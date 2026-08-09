/* ══════════════════════════════════════════════════════════════════════════
   AAP101 · ACCESS CONTROL & LIVE TELEMETRY
   ──────────────────────────────────────────────────────────────────────────
   Sits in front of the module: no valid access code, no lesson.
   Once a student is in, it quietly streams their activity to the
   AAP101_Database Google Sheet.

   DESIGN RULE: this file decorates app.js from the outside. It wraps the
   engine's existing functions rather than editing them, so the module keeps
   working exactly as before even if this layer fails completely.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

(function () {

const CFG = Object.assign({
  ENDPOINT: '', SYNC_SECONDS: 20, SYNC_AT_EVENTS: 8, HEARTBEAT_SECONDS: 180,
  SESSION_DAYS: 180, IDLE_MINUTES: 3, DEBUG: false
}, window.AAP_CONFIG || {});

const K_DEVICE  = 'aap101.device';
const K_SESSION = 'aap101.session';
const K_QUEUE   = 'aap101.queue';
const COOKIE    = 'aap101_session';

function dbg() { if (CFG.DEBUG) console.log('[AAP101]', ...arguments); }

/* ═════════════════════════ STORAGE (cookie + localStorage) ═════════════════════════
   Cookies are the primary store because they survive more situations than
   localStorage does, but Safari expires script-written cookies after 7 days,
   so every value is mirrored into localStorage and we read whichever survived. */

function setCookie(name, value, days) {
  try {
    const exp = new Date(Date.now() + days * 864e5).toUTCString();
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; expires=' + exp + '; path=/; SameSite=Lax' + secure;
  } catch (e) {}
}
function getCookie(name) {
  try {
    const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? decodeURIComponent(m[2]) : null;
  } catch (e) { return null; }
}
function delCookie(name) {
  try { document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; } catch (e) {}
}

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

/** Reads from cookie first, falls back to localStorage, and heals whichever is missing. */
function durableGet(cookieName, lsKey) {
  const c = getCookie(cookieName);
  const l = lsGet(lsKey);
  if (c && !l) lsSet(lsKey, c);
  if (l && !c) setCookie(cookieName, l, CFG.SESSION_DAYS);
  return c || l;
}
function durableSet(cookieName, lsKey, value) {
  setCookie(cookieName, value, CFG.SESSION_DAYS);
  lsSet(lsKey, value);
}
function durableDel(cookieName, lsKey) { delCookie(cookieName); lsDel(lsKey); }

/* ═════════════════════════ DEVICE IDENTITY ═════════════════════════ */

function deviceId() {
  let d = durableGet('aap101_device', K_DEVICE);
  if (!d) {
    d = 'dev-' + (crypto && crypto.randomUUID ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
    durableSet('aap101_device', K_DEVICE, d);
  }
  return d;
}

/* ═════════════════════════ NETWORK ═════════════════════════ */

/**
 * Apps Script cannot answer a CORS preflight, so we post JSON with a
 * text/plain content type. That makes it a "simple request" the browser
 * sends directly, and Apps Script still receives the JSON body intact.
 */
function post(payload, timeoutMs) {
  if (!CFG.ENDPOINT) return Promise.reject(new Error('NO_ENDPOINT'));

  const ctrl = ('AbortController' in window) ? new AbortController() : null;
  const timer = setTimeout(() => { try { ctrl && ctrl.abort(); } catch (e) {} }, timeoutMs || 15000);

  return fetch(CFG.ENDPOINT, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    signal: ctrl ? ctrl.signal : undefined
  })
    .then(r => r.text())
    .then(t => { clearTimeout(timer); try { return JSON.parse(t); } catch (e) { throw new Error('BAD_RESPONSE'); } })
    .catch(err => { clearTimeout(timer); throw err; });
}

/* ═════════════════════════ SESSION ═════════════════════════ */

const Session = {
  data: null,

  load() {
    const raw = durableGet(COOKIE, K_SESSION);
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      if (!d || !d.code || !d.token) return null;
      this.data = d;
      return d;
    } catch (e) { return null; }
  },

  save(d) {
    this.data = d;
    durableSet(COOKIE, K_SESSION, JSON.stringify(d));
  },

  clear() {
    this.data = null;
    durableDel(COOKIE, K_SESSION);
  }
};

/* ═════════════════════════ EVENT QUEUE ═════════════════════════
   Events are parked in localStorage so nothing is lost if the student
   closes the tab, loses signal, or the battery dies mid-lesson.        */

const Queue = {
  read() {
    try { return JSON.parse(lsGet(K_QUEUE) || '[]'); } catch (e) { return []; }
  },
  write(arr) {
    /* Hard cap so a very long offline stretch can never fill up storage. */
    if (arr.length > 500) arr = arr.slice(-500);
    lsSet(K_QUEUE, JSON.stringify(arr));
  },
  push(ev) {
    const q = this.read();
    q.push(ev);
    this.write(q);
    return q.length;
  },
  clear() { lsDel(K_QUEUE); }
};

/* ═════════════════════════ RUNTIME CLOCK ═════════════════════════
   Counts genuine study time: the tab must be visible and the student must
   have interacted within IDLE_MINUTES. Prevents a forgotten open tab from
   reporting eight hours of "studying".                                    */

const Clock = {
  activeMs: 0,
  lastTick: Date.now(),
  lastInteract: Date.now(),
  timer: null,

  start() {
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev =>
      document.addEventListener(ev, () => { this.lastInteract = Date.now(); },
        { passive: true, capture: true }));

    this.lastTick = Date.now();
    this.timer = setInterval(() => this.tick(), 1000);
  },

  tick() {
    const now = Date.now();
    const gap = now - this.lastTick;
    this.lastTick = now;
    if (gap > 5000) return;                                    // machine slept
    if (document.visibilityState !== 'visible') return;        // tab in background
    if (now - this.lastInteract > CFG.IDLE_MINUTES * 60000) return;  // walked away
    this.activeMs += gap;
  },

  minutes() { return Math.round((this.activeMs / 60000) * 10) / 10; }
};

/* ═════════════════════════ TELEMETRY ═════════════════════════ */

const Telemetry = {
  sid: null,
  attempts: {},        // activity id -> how many times answered
  timer: null,
  sending: false,
  online: true,
  lastSync: 0,

  begin() {
    this.sid = 's-' + Date.now().toString(36) + '-' +
               Math.random().toString(36).slice(2, 8);

    this.track('runtime', { event: 'session-start', minutes: 0 });
    Clock.start();

    this.timer = setInterval(() => this.flush(), CFG.SYNC_SECONDS * 1000);

    /* A phone "closing" a tab fires visibilitychange, not unload — this is the
       reliable moment to save the final minutes of a session. */
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush(true);
      else this.flush();
    });
    window.addEventListener('pagehide', () => this.flush(true));

    window.addEventListener('online',  () => { this.online = true;  this.flush(); });
    window.addEventListener('offline', () => { this.online = false; });
  },

  track(kind, data) {
    if (!Session.data) return;
    const ev = Object.assign({ kind: kind, ts: new Date().toISOString(), sid: this.sid }, data || {});
    if (!ev.page) ev.page = currentPage();
    const n = Queue.push(ev);
    dbg('track', kind, ev, 'queued=' + n);
    if (n >= CFG.SYNC_AT_EVENTS) this.flush();
  },

  /** Everything the dashboard row needs, recomputed fresh each sync. */
  snapshot() {
    const out = { sessionMinutes: Clock.minutes(), lastPage: currentPage() };
    try {
      const st = (typeof Game !== 'undefined' && Game.stats) ? Game.stats() : null;
      if (st) {
        out.xp = st.xp; out.level = st.lvl; out.accuracy = st.acc;
        out.bestStreak = st.streak; out.badgeCount = st.badges;
        out.rank = (Game.rankFor(st.xp) || {}).name || '';
      }
      if (typeof S !== 'undefined') {
        out.correct = S.correct;
        out.attempts = S.attempts;
        out.badgeList = (S.badges || []).map(id => {
          const b = (typeof BADGES !== 'undefined') ? BADGES.find(x => x.id === id) : null;
          return b ? b.n : id;
        }).join(', ');

        const gates = allGateIds();
        const done  = gates.filter(g => S.gates[g]).length;
        out.activitiesDone = done;
        out.progressPct = gates.length ? Math.round((done / gates.length) * 100) : 0;
        out.lessonsDone = countLessonsDone();
      }
    } catch (e) { dbg('snapshot error', e); }
    return out;
  },

  envelope(events) {
    return {
      action: 'sync',
      code: Session.data.code,
      token: Session.data.token,
      deviceId: deviceId(),
      sid: this.sid,
      events: events,
      snapshot: this.snapshot()
    };
  },

  /**
   * @param {boolean} final  Use sendBeacon — fire-and-forget, survives the
   *                         page being closed, but we cannot read a reply.
   */
  flush(final) {
    if (!Session.data || !CFG.ENDPOINT) return;

    const events = Queue.read();

    if (final) {
      events.push({ kind: 'runtime', event: 'session-end', sid: this.sid,
                    minutes: Clock.minutes(), ts: new Date().toISOString(),
                    page: currentPage() });
      try {
        const blob = new Blob([JSON.stringify(this.envelope(events))],
                              { type: 'text/plain;charset=UTF-8' });
        if (navigator.sendBeacon && navigator.sendBeacon(CFG.ENDPOINT, blob)) {
          Queue.clear();
          dbg('beacon sent', events.length);
        }
      } catch (e) { dbg('beacon failed', e); }
      return;
    }

    if (this.sending) return;

    /* With nothing new to report we still check in occasionally so the
       instructor sees live study time — but rarely, because every sync is an
       Apps Script execution and a whole class syncs at once. */
    const idleGap = Date.now() - this.lastSync;
    if (!events.length && idleGap < CFG.HEARTBEAT_SECONDS * 1000) return;

    this.sending = true;
    this.lastSync = Date.now();
    const batch = events.slice();

    post(this.envelope(batch), 20000)
      .then(res => {
        this.sending = false;
        if (res && res.ok) {
          /* Remove exactly what we sent — events added while in flight stay put. */
          const rest = Queue.read().slice(batch.length);
          Queue.write(rest);
          this.online = true;
          Banner.hide();
          dbg('synced', batch.length);
        } else if (res && (res.error === 'BAD_TOKEN' || res.error === 'DEVICE_LOCKED')) {
          dbg('session rejected:', res.error);
          Banner.show(res.message || 'Your session ended. Please log in again.', true);
          setTimeout(() => AAPAuth.signOut(), 4000);
        } else {
          dbg('sync refused', res);
        }
      })
      .catch(err => {
        this.sending = false;
        this.online = false;
        dbg('sync failed — will retry', err.message);
        Banner.show('Working offline — your progress is saved and will sync automatically.');
      });
  }
};

/* ═════════════════════════ PROGRESS HELPERS ═════════════════════════ */

let _gateCache = null;
function allGateIds() {
  if (_gateCache) return _gateCache;
  const out = [];
  try {
    ['m', 'f'].forEach(k => {
      (CONTENT[k].lessons || []).forEach(les => {
        (function walk(blocks) {
          (blocks || []).forEach(b => {
            if (b.blocks) walk(b.blocks);
            if (b.gate) out.push(b.gate);
          });
        })(les.blocks);
      });
    });
  } catch (e) {}
  _gateCache = out;
  return out;
}

function countLessonsDone() {
  let n = 0;
  try {
    ['m', 'f'].forEach(k => {
      (CONTENT[k].lessons || []).forEach(les => {
        const gates = [];
        (function walk(blocks) {
          (blocks || []).forEach(b => {
            if (b.blocks) walk(b.blocks);
            if (b.gate) gates.push(b.gate);
          });
        })(les.blocks);
        if (gates.length && gates.every(g => S.gates[g])) n++;
      });
    });
  } catch (e) {}
  return n;
}

function currentPage() {
  try { return (typeof S !== 'undefined' && S.page) ? S.page : ''; } catch (e) { return ''; }
}

function lessonLabel() {
  try {
    const les = (typeof findLesson === 'function') ? findLesson(S.page) : null;
    return les ? (les.title || S.page) : (S.page || '');
  } catch (e) { return ''; }
}

/* ═════════════════════════ ENGINE HOOKS ═════════════════════════
   We wrap app.js's own functions. Each wrapper reports what happened and
   then calls the original — and every wrapper is wrapped in try/catch so a
   reporting bug can never stop a student from answering a question.        */

let lastBlock = null;

function installHooks() {

  /* Remember which activity the student last touched, so a correct/wrong
     answer can be attributed to the right quiz. buildBlock() already tags
     every rendered block with its source data as `_block`. */
  document.addEventListener('click', e => {
    let n = e.target;
    for (let i = 0; n && i < 12; i++) {
      if (n._block) { lastBlock = n._block; return; }
      n = n.parentNode;
    }
  }, true);

  function ctx() {
    const b = lastBlock || {};
    return {
      lesson: lessonLabel(),
      actId: b.gate || '',
      actType: b.t || '',
      actTitle: b.title || ''
    };
  }

  function wrap(owner, name, before) {
    const orig = owner[name];
    if (typeof orig !== 'function') return;
    owner[name] = function () {
      try { before.apply(null, arguments); } catch (e) { dbg('hook error in ' + name, e); }
      return orig.apply(this, arguments);
    };
    return orig;
  }

  /* Correct / wrong answers */
  if (typeof Game !== 'undefined') {
    wrap(Game, 'hit', () => {
      const c = ctx();
      const id = c.actId || c.actTitle || 'unknown';
      Telemetry.attempts[id] = (Telemetry.attempts[id] || 0) + 1;
      Telemetry.track('answer', Object.assign(c, { correct: true, attempt: Telemetry.attempts[id] }));
    });

    wrap(Game, 'miss', () => {
      const c = ctx();
      const id = c.actId || c.actTitle || 'unknown';
      Telemetry.attempts[id] = (Telemetry.attempts[id] || 0) + 1;
      Telemetry.track('answer', Object.assign(c, { correct: false, attempt: Telemetry.attempts[id] }));
    });

    wrap(Game, 'awardXP', (amount, label) => {
      if (amount > 0) Telemetry.track('xp', { detail: label || '', value: amount });
    });

    wrap(Game, 'giveBadge', id => {
      if (typeof S !== 'undefined' && S.badges.includes(id)) return;   // already had it
      const b = (typeof BADGES !== 'undefined') ? BADGES.find(x => x.id === id) : null;
      if (!b) return;                                                  // unknown id — engine will ignore it too
      Telemetry.track('badge', { detail: b.n, value: id });
    });

    wrap(Game, 'levelUp', lvl => {
      Telemetry.track('levelup', { detail: 'Reached level ' + lvl, value: lvl });
      Telemetry.flush();
    });
  }

  /* Activity completed (every quiz, sorter, match, boss, simulator…) */
  if (typeof window.passGate === 'function') {
    const origGate = window.passGate;
    window.passGate = function (gid, node) {
      const isNew = (typeof S !== 'undefined') && !S.gates[gid];
      const result = origGate.apply(this, arguments);
      try {
        if (isNew && result) {
          const b = (node && node._block) || lastBlock || {};
          Telemetry.track('activity', {
            lesson: lessonLabel(), actId: gid,
            actType: b.t || '', actTitle: b.title || '',
            attempt: Telemetry.attempts[gid] || 1
          });
        }
      } catch (e) { dbg('passGate hook error', e); }
      return result;
    };
  }

  /* Page views — also gives us "where they left off" */
  if (typeof window.showPage === 'function') {
    const origShow = window.showPage;
    window.showPage = function (pid) {
      const r = origShow.apply(this, arguments);
      try {
        Telemetry.track('page', { detail: lessonLabel() || pid, value: pid, page: pid });
      } catch (e) {}
      return r;
    };
  }
}

/* ═════════════════════════ CONNECTION BANNER ═════════════════════════ */

const Banner = {
  node: null,
  show(msg, bad) {
    if (!this.node) {
      this.node = document.createElement('div');
      this.node.id = 'aap-net-banner';
      document.body.appendChild(this.node);
    }
    this.node.textContent = msg;
    this.node.classList.toggle('bad', !!bad);
    this.node.classList.add('on');
  },
  hide() { if (this.node) this.node.classList.remove('on'); }
};

/* ═════════════════════════ LOGIN SCREEN ═════════════════════════ */

const Gate = {
  resolve: null,
  root: null,

  open() {
    return new Promise(res => {
      this.resolve = res;
      this.render();
    });
  },

  render() {
    const w = document.createElement('div');
    w.id = 'aap-gate';
    w.innerHTML = `
      <div class="ag-card" role="dialog" aria-modal="true" aria-labelledby="ag-title">
        <div class="ag-crest">🎨</div>
        <div class="ag-tag">Bulacan State University</div>
        <h1 id="ag-title">Art Appreciation</h1>
        <div class="ag-sub">AAP101 · A.Y. 2026–2027 · 1st Semester</div>

        <form class="ag-step" data-step="code" autocomplete="off">
          <label for="ag-code">Enter your access code</label>
          <input id="ag-code" name="code" type="text" inputmode="latin"
                 autocapitalize="characters" spellcheck="false"
                 placeholder="AAP-XXXX-XXXX" maxlength="14" required>
          <p class="ag-hint">Your instructor gave you this code. It works on one device only.</p>
          <button type="submit" class="ag-btn">Continue →</button>
        </form>

        <form class="ag-step" data-step="name" hidden autocomplete="off">
          <label for="ag-name">Welcome! What's your full name?</label>
          <input id="ag-name" name="name" type="text" autocomplete="name"
                 placeholder="Juan D. Dela Cruz" maxlength="80" required>
          <label for="ag-section">Section</label>
          <input id="ag-section" name="section" type="text"
                 placeholder="e.g. BSED-1A" maxlength="40">
          <p class="ag-hint">This is saved to your instructor's class record. Enter it carefully — it can't be changed later.</p>
          <button type="submit" class="ag-btn">Start learning →</button>
          <button type="button" class="ag-link" data-act="back">← Use a different code</button>
        </form>

        <div class="ag-step" data-step="busy" hidden>
          <div class="ag-spinner"></div>
          <p class="ag-busy-msg">Checking your code…</p>
        </div>

        <div class="ag-msg" role="alert" hidden></div>
        <div class="ag-foot">Benedict C. de Jesus, LPT. · © Bulacan State University</div>
      </div>`;
    document.body.appendChild(w);
    this.root = w;

    const codeForm = w.querySelector('[data-step="code"]');
    const nameForm = w.querySelector('[data-step="name"]');
    const codeInput = w.querySelector('#ag-code');

    /* Tidies the code as it is typed: uppercases it and drops the dashes into
       place. Deliberately does NOT invent an "AAP" prefix — a student typing
       the prefix themselves would then get it twice. Punctuation is cosmetic
       anyway; the server compares codes with all separators stripped. */
    codeInput.addEventListener('input', () => {
      const atEnd = codeInput.selectionStart === codeInput.value.length;
      const v = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
      let out = v.slice(0, 3);
      if (v.length > 3) out += '-' + v.slice(3, 7);
      if (v.length > 7) out += '-' + v.slice(7);
      codeInput.value = out;
      if (atEnd) codeInput.setSelectionRange(out.length, out.length);
    });

    codeForm.addEventListener('submit', e => {
      e.preventDefault();
      this.submitCode(codeInput.value.trim());
    });

    nameForm.addEventListener('submit', e => {
      e.preventDefault();
      this.submitName(w.querySelector('#ag-name').value.trim(),
                      w.querySelector('#ag-section').value.trim());
    });

    w.querySelector('[data-act="back"]').addEventListener('click', () => {
      this.step('code');
      this.msg('');
    });

    if (!CFG.ENDPOINT) {
      this.step('code');
      codeForm.querySelector('.ag-btn').disabled = true;
      this.msg('This module has not been connected to the class database yet. ' +
               'Instructor: paste your Web app URL into assets/config.js.', true);
      return;
    }

    setTimeout(() => codeInput.focus(), 350);
  },

  step(name) {
    this.root.querySelectorAll('.ag-step').forEach(s => {
      s.hidden = (s.dataset.step !== name);
    });
  },

  busy(text) {
    this.root.querySelector('.ag-busy-msg').textContent = text;
    this.step('busy');
    this.msg('');
  },

  msg(text, bad) {
    const m = this.root.querySelector('.ag-msg');
    m.textContent = text || '';
    m.hidden = !text;
    m.classList.toggle('bad', bad !== false);
  },

  pending: null,

  submitCode(code) {
    if (!code || code.length < 8) { this.msg('Please type your full access code.'); return; }
    this.pending = code;
    this.busy('Checking your code…');

    post({ action: 'check', code: code, deviceId: deviceId(),
           ua: navigator.userAgent, screen: screen.width + '×' + screen.height })
      .then(res => {
        if (!res.ok) {
          this.step('code');
          this.msg(res.message || 'That code was not accepted.');
          return;
        }
        if (res.stage === 'REGISTER') {
          this.step('name');
          setTimeout(() => this.root.querySelector('#ag-name').focus(), 250);
        } else {
          this.finishLogin(code, res.name, res.section);
        }
      })
      .catch(err => {
        this.step('code');
        this.msg(err.message === 'NO_ENDPOINT'
          ? 'This module is not connected to the class database yet.'
          : 'Could not reach the class database. Check your internet connection and try again.');
      });
  },

  submitName(name, section) {
    if (name.length < 2) { this.msg('Please enter your full name.'); return; }
    this.finishLogin(this.pending, name, section);
  },

  finishLogin(code, name, section) {
    this.busy('Signing you in…');

    post({ action: 'login', code: code, name: name, section: section,
           deviceId: deviceId(), ua: navigator.userAgent,
           screen: screen.width + '×' + screen.height })
      .then(res => {
        if (!res.ok) {
          this.step(res.error === 'NAME_REQUIRED' ? 'name' : 'code');
          this.msg(res.message || 'Sign-in failed. Please try again.');
          return;
        }
        Session.save({
          code: res.code, token: res.token,
          name: res.name, section: res.section,
          at: Date.now()
        });
        this.close();
      })
      .catch(() => {
        this.step('code');
        this.msg('Could not reach the class database. Check your internet connection and try again.');
      });
  },

  close() {
    if (this.root) {
      this.root.classList.add('gone');
      setTimeout(() => { if (this.root) this.root.remove(); this.root = null; }, 420);
    }
    if (this.resolve) { this.resolve(); this.resolve = null; }
  }
};

/* ═════════════════════════ SIGNED-IN CHIP ═════════════════════════ */

function installIdentityChip() {
  if (!Session.data) return;
  const label = (Session.data.name || Session.data.code);

  function chip() {
    const d = document.createElement('div');
    d.className = 'aap-whoami';
    d.innerHTML = `<span class="aw-name"></span>
                   <button type="button" class="aw-out">Sign out</button>`;
    d.querySelector('.aw-name').textContent = 'Signed in as ' + label;
    d.querySelector('.aw-out').addEventListener('click', () => {
      if (confirm('Sign out of the module?\n\nYour progress is saved. You will need your access code to get back in.')) {
        AAPAuth.signOut();
      }
    });
    return d;
  }

  const foot = document.querySelector('.sb-footer');
  if (foot) foot.appendChild(chip());

  const sheetHd = document.querySelector('#sheet .sheet-hd');
  if (sheetHd && sheetHd.parentNode) sheetHd.parentNode.insertBefore(chip(), sheetHd.nextSibling);
}

/* ═════════════════════════ PUBLIC API ═════════════════════════ */

const AAPAuth = {

  /** app.js awaits this before booting. Resolves only once a student is in. */
  gate() {
    const s = Session.load();
    if (!s) return Gate.open().then(() => this.afterLogin());

    /* Standalone mode (no database) or genuinely offline: keep working. When
       offline, the first successful sync still re-validates the token, and a
       forged session can never sync because it has no valid signature. */
    if (!CFG.ENDPOINT || !navigator.onLine) {
      return Promise.resolve().then(() => this.afterLogin());
    }

    /* SECURITY (Critical 3): a saved session used to be trusted blindly, so
       anyone could paste a fake session into their browser and skip the access
       code. Now we ask the server to confirm it. Only an EXPLICIT rejection
       forces re-login; if the server is unreachable we fall through and let the
       student keep working (their sync will re-check the token). */
    /* Only these mean "this session is genuinely invalid — send them to login".
       Any other reply (including UNKNOWN_ACTION from a backend that hasn't been
       re-deployed yet) is treated as "can't confirm right now", so we let the
       student in and rely on the next sync to re-check the token. This keeps the
       rollout safe if the site updates before the Apps Script is re-deployed. */
    const REJECT = { BAD_TOKEN: 1, NOT_FOUND: 1, DISABLED: 1, DEVICE_LOCKED: 1 };
    return post({ action: 'resume', code: s.code, token: s.token, deviceId: deviceId() }, 12000)
      .then(res => {
        if (res && !res.ok && REJECT[res.error]) {
          Session.clear();
          Queue.clear();
          return Gate.open().then(() => this.afterLogin());
        }
        return this.afterLogin();
      })
      .catch(() => this.afterLogin());
  },

  afterLogin() {
    try {
      installHooks();
      Telemetry.begin();
      Telemetry.track('login', { detail: Session.data.name || '', value: Session.data.code });
      setTimeout(installIdentityChip, 60);
      if (!navigator.onLine) {
        Banner.show('Working offline — your progress is saved and will sync automatically.');
      }
    } catch (e) { console.warn('[AAP101] telemetry disabled:', e); }
  },

  /** Namespaces saved progress per student so a shared device never mixes them. */
  codeKey() { return Session.data ? Session.data.code : 'guest'; },

  student() { return Session.data ? Object.assign({}, Session.data) : null; },

  signOut() {
    try { Telemetry.flush(true); } catch (e) {}
    Session.clear();
    Queue.clear();
    location.reload();
  },

  /* Exposed for troubleshooting from the browser console. */
  _debug: { CFG, Session, Queue, Telemetry, Clock, deviceId, post }
};

window.AAPAuth = AAPAuth;

})();
