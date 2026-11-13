/* ══════════════════════════════════════════════════════════════════════════
   AAP101 · STUDENT PORTAL
   ──────────────────────────────────────────────────────────────────────────
   Quizzes & exams, and the lesson changes the instructor makes from the
   dashboard (locks, new lessons).

   SECURITY MODEL
     The browser holds no answer keys and no clock it can win with. It shows
     the questions the server hands out for the student's own attempt, saves
     answers as they go, and asks the server to grade. Deadlines are the
     server's; the countdown here is a display of the server's deadline
     corrected for this device's clock offset.

   Everything that reaches the page from the server or the instructor is
   escaped before it is shown. Instructor lessons are rendered from plain
   text with a tiny, safe formatting subset (bold, italic, lists, https links).
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

(function () {

const K_LESSONS = 'aap101.portal.lessons.v1';
const K_ATT     = 'aap101.portal.att.';

const P = {
  overrides: {}, custom: [], openTests: 0,
  tests: null, testsAt: 0, now: 0, offset: 0, loading: null
};

/* ═════════════════════════ HELPERS ═════════════════════════ */

const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };
const nowSrv = () => Date.now() + P.offset;

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ms))]);
}

function fmtDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function fmtLeft(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = n => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}
function fmtSpan(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return m + ' min';
  const hh = Math.floor(m / 60), r = m % 60;
  return hh + ' h' + (r ? ' ' + r + ' min' : '');
}
const termName = t => t === 'FT' ? 'Final Term' : 'Midterm';
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

/* Plain text → safe HTML: paragraphs, "- " lists, **bold**, *italic*, [text](https://…). */
function richText(src) {
  const inline = s => h(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]{1,200})\]\((https:\/\/[^\s)"'<>]{1,500})\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const out = [];
  String(src || '').replace(/\r/g, '').split(/\n{2,}/).forEach(par => {
    const lines = par.split('\n');
    if (lines.every(l => /^\s*[-•]\s+/.test(l))) {
      out.push('<ul>' + lines.map(l => '<li>' + inline(l.replace(/^\s*[-•]\s+/, '')) + '</li>').join('') + '</ul>');
    } else if (par.trim()) {
      out.push('<p>' + lines.map(inline).join('<br>') + '</p>');
    }
  });
  return out.join('');
}

function videoEmbed(url) {
  let m;
  if ((m = url.match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/))) {
    return `<div class="px-embed"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" title="Video" loading="lazy"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  }
  if ((m = url.match(/^https:\/\/(?:www\.)?vimeo\.com\/(\d{5,12})/))) {
    return `<div class="px-embed"><iframe src="https://player.vimeo.com/video/${m[1]}" title="Video" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  if ((m = url.match(/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,80})/))) {
    return `<div class="px-embed"><iframe src="https://drive.google.com/file/d/${m[1]}/preview" title="Video" loading="lazy" allow="autoplay; fullscreen" allowfullscreen></iframe></div>`;
  }
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
    return `<video class="px-video" src="${h(url)}" controls playsinline preload="metadata"></video>`;
  }
  return `<a class="px-linkcard" href="${h(url)}" target="_blank" rel="noopener noreferrer">▶ Open the video</a>`;
}

/* ═════════════════════════ LESSONS ═════════════════════════ */

function applyLessons(d) {
  P.last = d;
  P.overrides = (d && d.overrides) || {};
  P.custom = ((d && d.custom) || []).filter(c => c && /^x-[A-Z0-9]{6,12}$/.test(c.id));
  if (d && typeof d.openTests === 'number') P.openTests = d.openTests;
  const draft = previewDraft();
  ['m', 'f'].forEach(k => (CONTENT[k].lessons || []).forEach(les => {
    if (!les._orig) les._orig = { title: les.title, desc: les.desc, blocks: les.blocks };
    const o = P.overrides[les.id];
    const dr = draft && draft.id === les.id ? draft : null;
    les.title = (dr && dr.title) || (o && o.title) || les._orig.title;
    les.desc  = (dr && dr.desc)  || (o && o.desc)  || les._orig.desc;
    const edited = dr ? dr.blocks : o && o.blocks;
    les.blocks = Array.isArray(edited) && edited.length ? mergeBlocks(les._orig.blocks, edited, les.id) : les._orig.blocks;
  }));
}

/* ── Built-in lessons edited in the Studio ──
   The edited copy replaces the lesson's blocks, with two rules that keep the
   course working whatever arrives: every activity, "Continue" button and
   hidden section of the original must still be there (or the original is
   used), and the fields that drive progress (activity ids, XP, unlocks) are
   always taken from the original. Every text is cleaned to simple
   formatting before it is shown. */
const STRUCT = ['t', 'gate', 'xp', 'id', 'req', 'go', 'unlock', 'reveal', 'mode', 'optional', 'mono', 'cols',
                'badgeOnPerfect', 'badgeOnDone', 'badgeOnClean', 'badge', 'badgeOnClear'];
const FREE_TYPES = ['heading', 'text', 'quote', 'warn', 'compare', 'strum', 'rubric'];
const anchorOf = b => b.gate ? 'g:' + b.gate : (b.t === 'continue' || b.t === 'reveal') && b.id ? b.t + ':' + b.id : /^sim-/.test(b.t) ? 's:' + b.t : '';

function anchors(blocks, map) {
  (blocks || []).forEach(b => {
    if (!b || typeof b !== 'object') return;
    const a = anchorOf(b);
    if (a) map[a] = b;
    if (b.t === 'reveal') anchors(b.blocks, map);
  });
  return map;
}

function mergeBlocks(orig, edited, id) {
  const base = anchors(orig, {}), mine = anchors(edited, {});
  const same = Object.keys(base).length === Object.keys(mine).length && Object.keys(base).every(k => mine[k] && mine[k].t === base[k].t);
  if (!same) { try { console.warn('[AAP] The edited copy of ' + id + ' does not match its activities; showing the original.'); } catch (e) {} return orig; }
  const walk = list => (list || []).map(b => {
    if (!b || typeof b !== 'object') return null;
    const a = anchorOf(b), src = a ? base[a] : null;
    if (!src && FREE_TYPES.indexOf(b.t) < 0) return null;
    const out = cleanVal(b, '');
    if (src) {
      STRUCT.forEach(k => { if (k in src) out[k] = src[k]; else delete out[k]; });
      if (b.t === 'reveal') out.blocks = walk(b.blocks);
    } else {
      out.t = b.t;
      if (b.t === 'heading') out.lvl = b.lvl === 3 ? 3 : 2;
    }
    return out;
  }).filter(Boolean);
  return walk(edited);
}

const IMG_KEYS = { img: 1, src: 1 };
function cleanVal(v, key) {
  if (typeof v === 'string') return IMG_KEYS[key] ? (/^(images\/[\w.\- ]+|https:\/\/[^\s"'<>]+)$/.test(v) ? v : '') : cleanHtml(v);
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.slice(0, 200).map(x => cleanVal(x, key));
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).forEach(k => { if (/^[A-Za-z][\w-]{0,30}$/.test(k)) o[k] = cleanVal(v[k], k); });
    return o;
  }
  return '';
}

const OK_TAGS = /^(P|BR|STRONG|B|EM|I|U|S|UL|OL|LI|A|SPAN|SMALL|SUP|SUB|H3|H4|BLOCKQUOTE|CODE|MARK)$/;
const DROP_TAGS = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META|BASE|FORM|INPUT|TEXTAREA|BUTTON|SELECT|SVG|MATH|TEMPLATE|NOSCRIPT|VIDEO|AUDIO|IMG)$/;
function cleanHtml(s) {
  s = String(s).slice(0, 20000);
  if (s.indexOf('<') < 0) return s;
  const t = document.createElement('template');
  t.innerHTML = s;
  (function scrub(node) {
    Array.from(node.childNodes).forEach(c => {
      if (c.nodeType === 3) return;
      if (c.nodeType !== 1) { c.remove(); return; }
      if (DROP_TAGS.test(c.tagName)) { c.remove(); return; }
      scrub(c);
      if (!OK_TAGS.test(c.tagName)) { c.replaceWith(...Array.from(c.childNodes)); return; }
      const href = c.tagName === 'A' ? c.getAttribute('href') : null;
      Array.from(c.attributes).forEach(at => c.removeAttribute(at.name));
      if (c.tagName === 'A') {
        if (href && /^(https?:|mailto:)/i.test(href.trim())) { c.setAttribute('href', href.trim()); c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener noreferrer'); }
      }
    });
  })(t.content);
  return t.innerHTML;
}

/* The Studio's lesson editor shows unsaved changes in the instructor preview. */
const K_DRAFT = 'aap101.preview.draft';
function previewDraft() {
  if (!(AAPAuth.isPreview && AAPAuth.isPreview()) && !/[?&]preview=1(&|$)/.test(location.search)) return null;
  try { const d = JSON.parse(sessionStorage.getItem(K_DRAFT) || 'null'); return d && /^[mf]\d{1,2}$/.test(d.id) && Array.isArray(d.blocks) ? d : null; } catch (e) { return null; }
}

/** Rebuilds one lesson page in place, keeping the scroll position. Preview only. */
function redraft(id) {
  if (!(AAPAuth.isPreview && AAPAuth.isPreview())) return false;
  applyLessons(P.last);
  if (typeof S !== 'object' || typeof showPage !== 'function') return false;
  const wrap = document.getElementById('wrap'), top = wrap ? wrap.scrollTop : 0, here = S.page === id;
  const old = document.getElementById('page-' + id);
  if (old) { Array.from(old.querySelectorAll('.block')).forEach(b => { if (b._cleanup) try { b._cleanup(); } catch (e) {} }); old.remove(); }
  S.built.delete(id); S.inited.delete(id);
  if (here) { S.page = ''; showPage(id); if (wrap) wrap.scrollTop = top; }
  else if (typeof navigateTo === 'function') navigateTo(id);
  return true;
}

function findCustom(pid) { return P.custom.find(c => c.id === pid) || null; }

function buildCustomLesson(c) {
  const page = el('div', 'page');
  page.id = 'page-' + c.id;
  const tag = (c.term === 'f' ? 'Final Term' : 'Midterm') + ' · From your instructor';
  page.innerHTML = `
    <div class="l-hdr"><div class="l-hdr-inner">
      <span class="l-tag">${h(tag)}</span>
      <h2>${h(c.title)}</h2>
      ${c.desc ? `<p class="l-hdr-desc">${h(c.desc)}</p>` : ''}
    </div></div>
    <div class="l-body"></div>`;
  const body = page.querySelector('.l-body');
  if (c.status !== 'Open') {
    body.innerHTML = `<div class="block px-empty"><div class="px-empty-ico">🔒</div>
      <h3>Locked by your instructor</h3><p>This lesson is not open yet. Check back later.</p></div>`;
    return page;
  }
  (c.body || []).forEach(b => {
    let n;
    if (b.t === 'heading') { n = el('div', 'block b-heading'); n.innerHTML = `<h2>${h(b.text)}</h2>`; }
    else if (b.t === 'text') { n = el('div', 'block b-text'); n.innerHTML = richText(b.text); }
    else if (b.t === 'callout') { n = el('div', 'block px-callout px-' + (b.tone || 'info')); n.innerHTML = richText(b.text); }
    else if (b.t === 'divider') { n = el('div', 'block px-divider'); n.innerHTML = '<span>✦</span>'; }
    else if (b.t === 'image' && /^https:\/\//.test(b.url)) {
      n = el('figure', 'block px-figure');
      n.innerHTML = `<img src="${h(b.url)}" alt="${h(b.caption || '')}" loading="lazy" referrerpolicy="no-referrer" data-onerr="ph">
        ${b.caption ? `<figcaption>${h(b.caption)}</figcaption>` : ''}`;
    }
    else if (b.t === 'video' && /^https:\/\//.test(b.url)) {
      n = el('figure', 'block px-figure');
      n.innerHTML = videoEmbed(b.url) + (b.caption ? `<figcaption>${h(b.caption)}</figcaption>` : '');
    }
    if (n) body.appendChild(n);
  });
  const done = el('div', 'block px-lesson-end');
  done.innerHTML = `<button class="px-btn px-btn-ghost" type="button">⌂ Back to Home</button>`;
  done.querySelector('button').addEventListener('click', () => navigateTo('terminal'));
  body.appendChild(done);
  return page;
}

/* ═════════════════════════ TESTS DATA ═════════════════════════ */

function loadTests(force) {
  if (!force && P.tests && Date.now() - P.testsAt < 30000) return Promise.resolve(P.tests);
  if (P.loading) return P.loading;
  P.loading = AAPAuth.api('tests').then(res => {
    P.loading = null;
    if (!res || !res.ok) throw new Error((res && res.message) || 'Could not load your tests.');
    P.offset = (res.now || Date.now()) - Date.now();
    P.tests = res.tests || [];
    P.testsAt = Date.now();
    P.openTests = P.tests.filter(isActionable).length;
    refreshNav();
    return P.tests;
  }).catch(err => { P.loading = null; throw err; });
  return P.loading;
}

function isActionable(t) { return !!t.live || (t.window === 'open' && t.triesLeft > 0 && !t.best); }

function testState(t) {
  if (t.live) return { key: 'live', label: 'In progress', tone: 'warn' };
  if (t.best && t.best.status) {
    if (t.window === 'open' && t.triesLeft > 0) return { key: 'retake', label: 'Submitted · retake allowed', tone: 'ok' };
    return { key: 'done', label: 'Submitted', tone: 'ok' };
  }
  if (t.window === 'upcoming') return { key: 'upcoming', label: 'Upcoming', tone: 'muted' };
  if (t.window === 'closed') return { key: 'missed', label: 'Closed', tone: 'bad' };
  if (t.triesLeft <= 0) return { key: 'done', label: 'No attempts left', tone: 'muted' };
  return { key: 'open', label: 'Open now', tone: 'go' };
}

function scoreLine(b) {
  if (!b) return '';
  if (b.score == null) return `<div class="px-score px-score-hidden">Score released by your instructor</div>`;
  const pct = b.max ? Math.round(b.score / b.max * 100) : 0;
  return `<div class="px-score"><b>${h(b.score)}</b><span>/ ${h(b.max)}</span><em>${pct}%</em>
    ${b.pending ? `<small>· ${plural(b.pending, 'essay')} still being checked</small>` : ''}</div>`;
}

/* ═════════════════════════ TESTS PAGE ═════════════════════════ */

function buildTestsPage() {
  const page = el('div', 'page');
  page.id = 'page-tests';
  page.innerHTML = `
    <div class="l-hdr px-hdr"><div class="l-hdr-inner">
      <span class="l-tag">📝 Assessments</span>
      <h2>Quizzes &amp; Exams</h2>
      <p class="l-hdr-desc">Your Quiz 1, Quiz 2, Quiz 3 and term exams for the Midterm and Final Term. Each one is timed by the server and saves as you answer.</p>
    </div></div>
    <div class="l-body"><div class="px-list" aria-live="polite"></div></div>`;
  page._onShow = () => renderTests(page.querySelector('.px-list'), true);
  return page;
}

function skeleton(n) {
  return Array.from({ length: n }, () => '<div class="px-card px-skel"><i></i><i></i><i></i></div>').join('');
}

function renderTests(box, force) {
  if (!P.tests) box.innerHTML = skeleton(3);
  loadTests(force).then(tests => {
    if (!tests.length) {
      box.innerHTML = `<div class="px-empty"><div class="px-empty-ico">🗂️</div><h3>No quizzes or exams yet</h3>
        <p>When your instructor opens one, it will appear here.</p></div>`;
      return;
    }
    const groups = { MT: [], FT: [] };
    tests.forEach(t => (groups[t.term] || groups.MT).push(t));
    box.innerHTML = ['MT', 'FT'].filter(k => groups[k].length).map(k => `
      <section class="px-term">
        <h3 class="px-term-h"><span>${termName(k)}</span><i></i></h3>
        <div class="px-grid">${groups[k].map(cardHtml).join('')}</div>
      </section>`).join('');
    box.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => {
      const t = P.tests.find(x => x.id === btn.dataset.id);
      if (!t) return;
      if (btn.dataset.act === 'start') confirmStart(t);
      if (btn.dataset.act === 'resume') begin(t);
      if (btn.dataset.act === 'review') openReview(t);
    }));
  }).catch(err => {
    box.innerHTML = `<div class="px-empty"><div class="px-empty-ico">📡</div><h3>Couldn't reach the class database</h3>
      <p>${h(err.message === 'TIMEOUT' ? 'The connection is slow.' : (err.message || 'Please check your connection.'))}</p>
      <button class="px-btn" type="button" data-retry>Try again</button></div>`;
    box.querySelector('[data-retry]').addEventListener('click', () => renderTests(box, true));
  });
}

function cardHtml(t) {
  const st = testState(t);
  const meta = [
    t.items ? plural(t.items, 'item') : '',
    t.minutes ? fmtSpan(t.minutes * 60000) : 'No time limit',
    t.max ? t.max + ' pts' : ''
  ].filter(Boolean).join(' · ');
  let action = '';
  if (st.key === 'live') action = `<button class="px-btn px-btn-warn" data-act="resume" data-id="${h(t.id)}">Resume · ${fmtLeft(t.live.deadline - nowSrv())} left</button>`;
  else if (st.key === 'open') action = `<button class="px-btn" data-act="start" data-id="${h(t.id)}">Start ${h(t.slot === 'Exams' ? 'exam' : 'quiz')} →</button>`;
  else if (st.key === 'retake') action = `<button class="px-btn px-btn-ghost" data-act="start" data-id="${h(t.id)}">Retake (${t.triesLeft} left)</button>`;
  if (t.best && t.best.reviewReady) action += `<button class="px-btn px-btn-ghost" data-act="review" data-id="${h(t.id)}">Review answers</button>`;
  const when = t.window === 'open' && t.closes ? `Closes ${fmtDate(t.closes)}`
    : t.window === 'upcoming' ? `Opens ${fmtDate(t.opens)}${t.closes ? ' · closes ' + fmtDate(t.closes) : ''}`
    : t.closes ? `Closed ${fmtDate(t.closes)}` : '';
  return `
    <article class="px-card px-${st.key}">
      <div class="px-card-top">
        <span class="px-slot">${h(t.term)} · ${h(t.slot)}</span>
        <span class="px-pill px-${st.tone}">${h(st.label)}</span>
      </div>
      <h4>${h(t.title)}</h4>
      <div class="px-meta">${h(meta)}</div>
      ${when ? `<div class="px-when">🕒 ${h(when)}</div>` : ''}
      ${scoreLine(t.best)}
      ${action ? `<div class="px-actions">${action}</div>` : ''}
    </article>`;
}

/* ═════════════════════════ START DIALOG ═════════════════════════ */

function modal(html, cls) {
  const layer = document.getElementById('modal-layer'), card = document.getElementById('modal-card');
  card.className = 'modal-card ' + (cls || '');
  card.innerHTML = html;
  layer.classList.add('on');
  return card;
}
function closeModal_() {
  document.getElementById('modal-layer').classList.remove('on');
  document.getElementById('modal-card').className = 'modal-card';
}

function confirmStart(t) {
  const card = modal(`
    <div class="modal-hd"><div><h3>${h(t.title)}</h3><p>${h(termName(t.term))} · ${h(t.slot)}</p></div>
      <button class="modal-x" data-x aria-label="Close">✕</button></div>
    <div class="modal-bd px-start">
      <div class="px-facts">
        <div><b>${h(t.items || '—')}</b><span>Items</span></div>
        <div><b>${t.minutes ? h(fmtSpan(t.minutes * 60000)) : '∞'}</b><span>Time limit</span></div>
        <div><b>${h(t.triesLeft)}</b><span>${t.triesLeft === 1 ? 'Attempt' : 'Attempts'} left</span></div>
      </div>
      ${t.instr ? `<div class="px-instr">${richText(t.instr)}</div>` : ''}
      <ul class="px-rules">
        <li>The timer starts when you press <b>Begin</b> and keeps running even if you close the page.</li>
        <li>Your answers save automatically. If you lose connection, keep going: they are kept on this device and sent when you reconnect.</li>
        <li>Leaving this page during the test is recorded for your instructor.</li>
        ${t.closes ? `<li>The test closes at <b>${h(fmtDate(t.closes))}</b>, even if you still have time left.</li>` : ''}
      </ul>
      <label class="px-ready"><input type="checkbox" data-ready> <span><b>Academic Integrity.</b> I will answer on my own, use no unauthorized help, notes or AI tools, and not share the test contents with anyone who may take this course.</span></label>
      <div class="px-actions px-actions-end">
        <button class="px-btn px-btn-ghost" data-x type="button">Not yet</button>
        <button class="px-btn" data-go type="button" disabled>Begin</button>
      </div>
    </div>`, 'px-modal');
  card.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', closeModal_));
  const go = card.querySelector('[data-go]');
  card.querySelector('[data-ready]').addEventListener('change', e => { go.disabled = !e.target.checked; });
  go.addEventListener('click', () => { go.disabled = true; go.textContent = 'Starting…'; begin(t); });
}

/* ═════════════════════════ RUNNER ═════════════════════════ */

let R = null;

function begin(t) {
  AAPAuth.api('testStart', { testId: t.id }).then(res => {
    closeModal_();
    if (!res || !res.ok) { toast('⚠️', 'Could not start', (res && res.message) || 'Please try again.'); renderAllLists(true); return; }
    P.offset = (res.now || Date.now()) - Date.now();
    openRunner(res);
  }).catch(() => {
    closeModal_();
    toast('📡', 'No connection', 'Starting a test needs a connection. Please try again.');
  });
}

function openRunner(res) {
  const local = (() => { try { return JSON.parse(lsGet(K_ATT + res.attempt.id) || 'null'); } catch (e) { return null; } })();
  R = {
    test: res.test, attempt: res.attempt, qs: res.questions,
    answers: Object.assign({}, res.attempt.answers || {}, (local && local.answers) || {}),
    flags: new Set((local && local.flags) || []),
    focus: Math.max(res.attempt.focus || 0, (local && local.focus) || 0),
    idx: 0, dirty: !!local, saving: false, lastSave: 0, saveTimer: null, tick: null,
    warned5: false, warned1: false, submitting: false, done: false
  };
  const node = document.createElement('div');
  node.id = 'px-run';
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-modal', 'true');
  node.setAttribute('aria-label', res.test.title);
  node.innerHTML = `
    <header class="pxr-top">
      <div class="pxr-id">
        <span class="px-slot">${h(res.test.term)} · ${h(res.test.slot)}</span>
        <strong>${h(res.test.title)}</strong>
      </div>
      <div class="pxr-timer" data-timer role="timer" aria-live="off"><span class="pxr-ti">⏱</span><b>--:--</b></div>
      <div class="pxr-save" data-save aria-live="polite">Saved</div>
    </header>
    <div class="pxr-prog"><div class="pxr-prog-fill" data-prog></div></div>
    <div class="pxr-body">
      <aside class="pxr-map" aria-label="Questions">
        <div class="pxr-map-h">Questions <span data-count></span></div>
        <div class="pxr-map-grid" data-map></div>
        <div class="pxr-legend"><span><i class="lg-a"></i>Answered</span><span><i class="lg-f"></i>Flagged</span></div>
      </aside>
      <main class="pxr-main"><div class="pxr-q" data-q></div></main>
    </div>
    <footer class="pxr-foot">
      <button class="px-btn px-btn-ghost" data-prev type="button">← Previous</button>
      <button class="px-btn px-btn-flag" data-flag type="button" aria-pressed="false">⚑ Flag</button>
      <button class="px-btn" data-next type="button">Next →</button>
    </footer>`;
  document.body.appendChild(node);
  document.body.classList.add('px-running');
  R.node = node;

  node.querySelector('[data-prev]').addEventListener('click', () => go(R.idx - 1));
  node.querySelector('[data-next]').addEventListener('click', () => { if (R.idx >= R.qs.length - 1) reviewSubmit(); else go(R.idx + 1); });
  node.querySelector('[data-flag]').addEventListener('click', () => {
    const q = R.qs[R.idx];
    if (R.flags.has(q.qid)) R.flags.delete(q.qid); else R.flags.add(q.qid);
    backup(); paintMap(); paintFoot();
  });

  paintMap();
  go(0);
  tick();
  R.tick = setInterval(tick, 1000);
  R.autosave = setInterval(() => { if (R && R.dirty) save(); }, 20000);
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('beforeunload', onUnload);
  window.addEventListener('online', onOnline);
  document.addEventListener('keydown', onKey);
  if (R.dirty) save();
}

function onUnload(e) { if (R && !R.done) { backup(); e.preventDefault(); e.returnValue = ''; } }
function onOnline() { if (R && R.dirty) save(); }
function onVis() {
  if (!R || R.done) return;
  if (document.visibilityState === 'hidden') {
    R.focus++; R.dirty = true; backup();
  } else {
    toast('👀', 'You left the test page', 'Your instructor can see how often this happens.');
    save();
  }
}
function onKey(e) {
  if (!R || R.done || e.target.matches('input[type=text], textarea')) return;
  const q = R.qs[R.idx];
  if (e.key === 'ArrowRight') { e.preventDefault(); if (R.idx < R.qs.length - 1) go(R.idx + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); go(R.idx - 1); }
  else if (q && q.options && /^[1-9a-jA-J]$/.test(e.key)) {
    const i = /\d/.test(e.key) ? Number(e.key) - 1 : e.key.toLowerCase().charCodeAt(0) - 97;
    if (i < q.options.length) { choose(q, i); }
  }
}

function backup() {
  if (!R) return;
  lsSet(K_ATT + R.attempt.id, JSON.stringify({ answers: R.answers, flags: Array.from(R.flags), focus: R.focus, at: Date.now() }));
}

function isAnswered(q) {
  const v = R.answers[q.qid];
  return !(v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length));
}

function paintMap() {
  const box = R.node.querySelector('[data-map]');
  box.innerHTML = R.qs.map((q, i) => `<button type="button" data-i="${i}" class="${[
    isAnswered(q) ? 'a' : '', R.flags.has(q.qid) ? 'f' : '', i === R.idx ? 'cur' : ''
  ].join(' ')}" aria-label="Question ${i + 1}${isAnswered(q) ? ', answered' : ''}${R.flags.has(q.qid) ? ', flagged' : ''}">${i + 1}</button>`).join('');
  box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => go(Number(b.dataset.i))));
  const n = R.qs.filter(isAnswered).length;
  R.node.querySelector('[data-count]').textContent = `${n}/${R.qs.length}`;
  R.node.querySelector('[data-prog]').style.width = (R.qs.length ? n / R.qs.length * 100 : 0) + '%';
}

function paintFoot() {
  const q = R.qs[R.idx];
  const f = R.node.querySelector('[data-flag]');
  f.classList.toggle('on', R.flags.has(q.qid));
  f.setAttribute('aria-pressed', R.flags.has(q.qid) ? 'true' : 'false');
  R.node.querySelector('[data-prev]').disabled = R.idx === 0;
  const nx = R.node.querySelector('[data-next]');
  nx.textContent = R.idx >= R.qs.length - 1 ? 'Review & submit ✓' : 'Next →';
  nx.classList.toggle('px-btn-finish', R.idx >= R.qs.length - 1);
}

function go(i) {
  if (!R || i < 0 || i >= R.qs.length) return;
  R.idx = i;
  const q = R.qs[i], v = R.answers[q.qid];
  const box = R.node.querySelector('[data-q]');
  const kind = { mc: 'Choose one', multi: 'Select all that apply', tf: 'True or false', ident: 'Type your answer', essay: 'Write your answer' }[q.type];
  let input = '';
  if (q.type === 'mc' || q.type === 'multi' || q.type === 'tf') {
    const sel = q.type === 'multi' ? (Array.isArray(v) ? v : []) : [q.type === 'tf' ? (v === true ? 0 : v === false ? 1 : -1) : v];
    input = `<div class="pxr-opts ${q.type === 'tf' ? 'pxr-tf' : ''}" role="${q.type === 'multi' ? 'group' : 'radiogroup'}">` +
      q.options.map((o, k) => `<button type="button" class="pxr-opt ${sel.indexOf(k) >= 0 ? 'on' : ''}" data-k="${k}"
        role="${q.type === 'multi' ? 'checkbox' : 'radio'}" aria-checked="${sel.indexOf(k) >= 0}">
        <span class="pxr-key">${q.type === 'multi' ? (sel.indexOf(k) >= 0 ? '✓' : '') : String.fromCharCode(65 + k)}</span>
        <span class="pxr-ot">${h(o)}</span></button>`).join('') + '</div>';
  } else if (q.type === 'ident') {
    input = `<input class="pxr-text" type="text" maxlength="200" autocomplete="off" spellcheck="false" placeholder="Your answer" value="${h(v || '')}">`;
  } else {
    input = `<textarea class="pxr-essay" maxlength="5000" placeholder="Write your answer here…">${h(v || '')}</textarea>
      <div class="pxr-chars"><span data-chars>${String(v || '').length}</span> / 5000</div>`;
  }
  box.innerHTML = `
    <div class="pxr-qhd"><span>Question ${i + 1} of ${R.qs.length}</span><span>${h(q.points)} ${q.points === 1 ? 'pt' : 'pts'} · ${h(kind)}</span></div>
    <div class="pxr-prompt">${richText(q.prompt)}</div>
    ${q.image ? `<img class="pxr-img" src="${h(q.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-onerr="rm">` : ''}
    ${input}`;
  box.querySelectorAll('.pxr-opt').forEach(b => b.addEventListener('click', () => choose(q, Number(b.dataset.k))));
  const txt = box.querySelector('.pxr-text, .pxr-essay');
  if (txt) {
    txt.addEventListener('input', () => {
      R.answers[q.qid] = txt.value;
      const c = box.querySelector('[data-chars]'); if (c) c.textContent = txt.value.length;
      changed(false);
    });
    if (window.matchMedia('(hover:hover)').matches) setTimeout(() => txt.focus(), 30);
  }
  box.classList.remove('pxr-in'); void box.offsetWidth; box.classList.add('pxr-in');
  R.node.querySelector('.pxr-main').scrollTop = 0;
  paintMap(); paintFoot();
}

function choose(q, k) {
  if (q.type === 'multi') {
    const cur = Array.isArray(R.answers[q.qid]) ? R.answers[q.qid].slice() : [];
    const at = cur.indexOf(k);
    if (at >= 0) cur.splice(at, 1); else cur.push(k);
    R.answers[q.qid] = cur.sort((a, b) => a - b);
  } else if (q.type === 'tf') {
    R.answers[q.qid] = k === 0;
  } else {
    R.answers[q.qid] = k;
  }
  try { Audio_.play('pop'); } catch (e) {}
  changed(true);
  go(R.idx);
}

function changed(repaint) {
  R.dirty = true;
  backup();
  setSave('Unsaved changes', 'pending');
  clearTimeout(R.saveTimer);
  const wait = Math.max(2000, 4000 - (Date.now() - R.lastSave));
  R.saveTimer = setTimeout(save, wait);
  if (!repaint) paintMap();
}

function setSave(text, cls) {
  if (!R) return;
  const s = R.node.querySelector('[data-save]');
  s.textContent = text;
  s.className = 'pxr-save ' + (cls || '');
}

function save() {
  if (!R || R.done || R.saving || !R.dirty) return Promise.resolve();
  if (!navigator.onLine) { setSave('Offline · kept on this device', 'off'); return Promise.resolve(); }
  R.saving = true; R.dirty = false; R.lastSave = Date.now();
  setSave('Saving…', 'pending');
  const id = R.attempt.id;
  return AAPAuth.api('testSave', { attemptId: id, answers: R.answers, focusLost: R.focus }, 20000).then(res => {
    if (!R || R.attempt.id !== id) return;
    R.saving = false;
    if (res && res.ok) {
      setSave('Saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 'ok');
      if (res.deadline) R.attempt.deadline = res.deadline;
      if (res.now) P.offset = res.now - Date.now();
    } else if (res && (res.error === 'TIME_UP' || res.error === 'SUBMITTED')) {
      finish({ status: 'AUTO_SUBMITTED' }, res.message);
    } else {
      R.dirty = true;
      setSave('Not saved yet · retrying', 'off');
    }
  }).catch(() => {
    if (!R) return;
    R.saving = false; R.dirty = true;
    setSave('Offline · kept on this device', 'off');
  });
}

function tick() {
  if (!R || R.done) return;
  const left = R.attempt.deadline - nowSrv();
  const t = R.node.querySelector('[data-timer]');
  t.querySelector('b').textContent = fmtLeft(left);
  t.classList.toggle('warn', left < 5 * 60000);
  t.classList.toggle('danger', left < 60000);
  if (!R.warned5 && left < 5 * 60000 && left > 60000 && R.attempt.deadline - R.attempt.startedAt > 10 * 60000) {
    R.warned5 = true; toast('⏳', '5 minutes left', 'Check any flagged questions.');
  }
  if (!R.warned1 && left < 60000 && left > 0) { R.warned1 = true; toast('⏰', '1 minute left', 'Your answers will be submitted automatically.'); }
  if (left <= 0 && !R.submitting) { submit(true); }
}

function reviewSubmit() {
  const unanswered = R.qs.map((q, i) => isAnswered(q) ? null : i + 1).filter(Boolean);
  const flagged = R.qs.map((q, i) => R.flags.has(q.qid) ? i + 1 : null).filter(Boolean);
  const sheet = document.createElement('div');
  sheet.className = 'pxr-confirm';
  sheet.innerHTML = `
    <div class="pxr-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="pxc-h">
      <h3 id="pxc-h">Submit your answers?</h3>
      <div class="px-facts">
        <div><b>${R.qs.length - unanswered.length}</b><span>Answered</span></div>
        <div class="${unanswered.length ? 'bad' : ''}"><b>${unanswered.length}</b><span>Unanswered</span></div>
        <div class="${flagged.length ? 'warn' : ''}"><b>${flagged.length}</b><span>Flagged</span></div>
      </div>
      ${unanswered.length ? `<p class="pxr-miss">Unanswered: ${unanswered.slice(0, 20).map(n => `<button type="button" data-jump="${n - 1}">${n}</button>`).join('')}${unanswered.length > 20 ? '…' : ''}</p>` : ''}
      <p class="pxr-note">You can't change your answers after you submit.</p>
      <div class="px-actions px-actions-end">
        <button class="px-btn px-btn-ghost" data-back type="button">Keep working</button>
        <button class="px-btn px-btn-finish" data-ok type="button">Submit now</button>
      </div>
    </div>`;
  R.node.appendChild(sheet);
  const close = () => sheet.remove();
  sheet.querySelector('[data-back]').addEventListener('click', close);
  sheet.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => { close(); go(Number(b.dataset.jump)); }));
  sheet.querySelector('[data-ok]').addEventListener('click', () => { close(); submit(false); });
  setTimeout(() => sheet.querySelector('[data-ok]').focus(), 30);
}

function submit(auto) {
  if (!R || R.submitting) return;
  R.submitting = true;
  clearTimeout(R.saveTimer);
  const id = R.attempt.id;
  const overlay = document.createElement('div');
  overlay.className = 'pxr-busy';
  overlay.innerHTML = `<div class="ag-spinner"></div><p>${auto ? 'Time is up. Submitting your answers…' : 'Submitting your answers…'}</p>`;
  R.node.appendChild(overlay);
  const attemptOnce = (n) => AAPAuth.api('testSubmit', { attemptId: id, answers: R.answers, focusLost: R.focus }, 30000)
    .then(res => {
      if (res && res.ok) { finish(res.result); return; }
      if (res && res.error === 'BUSY' && n < 3) return new Promise(r => setTimeout(r, 2500)).then(() => attemptOnce(n + 1));
      overlay.remove(); R.submitting = false;
      toast('⚠️', 'Not submitted yet', (res && res.message) || 'Please press Submit again.');
    })
    .catch(() => {
      if (n < 3) return new Promise(r => setTimeout(r, 3000)).then(() => attemptOnce(n + 1));
      overlay.innerHTML = `<p>You're offline. Your answers are safe on this device.<br>Reconnect, then press the button.</p>
        <button class="px-btn" type="button">Submit again</button>`;
      overlay.querySelector('button').addEventListener('click', () => { overlay.remove(); R.submitting = false; submit(auto); });
    });
  attemptOnce(0);
}

function teardown() {
  if (!R) return;
  clearInterval(R.tick); clearInterval(R.autosave); clearTimeout(R.saveTimer);
  document.removeEventListener('visibilitychange', onVis);
  window.removeEventListener('beforeunload', onUnload);
  window.removeEventListener('online', onOnline);
  document.removeEventListener('keydown', onKey);
}

function finish(result, note) {
  if (!R) return;
  R.done = true;
  teardown();
  lsDel(K_ATT + R.attempt.id);
  const r = result || {};
  const show = r.score != null;
  const pct = show && r.max ? Math.round(r.score / r.max * 100) : 0;
  const deg = Math.round(pct * 3.6);
  const body = R.node.querySelector('.pxr-body');
  R.node.querySelectorAll('.pxr-busy, .pxr-confirm').forEach(n => n.remove());
  const foot = R.node.querySelector('.pxr-foot');
  if (foot) foot.remove();
  R.node.querySelector('[data-timer]').classList.add('stopped');
  setSave('Submitted', 'ok');
  body.innerHTML = `
    <div class="pxr-result">
      ${show ? `<div class="pxr-ring" style="--deg:${deg}deg"><div><b>${h(r.score)}</b><span>of ${h(r.max)}</span></div></div>
        <h3>${pct >= 90 ? 'Outstanding!' : pct >= 75 ? 'Well done!' : pct >= 60 ? 'Nice effort.' : 'Submitted.'}</h3>
        <p>You scored <b>${h(r.points)}</b> of <b>${h(r.maxPoints)}</b> points (${pct}%).</p>
        ${r.pending ? `<p class="pxr-note">${plural(r.pending, 'written answer')} will be checked by your instructor, so your score may go up.</p>` : ''}`
      : `<div class="pxr-check">✓</div><h3>Submitted</h3><p>Your instructor will release the scores.</p>`}
      ${note ? `<p class="pxr-note">${h(note)}</p>` : ''}
      ${r.status === 'AUTO_SUBMITTED' ? `<p class="pxr-note">Time ran out, so your saved answers were submitted for you.</p>` : ''}
      <button class="px-btn" type="button" data-done>Back to Quizzes &amp; Exams</button>
    </div>`;
  body.querySelector('[data-done]').addEventListener('click', closeRunner);
  if (show && pct >= 75) { try { FX.rain(pct >= 90 ? 140 : 80); Audio_.play('levelup'); } catch (e) {} }
  P.tests = null;
}

function closeRunner() {
  teardown();
  if (R && R.node) R.node.remove();
  document.body.classList.remove('px-running');
  R = null;
  renderAllLists(true);
}

function renderAllLists(force) {
  const box = document.querySelector('#page-tests .px-list');
  if (box) renderTests(box, force); else loadTests(force).catch(() => {});
  const card = document.querySelector('#page-terminal [data-assess]');
  if (card) terminalCard(card);
}

/* ═════════════════════════ REVIEW ═════════════════════════ */

function openReview(t) {
  if (!t.best || !t.best.id) return;
  const card = modal(`<div class="modal-hd"><div><h3>${h(t.title)}</h3><p>Answer review</p></div>
    <button class="modal-x" data-x aria-label="Close">✕</button></div>
    <div class="modal-bd"><div class="px-skel-line"></div><div class="px-skel-line"></div></div>`, 'px-modal px-modal-wide');
  card.querySelector('[data-x]').addEventListener('click', closeModal_);
  AAPAuth.api('testReview', { attemptId: t.best.id }).then(res => {
    const bd = card.querySelector('.modal-bd');
    if (!res || !res.ok) { bd.innerHTML = `<p>${h((res && res.message) || 'Review is not available yet.')}</p>`; return; }
    bd.innerHTML = scoreLine(res.result) + res.items.map(it => {
      const right = it.earned !== null && it.earned >= it.points;
      const pend = it.earned === null;
      let mine = '—', key = '';
      if (it.type === 'mc' || it.type === 'tf') {
        const gi = it.type === 'tf' ? (it.given === true ? 0 : it.given === false ? 1 : null) : it.given;
        const ki = it.type === 'tf' ? (it.answer === true ? 0 : 1) : it.answer;
        mine = gi == null ? '—' : h(it.options[gi]);
        key = h(it.options[ki]);
      } else if (it.type === 'multi') {
        mine = (it.given || []).map(i => h(it.options[i])).join(', ') || '—';
        key = (it.answer || []).map(i => h(it.options[i])).join(', ');
      } else if (it.type === 'ident') {
        mine = it.given ? h(it.given) : '—'; key = h((it.answer || []).join(' / '));
      } else {
        mine = it.given ? h(it.given) : '—';
      }
      return `<div class="px-rv ${pend ? 'pend' : right ? 'ok' : 'bad'}">
        <div class="px-rv-h"><span>${it.n}</span><b>${pend ? 'Being checked' : right ? 'Correct' : 'Incorrect'}</b><em>${pend ? '' : h(it.earned) + ' / '}${h(it.points)}</em></div>
        <div class="px-rv-q">${richText(it.prompt)}</div>
        <div class="px-rv-a"><span>Your answer</span>${mine}</div>
        ${key && !right ? `<div class="px-rv-a key"><span>Correct answer</span>${key}</div>` : ''}
        ${it.explain ? `<div class="px-rv-x">${richText(it.explain)}</div>` : ''}
      </div>`;
    }).join('');
  }).catch(() => { card.querySelector('.modal-bd').innerHTML = '<p>Could not load the review. Please try again.</p>'; });
}

/* ═════════════════════════ NAV & TERMINAL ═════════════════════════ */

function navItem(c, mode) {
  const locked = c.status !== 'Open';
  if (mode === 'sheet') {
    const it = el('button', 'sheet-item px-sheet-item' + (locked ? ' locked' : ''));
    it.type = 'button'; it.dataset.portal = c.id;
    it.innerHTML = `<span class="sheet-num">★</span><span class="sheet-txt"><span class="sheet-t">${h(c.title)}</span>
      <span class="sheet-d">${h(c.desc || 'From your instructor')}</span></span><span class="sheet-flag">${locked ? '🔒' : '›'}</span>`;
    it.addEventListener('click', () => { if (locked) return lockedMsg(); closeSheet(); navigateTo(c.id); });
    return it;
  }
  const it = el('div', 'nav-item px-nav-item' + (locked ? ' nav-locked' : ''));
  it.dataset.portal = c.id;
  it.innerHTML = `<div class="nav-icon">★</div><span class="nav-title">${h(c.title)}</span><span class="nav-flag">${locked ? '🔒' : ''}</span>`;
  it.addEventListener('click', () => { if (locked) return lockedMsg(); navigateTo(c.id); });
  return it;
}

function refreshNav() {
  document.querySelectorAll('[data-portal]').forEach(n => {
    n.classList.toggle('nav-active', n.dataset.portal === S.page);
    n.classList.toggle('current', n.dataset.portal === S.page);
  });
  const btn = document.querySelector('.px-sb-tests');
  if (btn) {
    btn.classList.toggle('on', S.page === 'tests');
    ['grades', 'guide'].forEach(pid => { const x = document.querySelector('.px-sb-' + pid); if (x) x.classList.toggle('on', S.page === pid); });
    const b = btn.querySelector('.px-badge');
    b.textContent = P.openTests || '';
    b.hidden = !P.openTests;
  }
  const dot = document.getElementById('mn-tests-dot');
  if (dot) dot.classList.toggle('on', !!P.openTests && S.page !== 'tests');
}

function terminalCard(box) {
  if (!box) return;
  const paint = () => {
    const tests = P.tests || [];
    const act = tests.filter(isActionable).sort((a, b) => (a.live ? -1 : 0) - (b.live ? -1 : 0) || (a.closes || 9e15) - (b.closes || 9e15));
    const next = tests.filter(t => t.window === 'upcoming').sort((a, b) => a.opens - b.opens)[0];
    if (!act.length && !next) { box.innerHTML = ''; return; }
    const t = act[0] || next;
    const live = !!t.live, upcoming = !act.length;
    box.innerHTML = `
      <button class="px-hero ${live ? 'live' : upcoming ? 'soon' : ''}" type="button">
        <span class="px-hero-ico">${live ? '⏳' : upcoming ? '🗓️' : '📝'}</span>
        <span class="px-hero-txt">
          <span class="px-hero-k">${live ? 'Test in progress' : upcoming ? 'Coming up' : act.length > 1 ? act.length + ' tests are open' : 'A test is open'}</span>
          <span class="px-hero-t">${h(t.term)} · ${h(t.slot)} · ${h(t.title)}</span>
          <span class="px-hero-d">${live ? fmtLeft(t.live.deadline - nowSrv()) + ' left' : upcoming ? 'Opens ' + h(fmtDate(t.opens)) : t.closes ? 'Closes ' + h(fmtDate(t.closes)) : 'No closing date'}</span>
        </span>
        <span class="px-hero-go">→</span>
      </button>`;
    box.querySelector('button').addEventListener('click', () => navigateTo('tests'));
  };
  paint();
  loadTests(false).then(paint).catch(() => {});
}

/* ═════════════════════════ MY GRADES (online consultation) ═════════════════════════ */

function buildGradesPage() {
  const page = el('div', 'page');
  page.id = 'page-grades';
  page.innerHTML = `
    <div class="l-hdr px-hdr"><div class="l-hdr-inner">
      <span class="l-tag">🎓 Grade Consultation</span>
      <h2>My Grades</h2>
      <p class="l-hdr-desc">Your class record for AAP101, once your instructor releases a term: each score, how the grade was computed, and what to focus on next.</p>
    </div></div>
    <div class="l-body"><div class="px-grades" aria-live="polite"></div></div>`;
  page._onShow = () => renderGrades(page.querySelector('.px-grades'));
  return page;
}

function renderGrades(box) {
  box.innerHTML = skeleton(2);
  withTimeout(AAPAuth.api('grades', {}, 20000), 25000).then(res => {
    if (!res || !res.ok) throw new Error((res && res.message) || 'Could not load your grades.');
    if (res.state !== 'open') {
      const ico = res.state === 'closed' ? '🔒' : '🗂️';
      const title = res.state === 'closed' ? 'Grades are not released yet' : 'You are not on the class record yet';
      box.innerHTML = `<div class="px-empty"><div class="px-empty-ico">${ico}</div><h3>${title}</h3><p>${h(res.message)}</p>
        ${res.note ? `<p class="px-grades-note">${h(res.note)}</p>` : ''}</div>`;
      return;
    }
    box.innerHTML = window.AAPGrades ? AAPGrades.render(res.record, { note: res.note })
                                     : '<div class="px-empty"><h3>Please reload the page.</h3></div>';
  }).catch(err => {
    box.innerHTML = `<div class="px-empty"><div class="px-empty-ico">📡</div><h3>Couldn't reach the class database</h3>
      <p>${h(err.message === 'TIMEOUT' ? 'The connection is slow. Please try again.' : (err.message || 'Please check your connection.'))}</p>
      <button class="px-btn px-btn-ghost" type="button">Try again</button></div>`;
    box.querySelector('button').addEventListener('click', () => renderGrades(box));
  });
}

/* ═════════════════════════ COURSE GUIDE (from the syllabus) ═════════════════════════ */

const GUIDE = {
  description: 'AAP 101 Art Appreciation is a three-unit general elective course offered by the College of Arts and Letters that develops students’ ability to appreciate, analyze, and critique works of art. Through interdisciplinary and multimodal approaches, students explore the nature, functions, and assumptions of art; the work of artists and artisans; art movements; the elements and principles of design; Philippine art; and the creative practices of photography, videography, and basic guitar. Students describe, analyze, interpret, and judge artworks, watch a live theater performance, and write an art critique, take part in a photography challenge, plan a short video as a storyboard, and create a coffee painting self-portrait and a live guitar performance.',
  outcomes: [
    ['CO1', 'Explain the nature, assumptions, and functions of art, and distinguish artists from artisans.'],
    ['CO2', 'Analyze artworks and performances using the elements and principles of art, art movements, Feldman’s method of art criticism, and the context of Philippine art.'],
    ['CO3', 'Apply the basics of photography, videography, and guitar playing in creative work.'],
    ['CO4', 'Create original artworks and reflect on the creative process and on art’s place in everyday life.']
  ],
  weeks: [
    ['1', 'Orientation (BulSU VMGO, grading system, classroom policies, BulSU AI policy) · Midterm Lesson 1: Introduction to Art and Assumptions of Art'],
    ['2', 'Midterm Lesson 2: Functions of Art'],
    ['3', 'Midterm Lesson 3: Artists and Artisans'],
    ['4', 'Midterm Lesson 4: Art Movements'],
    ['5', 'Midterm Lesson 5: Visual Elements of Art'],
    ['6', 'Coffee Painting Classroom Workshop (practice) · Midterm Project: Coffee Painting Self-Portrait (submit by Week 9)'],
    ['7', 'Midterm Lesson 6: Reading an Artwork (Feldman’s method) · Midterm Activity: Art Critique'],
    ['8', 'Midterm Lesson 7: Philippine Art and National Artists'],
    ['9', 'Midterm Activity: Theater Play Viewing, “Tanghalaya 2027” · Midterm Quiz'],
    ['10', 'Midterm Examination'],
    ['11', 'Final Term Lesson 1: Principles of Design'],
    ['12', 'Final Term Lesson 2: Basic Photography'],
    ['13', 'Final Term Activity: Photography Challenge'],
    ['14', 'Final Term Lesson 3: Basic Videography · Final Term Activity: Storyboarding'],
    ['15', 'Final Term Lesson 4: Guitar Lessons for Beginners'],
    ['16', 'Guitar Lesson Classroom Workshops (2 meetings, practice)'],
    ['17', 'Final Term Project: Live Guitar Performance (live in class) · Final Term Quiz'],
    ['18', 'Final Examination']
  ],
  grading: [['Term quiz', 20], ['Attendance (out of 18; 1 point off per absence, 0.5 if the class meets twice a week)', 10], ['Activities (two per term, 10% each)', 20], ['Project (one per term)', 20], ['Term examination', 30]],
  scale: [['96.50–100', '1.00'], ['93.50–96.49', '1.25'], ['90.50–93.49', '1.50'], ['87.50–90.49', '1.75'],
          ['84.50–87.49', '2.00'], ['81.50–84.49', '2.25'], ['78.50–81.49', '2.50'], ['75.50–78.49', '2.75'],
          ['74.50–75.49', '3.00'], ['74.49 and below', '5.00']],
  policies: [
    ['Attendance', 'Be on time and stay until class ends. Catch up on missed lessons and arrange make-up work with your instructor. In online sessions, use your real name and report connection problems right away.'],
    ['Submission of requirements', 'Submit complete work on time through the designated platform, following the given format. Ask for extensions early; late work is considered case by case.'],
    ['Academic integrity', 'Submit your own work and cite your sources. No plagiarism, cheating, or copying. Every quiz and exam here starts with the Academic Integrity affirmation, and you must not share test contents with anyone who may take the course.'],
    ['AI use', 'Following the BulSU AI policy, AI tools may be used for brainstorming and practice only when a task allows it, and you must disclose how you used them. AI tools are not allowed during quizzes and exams, and AI-generated images may not be submitted as your own artwork.'],
    ['Safe space', 'Respect everyone. No bullying, discrimination, or harassment. Ask permission before photographing, recording, or sharing other people or their work, which matters for the photography and video tasks.'],
    ['Special needs and accommodations', 'If you need support because of health, disability, or other concerns, talk to your instructor privately and early. Your information is kept confidential.']
  ]
};

function buildGuidePage() {
  const page = el('div', 'page');
  page.id = 'page-guide';
  const row = (a, b) => `<tr><th scope="row">${h(a)}</th><td>${h(b)}</td></tr>`;
  page.innerHTML = `
    <div class="l-hdr px-hdr"><div class="l-hdr-inner">
      <span class="l-tag">📘 Syllabus</span>
      <h2>Course Guide</h2>
      <p class="l-hdr-desc">AAP 101 Art Appreciation · ${h(window.AAP_TERM || '2nd Semester, A.Y. 2026-2027')} · 3 units</p>
    </div></div>
    <div class="l-body px-guide">
      <section class="px-g-card"><h3>Course description</h3><p>${h(GUIDE.description)}</p></section>
      <section class="px-g-card"><h3>Course outcomes</h3>
        <ul class="px-g-cos">${GUIDE.outcomes.map(o => `<li><b>${h(o[0])}</b><span>${h(o[1])}</span></li>`).join('')}</ul></section>
      <section class="px-g-card"><h3>Weekly plan</h3>
        <table class="px-g-tbl"><thead><tr><th>Week</th><th>Topic</th></tr></thead><tbody>${GUIDE.weeks.map(w => row(w[0], w[1])).join('')}</tbody></table></section>
      <div class="px-g-two">
        <section class="px-g-card"><h3>Grading system</h3>
          <table class="px-g-tbl">${GUIDE.grading.map(g => row(g[0], g[1] + '%')).join('')}
            <tr class="px-g-tot"><th scope="row">Term grade</th><td>100%</td></tr></table>
          <p class="px-g-fine">Final rating = (Midterm grade + Final Term grade) ÷ 2. A blank score with no submission counts as zero. More than 3 absences in the semester (6 if the class meets twice a week) = Dropped.</p></section>
        <section class="px-g-card"><h3>Grading scale</h3>
          <table class="px-g-tbl px-g-scale"><thead><tr><th>Rating</th><th>Grade</th></tr></thead><tbody>${GUIDE.scale.map(s => row(s[0], s[1])).join('')}</tbody></table></section>
      </div>
      <section class="px-g-card"><h3>Classroom policies</h3>
        <dl class="px-g-pol">${GUIDE.policies.map(p => `<dt>${h(p[0])}</dt><dd>${h(p[1])}</dd>`).join('')}</dl></section>
      <section class="px-g-card px-g-bulsu"><h3>Bulacan State University</h3>
        <p><b>Bisyon.</b> Ang Bulacan State University ay isang progresibong institusyong lumilikha ng kaalaman na kinikilala sa daigdig sa pinakamahusay na pagtuturo, nangungunang mga pananaliksik, at maagap na pagtugon sa pangangailangan ng komunidad.</p>
        <p><b>Misyon.</b> Ang Bulacan State University ay may hangaring humubog ng mga propesyonal na mahuhusay, etikal, at handang maglingkod, na nakapag-aambag sa patuloy na pag-unlad ng bayan.</p>
        <p><b>Core values: ALAB BulSU!</b> Agap sa Pagbabago · Lingap sa Kapwa at Sangnilikha · Agapayan sa Paggawa · Bayanihan sa Banyuhay</p></section>
    </div>`;
  return page;
}

/* ═════════════════════════ PUBLIC ═════════════════════════ */

window.AAPPortal = {
  /** Runs after sign-in, before the module builds itself. Never blocks boot for long. */
  prefetch() {
    try { const c = !(AAPAuth.isPreview && AAPAuth.isPreview()) && JSON.parse(lsGet(K_LESSONS) || 'null'); if (c) applyLessons(c); } catch (e) {}
    return withTimeout(AAPAuth.api('lessons', {}, 8000), 6000).then(res => {
      if (res && res.ok) { applyLessons(res); if (!(AAPAuth.isPreview && AAPAuth.isPreview())) lsSet(K_LESSONS, JSON.stringify({ overrides: res.overrides, custom: res.custom })); }
    }).catch(() => {});
  },

  lessonStatus(pid) {
    const c = findCustom(pid);
    if (c) return c.status;
    const o = P.overrides[pid];
    return (o && o.status) || 'Open';
  },

  /** Studio lesson editor: show this unsaved copy of a built-in lesson. */
  showDraft(d) {
    try { if (d) sessionStorage.setItem(K_DRAFT, JSON.stringify(d)); else sessionStorage.removeItem(K_DRAFT); } catch (e) {}
    return d ? redraft(d.id) : (applyLessons(P.last), true);
  },

  /** Studio lesson editor: scroll the preview to block <path> of lesson <id>. */
  focusBlock(id, path) {
    const les = typeof findLesson === 'function' ? findLesson(id) : null, page = document.getElementById('page-' + id);
    if (!les || !page) return false;
    let list = les.blocks, b = null;
    for (const i of path) { b = list && list[i]; list = b && b.blocks; }
    const node = b && Array.from(page.querySelectorAll('.block, .reveal-sec')).find(n => n._block === b);
    if (!node || !node.offsetParent) return false;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    node.classList.add('px-flash');
    setTimeout(() => node.classList.remove('px-flash'), 1400);
    return true;
  },

  owns(pid) { return pid === 'tests' || pid === 'grades' || pid === 'guide' || /^x-/.test(pid); },

  buildPage(pid) {
    if (pid === 'tests') return buildTestsPage();
    if (pid === 'grades') return buildGradesPage();
    if (pid === 'guide') return buildGuidePage();
    const c = findCustom(pid);
    return c ? buildCustomLesson(c) : null;
  },

  breadcrumb(pid) {
    if (pid === 'tests') return ['Assessments', 'Quizzes & Exams'];
    if (pid === 'grades') return ['Grade Consultation', 'My Grades'];
    if (pid === 'guide') return ['Syllabus', 'Course Guide'];
    const c = findCustom(pid);
    return c ? [CONTENT[c.term === 'f' ? 'f' : 'm'].label, c.title] : null;
  },

  sidebarTop(nav) {
    const b = el('button', 'sb-home-btn px-sb-tests', '📝 &nbsp;Quizzes &amp; Exams <span class="px-badge" hidden></span>');
    b.type = 'button';
    b.addEventListener('click', () => navigateTo('tests'));
    nav.appendChild(b);
    [['grades', '🎓 &nbsp;My Grades'], ['guide', '📘 &nbsp;Course Guide']].forEach(([pid, label]) => {
      const x = el('button', 'sb-home-btn px-sb-link px-sb-' + pid, label);
      x.type = 'button';
      x.addEventListener('click', () => navigateTo(pid));
      nav.appendChild(x);
    });
  },

  extraLessons(k, container, mode) {
    P.custom.filter(c => (c.term === 'f' ? 'f' : 'm') === k).forEach(c => container.appendChild(navItem(c, mode)));
  },

  refreshNav,
  terminalCard,

  /* Exposed for tests only. */
  _richText: richText, _videoEmbed: videoEmbed, _guidePage: buildGuidePage
};

})();
