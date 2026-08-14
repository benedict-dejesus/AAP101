/* ══════════════════════════════════════════════════════════════
   AAP101 · APPLICATION ENGINE
   Game layer + declarative block renderer + navigation.
   ══════════════════════════════════════════════════════════════ */
'use strict';

/* ══════════════════════ STATE ══════════════════════ */
const SAVE_KEY = 'aap101.progress.v2';

/* Progress is stored per access code, so two students sharing one phone (or a
   campus computer) never inherit each other's XP. Falls back to the original
   key when the access layer is absent, which keeps the module standalone. */
function saveKey(){
  try{
    if(window.AAPAuth && AAPAuth.student()) return SAVE_KEY + '::' + AAPAuth.codeKey();
  }catch(e){}
  return SAVE_KEY;
}

const S = {
  page:'terminal',
  hist:[],
  built:new Set(),
  inited:new Set(),
  gates:{},
  unlocked:{m:[1], f:[1]},
  xp:0,
  badges:[],
  streak:0,
  bestStreak:0,
  correct:0,
  attempts:0,
  quest:{},          // timeline step checks
  sound:true,
  lastPage:null
};

function save(){
  try{
    localStorage.setItem(saveKey(), JSON.stringify({
      gates:S.gates, unlocked:S.unlocked, xp:S.xp, badges:S.badges,
      bestStreak:S.bestStreak, correct:S.correct, attempts:S.attempts,
      quest:S.quest, sound:S.sound, lastPage:S.lastPage
    }));
  }catch(e){/* storage unavailable — session-only progress */}
}

function load(){
  try{
    const raw = localStorage.getItem(saveKey());
    if(!raw) return;
    const d = JSON.parse(raw);
    S.gates      = d.gates      || {};
    S.unlocked   = d.unlocked   || {m:[1], f:[1]};
    S.xp         = d.xp         || 0;
    S.badges     = d.badges     || [];
    S.bestStreak = d.bestStreak || 0;
    S.correct    = d.correct    || 0;
    S.attempts   = d.attempts   || 0;
    S.quest      = d.quest      || {};
    S.sound      = d.sound !== false;
    S.lastPage   = d.lastPage   || null;
  }catch(e){/* corrupt save — start fresh */}
}

/* ══════════════════════ UTILITIES ══════════════════════ */
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

function el(tag, cls, html){
  const n = document.createElement(tag);
  if(cls) n.className = cls;
  if(html != null) n.innerHTML = html;
  return n;
}
function esc(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function shuffle(a){
  const r = a.slice();
  for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];}
  return r;
}

/* Image fallback placeholder — preserved from the original module */
function handleImgErr(img){
  try{
    const src = img.getAttribute('src') || '';
    const fname = src.split('/').pop() || src;
    const ph = el('div','img-ph');
    ph.innerHTML = `<div class="iph-inner"><div class="iph-icon">🖼</div><div class="iph-name">${esc(fname)}</div></div>`;
    img.parentNode.insertBefore(ph, img);
    img.remove();
  }catch(e){}
}
window.handleImgErr = handleImgErr;

function imgTag(src, alt){
  return `<img src="${esc(src)}" alt="${esc(alt||'')}" loading="lazy" onerror="handleImgErr(this)">`;
}

/* ══════════════════════ AUDIO ══════════════════════ */
const Audio_ = {
  ctx:null,
  init(){
    if(this.ctx) return;
    try{ this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){}
  },
  tone(freq, dur=.12, type='sine', vol=.16, delay=0){
    if(!S.sound) return;
    this.init();
    if(!this.ctx) return;
    if(this.ctx.state === 'suspended') this.ctx.resume();
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g   = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + .012);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + .02);
  },
  play(name){
    switch(name){
      case 'click':   this.tone(520, .06, 'triangle', .07); break;
      case 'pop':     this.tone(740, .08, 'sine', .1); break;
      case 'correct': this.tone(660,.1,'sine',.14); this.tone(880,.14,'sine',.13,.09); break;
      case 'wrong':   this.tone(200,.16,'sawtooth',.09); this.tone(150,.2,'sawtooth',.08,.08); break;
      case 'xp':      this.tone(880,.07,'triangle',.1); this.tone(1170,.09,'triangle',.09,.06); break;
      case 'badge':   [523,659,784,1046].forEach((f,i)=>this.tone(f,.18,'triangle',.12,i*.09)); break;
      case 'levelup': [523,659,784,1046,1318].forEach((f,i)=>this.tone(f,.24,'sine',.13,i*.1)); break;
      case 'reveal':  this.tone(440,.1,'sine',.1); this.tone(660,.12,'sine',.09,.07); break;
      case 'tick':    this.tone(1200,.03,'square',.04); break;
      case 'strumD':  this.tone(196,.22,'sawtooth',.08); this.tone(294,.2,'sawtooth',.06,.01); break;
      case 'strumU':  this.tone(392,.16,'sawtooth',.06); this.tone(294,.14,'sawtooth',.05,.01); break;
      case 'fail':    [400,320,240].forEach((f,i)=>this.tone(f,.22,'sawtooth',.1,i*.12)); break;
    }
  }
};

/* ══════════════════════ FX ══════════════════════ */
const FX = {
  canvas:null, ctx:null, parts:[], raf:null,

  setup(){
    this.canvas = $('#fx-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', ()=>this.resize());
  },
  resize(){
    if(!this.canvas) return;
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },
  burst(x, y, count=42, spread=Math.PI*2, power=9){
    const colors = ['#00C18E','#FFF7F7','#015061','#7ef5d0','#FBBF24'];
    for(let i=0;i<count;i++){
      const a = (Math.random()*spread) - spread/2 - Math.PI/2;
      const v = Math.random()*power + 2.5;
      this.parts.push({
        x, y,
        vx:Math.cos(a)*v, vy:Math.sin(a)*v,
        g:.24 + Math.random()*.14,
        size:3 + Math.random()*5,
        rot:Math.random()*Math.PI,
        vr:(Math.random()-.5)*.3,
        life:1,
        decay:.008 + Math.random()*.01,
        color:colors[(Math.random()*colors.length)|0],
        square:Math.random() > .4
      });
    }
    this.start();
  },
  rain(count=110){
    const w = window.innerWidth;
    for(let i=0;i<count;i++){
      this.parts.push({
        x:Math.random()*w, y:-20 - Math.random()*300,
        vx:(Math.random()-.5)*2.2, vy:2 + Math.random()*4,
        g:.05, size:4 + Math.random()*6,
        rot:Math.random()*Math.PI, vr:(Math.random()-.5)*.22,
        life:1, decay:.0038,
        color:['#00C18E','#FFF7F7','#FBBF24','#7ef5d0'][(Math.random()*4)|0],
        square:Math.random() > .35
      });
    }
    this.start();
  },
  start(){
    if(this.raf) return;
    this.canvas.classList.add('on');
    const step = ()=>{
      const c = this.ctx;
      c.clearRect(0,0,this.canvas.width,this.canvas.height);
      this.parts = this.parts.filter(p=>{
        p.vy += p.g; p.x += p.vx; p.y += p.vy;
        p.rot += p.vr; p.life -= p.decay;
        if(p.life <= 0 || p.y > this.canvas.height + 40) return false;
        c.save();
        c.globalAlpha = Math.max(0, p.life);
        c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = p.color;
        if(p.square) c.fillRect(-p.size/2, -p.size/2, p.size, p.size*1.5);
        else { c.beginPath(); c.arc(0,0,p.size/2,0,Math.PI*2); c.fill(); }
        c.restore();
        return true;
      });
      if(this.parts.length){ this.raf = requestAnimationFrame(step); }
      else { this.raf = null; this.canvas.classList.remove('on'); c.clearRect(0,0,this.canvas.width,this.canvas.height); }
    };
    this.raf = requestAnimationFrame(step);
  },
  fromEl(node, count=34){
    if(!node) return;
    const r = node.getBoundingClientRect();
    this.burst(r.left + r.width/2, r.top + r.height/2, count);
  }
};

/* ══════════════════════ TOASTS ══════════════════════ */
function toast(icon, title, desc, kind=''){
  const t = el('div','toast ' + kind);
  t.innerHTML = `<div class="toast-ico">${icon}</div>
    <div class="toast-b"><div class="toast-t">${esc(title)}</div>${desc?`<div class="toast-d">${esc(desc)}</div>`:''}</div>`;
  $('#toasts').appendChild(t);
  setTimeout(()=>{ t.classList.add('out'); setTimeout(()=>t.remove(), 380); }, 3400);
}

function xpPop(node, amount){
  if(!node) return;
  const r = node.getBoundingClientRect();
  const p = el('div','xp-pop', `+${amount} XP`);
  p.style.left = (r.left + r.width/2) + 'px';
  p.style.top  = (r.top + 6) + 'px';
  document.body.appendChild(p);
  setTimeout(()=>p.remove(), 1200);
}

/* ══════════════════════ GAME LAYER ══════════════════════ */
const Game = {

  rankFor(xp){
    let r = RANKS[0];
    for(const x of RANKS) if(xp >= x.xp) r = x;
    return r;
  },
  nextRank(xp){
    return RANKS.find(x => x.xp > xp) || null;
  },

  /* ── XP is no longer something this file can grant ──
     The server decides what an activity is worth and how much of it a given
     submission earned. `S.xp` is a copy of the figure it sent back, and this
     function only plays the animation for it. Calling it does not change any
     number that counts. */
  celebrateXP(amount, label, node){
    if(amount <= 0) return;
    Audio_.play('xp');
    xpPop(node, amount);
    if(label) toast('⚡', `+${amount} XP`, label, 'xp');

    const chip = $('#hud-xp');
    chip.classList.remove('bump');
    void chip.offsetWidth;
    chip.classList.add('bump');
  },

  levelUp(lvl){
    const rank = RANKS.find(r => r.lvl === lvl) || RANKS[RANKS.length-1];
    $('#lu-badge').textContent = lvl;
    $('#lu-rank').textContent  = rank.name;
    $('#levelup').classList.add('on');
    Audio_.play('levelup');
    setTimeout(()=>FX.rain(90), 180);
    $('#sb-player').classList.add('shine');
    setTimeout(()=>$('#sb-player').classList.remove('shine'), 1200);
  },

  /* Announces a badge the SERVER has awarded. It does not grant one — by the
     time this runs, `S.badges` has already been replaced with the server's
     list. Badge ids the server does not recognise never arrive here. */
  announceBadge(id, node){
    const b = BADGES.find(x => x.id === id);
    if(!b) return;
    Audio_.play('badge');
    toast(b.em, `Badge unlocked: ${b.n}`, b.d, 'badge');
    FX.fromEl(node || $('#btn-badges'), 30);
    const btn = $('#btn-badges');
    btn.classList.add('glow-pulse');
    setTimeout(()=>btn.classList.remove('glow-pulse'), 1500);
  },

  /* Sound and streak animation for a graded answer. The counters behind them
     come from the server's reply, not from here. */
  hit(){ Audio_.play('correct'); this.refreshHUD(); },
  miss(){ Audio_.play('wrong');  this.refreshHUD(); },

  refreshHUD(){
    const rank = this.rankFor(S.xp);
    const next = this.nextRank(S.xp);

    $('#hud-xp-n').textContent  = S.xp;
    $('#hud-lvl-n').textContent = rank.lvl;
    $('#hud-streak-n').textContent = S.streak;

    const sc = $('#hud-streak');
    sc.classList.toggle('cold', S.streak === 0);
    sc.classList.toggle('hot',  S.streak >= 5);

    $('#pl-rank').textContent = rank.name;
    $('#pl-avatar').textContent = rank.em;
    $('#pl-xp').textContent   = S.xp;
    $('#pl-lvl').textContent  = rank.lvl;

    let pct = 100;
    if(next){
      const span = next.xp - rank.xp;
      pct = Math.max(0, Math.min(100, Math.round(((S.xp - rank.xp) / span) * 100)));
    }
    $('#pl-bar-fill').style.width = pct + '%';
  },

  stats(){
    const acc = S.attempts ? Math.round((S.correct / S.attempts) * 100) : 0;
    return {xp:S.xp, lvl:this.rankFor(S.xp).lvl, badges:S.badges.length, acc, streak:S.bestStreak};
  }
};

/* ══════════════════════ SUBMISSION ══════════════════════
   Every activity in the module funnels through here. The engine sends what the
   student did and renders whatever comes back — it holds no answer key and no
   XP figures, so there is nothing in this file worth tampering with.          */

const Grade = {
  inFlight: new Set(),

  /**
   * @param {object} o
   *   gate    activity id
   *   answer  index | [indices] | {itemId:category} | [{q,a}] | null for a claim
   *   node    the activity element, for the animation
   *   claim   true for activities with nothing to check (galleries, decks…)
   *   label   XP toast wording
   *   badges  badge ids to request; the server honours only allowlisted ones
   *   clean   for matches: was it a flawless run
   * @returns {Promise<object|null>} the server's verdict, or null if it could
   *          not be reached (the caller should leave the activity replayable).
   */
  submit(o){
    if(!(window.AAPAuth && AAPAuth.grade)){
      /* No access layer means no authority to grade against. Fail closed. */
      return Promise.resolve(null);
    }
    if(this.inFlight.has(o.gate)) return Promise.resolve(null);
    this.inFlight.add(o.gate);
    if(o.node) o.node.classList.add('checking');

    return AAPAuth.grade(o.gate, o.answer === undefined ? null : o.answer, {
      title: o.title || '', claim: !!o.claim, badges: o.badges || [], clean: o.clean
    })
      .then(res => {
        this.inFlight.delete(o.gate);
        if(o.node) o.node.classList.remove('checking');
        if(!res) return null;

        if(!res.ok){
          if(res.error === 'RATE_LIMIT' || res.error === 'BUSY'){
            toast('⏳', 'One moment', 'The class database is busy — try that again in a few seconds.', '');
          }else if(res.error === 'UNKNOWN_ACTIVITY'){
            toast('⚠️', 'Not recognised', 'This activity is not in the class database. Tell your instructor.', '');
          }else if(res.error === 'BAD_TOKEN' || res.error === 'DISABLED' || res.error === 'DEVICE_LOCKED'){
            /* auth.js is already showing the banner and signing out. Adding a
               toast on top would just be noise. */
          }else{
            /* Anything else is a fault, not a rule. This branch used to be
               empty, and that silence hid a server error that rejected EVERY
               submission: the student finished an activity, nothing happened,
               no XP, no message, and the Continue button stayed grey with
               nothing on screen to explain why. A failure the student can see
               is one they can report. */
            toast('⚠️', 'Not saved',
                  'That could not be recorded just now. Try it once more — if it keeps '
                + 'happening, tell your instructor.', '');
          }
          return res;
        }

        if(res.correct){
          if(res.xpAwarded > 0){
            Game.celebrateXP(res.xpAwarded, o.label || 'Activity cleared', o.node);
          }
          if(res.firstClear && o.node) FX.fromEl(o.node, o.burst || 32);
        }
        return res;
      })
      .catch(() => {
        this.inFlight.delete(o.gate);
        if(o.node) o.node.classList.remove('checking');
        toast('📡', 'No connection', 'Could not reach the class database. Check your internet and try again.', '');
        return null;
      });
  }
};

/* ══════════════════════ GATES ══════════════════════ */
const CONT_REQS   = {};   // continueId -> [gateIds]
const CONT_ACTS   = {};   // continueId -> fn
const REVEAL_REQS = {};   // revealSectionId -> [gateIds]

/* Registered up-front (not at page-build time) so that progress restored from
   a previous session is accurate before any lesson page has been rendered. */
function registerRequirements(){
  ['m','f'].forEach(k=>{
    CONTENT[k].lessons.forEach(les=>{
      (function walk(blocks){
        blocks.forEach(b=>{
          if(b.t === 'reveal'){ walk(b.blocks); return; }
          if(b.t !== 'continue') return;
          CONT_REQS[b.id] = b.req || [];
          if(b.reveal) REVEAL_REQS[b.reveal] = b.req || [];
        });
      })(les.blocks);
    });
  });
}

/**
 * Marks an activity complete in the local view.
 *
 * This used to BE the completion record: setting `S.gates[gid]` was all it took
 * to finish an activity, and `S` lives in localStorage, so a student could
 * complete the whole course from the console. It is now a mirror — the record
 * is `_ServerGates` in the spreadsheet, and this only repaints the screen to
 * match what the server has already confirmed.
 *
 * @returns {boolean} whether this was a change to the local view
 */
function passGate(gid, node){
  if(S.gates[gid]) return false;
  S.gates[gid] = true;
  refreshAllContinues();
  refreshLessonRail();
  refreshSidebar();
  save();
  return true;
}
window.passGate = passGate;   // exposed for the exposure simulator

/** Re-evaluates every "Continue" button against the current gate set. */
function refreshAllContinues(){
  Object.keys(CONT_REQS).forEach(cid => updCont(cid));
}
window.refreshAllContinues = refreshAllContinues;

function canCont(cid){
  return (CONT_REQS[cid] || []).every(g => S.gates[g]);
}
function updCont(cid){
  const btn = document.getElementById(cid);
  if(!btn) return;
  const ok = canCont(cid);
  btn.disabled = !ok;
  const note = document.getElementById(cid + '-note');
  if(ok){
    btn.classList.add('pop-in','ready');
    if(note) note.classList.add('hide');
    setTimeout(()=>btn.classList.remove('pop-in'), 420);
  }else{
    btn.classList.remove('ready');
    if(note) note.classList.remove('hide');
  }
}

/* Lesson progress rail — % of this lesson's gates satisfied */
function lessonGates(lesson){
  const out = [];
  (function walk(blocks){
    blocks.forEach(b=>{
      if(b.t === 'reveal'){ walk(b.blocks); return; }
      if(b.gate) out.push(b.gate);
    });
  })(lesson.blocks);
  return out;
}
function refreshLessonRail(){
  const les = findLesson(S.page);
  if(!les) return;
  const gates = lessonGates(les);
  if(!gates.length) return;
  const done = gates.filter(g => S.gates[g]).length;
  const pct  = Math.round(done / gates.length * 100);
  const fill = document.getElementById('rail-' + les.id);
  const txt  = document.getElementById('railtxt-' + les.id);
  if(fill) fill.style.width = pct + '%';
  if(txt)  txt.textContent  = `${done} / ${gates.length} activities · ${pct}%`;
}

function lessonComplete(les){
  const gates = lessonGates(les).filter(g=>{
    // only count gates that actually gate a continue button
    return Object.values(CONT_REQS).some(r => r.includes(g));
  });
  if(!gates.length) return false;
  return gates.every(g => S.gates[g]);
}
function moduleProgress(modId){
  const mod = CONTENT[modId];
  const total = mod.lessons.length;
  const done = mod.lessons.filter(l => lessonComplete(l)).length;
  return {done, total, pct: Math.round(done/total*100)};
}

/* ══════════════════════ CONTENT LOOKUP ══════════════════════ */
function findLesson(pid){
  for(const mk of ['m','f']){
    const l = CONTENT[mk].lessons.find(x => x.id === pid);
    if(l) return l;
  }
  return null;
}
function lessonMod(pid){ return pid[0] === 'm' ? 'm' : 'f'; }

function breadcrumb(pid){
  if(pid === 'terminal') return ['AAP101','Art Appreciation'];
  const les = findLesson(pid);
  if(les) return [CONTENT[lessonMod(pid)].label, `Lesson ${les.num}: ${les.title}`];
  if(pid === 'mc') return [CONTENT.m.label, 'Complete! 🎉'];
  if(pid === 'fc') return [CONTENT.f.label, 'Complete! 🏆'];
  return ['AAP101','Art Appreciation'];
}

/* ══════════════════════════════════════════════════════════════
   BLOCK RENDERERS
   Each returns a DOM node; interactive wiring happens in `init`.
   ══════════════════════════════════════════════════════════════ */
const Blocks = {

  /* ── heading ── */
  heading(b){
    const n = el('div','block b-heading');
    if(b.lvl === 3) n.innerHTML = `<h3>${esc(b.text)}</h3>`;
    else n.innerHTML = `<h2>${esc(b.text)}</h2>`;
    return n;
  },

  /* ── text ── */
  text(b){ return el('div','block b-text', b.html); },

  /* ── quote ── */
  quote(b){
    const n = el('div','block b-quote');
    n.innerHTML = `
      ${b.img ? `<div class="bq-img-wrap">${imgTag(b.img, b.alt)}</div>` : ''}
      <div><blockquote>${b.html}</blockquote>${b.attr ? `<div class="bq-attr">${esc(b.attr)}</div>` : ''}</div>`;
    return n;
  },

  /* ── warn ── */
  warn(b){
    const n = el('div','block b-warn');
    n.innerHTML = `<div class="b-warn-title">${b.title}</div><p>${b.html}</p>`;
    return n;
  },

  /* ── video ── */
  video(b){
    const n = el('div','block b-video');
    n.innerHTML = `<video id="terminal-video" src="${esc(b.src)}" autoplay muted loop playsinline></video>
      <div class="vid-label">${esc(b.label)}</div>`;
    return n;
  },

  /* ── compare (artist vs artisan) ── */
  compare(b){
    const n = el('div','block');
    const cards = b.items.map(it => `
      <div class="cmp-card">
        <div class="cmp-img"><div class="cmp-badge">${esc(it.badge)}</div>${imgTag(it.img, it.alt)}</div>
        <div class="cmp-body"><h4>${it.h}</h4>${it.html}</div>
      </div>`);
    n.innerHTML = `<div class="cmp-grid">${cards[0]}<div class="cmp-vs"><span>VS</span></div>${cards[1]}</div>`;
    return n;
  },

  /* ── polaroids ── */
  polaroids(b){
    const n = actShell(b, 'pol');
    const body = $('.act-body', n);
    const grid = el('div','pol-grid');
    b.items.forEach((it,i)=>{
      const p = el('div','pol');
      p.dataset.i = i;
      p.innerHTML = `
        <div class="pol-img">${imgTag(it.img, it.alt)}</div>
        <div class="pol-dev"><span>🎞️</span>Developing</div>
        <div class="pol-check">✓</div>
        <div class="pol-cap">${esc(it.cap)}</div>`;
      grid.appendChild(p);
    });
    body.appendChild(grid);
    addFoot(n, b, `0 / ${b.items.length} developed`, 'Develop all photos to continue');
    return n;
  },

  /* ── discover grid ── */
  discover(b){
    const n = actShell(b, 'discover');
    const body = $('.act-body', n);

    const grid = el('div','dg-grid');
    grid.dataset.cols = b.cols || 3;
    b.items.forEach((it,i)=>{
      const t = el('button','dg-tile');
      t.type = 'button';
      t.dataset.i = i;
      t.innerHTML = `<span class="dg-new">New</span>
        <span class="dg-ico">${it.ico || '◆'}</span>
        <span class="dg-label">${esc(it.label)}</span>`;
      grid.appendChild(t);
    });
    body.appendChild(grid);

    const panel = el('div','dg-panel');
    panel.innerHTML = `<div class="dg-panel-inner"></div>
      <div class="dg-nav">
        <button class="dg-nav-btn" data-d="-1">← Previous</button>
        <button class="dg-nav-btn" data-d="1">Next →</button>
      </div>`;
    body.appendChild(panel);

    addFoot(n, b, `0 / ${b.items.length} discovered`, `Discover all ${b.items.length} to continue`);
    return n;
  },

  /* ── flipdeck ── */
  flipdeck(b){
    const n = actShell(b, 'flip');
    const body = $('.act-body', n);
    const grid = el('div','fd-grid');
    b.items.forEach((it,i)=>{
      const c = el('div','fd-card');
      c.dataset.i = i;
      c.innerHTML = `
        <div class="fd-inner">
          <div class="fd-face fd-front">
            <div class="fd-front-img">${imgTag(it.img, it.alt)}</div>
            <div class="fd-front-cap">
              <div class="fd-title">${esc(it.title)}</div>
              <div class="fd-hint">↻ Tap to flip</div>
            </div>
          </div>
          <div class="fd-face fd-back">
            <h4>${esc(it.title)}</h4>
            <div class="fd-def">${esc(it.def)}</div>
          </div>
        </div>`;
      grid.appendChild(c);
    });
    body.appendChild(grid);
    addFoot(n, b, `0 / ${b.items.length} flipped`, `Flip all ${b.items.length} cards to continue`);
    return n;
  },

  /* ── deck (carousel replacement) ── */
  deck(b){
    const n = actShell(b, 'deck');
    const body = $('.act-body', n);
    const stage = el('div','dk-stage');
    b.items.forEach((it,i)=>{
      const c = el('div','dk-card' + (i===0 ? ' on' : ''));
      c.dataset.i = i;
      c.innerHTML = `
        <div class="dk-img dk-in-anim">${imgTag(it.img, it.alt)}</div>
        <div class="dk-txt dk-in-anim">
          <div class="dk-num">${String(i+1).padStart(2,'0')} / ${String(b.items.length).padStart(2,'0')}</div>
          <h4>${esc(it.title)}</h4>${it.html}
        </div>`;
      stage.appendChild(c);
    });
    body.appendChild(stage);

    const ctrl = el('div','dk-ctrl');
    const dots = b.items.map((_,i)=>`<button class="dk-dot${i===0?' on visited':''}" data-i="${i}" aria-label="Card ${i+1}"></button>`).join('');
    ctrl.innerHTML = `
      <button class="dk-btn" data-d="-1" disabled>← Prev</button>
      <div class="dk-dots">${dots}</div>
      <button class="dk-btn" data-d="1">Next →</button>`;
    n.appendChild(ctrl);

    addFoot(n, b, `1 / ${b.items.length} viewed`, `View all ${b.items.length} to continue`);
    return n;
  },

  /* ── sorter ── */
  sorter(b){
    const n = actShell(b, 'sorter');
    const body = $('.act-body', n);

    const pool = el('div','so-pool');
    pool.innerHTML = `<div class="so-pool-label">Items to sort</div>`;
    shuffle(b.items).forEach(it=>{
      const i = el('div','so-item', esc(it.label));
      i.dataset.id = it.id;
      i.draggable = true;
      pool.appendChild(i);
    });
    body.appendChild(pool);

    const cats = el('div','so-cats');
    b.cats.forEach(c=>{
      const box = el('div','so-cat');
      box.innerHTML = `<div class="so-cat-hd">${c.label}</div><div class="so-zone" data-cat="${esc(c.id)}"></div>`;
      cats.appendChild(box);
    });
    body.appendChild(cats);

    const act = el('div','so-actions');
    act.innerHTML = `<button class="btn-check" data-act="check">Check Answers</button>
      <span class="mt-stat">Attempts: <b data-tries>0</b></span>`;
    body.appendChild(act);
    body.appendChild(el('div','so-fb'));
    return n;
  },

  /* ── quiz ── */
  quiz(b){
    const n = actShell(b, 'quiz');
    const body = $('.act-body', n);

    if(b.badgeText){
      const bd = el('div','', `<span class="gs-type" style="margin-bottom:14px">${esc(b.badgeText)}</span>`);
      body.appendChild(bd);
    }
    body.appendChild(el('p','qz-q', b.q));
    if(b.img){
      const im = el('div','qz-img', imgTag(b.img, b.imgAlt));
      body.appendChild(im);
    }

    const opts = el('div','qz-opts' + (b.mode==='multi' ? ' qz-multi' : ''));
    b.opts.forEach((o,i)=>{
      const mark = b.mode === 'multi' ? '✓' : String.fromCharCode(65+i);
      const op = el('div','qz-opt');
      op.dataset.i = i;
      op.innerHTML = `<div class="qz-mark">${mark}</div>
        <div class="qz-body">
          <div class="qz-txt"${b.mono ? ' style="font-family:monospace;font-size:15px"' : ''}>${esc(o.txt)}</div>
          <div class="qz-resp"></div>
        </div>`;
      opts.appendChild(op);
    });
    body.appendChild(opts);

    const act = el('div','qz-actions');
    if(b.mode === 'multi') act.innerHTML = `<button class="btn-check" data-act="check">Check Answers</button>`;
    act.innerHTML += `<span class="qz-fb"></span>`;
    body.appendChild(act);
    return n;
  },

  /* ── match minigame ── */
  match(b){
    const n = actShell(b, 'match');
    const body = $('.act-body', n);

    const board = el('div','mt-board');
    const tiles = [];
    b.pairs.forEach((p,i)=>{
      tiles.push({kind:'term', pair:i, txt:p.a});
      tiles.push({kind:'def',  pair:i, txt:p.b});
    });
    shuffle(tiles).forEach(t=>{
      const d = el('div','mt-tile', esc(t.txt));
      d.dataset.kind = t.kind;
      d.dataset.pair = t.pair;
      board.appendChild(d);
    });
    body.appendChild(board);

    const stats = el('div','mt-stats');
    stats.style.marginTop = '18px';
    stats.innerHTML = `
      <span class="mt-stat">✅ Matched: <b data-hits>0</b> / ${b.pairs.length}</span>
      <span class="mt-stat">❌ Misses: <b data-miss>0</b></span>
      <span class="mt-stat">🔥 Best run: <b data-run>0</b></span>`;
    body.appendChild(stats);
    body.appendChild(el('div','so-fb'));

    addFoot(n, b, `0 / ${b.pairs.length} pairs`, 'Match every pair to finish');
    return n;
  },

  /* ── boss (speed round) ── */
  boss(b){
    const n = el('div','block b-boss');
    const rules = `
      <div class="boss-rules">
        <div class="boss-rule">⏱️ <b>${b.time}s</b> per question</div>
        <div class="boss-rule">❓ <b>${b.questions.length}</b> questions</div>
        <div class="boss-rule">🔥 Combo <b>multiplier</b></div>
      </div>`;
    n.innerHTML = `
      <div class="boss-intro">
        <span class="boss-emoji">${b.emoji}</span>
        <div class="boss-kicker">Optional Challenge</div>
        <div class="boss-title">${esc(b.title)}</div>
        <p class="boss-desc">${esc(b.desc)}</p>
        ${rules}
        <button class="btn-boss">Start the Speed Round ⚡</button>
      </div>

      <div class="boss-arena">
        <div class="boss-hud">
          <div class="boss-timer-wrap">
            <div class="boss-timer-lbl"><span>Time</span><span data-time>${b.time}s</span></div>
            <div class="boss-timer-bar"><div class="boss-timer-fill"></div></div>
          </div>
          <div class="boss-combo">🔥 x<span data-combo>1</span></div>
          <div class="boss-score"><span data-score>0</span> pts</div>
        </div>
        <div class="boss-qn" data-qn></div>
        <div class="boss-q" data-q></div>
        <div class="boss-opts"></div>
      </div>

      <div class="boss-result"></div>`;
    return n;
  },

  /* ── timeline ── */
  timeline(b){
    const n = actShell(b, 'timeline');
    const body = $('.act-body', n);
    const wrap = el('div','tl-wrap');
    b.steps.forEach((s,i)=>{
      const step = el('div','tl-step');
      step.dataset.i = i;
      step.innerHTML = `
        <div class="tl-dot">${i+1}</div>
        <div class="tl-card">
          <div class="tl-head">
            <div class="tl-title">Step ${i+1}: ${esc(s.title)}</div>
            <div class="tl-chev">▶</div>
          </div>
          <div class="tl-detail">
            ${s.html}
            <button class="tl-check" type="button">◻ Mark as done</button>
          </div>
        </div>`;
      wrap.appendChild(step);
    });
    body.appendChild(wrap);
    addFoot(n, b, `0 / ${b.steps.length} steps done`, 'Optional — track your project progress');
    return n;
  },

  /* ── strum trainer ── */
  strum(b){
    const n = actShell(b, 'strum');
    const body = $('.act-body', n);
    const wrap = el('div','');
    const pats = STRUM_PATTERNS.map((p,i)=>`
      <button class="strum-pat${i===2?' on':''}" data-i="${i}">
        <span class="strum-pat-n">${esc(p.name)} · ${esc(p.beats)}</span>
        <span class="strum-pat-p">${esc(p.pattern)}</span>
      </button>`).join('');
    wrap.innerHTML = `
      <div class="strum-row">${pats}</div>
      <div class="strum-beats"></div>
      <div style="margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn-check" data-act="play">▶ Play Pattern</button>
        <span class="mt-stat">Tempo: <b>80 BPM</b></span>
      </div>`;
    body.appendChild(wrap);
    return n;
  },

  /* ── exposure simulator (behaviour preserved) ── */
  'sim-exposure'(b){
    const n = el('div','block b-exp-sim');
    n.innerHTML = `
      <div class="simulator-wrapper">
        <div class="panel-left">
          <h2>Exposure Settings</h2>
          <p class="sim-brief">Objective: Capture a perfectly exposed photo of the moving train. Adjust Aperture, Shutter Speed, and ISO until the banner appears; then the Continue button will unlock.</p>
          <div class="control-group">
            <div class="control-header"><span>Aperture</span><span id="val-aperture">f/8</span></div>
            <input type="range" id="aperture" min="0" max="100" value="50">
            <div class="control-labels"><span>Wide (f/1.4)</span><span>Narrow (f/22)</span></div>
          </div>
          <div class="control-group">
            <div class="control-header"><span>Shutter Speed</span><span id="val-shutter">1/60s</span></div>
            <input type="range" id="shutter" min="0" max="100" value="50">
            <div class="control-labels"><span>Fast (1/1000s)</span><span>Slow (1s)</span></div>
          </div>
          <div class="control-group">
            <div class="control-header"><span>ISO</span><span id="val-iso">ISO 400</span></div>
            <input type="range" id="iso" min="0" max="100" value="30">
            <div class="control-labels"><span>Low (100)</span><span>High (6400)</span></div>
          </div>
        </div>
        <div class="panel-right">
          <div class="layer bg-sky" id="bg-layer"><div class="moon"></div></div>
          <div class="layer mg-buildings" id="mg-layer">
            <div class="building b1"><div class="windows">${'<div class="window"></div>'.repeat(9)}</div></div>
            <div class="building b2"><div class="windows">${'<div class="window"></div>'.repeat(6)}</div></div>
            <div class="building b3"><div class="windows">${'<div class="window"></div>'.repeat(6)}</div></div>
          </div>
          <div class="layer fg-train" id="fg-layer">${'<div class="train-window"></div>'.repeat(6)}</div>
          <div class="layer noise-overlay" id="noise-layer"></div>
          <div class="layer exposure-overlay" id="exposure-layer"></div>
          <div class="success-banner" id="success-message">Perfect Exposure Captured!</div>
        </div>
      </div>`;
    return n;
  },

  /* ── guitar simulator (behaviour preserved) ── */
  'sim-guitar'(b){
    const n = el('div','block b-guitar');
    const btns = CHORD_ORDER.map(c =>
      `<button class="chord-btn${c==='Am'?' chord-active':''}" data-chord="${esc(c)}">${esc(CHORD_LABELS[c] || c)}</button>`
    ).join('');
    n.innerHTML = `
      <div class="act-hdr">
        <div class="act-ico">🎸</div>
        <div class="act-meta">
          <div class="act-kicker">Interactive Cheat Sheet</div>
          <div class="act-title">Guitar Chord Cheat Sheet</div>
        </div>
        <div class="act-xp">+${b.xp} XP</div>
      </div>
      <div class="act-instr">Selected Open Chords for Beginners — click a chord name to view its diagram and fingering guide. <strong>View all ${CHORD_ORDER.length} chords</strong> to earn the Chord Collector badge.</div>
      <div class="gs-selector">${btns}</div>
      <div class="gs-display"></div>
      <div class="act-foot">
        <div class="act-prog">
          <span class="act-prog-txt">1 / ${CHORD_ORDER.length} chords viewed</span>
          <div class="act-prog-bar"><div class="act-prog-fill"></div></div>
        </div>
        <span class="act-gate">Explore every chord shape</span>
      </div>`;
    return n;
  },

  /* ── continue ── */
  continue(b){
    const n = el('div','block b-continue');
    n.innerHTML = `
      <p class="cont-note" id="${esc(b.id)}-note">${b.note}</p>
      <button class="btn-cont" id="${esc(b.id)}" disabled>${esc(b.label)} <span class="arrow">→</span></button>`;
    CONT_ACTS[b.id] = ()=>{
      if(b.reveal){
        const sec = document.getElementById(b.reveal);
        if(sec){
          sec.classList.add('on');
          Audio_.play('reveal');
          setTimeout(()=>sec.scrollIntoView({behavior:'smooth', block:'start'}), 90);
        }
        return;
      }
      if(b.unlock) unlockLesson(lessonMod(b.go), b.unlock);
      navigateTo(b.go);
    };
    return n;
  },

  /* ── reveal section ── */
  reveal(b){
    const n = el('div','reveal-sec');
    n.id = b.id;
    b.blocks.forEach(sub => n.appendChild(buildBlock(sub)));
    return n;
  }
};

/* Shared activity chrome */
function actShell(b, kind){
  const n = el('div','block b-act');
  n.dataset.kind = kind;
  n.innerHTML = `
    <div class="act-hdr">
      <div class="act-ico">${kindIcon(kind)}</div>
      <div class="act-meta">
        <div class="act-kicker">${esc(b.kicker || 'Activity')}</div>
        <div class="act-title">${esc(b.title || '')}</div>
      </div>
      ${b.xp ? `<div class="act-xp">+${b.xp} XP</div>` : ''}
    </div>
    ${b.instr ? `<div class="act-instr">${b.instr}</div>` : ''}
    <div class="act-body"></div>`;
  return n;
}
function kindIcon(k){
  return {pol:'📷', discover:'🔍', flip:'🃏', deck:'🎞️', sorter:'🎯',
          quiz:'🧠', match:'🧩', timeline:'🗺️', strum:'🥁'}[k] || '✨';
}
function addFoot(n, b, txt, gate){
  const f = el('div','act-foot');
  f.innerHTML = `
    <div class="act-prog">
      <span class="act-prog-txt">${esc(txt)}</span>
      <div class="act-prog-bar"><div class="act-prog-fill"></div></div>
    </div>
    <span class="act-gate">${esc(gate)}</span>`;
  n.appendChild(f);
  return f;
}
function setFoot(node, done, total, doneMsg){
  const pct = Math.round(done/total*100);
  const fill = $('.act-prog-fill', node);
  const txt  = $('.act-prog-txt', node);
  const gate = $('.act-gate', node);
  if(fill) fill.style.width = pct + '%';
  if(txt)  txt.textContent = txt.textContent.replace(/^\d+/, done);
  if(done >= total && gate){
    gate.classList.add('done');
    gate.textContent = doneMsg || '✓ Complete!';
  }
}

function buildBlock(b){
  const fn = Blocks[b.t];
  if(!fn){ console.warn('Unknown block type:', b.t); return el('div'); }
  const node = fn(b);
  node._block = b;
  return node;
}

/* ══════════════════════════════════════════════════════════════
   INTERACTIVE WIRING
   ══════════════════════════════════════════════════════════════ */
const Init = {

  /* ── polaroids ── */
  polaroids(node, b){
    const seen = new Set();
    const items = $$('.pol', node);
    const finish = ()=>{
      if(S.gates[b.gate]) return;
      Grade.submit({ gate:b.gate, claim:true, node, title:b.title,
                     label:'Studio wall revealed', burst:36 })
        .then(res => { if(res && res.correct) passGate(b.gate, node); });
    };
    items.forEach(p=>{
      p.addEventListener('click', ()=>{
        if(p.classList.contains('seen')) return;
        p.classList.add('seen');
        seen.add(p.dataset.i);
        Audio_.play('reveal');
        setFoot(node, seen.size, items.length, '✓ All photos developed!');
        if(seen.size >= items.length) finish();
      });
    });
    if(S.gates[b.gate]){ items.forEach(p=>p.classList.add('seen')); setFoot(node, items.length, items.length, '✓ All photos developed!'); }
  },

  /* ── discover grid ── */
  discover(node, b){
    const found = new Set();
    const tiles = $$('.dg-tile', node);
    const panel = $('.dg-panel', node);
    const inner = $('.dg-panel-inner', panel);
    let cur = -1;

    function open(i){
      const it = b.items[i];
      cur = i;
      inner.innerHTML = `
        ${it.img ? `<div class="dg-panel-img">${imgTag(it.img, it.alt)}</div>` : ''}
        <div class="dg-panel-txt">
          <h4><span class="dgp-ico">${it.ico || '◆'}</span>${esc(it.title)}</h4>
          ${it.html}
        </div>`;
      panel.classList.add('on');
      tiles.forEach(t => t.classList.remove('open'));
      tiles[i].classList.add('open');
      $$('.dg-nav-btn', panel).forEach(btn=>{
        const d = +btn.dataset.d;
        btn.disabled = (d < 0 && i === 0) || (d > 0 && i === b.items.length - 1);
      });

      if(!found.has(i)){
        found.add(i);
        tiles[i].classList.add('found');
        Audio_.play('reveal');
        setFoot(node, found.size, b.items.length, `✓ All ${b.items.length} discovered!`);
        if(found.size >= b.items.length && !S.gates[b.gate]){
          Grade.submit({ gate:b.gate, claim:true, node, title:b.title,
                         label:`${b.title} complete` })
            .then(res => { if(res && res.correct) passGate(b.gate, node); });
          FX.fromEl(node, 34);
        }
      }else{
        Audio_.play('click');
      }
    }

    tiles.forEach((t,i)=> t.addEventListener('click', ()=>open(i)));
    $$('.dg-nav-btn', panel).forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const next = cur + (+btn.dataset.d);
        if(next >= 0 && next < b.items.length) open(next);
      });
    });

    if(S.gates[b.gate]){
      tiles.forEach(t => t.classList.add('found'));
      b.items.forEach((_,i)=>found.add(i));
      setFoot(node, b.items.length, b.items.length, `✓ All ${b.items.length} discovered!`);
    }
    open(0);
  },

  /* ── flipdeck ── */
  flipdeck(node, b){
    const flipped = new Set();
    const cards = $$('.fd-card', node);
    cards.forEach((c,i)=>{
      c.addEventListener('click', ()=>{
        c.classList.toggle('flipped');
        Audio_.play('pop');
        if(!flipped.has(i)){
          flipped.add(i);
          c.classList.add('seen');
          setFoot(node, flipped.size, cards.length, '✓ Every movement revealed!');
          if(flipped.size >= cards.length && !S.gates[b.gate]){
            Grade.submit({ gate:b.gate, claim:true, node, title:b.title,
                           label:'All movement cards flipped', burst:40 })
              .then(res => { if(res && res.correct) passGate(b.gate, node); });
          }
        }
      });
    });
    if(S.gates[b.gate]){ cards.forEach(c=>c.classList.add('seen')); setFoot(node, cards.length, cards.length, '✓ Every movement revealed!'); }
  },

  /* ── deck ── */
  deck(node, b){
    const cards = $$('.dk-card', node);
    const dots  = $$('.dk-dot', node);
    const btns  = $$('.dk-btn', node);
    const viewed = new Set([0]);
    let cur = 0;

    function go(i, dir){
      if(i < 0 || i >= cards.length) return;
      cards[cur].classList.remove('on','back');
      cur = i;
      cards[cur].classList.add('on');
      if(dir < 0) cards[cur].classList.add('back');
      dots.forEach((d,j)=>{
        d.classList.toggle('on', j === cur);
        if(viewed.has(j)) d.classList.add('visited');
      });
      btns[0].disabled = cur === 0;
      btns[1].disabled = cur === cards.length - 1;
      Audio_.play('click');

      if(!viewed.has(cur)){
        viewed.add(cur);
        dots[cur].classList.add('visited');
        setFoot(node, viewed.size, cards.length, '✓ Full deck reviewed!');
        if(viewed.size >= cards.length && !S.gates[b.gate]){
          Grade.submit({ gate:b.gate, claim:true, node, title:b.title,
                         label:`${b.title} complete`, burst:34 })
            .then(res => { if(res && res.correct) passGate(b.gate, node); });
        }
      }
    }

    btns.forEach(btn => btn.addEventListener('click', ()=>{
      const d = +btn.dataset.d;
      go(cur + d, d);
    }));
    dots.forEach((d,i)=> d.addEventListener('click', ()=> go(i, i > cur ? 1 : -1)));

    node._deckKeys = e=>{
      if(e.key === 'ArrowRight') go(cur+1, 1);
      if(e.key === 'ArrowLeft')  go(cur-1, -1);
    };
    document.addEventListener('keydown', e=>{
      const page = node.closest('.page');
      if(!page || !page.classList.contains('active')) return;
      if(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      node._deckKeys(e);
    });

    if(S.gates[b.gate]){ cards.forEach((_,i)=>viewed.add(i)); dots.forEach(d=>d.classList.add('visited')); setFoot(node, cards.length, cards.length, '✓ Full deck reviewed!'); }
  },

  /* ── sorter ── */
  sorter(node, b){
    /* No answer map here any more — `b.items[].answer` was removed from
       content.js and now lives only in AnswerKey.gs. */
    const pool  = $('.so-pool', node);
    const fb    = $('.so-fb', node);
    const check = $('[data-act="check"]', node);
    const tries = $('[data-tries]', node);
    let sel = null, attempts = 0;

    $$('.so-item', node).forEach(item=>{
      item.addEventListener('click', e=>{
        e.stopPropagation();
        if(item.classList.contains('ok')) return;
        if(sel === item){ item.classList.remove('sel'); sel = null; }
        else{
          if(sel) sel.classList.remove('sel');
          item.classList.add('sel'); sel = item;
          Audio_.play('click');
        }
      });
      item.addEventListener('dragstart', e=>{
        e.dataTransfer.setData('iid', item.dataset.id);
        setTimeout(()=>item.classList.add('dragging'), 0);
      });
      item.addEventListener('dragend', ()=> item.classList.remove('dragging'));
    });

    $$('.so-zone, .so-pool', node).forEach(zone=>{
      zone.addEventListener('click', ()=>{
        if(!sel) return;
        zone.appendChild(sel);
        sel.classList.remove('sel');
        sel = null;
        Audio_.play('pop');
      });
      zone.addEventListener('dragover', e=>{
        e.preventDefault();
        (zone.closest('.so-cat') || zone).classList.add('over');
      });
      zone.addEventListener('dragleave', e=>{
        if(!zone.contains(e.relatedTarget)) (zone.closest('.so-cat') || zone).classList.remove('over');
      });
      zone.addEventListener('drop', e=>{
        e.preventDefault();
        (zone.closest('.so-cat') || zone).classList.remove('over');
        const id = e.dataTransfer.getData('iid');
        const it = node.querySelector(`.so-item[data-id="${id}"]`);
        if(it){ zone.appendChild(it); it.classList.remove('dragging','sel'); sel = null; }
      });
    });

    check.addEventListener('click', ()=>{
      if(pool.querySelectorAll('.so-item').length > 0){
        fb.className = 'so-fb err';
        fb.textContent = '⚠️ Place all items into a category first!';
        node.classList.add('shake');
        Audio_.play('wrong');
        setTimeout(()=>node.classList.remove('shake'), 500);
        return;
      }
      /* Collect where the student put things and let the server mark it.
         This file no longer knows which category is right. */
      const answer = {};
      $$('.so-item', node).forEach(item=>{
        item.classList.remove('ok','bad');
        answer[item.dataset.id] = item.closest('.so-zone')?.dataset.cat || '';
      });

      check.disabled = true;
      fb.className = 'so-fb';
      fb.textContent = '⏳ Checking your answers…';

      Grade.submit({ gate:b.gate, answer, node, title:b.title,
                     label:'Sorting gauntlet cleared', burst:40 })
        .then(res => {
          if(!res || !res.ok){
            /* Could not be marked — let them try again, and do not pretend
               the attempt happened. */
            check.disabled = false;
            fb.className = 'so-fb';
            fb.textContent = '';
            return;
          }
          attempts++;
          tries.textContent = attempts;

          if(res.correct){
            $$('.so-item', node).forEach(i => i.classList.add('ok'));
            fb.className = 'so-fb ok';
            fb.textContent = '✅ All items matched correctly! Great job!';
            Game.hit();
            passGate(b.gate, node);
          }else{
            check.disabled = false;
            /* The server names the tiles that are in the wrong box — which the
               student can already see — but never which box is right. */
            const wrong = new Set(res.wrong || []);
            $$('.so-item', node).forEach(i=>{
              if(wrong.has(i.dataset.id)) i.classList.add('bad');
              else i.classList.add('ok');
            });
            fb.className = 'so-fb err';
            fb.textContent = '❌ Some items are in the wrong category. Check the highlighted ones!';
            Game.miss();
            setTimeout(()=>{
              $$('.so-item.bad', node).forEach(i=>{ i.classList.remove('bad'); pool.appendChild(i); });
              $$('.so-item.ok', node).forEach(i=> i.classList.remove('ok'));
              fb.className = 'so-fb';
              fb.textContent = '';
            }, 2400);
          }
        });
    });

    if(S.gates[b.gate]){
      check.disabled = true;
      fb.className = 'so-fb ok';
      fb.textContent = '✅ Already completed.';
    }
  },

  /* ── quiz ── */
  quiz(node, b){
    const opts  = $$('.qz-opt', node);
    const resps = $$('.qz-resp', node);
    const fbEl  = $('.qz-fb', node);
    const check = $('[data-act="check"]', node);
    const done  = ()=> S.gates[b.gate];

    /* `b.opts[].correct` and `b.opts[].fb` no longer exist — both were an
       answer key in plain sight, the second one literally spelling out
       "✅ Correct!" beside the right options. They live in AnswerKey.gs now,
       and every verdict and explanation below arrives from the server. */
    let busy = false;

    /** Fills in the explanation the server sent for one option. */
    const showResp = (i, good, res)=>{
      const r = resps[i];
      if(!r) return;
      r.textContent = (res && res.fb && res.fb[i]) || '';
      r.classList.remove('good','bad');
      r.classList.add(good ? 'good' : 'bad', 'show');
    };
    const say = (text, colour)=>{
      fbEl.className = 'qz-fb show';
      fbEl.style.color = colour;
      fbEl.textContent = text;
    };

    if(b.mode === 'multi'){
      const sel = new Set();

      opts.forEach((op,i)=>{
        op.addEventListener('click', ()=>{
          if(done() || busy) return;
          if(sel.has(i)){ sel.delete(i); op.classList.remove('sel'); }
          else { sel.add(i); op.classList.add('sel'); Audio_.play('click'); }
        });
      });

      check.addEventListener('click', ()=>{
        if(done() || busy) return;
        if(sel.size === 0){
          say('⚠️ Please select at least one option.', 'var(--warn)');
          return;
        }
        opts.forEach(o => o.classList.remove('ok','bad'));
        resps.forEach(r => r.classList.remove('show'));

        busy = true;
        check.disabled = true;
        say('⏳ Checking your answers…', 'var(--muted)');

        Grade.submit({ gate:b.gate, answer:Array.from(sel), node, title:b.title,
                       label:'Knowledge check cleared' })
          .then(res => {
            busy = false;
            if(!res || !res.ok){ check.disabled = false; say('', 'var(--muted)'); fbEl.className = 'qz-fb'; return; }

            if(res.correct){
              sel.forEach(i => { opts[i].classList.add('ok'); showResp(i, true, res); });
              say('✅ Both correct answers identified! You may continue.', 'var(--success)');
              Game.hit();
              passGate(b.gate, node);
            }else{
              check.disabled = false;
              /* The server tells us which of THEIR OWN picks were wrong and
                 how many they missed — never which options are right. */
              const wrong = new Set(res.wrong || []);
              sel.forEach(i => {
                opts[i].classList.add(wrong.has(i) ? 'bad' : 'ok');
                showResp(i, !wrong.has(i), res);
              });
              let msg = '❌ ';
              if(wrong.size)      msg += 'Some selected statements are TRUE. ';
              if(res.missedCount) msg += 'You may have missed a FALSE statement. ';
              msg += 'Review and try again.';
              say(msg, 'var(--error)');
              Game.miss();
              node.classList.add('shake');
              setTimeout(()=>node.classList.remove('shake'), 450);
              setTimeout(()=>{
                opts.forEach(o => o.classList.remove('bad','ok'));
                resps.forEach(r => r.classList.remove('show'));
              }, 3200);
            }
          });
      });

    }else{
      opts.forEach((op,i)=>{
        op.addEventListener('click', ()=>{
          if(done() || busy) return;
          opts.forEach(o => o.classList.remove('sel','ok','bad'));
          resps.forEach(r => r.classList.remove('show'));
          op.classList.add('sel');

          busy = true;
          opts.forEach(o => o.classList.add('locked'));
          say('⏳ Checking…', 'var(--muted)');

          Grade.submit({ gate:b.gate, answer:i, node, title:b.title,
                         label:'Knowledge check cleared' })
            .then(res => {
              busy = false;
              opts.forEach(o => o.classList.remove('locked'));
              if(!res || !res.ok){ op.classList.remove('sel'); fbEl.className = 'qz-fb'; return; }

              showResp(i, !!res.correct, res);
              if(res.correct){
                op.classList.add('ok');
                const mark = $('.qz-mark', op);
                if(mark) mark.textContent = '✓';
                fbEl.className = 'qz-fb';
                Game.hit();
                opts.forEach(o => o.classList.add('locked'));
                op.classList.remove('locked');
                passGate(b.gate, node);
              }else{
                op.classList.add('bad','shake');
                fbEl.className = 'qz-fb';
                Game.miss();
                setTimeout(()=>op.classList.remove('shake'), 450);
              }
            });
        });
      });
    }

    if(S.gates[b.gate]){
      if(check) check.disabled = true;
      /* Previously this highlighted the correct option straight from the
         content file. The engine no longer knows which one that is. */
      if(fbEl){ fbEl.className = 'qz-fb show'; fbEl.style.color = 'var(--success)'; fbEl.textContent = '✅ Already completed.'; }
    }
  },

  /* ── match minigame ── */
  match(node, b){
    const tiles = $$('.mt-tile', node);
    const hitsEl = $('[data-hits]', node);
    const missEl = $('[data-miss]', node);
    const runEl  = $('[data-run]', node);
    const fb     = $('.so-fb', node);
    let sel = null, hits = 0, misses = 0, run = 0, bestRun = 0;

    tiles.forEach(t=>{
      t.addEventListener('click', ()=>{
        if(t.classList.contains('done')) return;
        if(sel === t){ t.classList.remove('sel'); sel = null; return; }

        if(!sel){
          sel = t; t.classList.add('sel');
          Audio_.play('click');
          return;
        }

        // must pair a term with a definition
        if(sel.dataset.kind === t.dataset.kind){
          sel.classList.remove('sel');
          sel = t; t.classList.add('sel');
          Audio_.play('click');
          return;
        }

        if(sel.dataset.pair === t.dataset.pair){
          sel.classList.remove('sel');
          sel.classList.add('done','hit');
          t.classList.add('done','hit');
          hits++; run++;
          bestRun = Math.max(bestRun, run);
          hitsEl.textContent = hits;
          runEl.textContent  = bestRun;
          Audio_.play('correct');
          Game.hit();
          sel = null;
          setFoot(node, hits, b.pairs.length, '✓ Every pair matched!');

          if(hits >= b.pairs.length){
            fb.className = 'so-fb ok';
            fb.textContent = misses === 0
              ? '🏆 Flawless! Every pair matched without a single miss.'
              : `✅ All ${b.pairs.length} pairs matched with ${misses} miss${misses===1?'':'es'}. Well done!`;
            if(!S.gates[b.gate]){
              /* A memory match shows both halves of every pair, so there is no
                 secret for the server to check — but it still decides the XP,
                 and a clean run only unlocks the bonus and the badge that the
                 key permits for this activity. */
              Grade.submit({ gate:b.gate, claim:true, node, title:b.title,
                             clean: misses === 0,
                             badges: misses === 0 ? ['matchmaker'] : [],
                             label: misses === 0 ? 'Perfect match run!' : 'Match game cleared',
                             burst:44 })
                .then(res => { if(res && res.correct) passGate(b.gate, node); });
            }
          }
        }else{
          const a = sel;
          a.classList.add('miss'); t.classList.add('miss');
          misses++; run = 0;
          missEl.textContent = misses;
          Audio_.play('wrong');
          Game.miss();
          sel = null;
          setTimeout(()=>{
            a.classList.remove('miss','sel');
            t.classList.remove('miss');
          }, 480);
        }
      });
    });

    if(S.gates[b.gate]){
      tiles.forEach(t => t.classList.add('done'));
      setFoot(node, b.pairs.length, b.pairs.length, '✓ Every pair matched!');
      fb.className = 'so-fb ok';
      fb.textContent = '✅ Already completed.';
    }
  },

  /* ── boss / speed round ── */
  boss(node, b){
    const intro  = $('.boss-intro', node);
    const arena  = $('.boss-arena', node);
    const result = $('.boss-result', node);
    const startB = $('.btn-boss', node);
    const optsEl = $('.boss-opts', node);
    const qEl    = $('[data-q]', node);
    const qnEl   = $('[data-qn]', node);
    const scoreEl= $('[data-score]', node);
    const comboEl= $('[data-combo]', node);
    const comboBx= $('.boss-combo', node);
    const timeEl = $('[data-time]', node);
    const timeFill = $('.boss-timer-fill', node);

    let qi = 0, score = 0, combo = 1, right = 0, timer = null, left = b.time, questions = [];
    let picks = [];   // {q: original index, a: option index or -1 for timeout}

    function tick(){
      left--;
      timeEl.textContent = left + 's';
      timeFill.style.width = (left / b.time * 100) + '%';
      timeFill.classList.toggle('warn', left <= b.time * .5 && left > b.time * .25);
      timeFill.classList.toggle('crit', left <= b.time * .25);
      if(left <= 3 && left > 0) Audio_.play('tick');
      if(left <= 0){ clearInterval(timer); answer(-1); }
    }

    function render(){
      const q = questions[qi];
      qnEl.textContent = `Question ${qi+1} of ${questions.length}`;
      qEl.textContent = q.q;
      optsEl.className = 'boss-opts';
      optsEl.innerHTML = '';
      q.opts.forEach((o,i)=>{
        const btn = el('button','boss-opt', esc(o));
        btn.type = 'button';
        btn.addEventListener('click', ()=> answer(i));
        optsEl.appendChild(btn);
      });
      left = b.time;
      timeEl.textContent = left + 's';
      timeFill.style.width = '100%';
      timeFill.classList.remove('warn','crit');
      clearInterval(timer);
      timer = setInterval(tick, 1000);
    }

    /* The engine no longer knows which option is right, so a speed round is now
       genuinely a speed round: answers are locked in as they are given and the
       whole set is marked at the end. That is the one visible change server-side
       grading forces — per-question feedback mid-round would mean shipping the
       key to the browser again, which is exactly what we removed. */
    function answer(i){
      clearInterval(timer);
      const btns = $$('.boss-opt', optsEl);
      optsEl.classList.add('locked');
      if(i >= 0) btns[i].classList.add('sel');

      picks.push({ q: questions[qi]._i, a: i });
      Audio_.play('click');

      scoreEl.textContent = picks.length + '/' + questions.length;
      comboBx.classList.remove('on');

      setTimeout(()=>{
        qi++;
        if(qi < questions.length) render();
        else finish();
      }, 420);
    }

    function finish(){
      arena.classList.remove('on');
      result.innerHTML = `<div class="boss-res-sub">⏳ Marking your round…</div>`;
      result.classList.add('on');

      Grade.submit({ gate:b.gate, answer:picks, node, title:b.title,
                     label:'Speed round cleared!', burst:0 })
        .then(res => {
          if(!res || !res.ok){
            result.innerHTML = `
              <span class="boss-res-emoji">📡</span>
              <div class="boss-res-title">Could not mark this round</div>
              <div class="boss-res-sub">The class database could not be reached, so this
                round has not been recorded. Check your connection and play it again —
                nothing was lost.</div>
              <button class="btn-boss" data-act="again">↻ Try Again</button>`;
            $('[data-act="again"]', result).addEventListener('click', start);
            Audio_.play('fail');
            return;
          }

          const won     = !!res.correct;
          const perfect = !!res.perfect;
          const acc     = res.accuracy;
          /* The original combo scoring, replayed over the server's verdict so
             the Points figure still means what it always did. */
          let pts = 0, combo2 = 1;
          const byQ = {};
          (res.review || []).forEach(r => byQ[r.q] = r);
          picks.forEach(p => {
            if(byQ[p.q] && byQ[p.q].ok){ pts += 100 * combo2; combo2 = Math.min(5, combo2 + 1); }
            else combo2 = 1;
          });

          /* The round is settled, so showing the answers now gives nothing
             away that the student has not already been marked on. */
          const review = (res.review || []).map(r => {
            const q = b.questions[r.q];
            if(!q) return '';
            return `<li class="boss-rev-item ${r.ok ? 'ok' : 'bad'}">
              <span class="boss-rev-q">${esc(q.q)}</span>
              <span class="boss-rev-a">${r.ok ? '✓' : '✗'} ${esc(q.opts[r.key])}</span>
            </li>`;
          }).join('');

          result.innerHTML = `
            <span class="boss-res-emoji">${perfect ? '💎' : won ? '🏆' : '💪'}</span>
            <div class="boss-res-title">${perfect ? 'Flawless Victory!' : won ? 'Speed Round Cleared!' : 'Good Effort!'}</div>
            <div class="boss-res-sub">${perfect ? 'A perfect run — nothing got past you.'
              : won ? 'Solid work. Replay for a higher score.' : 'You need 60% to clear. Review the lesson and try again.'}</div>
            <div class="boss-res-stats">
              <div class="boss-res-stat"><b>${res.right}/${res.total}</b><span>Correct</span></div>
              <div class="boss-res-stat"><b>${acc}%</b><span>Accuracy</span></div>
              <div class="boss-res-stat"><b>${pts}</b><span>Points</span></div>
            </div>
            <ul class="boss-review">${review}</ul>
            <button class="btn-boss" data-act="again">↻ Play Again</button>`;
          $('[data-act="again"]', result).addEventListener('click', start);

          if(won){
            Audio_.play('levelup');
            FX.rain(perfect ? 120 : 70);
            passGate(b.gate, node);
          }else{
            Audio_.play('fail');
          }
        });
    }

    function start(){
      /* Tag each question with its position in the content file before
         shuffling, so the server can match answers to its key. */
      questions = shuffle(b.questions.map((q, i) => Object.assign({ _i: i }, q)));
      qi = 0; picks = []; score = 0; combo = 1; right = 0;
      scoreEl.textContent = '0/' + questions.length;
      comboEl.textContent = '1';
      comboBx.classList.remove('on');
      intro.style.display = 'none';
      result.classList.remove('on');
      arena.classList.add('on');
      Audio_.play('pop');
      render();
    }

    startB.addEventListener('click', start);

    // stop the clock if the student navigates away mid-round
    node._cleanup = ()=> clearInterval(timer);
  },

  /* ── timeline ── */
  timeline(node, b){
    const steps = $$('.tl-step', node);
    const key = b.gate;
    if(!S.quest[key]) S.quest[key] = [];

    function refresh(){
      const done = S.quest[key].length;
      setFoot(node, done, steps.length, '✓ Quest log complete!');
      if(done >= steps.length && !S.gates[b.gate]){
        Grade.submit({ gate:b.gate, claim:true, node, title:b.title,
                       label:'Project quest log complete', burst:34 })
          .then(res => { if(res && res.correct) passGate(b.gate, node); });
      }
      save();
    }

    steps.forEach((step,i)=>{
      const card  = $('.tl-card', step);
      const head  = $('.tl-head', step);
      const check = $('.tl-check', step);

      head.addEventListener('click', ()=>{
        card.classList.toggle('open');
        Audio_.play('click');
      });
      check.addEventListener('click', e=>{
        e.stopPropagation();
        const on = S.quest[key].includes(i);
        if(on){
          S.quest[key] = S.quest[key].filter(x => x !== i);
          step.classList.remove('done');
          check.textContent = '◻ Mark as done';
        }else{
          S.quest[key].push(i);
          step.classList.add('done');
          check.textContent = '✓ Done';
          Audio_.play('pop');
        }
        refresh();
      });

      if(S.quest[key].includes(i)){
        step.classList.add('done');
        check.textContent = '✓ Done';
      }
    });
    setFoot(node, S.quest[key].length, steps.length, '✓ Quest log complete!');
  },

  /* ── strum trainer ── */
  strum(node, b){
    const pats  = $$('.strum-pat', node);
    const beats = $('.strum-beats', node);
    const play  = $('[data-act="play"]', node);
    let cur = 2, timer = null;

    function draw(){
      const p = STRUM_PATTERNS[cur];
      beats.innerHTML = '';
      p.seq.forEach(s=>{
        const d = el('div','strum-beat' + (s === '·' ? ' rest' : ''), s);
        beats.appendChild(d);
      });
    }
    function run(){
      clearInterval(timer);
      const p = STRUM_PATTERNS[cur];
      const cells = $$('.strum-beat', node);
      // 80 BPM quarter note = 750ms; scale by how many cells fill 4 beats
      const step = (750 * 4) / p.seq.length;
      let i = 0;
      cells.forEach(c => c.classList.remove('hit'));
      timer = setInterval(()=>{
        cells.forEach(c => c.classList.remove('hit'));
        if(i >= cells.length){ clearInterval(timer); return; }
        cells[i].classList.add('hit');
        const s = p.seq[i];
        if(s === 'D') Audio_.play('strumD');
        else if(s === 'U') Audio_.play('strumU');
        i++;
      }, step);
    }

    pats.forEach((btn,i)=>{
      btn.addEventListener('click', ()=>{
        pats.forEach(x => x.classList.remove('on'));
        btn.classList.add('on');
        cur = i;
        draw();
        Audio_.play('click');
      });
    });
    play.addEventListener('click', run);
    draw();
    node._cleanup = ()=> clearInterval(timer);
  },

  /* ── exposure simulator (logic preserved verbatim) ── */
  'sim-exposure'(node, b){
    const sliderAperture = $('#aperture', node);
    const sliderShutter  = $('#shutter', node);
    const sliderIso      = $('#iso', node);
    const valAperture = $('#val-aperture', node);
    const valShutter  = $('#val-shutter', node);
    const valIso      = $('#val-iso', node);
    const bgLayer     = $('#bg-layer', node);
    const mgLayer     = $('#mg-layer', node);
    const fgLayer     = $('#fg-layer', node);
    const noiseLayer  = $('#noise-layer', node);
    const exposureLayer = $('#exposure-layer', node);
    const successMessage = $('#success-message', node);

    const apertureLabels = ["f/1.4","f/2.8","f/4","f/5.6","f/8","f/11","f/16","f/22"];
    const shutterLabels  = ["1/1000s","1/500s","1/250s","1/125s","1/60s","1/30s","1/15s","1s"];
    const isoLabels      = ["100","200","400","800","1600","3200","6400","12800"];

    function updateSimulator(){
      const aperture = parseInt(sliderAperture.value);
      const shutter  = parseInt(sliderShutter.value);
      const iso      = parseInt(sliderIso.value);
      const apIndex  = Math.floor((aperture/100)*(apertureLabels.length-1));
      const shIndex  = Math.floor((shutter/100)*(shutterLabels.length-1));
      const isoIndex = Math.floor((iso/100)*(isoLabels.length-1));
      valAperture.textContent = apertureLabels[apIndex];
      valShutter.textContent  = shutterLabels[shIndex];
      valIso.textContent      = `ISO ${isoLabels[isoIndex]}`;

      const bgBlur = Math.max(0,(100-aperture)/10);
      bgLayer.style.filter = `blur(${bgBlur}px)`;
      mgLayer.style.filter = `blur(${bgBlur*0.8}px)`;

      const motionBlur = shutter/8;
      fgLayer.style.filter = `blur(${motionBlur}px)`;
      fgLayer.style.transform = `scaleX(${1+(shutter/500)})`;

      const grainOpacity = iso/100;
      noiseLayer.style.opacity = Math.min(0.8, grainOpacity*0.8);

      const totalLight = (100-aperture)+shutter+iso;
      let darkness = 0, brightness = 1;
      if(totalLight<150){ darkness = 1-(totalLight/150); }
      else if(totalLight>200){ brightness = 1+((totalLight-200)/50); }
      exposureLayer.style.backgroundColor = 'black';
      exposureLayer.style.opacity = darkness;
      $('.panel-right', node).style.filter = `brightness(${brightness})`;

      if(aperture<=30 && shutter<=25 && iso>=75 && totalLight>=120 && totalLight<=200){
        if(!successMessage.classList.contains('show')) Audio_.play('correct');
        successMessage.classList.add('show');
        if(!S.gates[b.gate]){
          Grade.submit({ gate:b.gate, claim:true, node, title:'Exposure triangle',
                         label:'Perfect exposure captured!', burst:46 })
            .then(res => { if(res && res.correct) passGate(b.gate, node); });
        }
      }else{
        successMessage.classList.remove('show');
      }
    }

    sliderAperture.addEventListener('input', updateSimulator);
    sliderShutter.addEventListener('input', updateSimulator);
    sliderIso.addEventListener('input', updateSimulator);
    updateSimulator();
  },

  /* ── guitar simulator (logic preserved) ── */
  'sim-guitar'(node, b){
    const disp = $('.gs-display', node);
    const btns = $$('.chord-btn', node);
    const seen = new Set();

    function buildChordSVG(ch){
      const W=160,H=195,strGap=22,fH=24,sX=20,nutY=42,nS=6,nF=5;
      const sx = i => sX + i*strGap, fy = f => nutY + f*fH;
      let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
      for(let i=0;i<nS;i++)
        s += `<line x1="${sx(i)}" y1="${nutY}" x2="${sx(i)}" y2="${fy(nF)}" stroke="#334155" stroke-width="${i===0||i===5?1.5:1}"/>`;
      for(let f=0;f<=nF;f++){
        const sw = f===0 ? 4 : 1.2;
        s += `<line x1="${sx(0)}" y1="${fy(f)}" x2="${sx(nS-1)}" y2="${fy(f)}" stroke="${f===0?'#002C39':'#94A3B8'}" stroke-width="${sw}"/>`;
      }
      ['E','A','D','G','B','e'].forEach((n,i)=>
        s += `<text x="${sx(i)}" y="${fy(nF)+14}" text-anchor="middle" font-size="9" fill="#94A3B8" font-family="Inter,sans-serif">${n}</text>`);
      ch.strings.forEach((v,i)=>{
        const x = sx(i), y = nutY - 15;
        if(v === 'x') s += `<text x="${x}" y="${y+2}" text-anchor="middle" dominant-baseline="middle" font-size="13" fill="#EF4444" font-weight="900" font-family="Arial">✕</text>`;
        else if(v === 'o') s += `<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="#002C39" stroke-width="1.8"/>`;
      });
      if(ch.barre){
        const bb = ch.barre, y = fy(bb.fret) - fH/2, x1 = sx(bb.fromStr), x2 = sx(bb.toStr);
        s += `<rect x="${x1-9}" y="${y-7}" width="${x2-x1+18}" height="14" rx="7" fill="rgba(0,44,57,.88)"/>`;
      }
      ch.fingers.forEach(([si,fret,finger])=>{
        const x = sx(si), y = fy(fret) - fH/2;
        const barred = ch.barre && fret === ch.barre.fret && si >= ch.barre.fromStr && si <= ch.barre.toStr;
        if(!barred){
          s += `<circle cx="${x}" cy="${y}" r="10" fill="#00C18E"/>`;
          s += `<text x="${x}" y="${y+1}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#002C39" font-weight="800" font-family="Inter,sans-serif">${finger}</text>`;
        }else{
          s += `<text x="${x}" y="${y+1}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="white" font-weight="800">1</text>`;
        }
      });
      s += `<text x="${W/2}" y="${H-3}" text-anchor="middle" font-size="14" fill="#002C39" font-weight="700" font-family="Playfair Display,serif">${ch.name||''}</text></svg>`;
      return s;
    }

    function renderChord(name){
      const ch = CHORDS[name];
      if(!ch) return;
      const fi = ch.fing.map(f=>{
        const m = f.match(/(\d)/);
        return `<li><span class="gs-fnum">${m ? m[1] : '?'}</span><span>${esc(f)}</span></li>`;
      }).join('');
      const strNames = ['E','A','D','G','B','e'];
      const strSummary = strNames.map((n,i)=>{
        const st = ch.strings[i];
        const fret = st === null ? (ch.fingers.find(f => f[0] === i) || [0,0])[1] : null;
        return `<strong>${n}:</strong> ${st === 'o' ? 'open' : st === 'x' ? 'muted' : fret ? 'fret ' + fret : '—'}`;
      }).join(' · ');

      disp.innerHTML = `
        <div class="gs-diagram">${buildChordSVG(ch)}</div>
        <div class="gs-info">
          <h3>${esc(ch.name)}</h3>
          <div class="gs-type">${esc(ch.type)}</div>
          <p class="gs-desc">${esc(ch.desc)}</p>
          <ul class="gs-fingers">${fi}</ul>
          <p class="gs-strings">${strSummary}</p>
        </div>`;

      if(!seen.has(name)){
        seen.add(name);
        setFoot(node, seen.size, CHORD_ORDER.length, '✓ All chord shapes explored!');
        if(seen.size >= CHORD_ORDER.length && !S.gates[b.gate]){
          Grade.submit({ gate:b.gate, claim:true, node, title:'Chord library',
                         label:'Every chord shape explored', burst:40 })
            .then(res => { if(res && res.correct) passGate(b.gate, node); });
        }
      }
    }

    btns.forEach(btn=>{
      btn.addEventListener('click', ()=>{
        btns.forEach(x => x.classList.remove('chord-active'));
        btn.classList.add('chord-active');
        Audio_.play('strumD');
        renderChord(btn.dataset.chord);
      });
    });

    if(S.gates[b.gate]){
      CHORD_ORDER.forEach(c => seen.add(c));
      setFoot(node, CHORD_ORDER.length, CHORD_ORDER.length, '✓ All chord shapes explored!');
    }
    renderChord('Am');
  }
};

/* ══════════════════════════════════════════════════════════════
   PAGE BUILDING
   ══════════════════════════════════════════════════════════════ */
function buildLessonPage(les){
  const page = el('div','page');
  page.id = 'page-' + les.id;

  const gates = lessonGates(les);
  page.innerHTML = `
    <div class="l-hdr">
      <div class="l-hdr-inner">
        <span class="l-tag">${esc(les.tag)}</span>
        <h2>${esc(les.title)}</h2>
        ${les.desc ? `<p class="l-hdr-desc">${esc(les.desc)}</p>` : ''}
        ${gates.length ? `
        <div class="l-rail">
          <div class="l-rail-bar"><div class="l-rail-fill" id="rail-${les.id}"></div></div>
          <span class="l-rail-txt" id="railtxt-${les.id}">0 / ${gates.length} activities · 0%</span>
        </div>` : ''}
      </div>
    </div>
    <div class="l-body"></div>`;

  const body = $('.l-body', page);
  les.blocks.forEach(b => body.appendChild(buildBlock(b)));
  return page;
}

function buildCompletePage(mod, modKey){
  const c = mod.complete;
  const page = el('div','page');
  page.id = 'page-' + c.id;
  page.innerHTML = `
    <div class="cg-wrap">
      <div class="cg-inner">
        <div class="cg-icon">${c.icon}</div>
        <h2>${esc(c.title)}</h2>
        <div class="cg-conf">${c.conf}</div>
        <p>${c.html}</p>
        <div class="report">
          <div class="report-h">Your Report Card</div>
          <div class="report-grid">
            <div class="report-stat"><b data-r-xp>0</b><span>Total XP</span></div>
            <div class="report-stat"><b data-r-lvl>1</b><span>Level</span></div>
            <div class="report-stat"><b data-r-acc>0%</b><span>Accuracy</span></div>
            <div class="report-stat"><b data-r-streak>0</b><span>Best Streak</span></div>
          </div>
          <div class="report-badges" data-r-badges></div>
        </div>
        <div class="cg-actions">
          <button class="btn-home" data-act="home">⌂ Back to Home</button>
          <button class="btn-home alt" data-act="badges">🏅 View Trophy Case</button>
        </div>
      </div>
    </div>`;

  page._onShow = ()=>{
    const st = Game.stats();
    $('[data-r-xp]', page).textContent = st.xp;
    $('[data-r-lvl]', page).textContent = st.lvl;
    $('[data-r-acc]', page).textContent = st.acc + '%';
    $('[data-r-streak]', page).textContent = st.streak;
    const bw = $('[data-r-badges]', page);
    bw.innerHTML = S.badges.length
      ? S.badges.map(id=>{
          const b = BADGES.find(x => x.id === id);
          return b ? `<span class="rb">${b.em} ${esc(b.n)}</span>` : '';
        }).join('')
      : '<span class="rb">No badges yet — replay the challenges!</span>';

    /* The midterm / final-term badges are decided by the server, from the set
       of activities it has actually cleared — reaching this page is not what
       earns them, finishing the module is. It has usually arrived already. */
    Audio_.play('levelup');
    FX.rain(140);
  };

  $('[data-act="home"]', page).addEventListener('click', ()=> navigateTo('terminal'));
  $('[data-act="badges"]', page).addEventListener('click', openBadges);
  return page;
}

function buildTerminal(){
  const page = el('div','page');
  page.id = 'page-terminal';
  page.innerHTML = `
    <div class="t-hero">
      <div class="t-glyphs"></div>
      <div class="t-hero-inner">
        <span class="t-hero-tag">${esc(TERMINAL.heroTag)}</span>
        <h1>${esc(TERMINAL.heroTitle)}</h1>
        <p class="t-sub">${TERMINAL.heroSub}</p>
      </div>
    </div>
    <div class="t-body">
      <div class="block b-video">
        <video id="terminal-video" src="${esc(TERMINAL.video.src)}" autoplay muted loop playsinline></video>
        <div class="vid-label">${esc(TERMINAL.video.label)}</div>
      </div>

      <div class="block" data-resume></div>

      <div class="block">
        <div class="dash">
          <div class="dash-card"><span class="dash-ico">⚡</span><div class="dash-val" data-d-xp>0</div><div class="dash-lbl">Total XP</div></div>
          <div class="dash-card"><span class="dash-ico">🎖️</span><div class="dash-val" data-d-lvl>1</div><div class="dash-lbl">Level</div></div>
          <div class="dash-card"><span class="dash-ico">🏅</span><div class="dash-val" data-d-badges>0<span class="dv-unit">/${BADGES.length}</span></div><div class="dash-lbl">Badges</div></div>
          <div class="dash-card"><span class="dash-ico">🎯</span><div class="dash-val" data-d-acc>0<span class="dv-unit">%</span></div><div class="dash-lbl">Accuracy</div></div>
        </div>
      </div>

      <div class="block b-text">${TERMINAL.welcome}</div>

      <div class="block b-warn">
        <div class="b-warn-title">${TERMINAL.warnTitle}</div>
        <p>${TERMINAL.warn}</p>
      </div>

      <div class="block">
        <div class="mod-access">
          ${['m','f'].map(k=>{
            const mod = CONTENT[k];
            return `
            <button class="mod-card" data-mod="${k}">
              <div class="mod-card-top">
                <div class="mc-tag">${esc(mod.label)}</div>
                <div class="mc-h">${esc(mod.short)} Learning Module</div>
              </div>
              <div class="mod-card-body">
                <div class="mc-desc">${esc(mod.desc)}</div>
                <div class="mc-foot">
                  <div class="mc-prog">
                    <div class="mc-prog-bar"><div class="mc-prog-fill" data-mp="${k}"></div></div>
                    <div class="mc-prog-txt" data-mpt="${k}">0 / ${mod.lessons.length} lessons</div>
                  </div>
                  <div class="mc-go">→</div>
                </div>
              </div>
            </button>`;
          }).join('')}
        </div>
      </div>
    </div>`;

  // floating glyphs
  const glyphs = $('.t-glyphs', page);
  ['🎨','🖌️','🎭','📸','🎬','🎸','🖼️','✨','🎼','🏛️'].forEach((g,i)=>{
    const s = el('span','t-glyph', g);
    s.style.left = (4 + i * 10 + Math.random()*5) + '%';
    s.style.animationDuration = (13 + Math.random()*11) + 's';
    s.style.animationDelay = (-Math.random()*18) + 's';
    s.style.fontSize = (18 + Math.random()*18) + 'px';
    glyphs.appendChild(s);
  });

  $$('.mod-card', page).forEach(card=>{
    card.addEventListener('click', ()=>{
      const k = card.dataset.mod;
      const firstLocked = CONTENT[k].lessons.find(l => !lessonComplete(l) && S.unlocked[k].includes(l.num));
      navigateTo(firstLocked ? firstLocked.id : CONTENT[k].lessons[0].id);
    });
  });

  page._onShow = ()=>{
    const st = Game.stats();
    $('[data-d-xp]', page).textContent = st.xp;
    $('[data-d-lvl]', page).textContent = st.lvl;
    $('[data-d-badges]', page).innerHTML = `${st.badges}<span class="dv-unit">/${BADGES.length}</span>`;
    $('[data-d-acc]', page).innerHTML = `${st.acc}<span class="dv-unit">%</span>`;

    ['m','f'].forEach(k=>{
      const p = moduleProgress(k);
      const fill = $(`[data-mp="${k}"]`, page);
      const txt  = $(`[data-mpt="${k}"]`, page);
      if(fill) fill.style.width = p.pct + '%';
      if(txt)  txt.textContent = `${p.done} / ${p.total} lessons complete`;
    });

    // resume banner
    const box = $('[data-resume]', page);
    const target = S.lastPage && S.lastPage !== 'terminal' ? findLesson(S.lastPage) : null;
    if(target){
      box.innerHTML = `
        <div class="resume">
          <div class="resume-ico">▶️</div>
          <div class="resume-txt">
            <div class="resume-k">Continue where you left off</div>
            <div class="resume-t">${esc(CONTENT[lessonMod(target.id)].short)} · Lesson ${target.num}: ${esc(target.title)}</div>
          </div>
          <div class="resume-go">→</div>
        </div>`;
      $('.resume', box).addEventListener('click', ()=> navigateTo(target.id));
    }else{
      box.innerHTML = '';
    }

    const v = $('#terminal-video', page);
    if(v){ try{ v.play(); }catch(e){} }
  };

  /* The original module references "images/Video1.mp4" while the file on disk is
     "video1.mp4". Windows and most local servers are case-insensitive so this works
     locally, but it 404s on case-sensitive hosting (Linux, GitHub Pages, Netlify).
     Retry the lowercase spelling once before giving up. */
  const vid = $('#terminal-video', page);
  if(vid){
    vid.addEventListener('error', ()=>{
      if(vid.dataset.retried) return;
      vid.dataset.retried = '1';
      vid.src = TERMINAL.video.src.replace(/Video1\.mp4$/i, 'video1.mp4');
      try{ vid.play(); }catch(e){}
    }, true);
  }

  return page;
}

/* Build (lazily) and return a page node */
function ensurePage(pid){
  if(S.built.has(pid)) return document.getElementById('page-' + pid);
  let node;
  if(pid === 'terminal') node = buildTerminal();
  else if(pid === 'mc')  node = buildCompletePage(CONTENT.m, 'm');
  else if(pid === 'fc')  node = buildCompletePage(CONTENT.f, 'f');
  else {
    const les = findLesson(pid);
    if(!les) return null;
    node = buildLessonPage(les);
  }
  $('#pages').appendChild(node);
  S.built.add(pid);
  return node;
}

/* Run interactive wiring for a page (once) */
function initPage(pid){
  if(S.inited.has(pid)) return;
  S.inited.add(pid);
  const page = document.getElementById('page-' + pid);
  if(!page) return;

  $$('.block, .reveal-sec', page).forEach(node=>{
    const b = node._block;
    if(!b) return;
    const fn = Init[b.t];
    if(fn) fn(node, b);
    // A reveal section stays open if the continue button that opens it is already satisfied.
    if(b.t === 'reveal'){
      const reqs = REVEAL_REQS[b.id];
      if(reqs && reqs.length && reqs.every(g => S.gates[g])) node.classList.add('on');
    }
  });

  // continue buttons
  $$('.btn-cont', page).forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(btn.disabled) return;
      Audio_.play('pop');
      const fn = CONT_ACTS[btn.id];
      if(fn) fn();
    });
    updCont(btn.id);
  });

  refreshLessonRail();
}

/* ══════════════════════════════════════════════════════════════
   NAVIGATION
   ══════════════════════════════════════════════════════════════ */
function navigateTo(pid){
  if(pid === S.page){ closeSidebar(); closeSheet(); return; }
  S.hist.push(S.page);
  showPage(pid);
  closeSidebar();
  closeSheet();
}
function goBack(){
  if(!S.hist.length) return;
  const p = S.hist.pop();
  showPage(p, true);
}

function showPage(pid, isBack){
  const node = ensurePage(pid);
  if(!node) return;

  // pause videos + stop any running timers on the outgoing page
  $$('video').forEach(v=>{ try{ v.pause(); }catch(e){} });
  const old = document.getElementById('page-' + S.page);
  if(old) $$('.block', old).forEach(b=>{ if(b._cleanup) b._cleanup(); });

  $$('.page').forEach(p => p.classList.remove('active'));
  node.classList.add('active');
  $('#wrap').scrollTop = 0;

  S.page = pid;
  if(pid !== 'terminal' && findLesson(pid)) S.lastPage = pid;

  initPage(pid);
  if(node._onShow) node._onShow();

  updateBack();
  refreshSidebar();
  updateBC(pid);
  refreshLessonRail();

  /* "First Steps" is awarded server-side on the first activity a student
     completes — opening a page is not something worth a badge on its own,
     and it was the one badge a student could earn without doing anything. */
  save();
}

function updateBC(pid){
  const bc = breadcrumb(pid);
  $('#bc-mod').textContent = bc[0];
  $('#bc-les').textContent = bc[1];
}
function updateBack(){
  const show = S.hist.length > 0 && S.page !== 'terminal';
  $('#back-btn').classList.toggle('vis', show);
  // On phones the floating button would sit under the bottom nav, so the
  // topbar chevron is used instead.
  $('#tb-back').classList.toggle('vis', show);
}

function unlockLesson(mod, num){
  if(!S.unlocked[mod].includes(num)){
    S.unlocked[mod].push(num);
    const les = CONTENT[mod].lessons.find(l => l.num === num);
    if(les) toast('🔓', 'Lesson unlocked!', `Lesson ${num}: ${les.title}`);
    save();
  }
  refreshSidebar();
}

/* ══════════════════════ SIDEBAR ══════════════════════ */
function buildSidebar(){
  const nav = $('#sb-nav');
  nav.innerHTML = '';

  const home = el('button','sb-home-btn','⌂ &nbsp;Home / Terminal');
  home.addEventListener('click', ()=> navigateTo('terminal'));
  nav.appendChild(home);

  ['m','f'].forEach((k,mi)=>{
    if(mi) nav.appendChild(el('div','sb-mod-div'));
    const mod = CONTENT[k];
    const lbl = el('div','sb-mod-label');
    lbl.innerHTML = `<span>${esc(mod.label)}</span><span class="sb-mod-pct" data-sbpct="${k}">0%</span>`;
    nav.appendChild(lbl);

    mod.lessons.forEach(les=>{
      const item = el('div','nav-item');
      item.id = 'nav-' + les.id;
      item.dataset.page = les.id;
      item.dataset.mod = k;
      item.dataset.num = les.num;
      item.innerHTML = `<div class="nav-icon">${les.num}</div>
        <span class="nav-title">${esc(les.title)}</span>
        <span class="nav-flag"></span>`;
      item.addEventListener('click', ()=>{
        if(!S.unlocked[k].includes(les.num)){
          Audio_.play('wrong');
          toast('🔒', 'Lesson locked', 'Complete the previous lesson to unlock this one.');
          return;
        }
        navigateTo(les.id);
      });
      nav.appendChild(item);
    });
  });
}

function refreshSidebar(){
  $$('.nav-item').forEach(item=>{
    const k = item.dataset.mod, num = +item.dataset.num, pid = item.dataset.page;
    const les = findLesson(pid);
    const open = S.unlocked[k].includes(num);
    const done = les ? lessonComplete(les) : false;

    item.classList.toggle('nav-locked', !open);
    item.classList.toggle('nav-active', pid === S.page);
    item.classList.toggle('nav-done', done);

    const flag = $('.nav-flag', item);
    flag.textContent = !open ? '🔒' : done ? '✓' : '';
    const ico = $('.nav-icon', item);
    ico.textContent = done && pid !== S.page ? '✓' : num;
  });

  // mobile lesson sheet mirrors the same state
  $$('.sheet-item').forEach(item=>{
    const k = item.dataset.mod, num = +item.dataset.num, pid = item.dataset.page;
    const les  = findLesson(pid);
    const open = S.unlocked[k].includes(num);
    const done = les ? lessonComplete(les) : false;

    item.classList.toggle('locked', !open);
    item.classList.toggle('current', pid === S.page);
    item.classList.toggle('done', done);
    $('.sheet-flag', item).textContent = !open ? '🔒' : done ? '✓' : '›';
    $('.sheet-num', item).textContent  = done ? '✓' : num;
  });

  ['m','f'].forEach(k=>{
    const p = moduleProgress(k);
    const e = $(`[data-sbpct="${k}"]`);
    if(e) e.textContent = p.pct + '%';
    const e2 = $(`[data-shpct="${k}"]`);
    if(e2) e2.textContent = `${p.done}/${p.total} · ${p.pct}%`;
  });

  refreshMobileNav();
}

function closeSidebar(){
  $('#sidebar').classList.remove('open');
  $('#sb-overlay').classList.remove('on');
}

/* ══════════════════════════════════════════════════════════════
   MOBILE NAVIGATION
   Phones get no sidebar at all: a thumb-reachable bottom bar plus a
   slide-up lesson sheet replaces it entirely.
   ══════════════════════════════════════════════════════════════ */
function buildSheet(){
  const nav = $('#sheet-nav');
  nav.innerHTML = '';
  ['m','f'].forEach(k=>{
    const mod = CONTENT[k];
    const grp = el('div','sheet-grp');
    grp.innerHTML = `<div class="sheet-grp-hd">
        <span>${esc(mod.label)}</span>
        <span class="sheet-grp-pct" data-shpct="${k}">0%</span>
      </div>`;
    mod.lessons.forEach(les=>{
      const it = el('button','sheet-item');
      it.type = 'button';
      it.dataset.page = les.id;
      it.dataset.mod  = k;
      it.dataset.num  = les.num;
      it.innerHTML = `
        <span class="sheet-num">${les.num}</span>
        <span class="sheet-txt">
          <span class="sheet-t">${esc(les.title)}</span>
          <span class="sheet-d">${esc(les.desc || '')}</span>
        </span>
        <span class="sheet-flag"></span>`;
      it.addEventListener('click', ()=>{
        if(!S.unlocked[k].includes(les.num)){
          Audio_.play('wrong');
          toast('🔒','Lesson locked','Complete the previous lesson to unlock this one.');
          return;
        }
        closeSheet();
        navigateTo(les.id);
      });
      grp.appendChild(it);
    });
    nav.appendChild(grp);
  });
}

function openSheet(){
  $('#sheet').classList.add('on');
  document.body.classList.add('no-scroll');
  Audio_.play('pop');
}
function closeSheet(){
  $('#sheet').classList.remove('on');
  document.body.classList.remove('no-scroll');
}

function refreshMobileNav(){
  $$('#mobilenav .mn-btn').forEach(b=>{
    const k = b.dataset.mn;
    b.classList.toggle('on', (k === 'home' && S.page === 'terminal'));
  });
  // little dot on "Lessons" when something new is unlocked but unfinished
  const anyOpen = ['m','f'].some(k=>
    CONTENT[k].lessons.some(l => S.unlocked[k].includes(l.num) && !lessonComplete(l)));
  const dot = $('#mn-lessons-dot');
  if(dot) dot.classList.toggle('on', anyOpen && S.page === 'terminal');
}

/* ══════════════════════ TROPHY CASE ══════════════════════ */
function openBadges(){
  const card = $('#modal-card');
  const got = S.badges.length;
  card.innerHTML = `
    <div class="modal-hd">
      <div>
        <h3>🏅 Trophy Case</h3>
        <p>Badges earned across both modules</p>
      </div>
      <button class="modal-x" data-act="close">✕</button>
    </div>
    <div class="modal-bd">
      <div class="badge-count"><b>${got}</b> of <b>${BADGES.length}</b> badges unlocked</div>
      <div class="badge-grid">
        ${BADGES.map(b=>`
          <div class="badge-card${S.badges.includes(b.id)?' got':''}">
            <span class="badge-em">${b.em}</span>
            <div class="badge-n">${esc(b.n)}</div>
            <div class="badge-d">${esc(b.d)}</div>
          </div>`).join('')}
      </div>
    </div>`;
  $('#modal-layer').classList.add('on');
  $('[data-act="close"]', card).addEventListener('click', closeModal);
  Audio_.play('pop');
}
function closeModal(){ $('#modal-layer').classList.remove('on'); }

/* ══════════════════════ BOOT ══════════════════════ */
function boot(){
  load();
  registerRequirements();
  FX.setup();
  buildSidebar();
  buildSheet();

  /* localStorage got us this far so the module can paint instantly, but the
     spreadsheet is the record. Overwrite the local view with whatever the
     server handed over at sign-in; the first sync (a second or two from now)
     refreshes it again. A student who edited their saved progress watches it
     revert here. */
  if(window.AAPAuth && AAPAuth.applyState) AAPAuth.applyState();

  Game.refreshHUD();

  $('#sb-overlay').addEventListener('click', closeSidebar);
  $('#back-btn').addEventListener('click', goBack);
  $('#tb-back').addEventListener('click', goBack);
  $('#btn-badges').addEventListener('click', openBadges);
  $('.modal-back').addEventListener('click', closeModal);
  $('#lu-close').addEventListener('click', ()=> $('#levelup').classList.remove('on'));

  // Mobile bottom nav + lesson sheet
  $('.sheet-back').addEventListener('click', closeSheet);
  $('.sheet-x').addEventListener('click', closeSheet);
  $$('#mobilenav .mn-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      switch(btn.dataset.mn){
        case 'home':    closeSheet(); navigateTo('terminal'); break;
        case 'lessons': openSheet(); break;
        case 'badges':  closeSheet(); openBadges(); break;
        case 'sound':   toggleSound(); break;
      }
    });
  });

  const sb = $('#btn-sound');
  function paintSound(){
    sb.textContent = S.sound ? '🔊' : '🔇';
    sb.classList.toggle('muted', !S.sound);
    const mi = $('#mn-sound-ico');
    if(mi) mi.textContent = S.sound ? '🔊' : '🔇';
    $('#mobilenav [data-mn="sound"]')?.classList.toggle('muted', !S.sound);
  }
  window.toggleSound = ()=>{
    S.sound = !S.sound;
    paintSound();
    if(S.sound) Audio_.play('pop');
    save();
  };
  paintSound();
  sb.addEventListener('click', ()=> toggleSound());

  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape'){ closeModal(); closeSidebar(); closeSheet(); $('#levelup').classList.remove('on'); }
  });

  // unlock audio on first gesture (browser autoplay policy)
  const unlock = ()=>{ Audio_.init(); document.removeEventListener('pointerdown', unlock); };
  document.addEventListener('pointerdown', unlock);

  showPage('terminal');

  setTimeout(()=> $('#boot').classList.add('gone'), 620);
}

/* The access layer (assets/auth.js) must clear a student before the module
   builds itself. This fails CLOSED on purpose: if the access layer is missing
   or broken, nobody gets in, because an unlocked module would hand the whole
   course to anyone with the URL. */
document.addEventListener('DOMContentLoaded', ()=>{
  if(!(window.AAPAuth && typeof AAPAuth.gate === 'function')){
    console.error('[AAP101] assets/auth.js did not load — module locked.');
    document.body.innerHTML =
      '<div style="position:fixed;inset:0;display:flex;align-items:center;'
    + 'justify-content:center;padding:28px;background:#002C39;color:#FFF7F7;'
    + 'font:500 15px/1.6 Inter,system-ui,sans-serif;text-align:center">'
    + '<div><div style="font-size:40px;margin-bottom:14px">🔒</div>'
    + '<strong style="display:block;font-size:19px;margin-bottom:8px">Could not start</strong>'
    + 'The sign-in system did not load. Please check your connection and refresh '
    + 'this page.<br><br><span style="opacity:.6;font-size:13px">If it keeps happening, '
    + 'contact your instructor.</span></div></div>';
    return;
  }
  AAPAuth.gate().then(boot).catch(err=>{
    console.error('[AAP101] gate failed:', err);
  });
});
