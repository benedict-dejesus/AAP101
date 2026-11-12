/* ══════════════════════════════════════════════════════════════════════════
   AAP101 · INSTRUCTOR STUDIO
   ──────────────────────────────────────────────────────────────────────────
   The teacher's dashboard: lessons, quizzes & exams, results, students and
   the class record. Every action is an authenticated call to the Apps Script
   (action "admin"); nothing here is trusted by the server.

   The session token lives in sessionStorage, so closing the browser signs the
   instructor out. Everything shown is escaped with h().
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

(function () {

const CFG = window.AAP_CONFIG || {};
const K_DEV = 'aap101.admin.device', K_TOK = 'aap101.admin.token';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
             set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} },
             del: k => { try { sessionStorage.removeItem(k); } catch (e) {} } };

function deviceId() {
  let d = null;
  try { d = localStorage.getItem(K_DEV); } catch (e) {}
  if (!d) {
    d = 'adm-' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
    try { localStorage.setItem(K_DEV, d); } catch (e) {}
  }
  return d;
}

const TERMS = { MT: 'Midterm', FT: 'Final Term' };
const SLOTS = ['Quiz 1', 'Quiz 2', 'Quiz 3', 'Exams'];
/* This semester's planner has one quiz per term: the Midterm/Final Term Quiz goes in the Quiz 1 slot. */
const SLOT_NAME = { 'Quiz 1': 'Term Quiz (Quiz 1)', 'Quiz 2': 'Quiz 2 (not in the planner)', 'Quiz 3': 'Quiz 3 (not in the planner)', 'Exams': 'Term Exam' };
const QTYPES = { mc: 'Multiple choice', multi: 'Multiple answers', tf: 'True / False', ident: 'Identification', essay: 'Essay (you grade)' };
const COLS = { 'MT|Quiz 1': 'E', 'MT|Quiz 2': 'F', 'MT|Quiz 3': 'G', 'MT|Exams': 'T',
               'FT|Quiz 1': 'Y', 'FT|Quiz 2': 'Z', 'FT|Quiz 3': 'AA', 'FT|Exams': 'AN' };
/* Default maximums, matching row 2 of a new class record tab. */
const MAXES = { 'MT|Quiz 1': 40, 'MT|Quiz 2': 20, 'MT|Quiz 3': 20, 'MT|Exams': 50,
                'FT|Quiz 1': 20, 'FT|Quiz 2': 20, 'FT|Quiz 3': 20, 'FT|Exams': 50 };
const maxFor = t => MAXES[(t.term || 'MT') + '|' + (t.slot || 'Quiz 1')] || 20;

const fmtDate = ms => ms ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const fmtAgo = ms => {
  if (!ms) return 'never';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
  const hh = Math.round(m / 60); if (hh < 24) return hh + ' h ago';
  const d = Math.round(hh / 24); return d < 30 ? d + ' d ago' : fmtDate(ms);
};
const toLocal = ms => ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
const fromLocal = v => v ? new Date(v).getTime() : 0;
const uid = () => 'k' + Math.random().toString(36).slice(2, 9);

/* ═════════════════════════ API ═════════════════════════ */

function post(body, timeout) {
  if (!CFG.ENDPOINT) return Promise.reject(new Error('The web app address is missing from assets/config.js.'));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout || 30000);
  return fetch(CFG.ENDPOINT, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow', signal: ctrl.signal })
    .then(r => r.text()).then(t2 => { clearTimeout(t); return JSON.parse(t2); })
    .catch(e => { clearTimeout(t); throw new Error(e.name === 'AbortError' ? 'The server took too long to answer.' : 'Could not reach the server. Check your connection.'); });
}

function api(op, data) {
  return post({ action: 'admin', op, data: data || {}, token: ss.get(K_TOK), deviceId: deviceId(), ua: navigator.userAgent.slice(0, 160) })
    .then(res => {
      if (!res) throw new Error('No answer from the server.');
      if (res.error === 'BAD_TOKEN') { ss.del(K_TOK); toast('Your session ended. Please sign in again.', 'bad'); renderLogin(); throw new Error(res.message); }
      if (!res.ok) { const e = new Error(res.message || 'Something went wrong.'); e.res = res; throw e; }
      return res;
    });
}

/* ═════════════════════════ UI PRIMITIVES ═════════════════════════ */

function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'ad-toast ' + (kind || 'ok');
  t.textContent = msg;
  $('#ad-toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3600);
}

function dialog({ title, body, ok = 'OK', cancel = 'Cancel', danger = false, wide = false }) {
  return new Promise(resolve => {
    const d = document.createElement('div');
    d.className = 'ad-dialog';
    d.innerHTML = `<div class="ad-dialog-card ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="add-h">
      <h3 id="add-h">${h(title)}</h3><div class="ad-dialog-bd">${body || ''}</div>
      <div class="ad-row-end">${cancel ? `<button class="ad-btn ghost" data-c>${h(cancel)}</button>` : ''}
      <button class="ad-btn ${danger ? 'danger' : ''}" data-o>${h(ok)}</button></div></div>`;
    document.body.appendChild(d);
    const close = v => { d.remove(); document.removeEventListener('keydown', key); resolve(v); };
    const key = e => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', key);
    d.addEventListener('click', e => { if (e.target === d) close(false); });
    if ($('[data-c]', d)) $('[data-c]', d).addEventListener('click', () => close(false));
    $('[data-o]', d).addEventListener('click', () => close(d));
    setTimeout(() => ($('input,textarea,select', d) || $('[data-o]', d)).focus(), 30);
  });
}
const confirmBox = (title, text, ok, danger) => dialog({ title, body: `<p>${h(text)}</p>`, ok: ok || 'Continue', danger }).then(Boolean);

function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="ad-spin"></span>${h(label || 'Working…')}`; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

function loading(box) { box.innerHTML = '<div class="ad-loading"><span class="ad-spin big"></span></div>'; }
function failed(box, err, retry) {
  box.innerHTML = `<div class="ad-empty"><div class="ad-empty-ico">⚠️</div><h3>Couldn't load this</h3><p>${h(err.message)}</p>
    <button class="ad-btn" data-retry>Try again</button></div>`;
  $('[data-retry]', box).addEventListener('click', retry);
}

/* ═════════════════════════ SIGN-IN ═════════════════════════ */

function renderLogin() {
  document.body.className = 'ad-login-body';
  $('#app').innerHTML = `
    <main class="ad-login">
      <div class="ad-login-card">
        <div class="ad-crest">🎨</div>
        <div class="ad-kicker">Bulacan State University · AAP101</div>
        <h1>Instructor Studio</h1>
        <p class="ad-sub">Lessons, quizzes &amp; exams, results and the class record in one place.</p>
        <form id="ad-login-form" autocomplete="off">
          <label for="ad-pass">Instructor passcode</label>
          <div class="ad-pass-wrap">
            <input id="ad-pass" type="password" autocomplete="current-password" required minlength="8" maxlength="200" placeholder="••••••••">
            <button type="button" class="ad-eye" aria-label="Show passcode">👁</button>
          </div>
          <button class="ad-btn wide" type="submit">Sign in</button>
          <p class="ad-msg" role="alert" hidden></p>
        </form>
        <p class="ad-foot">Set or change the passcode in the spreadsheet: <b>AAP101 Database ▸ Set instructor passcode…</b></p>
      </div>
    </main>`;
  const f = $('#ad-login-form'), inp = $('#ad-pass'), msg = $('.ad-msg');
  $('.ad-eye').addEventListener('click', () => { inp.type = inp.type === 'password' ? 'text' : 'password'; inp.focus(); });
  f.addEventListener('submit', e => {
    e.preventDefault();
    const btn = $('button[type=submit]', f);
    busy(btn, true, 'Signing in…'); msg.hidden = true;
    post({ action: 'adminLogin', passcode: inp.value, deviceId: deviceId(), ua: navigator.userAgent.slice(0, 160) })
      .then(res => {
        busy(btn, false);
        if (!res || !res.ok) { msg.textContent = (res && res.message) || 'Sign-in failed.'; msg.hidden = false; inp.select(); return; }
        ss.set(K_TOK, res.token); inp.value = '';
        renderShell();
      })
      .catch(err => { busy(btn, false); msg.textContent = err.message; msg.hidden = false; });
  });
  setTimeout(() => inp.focus(), 50);
}

/* ═════════════════════════ SHELL ═════════════════════════ */

const VIEWS = [
  { id: 'overview', ico: '◎', label: 'Overview' },
  { id: 'tests', ico: '📝', label: 'Quizzes & Exams' },
  { id: 'results', ico: '📊', label: 'Results' },
  { id: 'lessons', ico: '📚', label: 'Lessons' },
  { id: 'viewer', ico: '👁', label: 'Module Viewer' },
  { id: 'students', ico: '👥', label: 'Students' },
  { id: 'gradebook', ico: '✏️', label: 'Grade Book' },
  { id: 'record', ico: '🧾', label: 'Class Record' }
];
let current = 'overview';

function renderShell() {
  document.body.className = 'ad-app-body';
  $('#app').innerHTML = `
    <div class="ad-shell">
      <aside class="ad-side">
        <div class="ad-brand"><span class="ad-brand-mark">🎨</span><div><b>AAP101</b><small>Instructor Studio</small></div></div>
        <nav class="ad-nav">${VIEWS.map(v => `<button class="ad-nav-btn" data-view="${v.id}"><span>${v.ico}</span>${h(v.label)}</button>`).join('')}</nav>
        <div class="ad-side-foot">
          <button class="ad-side-link ad-side-search" data-pal><span>⌕ Search &amp; commands</span><kbd>Ctrl K</kbd></button>
          <button class="ad-side-link" data-install ${isStandalone() ? 'hidden' : ''}>⬇ Install on this computer</button>
          <button class="ad-side-link" data-openmod>👁 Open module as instructor ↗</button>
          <button class="ad-side-link" data-signout>Sign out</button>
        </div>
      </aside>
      <div class="ad-main">
        <header class="ad-top"><h2 id="ad-title"></h2><div class="ad-top-actions" id="ad-actions"></div></header>
        <section class="ad-view" id="ad-view"></section>
      </div>
    </div>`;
  $$('.ad-nav-btn').forEach(b => b.addEventListener('click', () => navTo(b.dataset.view)));
  $('[data-signout]').addEventListener('click', () => guardLeave().then(ok => { if (ok) { ss.del(K_TOK); PAL_CACHE = null; renderLogin(); } }));
  $('[data-pal]').addEventListener('click', openPalette);
  $('[data-install]').addEventListener('click', installApp);
  $('[data-openmod]').addEventListener('click', openPreviewWindow);
  const fromHash = (location.hash || '').slice(1);
  go(VIEWS.some(v => v.id === fromHash) ? fromHash : 'overview');
}

function go(view, arg) {
  current = view;
  LC = null; ss.del(K_DRAFT);
  if (location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
  $$('.ad-nav-btn').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  $('#ad-actions').innerHTML = '';
  $('#ad-title').textContent = (VIEWS.find(v => v.id === view) || {}).label || '';
  const box = $('#ad-view');
  box.scrollTop = 0; window.scrollTo(0, 0);
  ({ overview: viewOverview, tests: viewTests, results: viewResults, lessons: viewLessons, viewer: viewViewer, students: viewStudents, gradebook: viewGradebook, record: viewRecord }[view])(box, arg);
}

/* Anything unsaved on screen: the test editor, the lesson editor or the Grade Book. */
function unsaved() { return (ED && ED.dirty) || (LE && LE.dirty) || (LC && LC.dirty) || (current === 'gradebook' && gbDirty()); }
function guardLeave() {
  if (!unsaved()) return Promise.resolve(true);
  return confirmBox('Leave without saving?', 'You have unsaved changes on this page. They will be lost.', 'Leave', true).then(ok => {
    if (ok) { ED = null; LE = null; LC = null; if (GB) { GB.edits = {}; GB.maxEdits = {}; GB.hdrEdits = {}; } }
    return ok;
  });
}
function navTo(view, arg) { return guardLeave().then(ok => { if (ok) go(view, arg); }); }

document.addEventListener('keydown', e => {
  if (!$('.ad-shell')) return;
  const mod = e.ctrlKey || e.metaKey, typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
  if (mod && !e.shiftKey && (e.key === 'k' || e.key === 'K' || e.key === 'p' || e.key === 'P')) { e.preventDefault(); openPalette(); return; }
  if (mod && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    if ($('.ad-dialog')) return;
    const b = $('#ad-actions [data-save]');
    if (b && !b.disabled) b.click(); else toast('Nothing to save on this page.');
    return;
  }
  if ($('.ad-dialog') || $('.ad-drawer')) return;
  if (e.altKey && !mod && /^[1-9]$/.test(e.key) && VIEWS[Number(e.key) - 1]) { e.preventDefault(); navTo(VIEWS[Number(e.key) - 1].id); return; }
  if (e.key === '?' && !typing) { e.preventDefault(); showShortcuts(); }
});
function actions(html) { $('#ad-actions').innerHTML = html; return $('#ad-actions'); }

/* ═════════════════════════ OVERVIEW ═════════════════════════ */

function viewOverview(box) {
  loading(box);
  const a = actions(`<button class="ad-btn" data-new>＋ New quiz or exam</button>`);
  $('[data-new]', a).addEventListener('click', () => editTest(null));
  api('summary').then(s => {
    const secs = Object.keys(s.sections || {}).sort();
    box.innerHTML = `
      <div class="ad-hello"><div><span class="ad-kicker">${h(s.semester || '')}</span><h3>Good ${greeting()}, Sir Kito.</h3>
        <p>${s.tests.open ? `${s.tests.open} test${s.tests.open > 1 ? 's are' : ' is'} open right now.` : 'No tests are open right now.'}
        ${s.pendingGrading ? ` ${s.pendingGrading} submission${s.pendingGrading > 1 ? 's need' : ' needs'} essay grading.` : ''}</p></div></div>
      <div class="ad-kpis">
        ${kpi('Students registered', s.students, `${s.codesTotal - s.students} codes unclaimed`)}
        ${kpi('Active this week', s.active7, s.students ? Math.round(s.active7 / s.students * 100) + '% of the class' : '')}
        ${kpi('Tests open now', s.tests.open, `${s.tests.total} total · ${s.tests.draft} draft`)}
        ${kpi('Need grading', s.pendingGrading, s.inProgress + ' attempt' + (s.inProgress === 1 ? '' : 's') + ' in progress', s.pendingGrading ? 'warn' : '')}
      </div>
      <div class="ad-grid2">
        <div class="ad-card"><div class="ad-card-h"><h4>Sections</h4></div>
          ${secs.length ? `<div class="ad-chips">${secs.map(k => `<span class="ad-chip"><b>${h(k)}</b><span>${s.sections[k]}</span></span>`).join('')}</div>`
            : '<p class="ad-muted">No students have registered yet.</p>'}
        </div>
        <div class="ad-card"><div class="ad-card-h"><h4>Latest submissions</h4><button class="ad-link" data-go="results">All results →</button></div>
          ${s.recent.length ? `<table class="ad-table compact"><tbody>${s.recent.map(r => `<tr><td><b>${h(r.name)}</b><small>${h(r.section)}</small></td>
            <td>${h(r.test)}</td><td class="num">${h(r.score)}<small>/ ${h(r.max)}</small></td><td class="ad-muted nowrap">${fmtAgo(r.at)}</td></tr>`).join('')}</tbody></table>`
            : '<p class="ad-muted">Nothing submitted yet.</p>'}
        </div>
      </div>
      ${isStandalone() ? '' : `<div class="ad-card ad-install"><div><h4>Put the Studio on your desktop</h4><p class="ad-muted">Install it as an app: it opens in its own window from a desktop shortcut, like any program. Press <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere to jump to a test, lesson, student or section.</p></div>
        <button class="ad-btn" data-inst>⬇ Install on this computer</button></div>`}
      `;
    if ($('[data-inst]', box)) $('[data-inst]', box).addEventListener('click', installApp);
    $$('[data-go]', box).forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  }).catch(err => failed(box, err, () => viewOverview(box)));
}
function greeting() { const hr = new Date().getHours(); return hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening'; }
function kpi(label, val, sub, tone) {
  return `<div class="ad-kpi ${tone || ''}"><span>${h(label)}</span><b>${h(val)}</b><small>${h(sub || '')}</small></div>`;
}

/* ═════════════════════════ TESTS LIST ═════════════════════════ */

function statusChip(t) {
  if (t.status === 'DRAFT') return '<span class="ad-pill muted">Draft</span>';
  if (t.status === 'CLOSED' || t.window === 'closed') return '<span class="ad-pill bad">Closed</span>';
  if (t.window === 'upcoming') return '<span class="ad-pill info">Scheduled</span>';
  return '<span class="ad-pill go">Open</span>';
}

function viewTests(box) {
  loading(box);
  const a = actions(`<button class="ad-btn ghost" data-banks>📚 Question banks</button><button class="ad-btn" data-new>＋ New quiz or exam</button>`);
  $('[data-new]', a).addEventListener('click', () => editTest(null));
  $('[data-banks]', a).addEventListener('click', () => openBanks(box));
  api('tests.list').then(res => {
    const tests = res.tests;
    if (!tests.length) {
      box.innerHTML = `<div class="ad-empty"><div class="ad-empty-ico">📝</div><h3>No quizzes or exams yet</h3>
        <p>Create Quiz 1, Quiz 2, Quiz 3 and the term exam for the Midterm and Final Term, or load the ready-made question banks. Scores go straight into the class record.</p>
        <button class="ad-btn" data-new2>＋ Create the first one</button></div>`;
      $('[data-new2]', box).addEventListener('click', () => editTest(null));
      return;
    }
    box.innerHTML = ['MT', 'FT'].map(term => {
      const list = tests.filter(t => t.term === term);
      return `<section class="ad-sec"><h3 class="ad-sec-h">${TERMS[term]}</h3>
        <div class="ad-slots">${SLOTS.map(slot => {
          const here = list.filter(t => t.slot === slot);
          return `<div class="ad-slot"><div class="ad-slot-h"><b>${h(SLOT_NAME[slot] || slot)}</b><span>Class record column ${COLS[term + '|' + slot]}</span></div>
            ${here.map(t => `
              <article class="ad-test" data-id="${h(t.id)}">
                <div class="ad-test-top">${statusChip(t)}<span class="ad-muted">${t.questions} q · ${t.minutes ? t.minutes + ' min' : 'untimed'} · ${t.max} pts</span></div>
                <h4>${h(t.title)}</h4>
                <div class="ad-test-meta">${t.opens ? 'Opens ' + fmtDate(t.opens) : 'Opens when you press Open'}${t.closes ? ' · closes ' + fmtDate(t.closes) : ''}</div>
                <div class="ad-test-stats"><span><b>${t.submitted}</b> submitted</span>${t.inProgress ? `<span><b>${t.inProgress}</b> in progress</span>` : ''}</div>
                <div class="ad-row">
                  <button class="ad-btn sm ghost" data-act="edit">Edit</button>
                  ${t.status === 'OPEN' ? `<button class="ad-btn sm ghost" data-act="close">Close</button>` : `<button class="ad-btn sm" data-act="open">${t.status === 'CLOSED' ? 'Reopen' : 'Open'}</button>`}
                  <button class="ad-btn sm ghost" data-act="results">Results</button>
                  <button class="ad-icon" data-act="delete" title="Delete">🗑</button>
                </div>
              </article>`).join('') || `<button class="ad-slot-empty" data-add="${term}|${slot}">＋ Add ${h(slot)}</button>`}
          </div>`;
        }).join('')}</div></section>`;
    }).join('');
    $$('[data-add]', box).forEach(b => b.addEventListener('click', () => { const [term, slot] = b.dataset.add.split('|'); editTest(null, { term, slot }); }));
    $$('.ad-test', box).forEach(card => {
      const t = tests.find(x => x.id === card.dataset.id);
      $$('[data-act]', card).forEach(b => b.addEventListener('click', () => testAction(t, b.dataset.act, b, box)));
    });
  }).catch(err => failed(box, err, () => viewTests(box)));
}

/* Ready-made, TOS-aligned question banks. Each loads as a DRAFT test you review before opening. */
function openBanks(box) {
  api('banks.list').then(res => {
    const rows = res.banks.map(b => `<tr><td><b>${h(b.title)}</b><div class="ad-muted">${h(TERMS[b.term])} · ${h(b.slot)} · ${b.items} items · ${b.minutes} min</div>
        <div class="ad-muted">${Object.keys(b.topics).map(k => h(k) + ' ' + b.topics[k]).join(' · ')}</div></td>
      <td class="ad-row-end">${b.loaded ? `<span class="ad-pill muted">${h(b.loaded.status === 'DRAFT' ? 'Loaded as draft' : 'In your tests')}</span>`
        : `<button class="ad-btn sm" data-load="${h(b.key)}">Load as draft</button>`}</td></tr>`).join('');
    const d = dialog({ title: 'Question banks · ' + (res.semester || ''), ok: 'Done', cancel: '', wide: true,
      body: `<p class="ad-muted">Built from last semester's quizzes and exams and aligned to the syllabus TOS. Each bank loads as a <b>draft</b> with shuffled questions and choices. Review it, set the dates, then press Open.</p>
        <table class="ad-table compact"><tbody>${rows}</tbody></table>` });
    setTimeout(() => $$('[data-load]').forEach(btn => btn.addEventListener('click', () => {
      busy(btn, true, 'Loading…');
      api('banks.import', { key: btn.dataset.load }).then(r => {
        btn.outerHTML = '<span class="ad-pill ok">Loaded as draft</span>';
        toast('"' + r.test.title + '" is in your tests as a draft.');
      }).catch(e => { busy(btn, false); toast(e.message, 'bad'); });
    })), 0);
    d.then(() => viewTests(box));
  }).catch(e => toast(e.message, 'bad'));
}

function testAction(t, act, btn, box) {
  if (act === 'edit') return editTest(t.id);
  if (act === 'results') return go('results', t.id);
  if (act === 'open' || act === 'close') {
    const status = act === 'open' ? 'OPEN' : 'CLOSED';
    const p = act === 'close'
      ? confirmBox('Close “' + t.title + '”?', 'Students still taking it will be submitted with the answers they have saved.', 'Close test', true)
      : Promise.resolve(true);
    return p.then(ok => {
      if (!ok) return;
      busy(btn, true, '');
      api('tests.status', { id: t.id, status }).then(() => { toast(status === 'OPEN' ? 'Test opened for students.' : 'Test closed.'); viewTests(box); })
        .catch(e => { busy(btn, false); toast(e.message, 'bad'); });
    });
  }
  if (act === 'delete') {
    return confirmBox('Delete “' + t.title + '”?', t.submitted || t.inProgress
      ? 'Students have taken this test, so it will be archived: hidden from everyone, with every attempt kept.'
      : 'This removes the test and its questions.', 'Delete', true)
      .then(ok => { if (ok) api('tests.delete', { id: t.id }).then(r => { toast(r.archived ? 'Archived.' : 'Deleted.'); viewTests(box); }).catch(e => toast(e.message, 'bad')); });
  }
}

/* ═════════════════════════ TEST EDITOR ═════════════════════════ */

let ED = null;

function blankQ(type) {
  return { _k: uid(), type: type || 'mc', prompt: '', options: type === 'mc' || type === 'multi' || !type ? ['', '', '', ''] : [],
           answer: type === 'multi' ? [] : type === 'tf' ? true : type === 'ident' ? [] : type === 'essay' ? null : 0, points: 1, image: '', explain: '' };
}

function editTest(id, preset) {
  current = 'tests';
  $$('.ad-nav-btn').forEach(b => b.classList.toggle('on', b.dataset.view === 'tests'));
  const box = $('#ad-view');
  loading(box);
  const load = id ? api('tests.get', { id }) : Promise.resolve({
    test: Object.assign({ id: '', title: '', term: 'MT', slot: 'Quiz 1', instr: '', minutes: 30, max: 40, tries: 1, shuffle: true, draw: 0,
      results: 'score', sections: '', opens: 0, closes: 0, status: 'DRAFT' }, preset || {}),
    questions: [blankQ('mc')]
  });
  load.then(res => {
    ED = { test: Object.assign({}, res.test), qs: res.questions.map(q => Object.assign({ _k: uid() }, q)), dirty: false };
    if (!id) ED.test.max = maxFor(ED.test);
    renderEditor(box);
  }).catch(err => failed(box, err, () => editTest(id, preset)));
}

function renderEditor(box) {
  const t = ED.test;
  $('#ad-title').textContent = t.id ? 'Edit: ' + t.title : 'New quiz or exam';
  const a = actions(`<button class="ad-btn ghost" data-back>← All tests</button><button class="ad-btn ghost" data-preview>Preview</button>${t.id ? '<button class="ad-btn ghost" data-try title="Take it in the Module Viewer">👁 Try it</button>' : ''}<button class="ad-btn" data-save>Save</button>`);
  if ($('[data-try]', a)) $('[data-try]', a).addEventListener('click', () => navTo('viewer', { page: 'tests' }));
  $('[data-back]', a).addEventListener('click', () => leaveEditor());
  $('[data-preview]', a).addEventListener('click', previewTest);
  $('[data-save]', a).addEventListener('click', e => saveTest(e.currentTarget));

  box.innerHTML = `
    <div class="ad-editor">
      <section class="ad-card ad-settings">
        <div class="ad-card-h"><h4>Settings</h4>${t.id ? statusChip(t) : '<span class="ad-pill muted">New</span>'}</div>
        <div class="ad-form">
          <label class="span2">Title<input data-f="title" maxlength="160" value="${h(t.title)}" placeholder="e.g. Midterm Quiz 1: Introduction to Art"></label>
          <label>Term<select data-f="term">${Object.keys(TERMS).map(k => `<option value="${k}" ${t.term === k ? 'selected' : ''}>${TERMS[k]}</option>`).join('')}</select></label>
          <label>Class record column<select data-f="slot">${SLOTS.map(s => `<option ${t.slot === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          <div class="ad-colhint span2" data-colhint></div>
          <label>Score out of<input data-f="max" type="number" min="1" max="1000" value="${h(t.max)}"><small>Matches the maximum in row 2 of the class record.</small></label>
          <label>Time limit (minutes)<input data-f="minutes" type="number" min="0" max="600" value="${h(t.minutes)}"><small>0 = no limit (until it closes).</small></label>
          <label>Opens<input data-f="opens" type="datetime-local" value="${toLocal(t.opens)}"><small>Blank = as soon as you press Open.</small></label>
          <label>Closes<input data-f="closes" type="datetime-local" value="${toLocal(t.closes)}"><small>Blank = when you press Close.</small></label>
          <label>Attempts allowed<input data-f="tries" type="number" min="1" max="10" value="${h(t.tries)}"><small>The best score counts.</small></label>
          <label>Questions per student<input data-f="draw" type="number" min="0" max="150" value="${h(t.draw)}"><small>0 = all. Fewer draws a random set for each student.</small></label>
          <label>After submitting, students see<select data-f="results">
            <option value="score" ${t.results === 'score' ? 'selected' : ''}>Their score</option>
            <option value="review" ${t.results === 'review' ? 'selected' : ''}>Score, then answers after it closes</option>
            <option value="hidden" ${t.results === 'hidden' ? 'selected' : ''}>Nothing until you release it</option></select></label>
          <label>Sections<input data-f="sections" maxlength="400" value="${h(t.sections)}" placeholder="All sections"><small>Comma-separated, e.g. BSMCS 3A, BSED 1B.</small></label>
          <label class="ad-switch span2"><input type="checkbox" data-f="shuffle" ${t.shuffle !== false ? 'checked' : ''}><span></span>Shuffle questions and choices for each student</label>
          <label class="span2">Instructions<textarea data-f="instr" rows="3" maxlength="4000" placeholder="Shown before the student starts. **bold** and *italic* work.">${h(t.instr)}</textarea></label>
        </div>
      </section>

      <section class="ad-qs">
        <div class="ad-qs-h">
          <div><h4>Questions</h4><span class="ad-muted" data-qsum></span></div>
          <div class="ad-row"><button class="ad-btn sm ghost" data-paste>Paste questions…</button></div>
        </div>
        <div data-qlist></div>
        <div class="ad-addq">${Object.keys(QTYPES).map(k => `<button class="ad-btn sm ghost" data-addq="${k}">＋ ${h(QTYPES[k])}</button>`).join('')}</div>
      </section>
    </div>`;

  $$('[data-f]', box).forEach(inp => inp.addEventListener(inp.type === 'checkbox' || inp.tagName === 'SELECT' ? 'change' : 'input', () => {
    const f = inp.dataset.f;
    ED.test[f] = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? Number(inp.value) : inp.type === 'datetime-local' ? fromLocal(inp.value) : inp.value;
    if ((f === 'slot' || f === 'term') && !ED.test.id) { ED.test.max = maxFor(ED.test); $('[data-f="max"]', box).value = ED.test.max; }
    ED.dirty = true;
    colHint();
  }));
  $$('[data-addq]', box).forEach(b => b.addEventListener('click', () => { ED.qs.push(blankQ(b.dataset.addq)); ED.dirty = true; paintQs(); focusQ(ED.qs.length - 1); }));
  $('[data-paste]', box).addEventListener('click', pasteQuestions);
  colHint();
  paintQs();
}

function colHint() {
  const c = COLS[ED.test.term + '|' + ED.test.slot];
  const el = $('[data-colhint]');
  if (el) el.innerHTML = `Scores post to <b>${TERMS[ED.test.term]} ${h(ED.test.slot)}</b> (column <b>${c}</b>) of each student's class record. A number you type there yourself is never overwritten.`;
}

function leaveEditor() {
  if (!ED || !ED.dirty) return go('tests');
  confirmBox('Leave without saving?', 'Your changes to this test will be lost.', 'Leave', true).then(ok => { if (ok) { ED = null; go('tests'); } });
}

function paintQs() {
  const list = $('[data-qlist]');
  if (!list) return;
  const total = ED.qs.reduce((s, q) => s + (Number(q.points) || 0), 0);
  $('[data-qsum]').textContent = `${ED.qs.length} question${ED.qs.length === 1 ? '' : 's'} · ${total} point${total === 1 ? '' : 's'}`;
  list.innerHTML = ED.qs.length ? ED.qs.map((q, i) => qCard(q, i)).join('') : '<div class="ad-empty small"><p>No questions yet. Add one below, or paste a whole set.</p></div>';
  $$('.ad-q', list).forEach(card => wireQ(card, Number(card.dataset.i)));
}

function qCard(q, i) {
  let body = '';
  if (q.type === 'mc' || q.type === 'multi') {
    const ans = q.type === 'multi' ? (q.answer || []) : [q.answer];
    body = `<div class="ad-opts">${q.options.map((o, k) => `
      <div class="ad-opt ${ans.indexOf(k) >= 0 ? 'right' : ''}">
        <button class="ad-mark" data-mark="${k}" title="${q.type === 'multi' ? 'Toggle correct' : 'Mark as the answer'}" aria-pressed="${ans.indexOf(k) >= 0}">${ans.indexOf(k) >= 0 ? '✓' : String.fromCharCode(65 + k)}</button>
        <input data-opt="${k}" maxlength="500" value="${h(o)}" placeholder="Choice ${String.fromCharCode(65 + k)}">
        <button class="ad-icon" data-delopt="${k}" title="Remove choice">✕</button>
      </div>`).join('')}
      ${q.options.length < 10 ? `<button class="ad-link" data-addopt>＋ Add choice</button>` : ''}
      <p class="ad-hint">${q.type === 'multi' ? 'Tick every correct choice. Students must pick exactly those.' : 'Click a letter to mark the correct choice.'}</p></div>`;
  } else if (q.type === 'tf') {
    body = `<div class="ad-tf"><button class="${q.answer === true ? 'on' : ''}" data-tf="1">True</button><button class="${q.answer === false ? 'on' : ''}" data-tf="0">False</button></div>
      <p class="ad-hint">Click the correct answer.</p>`;
  } else if (q.type === 'ident') {
    body = `<label class="ad-lbl">Accepted answers<input data-ident maxlength="2000" value="${h((q.answer || []).join(' | '))}" placeholder="Juan Luna | Luna"></label>
      <p class="ad-hint">Separate alternatives with | . Capitals, accents, spacing and punctuation are ignored.</p>`;
  } else {
    body = `<p class="ad-hint">Students write freely. You award the points under <b>Results</b>. Use the notes field for your rubric.</p>`;
  }
  return `<article class="ad-q" data-i="${i}" id="q-${q._k}">
    <div class="ad-q-h"><span class="ad-q-n">${i + 1}</span>
      <select data-type>${Object.keys(QTYPES).map(k => `<option value="${k}" ${q.type === k ? 'selected' : ''}>${QTYPES[k]}</option>`).join('')}</select>
      <label class="ad-pts"><input data-points type="number" min="0" max="100" step="0.5" value="${h(q.points)}"> pts</label>
      <div class="ad-q-tools">
        <button class="ad-icon" data-move="-1" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="ad-icon" data-move="1" title="Move down" ${i === ED.qs.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="ad-icon" data-dup title="Duplicate">⧉</button>
        <button class="ad-icon" data-del title="Delete">🗑</button>
      </div></div>
    <textarea data-prompt rows="2" maxlength="4000" placeholder="Type the question…">${h(q.prompt)}</textarea>
    ${body}
    <details class="ad-more" ${q.image || q.explain ? 'open' : ''}><summary>Image &amp; notes</summary>
      <label class="ad-lbl">Image link (https)<input data-image maxlength="600" value="${h(q.image)}" placeholder="https://…"></label>
      <label class="ad-lbl">${q.type === 'essay' ? 'Rubric / notes (only you see this)' : 'Explanation shown in the answer review'}<textarea data-explain rows="2" maxlength="2000">${h(q.explain)}</textarea></label>
    </details>
  </article>`;
}

function wireQ(card, i) {
  const q = ED.qs[i];
  const dirty = () => { ED.dirty = true; };
  $('[data-prompt]', card).addEventListener('input', e => { q.prompt = e.target.value; dirty(); });
  $('[data-points]', card).addEventListener('input', e => { q.points = Number(e.target.value); dirty(); const total = ED.qs.reduce((s, x) => s + (Number(x.points) || 0), 0); $('[data-qsum]').textContent = `${ED.qs.length} questions · ${total} points`; });
  $('[data-type]', card).addEventListener('change', e => {
    const nq = blankQ(e.target.value);
    nq._k = q._k; nq.prompt = q.prompt; nq.points = q.points; nq.image = q.image; nq.explain = q.explain;
    if ((nq.type === 'mc' || nq.type === 'multi') && q.options && q.options.length) nq.options = q.options.slice();
    ED.qs[i] = nq; dirty(); paintQs();
  });
  const im = $('[data-image]', card); if (im) im.addEventListener('input', e => { q.image = e.target.value.trim(); dirty(); });
  const ex = $('[data-explain]', card); if (ex) ex.addEventListener('input', e => { q.explain = e.target.value; dirty(); });
  $$('[data-opt]', card).forEach(inp => inp.addEventListener('input', () => { q.options[Number(inp.dataset.opt)] = inp.value; dirty(); }));
  $$('[data-mark]', card).forEach(b => b.addEventListener('click', () => {
    const k = Number(b.dataset.mark);
    if (q.type === 'multi') { const a = (q.answer || []).slice(); const at = a.indexOf(k); if (at >= 0) a.splice(at, 1); else a.push(k); q.answer = a.sort(); }
    else q.answer = k;
    dirty(); paintQs();
  }));
  $$('[data-delopt]', card).forEach(b => b.addEventListener('click', () => {
    const k = Number(b.dataset.delopt);
    if (q.options.length <= 2) return toast('A question needs at least two choices.', 'bad');
    q.options.splice(k, 1);
    if (q.type === 'mc') q.answer = q.answer === k ? 0 : q.answer > k ? q.answer - 1 : q.answer;
    else q.answer = (q.answer || []).filter(x => x !== k).map(x => x > k ? x - 1 : x);
    dirty(); paintQs();
  }));
  const ao = $('[data-addopt]', card); if (ao) ao.addEventListener('click', () => { q.options.push(''); dirty(); paintQs(); setTimeout(() => { const ins = $$('#q-' + q._k + ' [data-opt]'); ins[ins.length - 1].focus(); }, 20); });
  $$('[data-tf]', card).forEach(b => b.addEventListener('click', () => { q.answer = b.dataset.tf === '1'; dirty(); paintQs(); }));
  const id = $('[data-ident]', card); if (id) id.addEventListener('input', () => { q.answer = id.value.split('|').map(s => s.trim()).filter(Boolean); dirty(); });
  $$('[data-move]', card).forEach(b => b.addEventListener('click', () => {
    const j = i + Number(b.dataset.move); if (j < 0 || j >= ED.qs.length) return;
    [ED.qs[i], ED.qs[j]] = [ED.qs[j], ED.qs[i]]; dirty(); paintQs(); focusQ(j);
  }));
  $('[data-dup]', card).addEventListener('click', () => { const c = JSON.parse(JSON.stringify(q)); c._k = uid(); delete c.qid; ED.qs.splice(i + 1, 0, c); dirty(); paintQs(); focusQ(i + 1); });
  $('[data-del]', card).addEventListener('click', () => { ED.qs.splice(i, 1); dirty(); paintQs(); });
}

function focusQ(i) {
  const q = ED.qs[i]; if (!q) return;
  const n = document.getElementById('q-' + q._k);
  if (n) { n.scrollIntoView({ behavior: 'smooth', block: 'center' }); n.classList.add('flash'); setTimeout(() => n.classList.remove('flash'), 900); const p = $('[data-prompt]', n); if (p && !p.value) p.focus(); }
}

function saveTest(btn) {
  const t = ED.test;
  if (!String(t.title || '').trim()) { toast('Give the test a title first.', 'bad'); $('[data-f="title"]').focus(); return; }
  busy(btn, true, 'Saving…');
  const payload = Object.assign({}, t);
  const qs = ED.qs.map(q => ({ qid: q.qid, type: q.type, prompt: q.prompt, options: q.options, answer: q.answer, points: q.points, image: q.image, explain: q.explain }));
  api('tests.save', { test: payload, questions: qs }).then(res => {
    busy(btn, false);
    ED = { test: res.test, qs: res.questions.map(q => Object.assign({ _k: uid() }, q)), dirty: false };
    toast('Saved.' + (res.test.status === 'DRAFT' ? ' Open it from the list when you are ready.' : ''));
    renderEditor($('#ad-view'));
  }).catch(err => {
    busy(btn, false);
    toast(err.message, 'bad');
    if (err.res && typeof err.res.index === 'number') focusQ(err.res.index);
  });
}

/* Bulk paste: blocks separated by a blank line.
     1. Question text              ← prompt (numbering removed)
     a) Choice   *b) Correct       ← choices; * marks the answer(s)
     Answer: True | Juan Luna      ← true/false, or accepted answers
     Essay: (no answer line, starts with "Essay:")                         */
function parsePasted(text) {
  const out = [], errs = [];
  String(text).replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).forEach((block, bi) => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    let prompt = lines.shift().replace(/^(\d+|Q\d+)[.)]\s*/i, '');
    const essay = /^essay:\s*/i.test(prompt); if (essay) prompt = prompt.replace(/^essay:\s*/i, '');
    const opts = [], right = []; let ans = null, pts = 1;
    lines.forEach(l => {
      let m;
      if ((m = l.match(/^(\*)?\s*([a-jA-J])[.)]\s*(.+?)\s*(\*)?$/))) { if (m[1] || m[4]) right.push(opts.length); opts.push(m[3]); }
      else if ((m = l.match(/^answer\s*:\s*(.+)$/i))) ans = m[1];
      else if ((m = l.match(/^points?\s*:\s*([\d.]+)/i))) pts = Number(m[1]);
      else prompt += '\n' + l;
    });
    const q = blankQ('mc'); q.prompt = prompt; q.points = pts;
    if (essay) { Object.assign(q, { type: 'essay', options: [], answer: null }); }
    else if (opts.length >= 2) {
      if (!right.length && ans && /^[a-j]$/i.test(ans.trim())) right.push(ans.trim().toLowerCase().charCodeAt(0) - 97);
      q.options = opts;
      if (right.length > 1) { q.type = 'multi'; q.answer = right; } else { q.type = 'mc'; q.answer = right.length ? right[0] : 0; if (!right.length) errs.push(bi + 1); }
    } else if (ans && /^(true|false|t|f)$/i.test(ans.trim())) { Object.assign(q, { type: 'tf', options: [], answer: /^t/i.test(ans.trim()) }); }
    else if (ans) { Object.assign(q, { type: 'ident', options: [], answer: ans.split('|').map(s => s.trim()).filter(Boolean) }); }
    else { errs.push(bi + 1); }
    out.push(q);
  });
  return { qs: out, errs };
}

function pasteQuestions() {
  dialog({ title: 'Paste questions', wide: true, ok: 'Add questions', body: `
    <p class="ad-muted">Leave a blank line between questions. Mark correct choices with <b>*</b>. Use <b>Answer:</b> for true/false or identification, and start an essay with <b>Essay:</b>.</p>
    <textarea class="ad-paste" rows="12" spellcheck="false" placeholder="1. Who painted the Spoliarium?
a) Fernando Amorsolo
*b) Juan Luna
c) Botong Francisco

2. A sunset is a work of art.
Answer: False

3. Name the National Artist who painted Planting Rice.
Answer: Fernando Amorsolo | Amorsolo

4. Essay: Why does art matter?
Points: 5"></textarea>` }).then(d => {
    if (!d) return;
    const r = parsePasted($('.ad-paste', d).value);
    if (!r.qs.length) return toast('Nothing to add.', 'bad');
    ED.qs = ED.qs.filter(q => q.prompt.trim()).concat(r.qs);
    ED.dirty = true; paintQs();
    toast(`Added ${r.qs.length} question${r.qs.length === 1 ? '' : 's'}.` + (r.errs.length ? ` Check #${r.errs.join(', #')}: no answer found.` : ''), r.errs.length ? 'warn' : 'ok');
  });
}

function previewTest() {
  const qs = ED.qs;
  dialog({ title: 'Student preview · ' + (ED.test.title || 'Untitled'), wide: true, ok: 'Close', cancel: '', body: `<div class="ad-preview">${qs.map((q, i) => `
    <div class="ad-pv-q"><div class="ad-pv-h">Question ${i + 1} · ${h(q.points)} pt${q.points === 1 ? '' : 's'} · ${h(QTYPES[q.type])}</div>
      <div class="ad-pv-p">${md(q.prompt) || '<p><i>(no question text)</i></p>'}</div>
      ${q.image ? `<img src="${h(q.image)}" alt="" referrerpolicy="no-referrer">` : ''}
      ${q.type === 'mc' || q.type === 'multi' ? `<ol type="A">${q.options.map(o => `<li>${h(o)}</li>`).join('')}</ol>` : ''}
      ${q.type === 'tf' ? '<ol type="A"><li>True</li><li>False</li></ol>' : ''}
      ${q.type === 'ident' ? '<div class="ad-pv-blank">Type your answer</div>' : ''}
      ${q.type === 'essay' ? '<div class="ad-pv-blank tall">Write your answer</div>' : ''}
    </div>`).join('') || '<p>No questions yet.</p>'}</div>` });
}

window.addEventListener('beforeunload', e => { if (unsaved()) { e.preventDefault(); e.returnValue = ''; } });

/* ═════════════════════════ RESULTS ═════════════════════════ */

function viewResults(box, testId) {
  loading(box);
  api('tests.list').then(res => {
    const tests = res.tests.filter(t => t.submitted || t.inProgress || t.status !== 'DRAFT');
    if (!tests.length) { box.innerHTML = `<div class="ad-empty"><div class="ad-empty-ico">📊</div><h3>No results yet</h3><p>Results appear here once students start taking your tests.</p></div>`; return; }
    const sel = testId && tests.some(t => t.id === testId) ? testId : tests[0].id;
    box.innerHTML = `<div class="ad-row ad-results-bar"><select class="ad-select" data-pick>${tests.map(t => `<option value="${h(t.id)}" ${t.id === sel ? 'selected' : ''}>${h(TERMS[t.term])} · ${h(t.slot)} — ${h(t.title)}</option>`).join('')}</select></div>
      <div data-res></div>`;
    $('[data-pick]', box).addEventListener('change', e => { history.replaceState(null, '', '#results'); loadResults($('[data-res]', box), e.target.value); });
    loadResults($('[data-res]', box), sel);
  }).catch(err => failed(box, err, () => viewResults(box, testId)));
}

function loadResults(box, id) {
  loading(box);
  const a = actions(`<button class="ad-btn ghost" data-csv>⬇ Export CSV</button><button class="ad-btn ghost" data-regrade>↻ Regrade</button>`);
  api('results.list', { testId: id }).then(res => {
    const rows = res.attempts, st = res.stats, t = res.test;
    $('[data-csv]', a).onclick = () => exportCsv(t, rows);
    $('[data-regrade]', a).onclick = e => confirmBox('Regrade every submission?', 'Use this after correcting an answer key. Scores and the class record update.', 'Regrade')
      .then(ok => { if (!ok) return; busy(e.target, true, ''); api('tests.regrade', { id }).then(r => { toast(`Regraded ${r.regraded} submission(s).`); loadResults(box, id); }).catch(er => { busy(e.target, false); toast(er.message, 'bad'); }); });
    const pend = rows.filter(r => r.pending && r.status !== 'VOID').length;
    box.innerHTML = `
      <div class="ad-kpis">
        ${kpi('Submitted', st.count, rows.filter(r => r.status === 'IN_PROGRESS').length + ' in progress')}
        ${kpi('Average', st.count ? st.average : '—', 'out of ' + t.max)}
        ${kpi('Highest', st.count ? st.high : '—', '')}
        ${kpi('Lowest', st.count ? st.low : '—', '')}
        ${kpi('Need grading', pend, pend ? 'essays waiting' : 'all graded', pend ? 'warn' : '')}
      </div>
      ${st.count ? histogram(rows.filter(r => r.score != null && r.status !== 'VOID'), t.max) : ''}
      <div class="ad-card flush"><div class="ad-table-wrap"><table class="ad-table">
        <thead><tr><th>Student</th><th>Status</th><th class="num">Score</th><th class="num">Answered</th><th class="num" title="Times the student left the test page">Left page</th><th>Submitted</th><th></th></tr></thead>
        <tbody>${rows.length ? rows.map(r => `<tr class="${r.status === 'VOID' ? 'void' : ''}">
          <td><b>${h(r.name)}</b><small>${h(r.section)}</small></td>
          <td>${attPill(r)}</td>
          <td class="num">${r.score == null ? '—' : `<b>${h(r.score)}</b><small>/ ${h(t.max)}</small>`}</td>
          <td class="num">${r.answered}/${r.items}</td>
          <td class="num ${r.focus >= 5 ? 'hot' : ''}">${r.focus}</td>
          <td class="ad-muted">${r.submittedAt ? fmtDate(r.submittedAt) : r.status === 'IN_PROGRESS' ? 'Due ' + fmtDate(r.deadline) : '—'}</td>
          <td><button class="ad-btn sm ghost" data-open="${h(r.id)}">${r.pending ? 'Grade' : 'View'}</button></td></tr>`).join('')
          : '<tr><td colspan="7" class="ad-muted center">Nobody has started this test yet.</td></tr>'}</tbody></table></div></div>`;
    $$('[data-open]', box).forEach(b => b.addEventListener('click', () => openAttempt(b.dataset.open, () => loadResults(box, id))));
  }).catch(err => failed(box, err, () => loadResults(box, id)));
}

function attPill(r) {
  if (r.status === 'VOID') return '<span class="ad-pill muted">Reset</span>';
  if (r.status === 'IN_PROGRESS') return '<span class="ad-pill info">In progress</span>';
  if (r.pending) return '<span class="ad-pill warn">Needs grading</span>';
  return r.status === 'AUTO_SUBMITTED' ? '<span class="ad-pill ok">Auto-submitted</span>' : '<span class="ad-pill ok">Submitted</span>';
}

function histogram(rows, max) {
  const bins = [0, 0, 0, 0, 0];   // <60, 60-69, 70-79, 80-89, 90+
  rows.forEach(r => { const p = max ? r.score / max * 100 : 0; bins[p >= 90 ? 4 : p >= 80 ? 3 : p >= 70 ? 2 : p >= 60 ? 1 : 0]++; });
  const top = Math.max(1, ...bins), labels = ['Below 60%', '60–69%', '70–79%', '80–89%', '90–100%'];
  return `<div class="ad-card"><div class="ad-card-h"><h4>Score distribution</h4><span class="ad-muted">${rows.length} student${rows.length === 1 ? '' : 's'}</span></div>
    <div class="ad-hist">${bins.map((n, i) => `<div class="ad-bar"><div class="ad-bar-col"><i style="height:${Math.round(n / top * 100)}%" class="b${i}"></i></div><b>${n}</b><span>${labels[i]}</span></div>`).join('')}</div></div>`;
}

function exportCsv(t, rows) {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [['Name', 'Section', 'Access Code', 'Status', 'Score', 'Out of', 'Points', 'Max Points', 'Left page', 'Submitted'].map(q).join(',')]
    .concat(rows.map(r => [r.name, r.section, r.code, r.status, r.score, t.max, r.points, r.maxPoints, r.focus, r.submittedAt ? new Date(r.submittedAt).toLocaleString() : ''].map(q).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (t.term + ' ' + t.slot + ' - ' + t.title).replace(/[^\w\- ]+/g, '').slice(0, 80) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function openAttempt(id, refresh) {
  const d = document.createElement('div');
  d.className = 'ad-drawer';
  d.innerHTML = `<div class="ad-drawer-card"><div class="ad-loading"><span class="ad-spin big"></span></div></div>`;
  document.body.appendChild(d);
  const close = () => { d.classList.add('out'); setTimeout(() => d.remove(), 250); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  d.addEventListener('click', e => { if (e.target === d) close(); });
  const paint = res => {
    const at = res.attempt, card = $('.ad-drawer-card', d), live = at.status === 'IN_PROGRESS';
    card.innerHTML = `
      <header class="ad-drawer-h"><div><span class="ad-kicker">${h(TERMS[res.test.term])} · ${h(res.test.slot)}</span><h3>${h(at.name)}</h3>
        <p class="ad-muted">${h(at.section)} · ${h(String(at.code).replace(/^(.{3})(.{4})(.{4})$/, '$1-$2-$3'))} · left the page ${at.focus} time${at.focus === 1 ? '' : 's'}</p></div>
        <button class="ad-icon" data-x aria-label="Close">✕</button></header>
      <div class="ad-drawer-score"><b>${at.score == null ? '—' : h(at.score)}</b><span>/ ${h(at.max)}</span><small>${live ? 'Still taking the test. Grade the essays after it is submitted.' : at.score == null ? 'Not scored yet.' : `${h(at.points)} of ${h(at.maxPoints)} points · ${at.posted === '' || at.posted == null ? 'not yet in the class record' : 'in the class record'}`}</small></div>
      <div class="ad-drawer-bd">${res.items.map(it => itemHtml(it, live)).join('')}</div>
      <footer class="ad-drawer-f">
        <button class="ad-btn ghost danger-text" data-reset>Reset attempt</button>
        ${!live && res.items.some(i => i.type === 'essay') ? '<button class="ad-btn" data-savegrades>Save grades</button>' : ''}
      </footer>`;
    $('[data-x]', card).addEventListener('click', close);
    $('[data-reset]', card).addEventListener('click', () => confirmBox('Reset this attempt?', 'The student can take the test again. This attempt is kept in the Attempts tab, marked as reset, and stops counting.', 'Reset', true)
      .then(ok => { if (ok) api('results.reset', { attemptId: id }).then(() => { toast('Attempt reset.'); close(); refresh(); }).catch(e => toast(e.message, 'bad')); }));
    const sg = $('[data-savegrades]', card);
    if (sg) sg.addEventListener('click', () => {
      const manual = {};
      $$('[data-grade]', card).forEach(inp => { manual[inp.dataset.grade] = inp.value === '' ? '' : Number(inp.value); });
      busy(sg, true, 'Saving…');
      api('results.grade', { attemptId: id, manual }).then(r => { toast('Grades saved and posted to the class record.'); paint(r); refresh(); })
        .catch(e => { busy(sg, false); toast(e.message, 'bad'); });
    });
  };
  api('results.get', { attemptId: id }).then(paint).catch(e => { $('.ad-drawer-card', d).innerHTML = `<div class="ad-empty"><p>${h(e.message)}</p></div>`; });
}

function itemHtml(it, live) {
  const pend = it.earned === null, right = !pend && it.earned >= it.points, part = !pend && it.earned > 0 && !right;
  let given = '<i class="ad-muted">No answer</i>', key = '';
  if (it.type === 'mc' || it.type === 'tf') {
    const gi = it.type === 'tf' ? (it.given === true ? 0 : it.given === false ? 1 : null) : it.given;
    const ki = it.type === 'tf' ? (it.answer === true ? 0 : 1) : it.answer;
    if (gi != null) given = h(it.options[gi]);
    key = h(it.options[ki]);
  } else if (it.type === 'multi') {
    if (it.given && it.given.length) given = it.given.map(i => h(it.options[i])).join(', ');
    key = (it.answer || []).map(i => h(it.options[i])).join(', ');
  } else if (it.type === 'ident') {
    if (it.given) given = h(it.given); key = h((it.answer || []).join(' / '));
  } else if (it.given) {
    given = `<div class="ad-essay">${h(it.given).replace(/\n/g, '<br>')}</div>`;
  }
  return `<div class="ad-item ${pend ? 'pend' : right ? 'ok' : part ? 'part' : 'bad'}">
    <div class="ad-item-h"><span>${it.n}</span><b>${h(QTYPES[it.type])}</b>
      ${it.type === 'essay' && !live ? `<label class="ad-grade"><input type="number" min="0" max="${h(it.points)}" step="0.5" data-grade="${h(it.qid)}" value="${pend ? '' : h(it.earned)}" placeholder="—"> / ${h(it.points)}</label>`
        : `<em>${pend ? '—' : h(it.earned)} / ${h(it.points)}</em>`}</div>
    <div class="ad-item-q">${md(it.prompt)}</div>
    <div class="ad-item-a"><span>Answer</span>${given}</div>
    ${key && !right ? `<div class="ad-item-a key"><span>Correct</span>${key}</div>` : ''}
    ${it.type === 'essay' && it.explain ? `<div class="ad-item-a note"><span>Your rubric</span>${h(it.explain)}</div>` : ''}
  </div>`;
}

/* ═════════════════════════ LESSONS ═════════════════════════ */

function viewLessons(box) {
  loading(box);
  const a = actions(`<button class="ad-btn" data-new>＋ New lesson</button>`);
  $('[data-new]', a).addEventListener('click', () => editLesson(null, []));
  api('lessons.list').then(res => {
    const rows = res.lessons, byId = {};
    rows.forEach(r => { byId[r.id] = r; });
    const builtins = typeof CONTENT === 'object' ? CONTENT : { m: { lessons: [] }, f: { lessons: [] } };
    box.innerHTML = `<p class="ad-lead">Lock a lesson to keep students out until you're ready, or hide it. <b>Edit</b> opens any lesson to change its text, images, activities and knowledge checks, with a live preview. New lessons you write appear after the built-in ones in the same term.</p>` +
      ['m', 'f'].map(k => {
        const base = (builtins[k].lessons || []).map(l => ({ id: l.id, num: lessonIcon(l), label: lessonLabel(l), title: l.title, desc: l.desc, kind: 'builtin', o: byId[l.id] }));
        const custom = rows.filter(r => r.kind === 'custom' && r.term === k).sort((x, y) => x.order - y.order);
        return `<section class="ad-sec"><h3 class="ad-sec-h">${k === 'm' ? 'Midterm' : 'Final Term'}</h3><div class="ad-card flush"><ul class="ad-lessons">
          ${base.map(l => lessonRow(l.id, l.num, (l.o && l.o.title) || l.title, (l.o && l.o.desc) || l.desc, (l.o && l.o.status) || 'Open', 'builtin', l.o && l.o.edited)).join('')}
          ${custom.map(c => lessonRow(c.id, '★', c.title, c.desc, c.status, 'custom')).join('')}
        </ul></div></section>`;
      }).join('');
    $$('.ad-lesson', box).forEach(row => {
      const id = row.dataset.id, kind = row.dataset.kind;
      $$('[data-st]', row).forEach(b => b.addEventListener('click', () => {
        const base = kind === 'builtin' ? findBuiltin(id) : null;
        const cur = byId[id] || { id, kind, term: id.charAt(0), title: '', desc: '' };
        const payload = Object.assign({}, cur, { status: b.dataset.st, kind });
        if (kind === 'custom') payload.body = cur.body;
        api('lessons.save', { lesson: payload }).then(() => {
          toast(`${base ? base.label : '“' + cur.title + '”'} is now ${b.dataset.st.toLowerCase()}.`);
          viewLessons(box);
        }).catch(e => toast(e.message, 'bad'));
      }));
      $('[data-view]', row).addEventListener('click', () => navTo('viewer', { page: id }));
      $('[data-edit]', row).addEventListener('click', () => kind === 'custom' ? editLesson(byId[id]) : editBuiltin(id));
    });
  }).catch(err => failed(box, err, () => viewLessons(box)));
}

function findBuiltin(id) {
  for (const k of ['m', 'f']) { const l = (CONTENT[k].lessons || []).find(x => x.id === id); if (l) return l; }
  return null;
}

function lessonRow(id, num, title, desc, status, kind, edited) {
  return `<li class="ad-lesson ${status.toLowerCase()}" data-id="${h(id)}" data-kind="${kind}">
    <span class="ad-lesson-n ${kind}">${h(num)}</span>
    <div class="ad-lesson-t"><b>${h(title)}${edited ? ' <span class="lc-tag">Edited</span>' : ''}</b><small>${h(desc || (kind === 'custom' ? 'Your lesson' : ''))}</small></div>
    <div class="ad-seg" role="group" aria-label="Status">${['Open', 'Locked', 'Hidden'].map(s => `<button data-st="${s}" class="${status === s ? 'on ' + s.toLowerCase() : ''}" aria-pressed="${status === s}">${s === 'Open' ? '🔓' : s === 'Locked' ? '🔒' : '🙈'} ${s}</button>`).join('')}</div>
    <button class="ad-btn sm ghost" data-view title="See it in the Module Viewer">👁 View</button>
    <button class="ad-btn sm ghost" data-edit title="Edit the text, images, activities and knowledge checks">✏️ Edit</button>
  </li>`;
}

const BLOCKS = { heading: 'Heading', text: 'Text', callout: 'Callout', image: 'Image', video: 'Video', divider: 'Divider' };
let LE = null;

function editLesson(row) {
  LE = row ? JSON.parse(JSON.stringify(row)) : { id: '', kind: 'custom', term: 'm', order: 0, title: '', desc: '', status: 'Locked', body: [{ t: 'heading', text: '' }, { t: 'text', text: '' }] };
  LE.dirty = false;
  current = 'lessons';
  $$('.ad-nav-btn').forEach(b => b.classList.toggle('on', b.dataset.view === 'lessons'));
  if (location.hash.slice(1) !== 'lessons') history.replaceState(null, '', '#lessons');
  const box = $('#ad-view');
  $('#ad-title').textContent = LE.id ? 'Edit lesson' : 'New lesson';
  const a = actions(`<button class="ad-btn ghost" data-back>← Lessons</button>${LE.id ? '<button class="ad-btn ghost danger-text" data-del>Delete</button>' : ''}<button class="ad-btn" data-save>Save lesson</button>`);
  $('[data-back]', a).addEventListener('click', () => navTo('lessons'));
  if ($('[data-del]', a)) $('[data-del]', a).addEventListener('click', () => confirmBox('Delete this lesson?', 'Students will no longer see it. This cannot be undone.', 'Delete', true)
    .then(ok => { if (ok) api('lessons.delete', { id: LE.id }).then(() => { toast('Lesson deleted.'); LE = null; go('lessons'); }).catch(e => toast(e.message, 'bad')); }));
  $('[data-save]', a).addEventListener('click', e => {
    if (!LE.title.trim()) return toast('Give the lesson a title.', 'bad');
    busy(e.currentTarget, true, 'Saving…');
    const out = Object.assign({}, LE); delete out.dirty;
    api('lessons.save', { lesson: out }).then(() => { LE = null; toast('Lesson saved.'); go('lessons'); }).catch(er => { busy(e.currentTarget, false); toast(er.message, 'bad'); });
  });
  box.innerHTML = `<div class="ad-lesson-ed">
    <div class="ad-lesson-form">
      <div class="ad-card"><div class="ad-form">
        <label class="span2">Title<input data-l="title" maxlength="140" value="${h(LE.title)}" placeholder="e.g. Philippine Contemporary Art"></label>
        <label class="span2">Short description<input data-l="desc" maxlength="400" value="${h(LE.desc)}" placeholder="One line shown under the title"></label>
        <label>Term<select data-l="term"><option value="m" ${LE.term === 'm' ? 'selected' : ''}>Midterm</option><option value="f" ${LE.term === 'f' ? 'selected' : ''}>Final Term</option></select></label>
        <label>Position<input data-l="order" type="number" min="0" max="999" value="${h(LE.order)}"><small>Lower numbers come first.</small></label>
        <label class="span2">Status<select data-l="status">${['Open', 'Locked', 'Hidden'].map(s => `<option ${LE.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select><small>Locked: listed with a lock. Hidden: not listed.</small></label>
      </div></div>
      <div data-blocks></div>
      <div class="ad-addq">${Object.keys(BLOCKS).map(k => `<button class="ad-btn sm ghost" data-addb="${k}">＋ ${BLOCKS[k]}</button>`).join('')}</div>
    </div>
    <aside class="ad-lesson-pv"><div class="ad-pv-label">Live preview</div><div class="ad-pv-page" data-pv></div></aside>
  </div>`;
  $$('[data-l]', box).forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { LE[inp.dataset.l] = inp.type === 'number' ? Number(inp.value) : inp.value; LE.dirty = true; lessonPreview(); }));
  $$('[data-addb]', box).forEach(b => b.addEventListener('click', () => { LE.body.push({ t: b.dataset.addb, text: '', url: '', caption: '', tone: 'info' }); LE.dirty = true; paintBlocks(); }));
  paintBlocks();
}

function paintBlocks() {
  const list = $('[data-blocks]');
  list.innerHTML = LE.body.map((b, i) => `<div class="ad-block" data-i="${i}">
    <div class="ad-q-h"><span class="ad-q-n">${i + 1}</span><b>${BLOCKS[b.t]}</b>
      <div class="ad-q-tools"><button class="ad-icon" data-mv="-1" ${i === 0 ? 'disabled' : ''}>↑</button><button class="ad-icon" data-mv="1" ${i === LE.body.length - 1 ? 'disabled' : ''}>↓</button><button class="ad-icon" data-rm>🗑</button></div></div>
    ${b.t === 'heading' ? `<input data-b="text" maxlength="200" value="${h(b.text)}" placeholder="Section heading">` : ''}
    ${b.t === 'text' ? `<textarea data-b="text" rows="5" maxlength="8000" placeholder="Write here. Blank line = new paragraph. **bold**, *italic*, - bullet, [link](https://…)">${h(b.text)}</textarea>` : ''}
    ${b.t === 'callout' ? `<select data-b="tone">${['info', 'tip', 'warn'].map(t => `<option value="${t}" ${b.tone === t ? 'selected' : ''}>${{ info: '💡 Note', tip: '✨ Tip', warn: '⚠️ Important' }[t]}</option>`).join('')}</select>
      <textarea data-b="text" rows="3" maxlength="8000" placeholder="Callout text">${h(b.text)}</textarea>` : ''}
    ${b.t === 'image' || b.t === 'video' ? `<input data-b="url" maxlength="600" value="${h(b.url)}" placeholder="${b.t === 'video' ? 'YouTube, Vimeo, Google Drive or .mp4 link (https)' : 'Image link (https)'}">
      <input data-b="caption" maxlength="300" value="${h(b.caption)}" placeholder="Caption (optional)">` : ''}
    ${b.t === 'divider' ? '<p class="ad-hint">A decorative break between sections.</p>' : ''}
  </div>`).join('');
  $$('.ad-block', list).forEach(n => {
    const i = Number(n.dataset.i), b = LE.body[i];
    $$('[data-b]', n).forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { b[inp.dataset.b] = inp.value; LE.dirty = true; lessonPreview(); }));
    $$('[data-mv]', n).forEach(x => x.addEventListener('click', () => { const j = i + Number(x.dataset.mv); [LE.body[i], LE.body[j]] = [LE.body[j], LE.body[i]]; LE.dirty = true; paintBlocks(); }));
    $('[data-rm]', n).addEventListener('click', () => { LE.body.splice(i, 1); LE.dirty = true; paintBlocks(); });
  });
  lessonPreview();
}

function md(src) {
  const inline = s => h(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]{1,200})\]\((https:\/\/[^\s)"'<>]{1,500})\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return String(src || '').split(/\n{2,}/).map(p => {
    const ls = p.split('\n');
    if (ls.every(l => /^\s*[-•]\s+/.test(l))) return '<ul>' + ls.map(l => '<li>' + inline(l.replace(/^\s*[-•]\s+/, '')) + '</li>').join('') + '</ul>';
    return p.trim() ? '<p>' + ls.map(inline).join('<br>') + '</p>' : '';
  }).join('');
}

function lessonPreview() {
  const pv = $('[data-pv]'); if (!pv) return;
  pv.innerHTML = `<div class="pv-hdr"><span>${LE.term === 'f' ? 'Final Term' : 'Midterm'} · From your instructor</span><h2>${h(LE.title || 'Untitled lesson')}</h2>${LE.desc ? `<p>${h(LE.desc)}</p>` : ''}</div>
    <div class="pv-body">${LE.body.map(b => {
      if (b.t === 'heading') return `<h3>${h(b.text)}</h3>`;
      if (b.t === 'text') return `<div class="pv-text">${md(b.text)}</div>`;
      if (b.t === 'callout') return `<div class="pv-callout ${h(b.tone)}">${md(b.text) || '<p class="ad-muted">Callout text…</p>'}</div>`;
      if (b.t === 'divider') return '<div class="pv-div">✦ ✦ ✦</div>';
      if (b.t === 'image') return /^https:\/\//.test(b.url) ? `<figure><img src="${h(b.url)}" alt="" referrerpolicy="no-referrer">${b.caption ? `<figcaption>${h(b.caption)}</figcaption>` : ''}</figure>` : '<div class="pv-ph">Image (needs an https link)</div>';
      if (b.t === 'video') return /^https:\/\//.test(b.url) ? `<div class="pv-ph">▶ ${h(b.url)}</div>` : '<div class="pv-ph">Video (needs an https link)</div>';
      return '';
    }).join('')}</div>`;
}

/* ═════════════════════════ BUILT-IN LESSON EDITOR ═════════════════════════ */
/* Everything in a built-in lesson can be changed here: wording, images,
   cards, sorting items, knowledge-check choices and their answers. The live
   preview on the right is the real student module, showing the unsaved copy.
   The activities themselves (their ids, XP and what each one unlocks) stay
   fixed so progress and the class record keep working; the server and the
   module both check that. */

const K_DRAFT = 'aap101.preview.draft';
const LC_TYPES = {
  heading: ['🔠', 'Heading'], text: ['¶', 'Text'], quote: ['❝', 'Quote'], warn: ['⚠️', 'Note box'], video: ['▶', 'Video'],
  compare: ['⚖️', 'Comparison'], polaroids: ['📸', 'Photo reveal'], discover: ['🔍', 'Discovery grid'], deck: ['🃏', 'Card deck'],
  flipdeck: ['🔄', 'Flip cards'], match: ['🧩', 'Memory match'], timeline: ['🗺', 'Quest steps'], quiz: ['✅', 'Knowledge check'],
  sorter: ['🗂', 'Sorting game'], boss: ['⚔️', 'Speed round'], continue: ['➡️', 'Continue button'], reveal: ['🔓', 'Section opened by Continue'],
  strum: ['🎸', 'Strum trainer'], 'sim-exposure': ['📷', 'Exposure simulator'], 'sim-guitar': ['🎸', 'Guitar chord simulator'],
  rubric: ['📋', 'Rubric']
};
const LC_FREE = { heading: { t: 'heading', lvl: 2, text: '' }, text: { t: 'text', html: '<p></p>' }, quote: { t: 'quote', img: '', alt: '', html: '', attr: '' }, warn: { t: 'warn', title: '', html: '' } };
const LC_STRUCT = new Set(['t', 'gate', 'xp', 'id', 'req', 'go', 'unlock', 'reveal', 'mode', 'optional', 'mono', 'cols', 'badgeOnPerfect', 'badgeOnDone', 'badgeOnClean', 'badgeOnClear', 'blocks']);
const LC_RICH = new Set(['html', 'instr', 'q', 'def']);
const LC_IMG = new Set(['img', 'src']);
const LC_LABEL = {
  title: 'Title', kicker: 'Small label above the title', instr: 'Instructions', html: 'Text', text: 'Text', q: 'Question', img: 'Image',
  alt: 'Image description (for screen readers)', imgAlt: 'Image description', attr: 'Attribution', label: 'Label', note: 'Message shown until the activities are done',
  cap: 'Caption', ico: 'Icon (emoji)', def: 'Definition', badge: 'Tag', h: 'Heading', a: 'Term', b: 'Matches', txt: 'Choice', desc: 'Description',
  emoji: 'Emoji', time: 'Seconds per question', badgeText: 'Hint chip', lvl: 'Size', src: 'Video file',
  when: 'When', task: 'Task', name: 'Criterion', ex: 'What Excellent looks like'
};
const LC_LIST = { items: ['Items', 'item'], opts: ['Choices', 'choice'], pairs: ['Pairs', 'pair'], steps: ['Steps', 'step'], questions: ['Questions', 'question'], cats: ['Boxes', 'box'], crit: ['Criteria', 'criterion'] };
let LC = null, LC_BINDS = [], LC_TIMER = null;
const LC_OPEN = new WeakSet();

function lcDeep(x) { return JSON.parse(JSON.stringify(x)); }
function lcStrip(x) {
  if (Array.isArray(x)) return x.map(lcStrip);
  if (x && typeof x === 'object') { const o = {}; Object.keys(x).forEach(k => { if (k.charAt(0) !== '_') o[k] = lcStrip(x[k]); }); return o; }
  return x;
}
function lcWalk(list, fn) { (list || []).forEach(b => { fn(b); if (b.t === 'reveal') lcWalk(b.blocks, fn); }); }
const lcText = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const lcId = p => p + '-' + Math.random().toString(36).slice(2, 7);

function editBuiltin(id) {
  const base = findBuiltin(id);
  if (!base) return toast('That lesson was not found.', 'bad');
  current = 'lessons';
  $$('.ad-nav-btn').forEach(b => b.classList.toggle('on', b.dataset.view === 'lessons'));
  if (location.hash.slice(1) !== 'lessons') history.replaceState(null, '', '#lessons');
  $('#ad-title').textContent = lessonLabel(base) + ': ' + base.title;
  const box = $('#ad-view');
  actions(`<button class="ad-btn ghost" data-back>← Lessons</button>`);
  $('[data-back]').addEventListener('click', () => navTo('lessons'));
  loading(box);
  Promise.all([api('lessons.content', { id }), api('lessons.list')]).then(([c, l]) => {
    const row = (l.lessons || []).find(x => x.id === id) || {};
    LC = { id, base, num: base.num, title: row.title || '', desc: row.desc || '', status: row.status || 'Open', edited: !!c.blocks,
           updated: c.updated, keys: c.keys || {}, keysLive: c.keysLive !== false, blocks: lcDeep(c.blocks || base.blocks), dirty: false };
    /* The answer key goes onto the choices themselves, so it follows them when they move. */
    lcWalk(LC.blocks, b => {
      const k = b.gate && LC.keys[b.gate];
      if (!k) return;
      b._graded = true;
      if (b.t === 'quiz') (b.opts || []).forEach((o, i) => { o._ok = b.mode === 'multi' ? (k.correct || []).indexOf(i) >= 0 : k.correct === i; o._fb = (k.feedback || [])[i] || ''; });
      if (b.t === 'sorter') (b.items || []).forEach(it => { it._cat = (k.answers || {})[it.id] || ''; });
      if (b.t === 'boss') (b.questions || []).forEach((q, i) => { q._ok = (k.correct || [])[i] || 0; });
    });
    lcRender();
  }).catch(err => {
    if (/not supported/i.test(err.message)) {
      box.innerHTML = `<div class="ad-card"><h4>One more step in Apps Script</h4><p>Editing the built-in lessons needs the new <b>Admin.gs</b> and <b>AnswerKey.gs</b>. Paste both into the Apps Script project, then <b>Deploy ▸ Manage deployments ▸ Edit ▸ New version</b>, and open this lesson again.</p></div>`;
    } else failed(box, err, () => editBuiltin(id));
  });
}

function lcRender() {
  const box = $('#ad-view'), base = LC.base;
  const a = actions(`<button class="ad-btn ghost" data-back>← Lessons</button>
    ${LC.edited ? '<button class="ad-btn ghost danger-text" data-restore title="Go back to the lesson as it ships with the module">Restore original</button>' : ''}
    <button class="ad-btn" data-save>Save lesson</button>`);
  $('[data-back]', a).addEventListener('click', () => navTo('lessons'));
  $('[data-save]', a).addEventListener('click', e => lcSave(e.currentTarget));
  if ($('[data-restore]', a)) $('[data-restore]', a).addEventListener('click', lcRestore);
  const hasKeys = Object.keys(LC.keys).length > 0;
  box.innerHTML = `<div class="lc">
    <div class="lc-form">
      <div class="ad-card">
        <div class="lc-state">${LC.edited ? `<span class="ad-pill go">Edited${LC.updated ? ' · saved ' + h(new Date(LC.updated).toLocaleString()) : ''}</span>` : '<span class="ad-pill muted">As it ships with the module</span>'}
          <span class="ad-muted">${base.id.charAt(0) === 'm' ? 'Midterm' : 'Final Term'} · ${h(lessonLabel(base))}</span></div>
        <div class="ad-form">
          <label class="span2">Title<input data-lf="title" maxlength="140" value="${h(LC.title)}" placeholder="${h(base.title)}"><small>Leave blank to keep “${h(base.title)}”.</small></label>
          <label class="span2">Short description<input data-lf="desc" maxlength="400" value="${h(LC.desc)}" placeholder="${h(base.desc || '')}"></label>
          <label class="span2">Status<select data-lf="status">${['Open', 'Locked', 'Hidden'].map(s => `<option ${LC.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select><small>Locked: students see it with a lock. Hidden: not listed.</small></label>
        </div>
        ${hasKeys && !LC.keysLive ? '<p class="lc-warn">⚠️ This lesson has knowledge checks. Update <b>AnswerKey.gs</b> in Apps Script before saving, so the server grades the edited choices.</p>' : ''}
      </div>
      <div class="lc-bar"><span class="ad-muted">Click a block to open it. Activities can be reworded and reordered; text blocks can also be added or removed.</span>
        <span><button class="ad-btn sm ghost" data-all="1">Open all</button> <button class="ad-btn sm ghost" data-all="0">Close all</button></span></div>
      <div data-lc-root></div>
    </div>
    <aside class="lc-pv">
      <div class="lc-pv-bar"><b>Live preview</b><div class="ad-seg" role="group" aria-label="Screen size">
        <button data-pvw="desktop" class="on open">🖥</button><button data-pvw="phone">📱</button></div>
        <button class="ad-icon" data-pvr title="Reload the preview">↻</button></div>
      <div class="lc-pv-frame desktop" data-pvf><iframe title="Lesson preview" data-lcif></iframe></div>
      <p class="ad-hint">The real student module, showing your unsaved changes. Knowledge checks are graded with the saved answers until you save.</p>
    </aside>
  </div>`;
  $$('[data-lf]', box).forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { LC[inp.dataset.lf] = inp.value; lcDirty(); }));
  $$('[data-all]', box).forEach(b => b.addEventListener('click', () => { lcWalk(LC.blocks, x => { if (b.dataset.all === '1') LC_OPEN.add(x); else LC_OPEN.delete(x); }); lcPaint(); }));
  $$('[data-pvw]', box).forEach(b => b.addEventListener('click', () => {
    $$('[data-pvw]', box).forEach(x => { x.classList.toggle('on', x === b); x.classList.toggle('open', x === b); });
    $('[data-pvf]', box).className = 'lc-pv-frame ' + b.dataset.pvw;
  }));
  $('[data-pvr]', box).addEventListener('click', () => lcPreviewLoad());
  lcPaint();
  lcPreviewLoad();
}

function lcDirty() { LC.dirty = true; clearTimeout(LC_TIMER); LC_TIMER = setTimeout(lcPush, 700); }

function lcDraft() { return { id: LC.id, title: LC.title, desc: LC.desc, blocks: lcStrip(LC.blocks) }; }

function lcPreviewLoad() {
  const f = $('[data-lcif]');
  if (!f) return;
  ss.set(K_DRAFT, JSON.stringify(lcDraft()));
  f.src = 'index.html?preview=1&r=' + Date.now();
  const id = LC.id, start = Date.now();
  const wait = () => {
    if (!LC || LC.id !== id || !document.body.contains(f)) return;
    let w = null;
    try { w = f.contentWindow; } catch (e) {}
    if (w && w.AAPAuth && w.AAPAuth.isPreview && w.AAPAuth.isPreview() && w.AAPPortal && typeof w.navigateTo === 'function' && w.document.getElementById('pages')) {
      setTimeout(() => { try { w.AAPPortal.showDraft(lcDraft()); } catch (e) {} }, 250);
      return;
    }
    if (Date.now() - start < 30000) setTimeout(wait, 400);
  };
  setTimeout(wait, 600);
}

function lcPush() {
  if (!LC) return;
  const d = lcDraft();
  ss.set(K_DRAFT, JSON.stringify(d));
  const f = $('[data-lcif]');
  try { if (f && f.contentWindow.AAPPortal && f.contentWindow.AAPAuth.isPreview()) f.contentWindow.AAPPortal.showDraft(d); } catch (e) {}
}

/** Scrolls the preview to the block being edited. */
function lcFocus(path) {
  const f = $('[data-lcif]');
  try { if (f && f.contentWindow.AAPPortal && f.contentWindow.AAPPortal.focusBlock) f.contentWindow.AAPPortal.focusBlock(LC.id, String(path).split('.').map(Number)); } catch (e) {}
}

/* ── block list ── */

function lcPaint() {
  const root = $('[data-lc-root]');
  if (!root) return;
  LC_BINDS = [];
  root.innerHTML = lcList(LC.blocks);
  lcWire(root);
}

function lcBind(obj, key, list) { LC_BINDS.push({ obj, key, list }); return LC_BINDS.length - 1; }

function lcList(list, pre) {
  const li = lcBind(list, null, list);
  pre = pre || '';
  return `<div class="lc-list">${list.map((b, i) => lcBlock(b, i, list, li, pre + i)).join('')}
    <div class="lc-add"><span>＋ Add</span>${Object.keys(LC_FREE).map(t => `<button class="ad-btn sm ghost" data-addb="${t}" data-l="${li}">${LC_TYPES[t][0]} ${LC_TYPES[t][1]}</button>`).join('')}</div></div>`;
}

function lcBlock(b, i, list, li, path) {
  const ty = LC_TYPES[b.t] || ['◆', b.t], open = LC_OPEN.has(b), free = !!LC_FREE[b.t];
  const sum = b.t === 'reveal' ? (b.blocks || []).length + ' blocks, shown after the Continue button above'
    : lcText(b.title || b.text || b.html || b.q || b.label || b.desc || '').slice(0, 90);
  const tags = [];
  if (b.gate) tags.push(`<span class="lc-tag">${b.xp ? b.xp + ' XP' : 'Activity'}${b.optional ? ' · optional' : ''}</span>`);
  if (b._graded) tags.push('<span class="lc-tag key">Graded</span>');
  const bi = lcBind(b, null, list);
  return `<div class="lc-b ${open ? 'open' : ''} ${b.gate ? 'act' : ''}" data-b="${bi}">
    <div class="lc-b-h" data-tog="${bi}" data-path="${path}" role="button" tabindex="0" aria-expanded="${open}">
      <span class="lc-ico">${ty[0]}</span><span class="lc-b-t"><b>${h(ty[1])}</b><small>${h(sum) || '<i>empty</i>'}</small></span>${tags.join('')}
      <span class="lc-tools"><button class="ad-icon" data-mv="-1" data-i="${i}" data-l="${li}" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button><button class="ad-icon" data-mv="1" data-i="${i}" data-l="${li}" ${i === list.length - 1 ? 'disabled' : ''} title="Move down">↓</button>${free ? `<button class="ad-icon" data-rm data-i="${i}" data-l="${li}" title="Remove">🗑</button>` : ''}</span>
    </div>
    ${open ? `<div class="lc-b-bd">${lcFields(b, true)}${b.t === 'reveal' ? `<div class="lc-nest">${lcList(b.blocks, path + '.')}</div>` : ''}${lcFixedNote(b)}</div>` : ''}
  </div>`;
}

function lcFixedNote(b) {
  if (b.t === 'continue') return `<p class="ad-hint">Opens ${b.go ? 'the next lesson' : 'the section below'} once the activities above it are done. What it waits for stays fixed.</p>`;
  if (/^sim-/.test(b.t) || b.t === 'strum') return '<p class="ad-hint">This interactive tool is built into the module. Its settings are fixed.</p>';
  if (b.t === 'reveal') return '';
  if (b.t === 'rubric') return '<p class="ad-hint">The criteria and their points match the course rubric, so the total stays 100. You can reword them here.</p>';
  return '';
}

function lcFields(o, top, ctx) {
  const parts = [];
  Object.keys(o).forEach(k => {
    if (k.charAt(0) === '_' || (top && LC_STRUCT.has(k)) || (!top && k === 'id')) return;
    if (top && k === 'badge' && /^sim-/.test(o.t)) return;
    const v = o[k];
    if (typeof v === 'string') parts.push(lcField(o, k, v));
    else if (typeof v === 'number') {
      if (k === 'lvl') parts.push(`<label class="lc-f">${LC_LABEL.lvl}<select data-bn="${lcBind(o, k)}"><option value="2" ${v !== 3 ? 'selected' : ''}>Section heading</option><option value="3" ${v === 3 ? 'selected' : ''}>Sub-heading</option></select></label>`);
      if (k === 'time') parts.push(`<label class="lc-f">${LC_LABEL.time}<input type="number" min="3" max="120" value="${h(v)}" data-bn="${lcBind(o, k)}"></label>`);
    } else if (Array.isArray(v) && v.every(x => typeof x === 'string')) {
      parts.push(`<div class="lc-f">${h(LC_LABEL[k] || 'Choices')}${v.map((x, i) => `<div class="lc-opt">${ctx && ctx.boss ? `<label class="lc-ok" title="Correct answer"><input type="radio" name="bq${ctx.bi}" data-boss="${ctx.bi}" value="${i}" ${ctx.q._ok === i ? 'checked' : ''}> ✓</label>` : ''}<input value="${h(x)}" data-ba="${lcBind(v, i)}"></div>`).join('')}</div>`);
    } else if (Array.isArray(v) && v.every(x => x && typeof x === 'object')) parts.push(lcItems(o, k, v));
  });
  return parts.join('');
}

function lcField(o, k, v) {
  const label = h(o.t === 'rubric' && k === 'note' ? 'Note under the rubric' : LC_LABEL[k] || k), bi = lcBind(o, k);
  if (LC_IMG.has(k)) {
    const ok = /^(images\/|https:\/\/)/.test(v);
    return `<div class="lc-f">${label}<div class="lc-img">${ok ? `<img src="${h(v)}" alt="">` : '<span>No image</span>'}<div><input value="${h(v)}" data-bs="${bi}" placeholder="images/… or https://…"><button class="ad-btn sm ghost" data-pick="${bi}">Choose image…</button></div></div></div>`;
  }
  if (LC_RICH.has(k) || (k === 'desc' && v.length > 80) || (k === 'title' && /<[a-z]/i.test(v))) {
    return `<div class="lc-f">${label}<div class="lc-rt"><div class="lc-rt-bar">
      <button data-cmd="bold" title="Bold"><b>B</b></button><button data-cmd="italic" title="Italic"><i>I</i></button><button data-cmd="underline" title="Underline"><u>U</u></button>
      <button data-cmd="insertUnorderedList" title="Bulleted list">• List</button><button data-cmd="createLink" title="Link">🔗</button><button data-cmd="removeFormat" title="Clear formatting">⌫</button></div>
      <div class="lc-rich" contenteditable="true" data-bh="${bi}">${lcSafe(v)}</div></div></div>`;
  }
  if (v.length > 90) return `<label class="lc-f">${label}<textarea rows="3" data-bs="${bi}">${h(v)}</textarea></label>`;
  return `<label class="lc-f ${k === 'ico' || k === 'emoji' ? 'short' : ''}">${label}<input value="${h(v)}" data-bs="${bi}"></label>`;
}

/* What the editor shows in a rich-text box: formatting only, never script. */
function lcSafe(s) {
  const t = document.createElement('template');
  t.innerHTML = String(s || '');
  t.content.querySelectorAll('script,style,iframe,object,embed,link,meta,form,img,svg').forEach(n => n.parentNode.removeChild(n));
  t.content.querySelectorAll('*').forEach(n => Array.from(n.attributes).forEach(a => { if (!(n.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:)/i.test(a.value))) n.removeAttribute(a.name); }));
  return t.innerHTML;
}

function lcItems(o, k, arr) {
  const [title, one] = LC_LIST[k] || [k, 'item'];
  const fixed = (o.t === 'compare' && k === 'items') || (o.t === 'rubric' && k === 'crit');
  const min = k === 'opts' || k === 'cats' ? 2 : 1;
  const li = lcBind(arr, null, arr);
  const quiz = o.t === 'quiz' && k === 'opts' && o._graded, sorter = o.t === 'sorter' && k === 'items' && o._graded, boss = o.t === 'boss' && k === 'questions';
  return `<div class="lc-items"><div class="lc-items-h">${h(title)} <small>${arr.length}</small></div>
    ${quiz ? `<p class="ad-hint">${o.mode === 'multi' ? 'Tick every correct choice.' : 'Pick the one correct choice.'} The note under each choice is the feedback a student sees after choosing it.</p>` : ''}
    ${sorter ? '<p class="ad-hint">Choose the right box for every item.</p>' : ''}
    ${boss ? '<p class="ad-hint">Every question has exactly four choices. Mark the right one with ✓.</p>' : ''}
    ${arr.map((it, i) => {
      const ib = lcBind(it, null, arr);
      const key = quiz ? `<label class="lc-ok">${o.mode === 'multi' ? `<input type="checkbox" data-qok="${ib}" ${it._ok ? 'checked' : ''}>` : `<input type="radio" name="q${li}" data-qok="${ib}" data-one="${li}" ${it._ok ? 'checked' : ''}>`} Correct</label>`
        : sorter ? `<label class="lc-f lc-cat">Right box<select data-cat="${ib}"><option value="">Choose…</option>${(o.cats || []).map(c => `<option value="${h(c.id)}" ${it._cat === c.id ? 'selected' : ''}>${h(lcText(c.label))}</option>`).join('')}</select></label>` : '';
      return `<div class="lc-item ${quiz && it._ok ? 'right' : ''}"><div class="lc-item-h"><span>${h(one.charAt(0).toUpperCase() + one.slice(1))} ${i + 1}</span>
        <span class="lc-tools">${fixed ? '' : `<button class="ad-icon" data-imv="-1" data-i="${i}" data-l="${li}" ${i === 0 ? 'disabled' : ''}>↑</button><button class="ad-icon" data-imv="1" data-i="${i}" data-l="${li}" ${i === arr.length - 1 ? 'disabled' : ''}>↓</button><button class="ad-icon" data-irm data-i="${i}" data-l="${li}" ${arr.length <= min ? 'disabled' : ''}>🗑</button>`}</span></div>
        ${sorter ? '' : key}${lcFields(it, false, boss ? { boss: true, bi: ib, q: it } : null)}${sorter ? key : ''}
        ${quiz ? `<label class="lc-f">Feedback for this choice<input value="${h(lcText(it._fb))}" data-fb="${ib}" placeholder="${it._ok ? '✅ Correct! …' : '❌ Not quite. …'}"></label>` : ''}</div>`;
    }).join('')}
    ${fixed || arr.length >= 30 ? '' : `<button class="ad-btn sm ghost" data-iadd="${li}" data-k="${k}" data-o="${lcBind(o, k)}">＋ Add ${h(one)}</button>`}
  </div>`;
}

function lcNewItem(o, k, arr) {
  if (k === 'questions') return { q: '', opts: ['', '', '', ''], _ok: 0 };
  const proto = arr[arr.length - 1] || arr[0] || {};
  const it = {};
  Object.keys(proto).forEach(x => { if (x.charAt(0) !== '_') it[x] = typeof proto[x] === 'string' ? '' : Array.isArray(proto[x]) ? proto[x].map(() => '') : proto[x]; });
  if ('id' in proto || k === 'cats' || (o.t === 'sorter' && k === 'items')) it.id = lcId(k === 'cats' ? 'c' : 'i');
  if (o.t === 'quiz' && k === 'opts') { it.txt = it.txt || ''; it._ok = false; it._fb = ''; }
  if (o.t === 'sorter' && k === 'items') it._cat = '';
  return it;
}

function lcWire(root) {
  const B = el => LC_BINDS[Number(el)];
  const rerender = () => { lcPaint(); lcDirty(); };
  $$('[data-tog]', root).forEach(t => {
    const fn = () => {
      const b = B(t.dataset.tog).obj, opening = !LC_OPEN.has(b);
      if (opening) LC_OPEN.add(b); else LC_OPEN.delete(b);
      lcPaint();
      if (opening) lcFocus(t.dataset.path);
    };
    t.addEventListener('click', e => { if (!e.target.closest('.lc-tools')) fn(); });
    t.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === t) { e.preventDefault(); fn(); } });
  });
  $$('[data-mv],[data-imv]', root).forEach(x => x.addEventListener('click', e => {
    e.stopPropagation();
    const list = B(x.dataset.l).list, i = Number(x.dataset.i), j = i + Number(x.dataset.mv || x.dataset.imv);
    [list[i], list[j]] = [list[j], list[i]]; rerender();
  }));
  $$('[data-rm],[data-irm]', root).forEach(x => x.addEventListener('click', e => {
    e.stopPropagation();
    B(x.dataset.l).list.splice(Number(x.dataset.i), 1); rerender();
  }));
  $$('[data-addb]', root).forEach(x => x.addEventListener('click', () => {
    const b = lcDeep(LC_FREE[x.dataset.addb]); B(x.dataset.l).list.push(b); LC_OPEN.add(b); rerender();
  }));
  $$('[data-iadd]', root).forEach(x => x.addEventListener('click', () => {
    const arr = B(x.dataset.iadd).list, o = B(x.dataset.o).obj; arr.push(lcNewItem(o, x.dataset.k, arr)); rerender();
  }));
  $$('[data-bs]', root).forEach(inp => inp.addEventListener('input', () => {
    const bd = B(inp.dataset.bs); bd.obj[bd.key] = inp.value; lcDirty();
    if (LC_IMG.has(bd.key)) { const box = inp.closest('.lc-img'); const ok = /^(images\/|https:\/\/)/.test(inp.value); box.firstElementChild.outerHTML = ok ? `<img src="${h(inp.value)}" alt="">` : '<span>No image</span>'; }
  }));
  $$('[data-bn]', root).forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { const bd = B(inp.dataset.bn); bd.obj[bd.key] = Number(inp.value) || 0; lcDirty(); }));
  $$('[data-ba]', root).forEach(inp => inp.addEventListener('input', () => { const bd = B(inp.dataset.ba); bd.obj[bd.key] = inp.value; lcDirty(); }));
  $$('[data-bh]', root).forEach(ed => {
    ed.addEventListener('input', () => { const bd = B(ed.dataset.bh); bd.obj[bd.key] = lcSafe(ed.innerHTML); lcDirty(); });
    ed.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); });
  });
  $$('[data-cmd]', root).forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => {
      const ed = btn.closest('.lc-rt').querySelector('.lc-rich'); ed.focus();
      if (btn.dataset.cmd === 'createLink') {
        const u = prompt('Link address (https://…)');
        if (u && /^https?:\/\//i.test(u.trim())) document.execCommand('createLink', false, u.trim());
      } else document.execCommand(btn.dataset.cmd, false, null);
      ed.dispatchEvent(new Event('input'));
    });
  });
  $$('[data-qok]', root).forEach(inp => inp.addEventListener('change', () => {
    const it = B(inp.dataset.qok).obj, arr = B(inp.dataset.qok).list;
    if (inp.type === 'radio') arr.forEach(x => { x._ok = x === it; }); else it._ok = inp.checked;
    $$('.lc-item', inp.closest('.lc-items')).forEach((n, i) => n.classList.toggle('right', !!arr[i]._ok));
    lcDirty();
  }));
  $$('[data-fb]', root).forEach(inp => inp.addEventListener('input', () => { B(inp.dataset.fb).obj._fb = inp.value; LC.dirty = true; }));
  $$('[data-cat]', root).forEach(sel => sel.addEventListener('change', () => { B(sel.dataset.cat).obj._cat = sel.value; LC.dirty = true; }));
  $$('[data-boss]', root).forEach(r => r.addEventListener('change', () => { B(r.dataset.boss).obj._ok = Number(r.value); LC.dirty = true; }));
  $$('[data-pick]', root).forEach(btn => btn.addEventListener('click', () => lcPickImage(B(btn.dataset.pick), btn.closest('.lc-img'))));
}

function lcPickImage(bd, box) {
  const seen = new Set();
  const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.keys(v).forEach(k => { if (LC_IMG.has(k) && /^images\//.test(v[k])) seen.add(v[k]); else walk(v[k]); }); };
  ['m', 'f'].forEach(k => walk(CONTENT[k].lessons));
  const imgs = Array.from(seen).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  dialog({ title: 'Choose an image', ok: 'Use link', wide: true, body: `
    <div class="lc-gal">${imgs.map(s => `<button type="button" data-src="${h(s)}" title="${h(s)}"><img src="${h(s)}" alt="" loading="lazy"></button>`).join('')}</div>
    <label class="ad-lbl">Or paste an image link<input data-u placeholder="https://…" value="${/^https:/.test(bd.obj[bd.key]) ? h(bd.obj[bd.key]) : ''}"><small class="ad-muted">Use a direct link to the picture itself (ending in .jpg, .png or .webp). A Google Drive share page will not work. To use a new picture of your own, add it to the images folder of the site.</small></label>` })
    .then(d => {
      if (!d) return;
      const u = $('[data-u]', d).value.trim();
      if (u && !/^https:\/\//.test(u)) return toast('Image links must start with https://', 'bad');
      if (u) lcSetImg(bd, box, u);
    });
  setTimeout(() => $$('.lc-gal [data-src]').forEach(b => b.addEventListener('click', () => {
    lcSetImg(bd, box, b.dataset.src);
    const dlg = b.closest('.ad-dialog'); if (dlg) $('[data-c]', dlg).click();
  })), 50);
}
function lcSetImg(bd, box, src) {
  bd.obj[bd.key] = src;
  $('input', box).value = src;
  box.firstElementChild.outerHTML = `<img src="${h(src)}" alt="">`;
  lcDirty();
}

/* ── save ── */

function lcKeys() {
  const keys = {}, problems = [];
  lcWalk(LC.blocks, b => {
    if (!b._graded) return;
    const name = '“' + (lcText(b.title) || LC_TYPES[b.t][1]) + '”';
    if (b.t === 'quiz') {
      const opts = b.opts || [], marked = opts.map((o, i) => o._ok ? i : -1).filter(i => i >= 0);
      if (opts.some(o => !lcText(o.txt))) problems.push(name + ': one of the choices is empty.');
      if (b.mode === 'multi') { if (!marked.length) problems.push(name + ': tick at least one correct choice.'); keys[b.gate] = { correct: marked, feedback: opts.map(o => o._fb || '') }; }
      else { if (marked.length !== 1) problems.push(name + ': pick the correct choice.'); keys[b.gate] = { correct: marked[0], feedback: opts.map(o => o._fb || '') }; }
    } else if (b.t === 'sorter') {
      const ans = {};
      (b.items || []).forEach(it => { ans[it.id] = it._cat; if (!(b.cats || []).some(c => c.id === it._cat)) problems.push(name + ': choose the right box for “' + lcText(it.label) + '”.'); });
      keys[b.gate] = { answers: ans };
    } else if (b.t === 'boss') {
      if ((b.questions || []).some(q => !lcText(q.q) || q.opts.some(x => !String(x).trim()))) problems.push(name + ': every question needs its text and four choices.');
      keys[b.gate] = { correct: (b.questions || []).map(q => Number(q._ok) || 0) };
    }
  });
  return { keys, problems };
}

function lcSave(btn) {
  const { keys, problems } = lcKeys();
  if (problems.length) return dialog({ title: 'Almost there', cancel: '', ok: 'OK', body: `<ul class="lc-probs">${problems.map(p => `<li>${h(p)}</li>`).join('')}</ul>` });
  busy(btn, true, 'Saving…');
  api('lessons.save', { lesson: { id: LC.id, kind: 'builtin', status: LC.status, title: LC.title, desc: LC.desc, content: { blocks: lcStrip(LC.blocks), keys } } })
    .then(() => {
      LC.dirty = false; LC.edited = true; LC.updated = Date.now(); PAL_CACHE = null;
      toast('Lesson saved. Students see it the next time they open the module.');
      lcRender();
    })
    .catch(err => { busy(btn, false); toast(err.message, 'bad'); });
}

function lcRestore() {
  confirmBox('Restore the original lesson?', 'Your edits to this lesson, including any changed knowledge-check answers, are removed. The title, description and status stay as they are.', 'Restore', true).then(ok => {
    if (!ok) return;
    api('lessons.save', { lesson: { id: LC.id, kind: 'builtin', status: LC.status, title: LC.title, desc: LC.desc, content: null } })
      .then(() => { toast('Original lesson restored.'); LC.dirty = false; editBuiltin(LC.id); })
      .catch(err => toast(err.message, 'bad'));
  });
}

/* ═════════════════════════ STUDENTS ═════════════════════════ */

function viewStudents(box) {
  loading(box);
  const a = actions(`<button class="ad-btn ghost" data-csv>⬇ Export CSV</button>`);
  api('students.list').then(res => {
    const all = res.students, secs = Array.from(new Set(all.map(s => s.section))).sort();
    $('[data-csv]', a).onclick = () => {
      const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      download([['Name', 'Section', 'Access Code', 'Status', 'Last Seen', 'Sign-ins', 'Minutes', 'Lessons Done', 'Progress %', 'XP'].map(q).join(',')]
        .concat(all.map(s => [s.name, s.section, fmtCode(s.code), s.status, s.lastSeen ? new Date(s.lastSeen).toLocaleString() : '', s.logins, s.minutes, s.lessons, s.progress, s.xp].map(q).join(','))).join('\r\n'), 'AAP101 students.csv');
    };
    box.innerHTML = `<div class="ad-row ad-filter">
        <input class="ad-search" type="search" placeholder="Search name or code…" data-q>
        <select class="ad-select" data-sec><option value="">All sections (${all.length})</option>${secs.map(s => `<option>${h(s)}</option>`).join('')}</select>
        <span class="ad-muted">${res.unclaimed} unclaimed code${res.unclaimed === 1 ? '' : 's'}</span></div>
      <div class="ad-card flush"><div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>Student</th><th>Access code</th><th>Status</th><th>Last seen</th><th class="num">Progress</th><th class="num">XP</th><th></th></tr></thead><tbody data-rows></tbody></table></div></div>`;
    const paint = () => {
      const q = $('[data-q]', box).value.trim().toLowerCase(), sec = $('[data-sec]', box).value;
      const rows = all.filter(s => (!sec || s.section === sec) && (!q || (s.name + ' ' + s.code).toLowerCase().includes(q)));
      $('[data-rows]', box).innerHTML = rows.length ? rows.map(s => `<tr data-code="${h(s.code)}">
        <td><button class="ad-link ad-name-link" data-prof>${h(s.name)}</button><small>${h(s.section)}</small></td>
        <td><code class="ad-code">${h(s.code.replace(/^(.{3})(.{4})(.{4})$/, '$1-$2-$3'))}</code></td>
        <td>${s.status === 'DISABLED' ? '<span class="ad-pill bad">Disabled</span>' : '<span class="ad-pill ok">Active</span>'}</td>
        <td class="ad-muted">${fmtAgo(s.lastSeen)}</td>
        <td class="num"><div class="ad-meter"><i style="width:${Math.min(100, s.progress)}%"></i></div>${s.progress}%</td>
        <td class="num">${s.xp}</td>
        <td class="ad-row-end"><button class="ad-btn sm ghost" data-sa="signout">Sign out</button>
          ${s.status === 'DISABLED' ? '<button class="ad-btn sm" data-sa="enable">Enable</button>' : '<button class="ad-btn sm ghost danger-text" data-sa="disable">Disable</button>'}</td></tr>`).join('')
        : '<tr><td colspan="7" class="ad-muted center">No students match.</td></tr>';
      $$('[data-prof]', box).forEach(b => b.addEventListener('click', () => openStudent(b.closest('tr').dataset.code, () => viewStudents(box))));
      $$('[data-sa]', box).forEach(b => b.addEventListener('click', () => {
        const code = b.closest('tr').dataset.code, s = all.find(x => x.code === code), act = b.dataset.sa;
        const msg = act === 'signout' ? `${s.name} will be signed out on every device. Their progress is kept.`
          : act === 'disable' ? `${s.name} will be blocked immediately until you enable them again.` : `${s.name} will be able to sign in again.`;
        confirmBox({ signout: 'Sign out', disable: 'Disable', enable: 'Enable' }[act] + ' ' + s.name + '?', msg, 'Yes', act === 'disable').then(ok => {
          if (!ok) return;
          const call = act === 'signout' ? api('students.signout', { code }) : api('students.status', { code, status: act === 'disable' ? 'DISABLED' : 'ACTIVE' });
          call.then(() => { toast('Done.'); if (act !== 'signout') { s.status = act === 'disable' ? 'DISABLED' : 'ACTIVE'; paint(); } }).catch(e => toast(e.message, 'bad'));
        });
      }));
    };
    $('[data-q]', box).addEventListener('input', paint);
    $('[data-sec]', box).addEventListener('change', paint);
    paint();
  }).catch(err => failed(box, err, () => viewStudents(box)));
}

/* ═════════════════════════ CLASS RECORD ═════════════════════════ */

function viewRecord(box) {
  box.innerHTML = `
    <div class="ad-grid2">
      <div class="ad-card"><div class="ad-card-h"><h4>Build or refresh</h4></div>
        <p>Creates one tab per section in the spreadsheet, laid out exactly like your Class Record template, and adds students who registered since the last run. Scores you typed are never erased.</p>
        <button class="ad-btn" data-build>🧾 Build / refresh class record</button>
        <div data-out></div>
      </div>
      <div class="ad-card"><div class="ad-card-h"><h4>How grades are computed</h4></div>
        <table class="ad-table compact"><tbody>
          <tr><td>Term quiz (Quiz 1 slot)</td><td class="num"><b>30%</b></td><td class="ad-muted">from the module</td></tr>
          <tr><td>Term exam</td><td class="num"><b>30%</b></td><td class="ad-muted">from the module</td></tr>
          <tr><td>Performance tasks (workshop, activity, project)</td><td class="num"><b>30%</b></td><td class="ad-muted">you type them</td></tr>
          <tr><td>Recitation / Attendance</td><td class="num"><b>10%</b></td><td class="ad-muted">you type them</td></tr>
        </tbody></table>
        <p class="ad-muted">Laid out like the BulSU Class Record template. Final rating = (MT Grade + FT Grade) ÷ 2. MG, FTG and FG: 96.50+ → 1.00, 93.50 → 1.25, 90.50 → 1.50, 87.50 → 1.75, 84.50 → 2.00, 81.50 → 2.25, 78.50 → 2.50, 75.50 → 2.75, 75.00 → 3.00, 74.01–74.99 → 4.00, 74.00 and below → 5.00. Type INC or Dropped in Status to override Remarks.</p>
      </div>
      <div class="ad-card span2" data-consult></div>
    </div>`;
  $('[data-build]', box).addEventListener('click', e => {
    const btn = e.currentTarget; busy(btn, true, 'Building…');
    api('classrecord.build').then(r => {
      busy(btn, false);
      $('[data-out]', box).innerHTML = r.results.length ? `<ul class="ad-list">${r.results.map(x => x.error ? `<li class="bad">${h(x.tab)}: ${h(x.error)}</li>`
        : `<li><b>${h(x.tab)}</b> · ${x.total} students${x.added ? ` (${x.added} new)` : ''}</li>`).join('')}</ul>` : '<p class="ad-muted">No registered students yet.</p>';
      toast('Class record updated.');
    }).catch(err => { busy(btn, false); toast(err.message, 'bad'); });
  });
  consultCard($('[data-consult]', box));
}

/* Online grade consultation: release terms to students and preview what they see. */
function consultCard(card) {
  card.innerHTML = '<div class="ad-card-h"><h4>Online grade consultation</h4></div><div class="ad-loading"><span class="ad-spin"></span></div>';
  api('consult.get').then(res => {
    const c = res.consult;
    card.innerHTML = `<div class="ad-card-h"><h4>Online grade consultation</h4></div>
      <p>Students see their own scores, term grades and a short reading of their record under <b>My Grades</b>, only for the terms you release. A blank score with <b>red fill</b> counts as not submitted; a blank without fill keeps the student's record on "still being graded".</p>
      <div class="ad-row">
        <label class="ad-check"><input type="checkbox" data-rel="mt" ${c.mt ? 'checked' : ''}> Release Midterm</label>
        <label class="ad-check"><input type="checkbox" data-rel="ft" ${c.ft ? 'checked' : ''}> Release Final Term (shows the final grade)</label>
      </div>
      <label class="ad-lbl">Note shown to students (consultation hours, deadline for concerns)
        <textarea data-note rows="2" maxlength="500">${h(String(c.note || '').replace(/^'/, ''))}</textarea></label>
      <div class="ad-row"><button class="ad-btn" data-save>Save</button>${c.updated ? `<span class="ad-muted">Last changed ${h(fmtDate(c.updated))}</span>` : ''}</div>
      <hr class="ad-hr">
      <label class="ad-lbl">Preview a student (access code)<span class="ad-row"><input data-code maxlength="20" placeholder="Student's access code" autocomplete="off">
        <button class="ad-btn ghost" data-prev type="button">Preview</button></span></label>
      <div data-pv class="ad-consult-pv"></div>`;
    $('[data-save]', card).addEventListener('click', e => {
      const btn = e.currentTarget; busy(btn, true, 'Saving…');
      api('consult.set', { mt: $('[data-rel="mt"]', card).checked, ft: $('[data-rel="ft"]', card).checked, note: $('[data-note]', card).value })
        .then(() => { busy(btn, false); toast('Grade consultation updated.'); })
        .catch(err => { busy(btn, false); toast(err.message, 'bad'); });
    });
    const prev = () => {
      const code = $('[data-code]', card).value.trim();
      if (!code) return;
      const pv = $('[data-pv]', card); pv.innerHTML = '<div class="ad-loading"><span class="ad-spin"></span></div>';
      api('consult.preview', { code }).then(r => {
        pv.innerHTML = `<p class="ad-muted">Both terms shown for checking. Students only see released terms.</p>` +
          (window.AAPGrades ? AAPGrades.render(r.record, { note: $('[data-note]', card).value }) : '');
      }).catch(err => { pv.innerHTML = `<p class="bad">${h(err.message)}</p>`; });
    };
    $('[data-prev]', card).addEventListener('click', prev);
    $('[data-code]', card).addEventListener('keydown', e => { if (e.key === 'Enter') prev(); });
  }).catch(err => { card.innerHTML = `<div class="ad-card-h"><h4>Online grade consultation</h4></div><p class="bad">${h(err.message)}</p>`; });
}

/* ═════════════════════════ MODULE VIEWER ═════════════════════════ */
/* The real student module, running inside the Studio as the instructor:
   no access code, every lesson open, answers checked by the server with the
   real key, and nothing recorded. See "INSTRUCTOR PREVIEW" in auth.js. */

const VW = { device: 'desktop', page: '' };
const DEVICES = { desktop: { label: '🖥 Desktop', w: 0, h: 0 }, tablet: { label: '📱 Tablet', w: 820, h: 1180 }, phone: { label: '📱 Phone', w: 390, h: 844 } };
let VW_TIMER = null;
try { const d = localStorage.getItem('aap101.admin.viewer'); if (DEVICES[d]) VW.device = d; } catch (e) {}

function viewViewer(box, arg) {
  const a = actions(`<div class="ad-seg" role="group" aria-label="Screen size">${Object.keys(DEVICES).map(k => `<button data-dev="${k}" class="${VW.device === k ? 'on open' : ''}" aria-pressed="${VW.device === k}">${DEVICES[k].label}</button>`).join('')}</div>
    <button class="ad-btn ghost" data-reload title="Reload the module">↻ Reload</button>
    <button class="ad-btn ghost" data-pop title="Open in a separate window">↗ New window</button>`);
  box.innerHTML = `<div class="vw">
    <aside class="vw-out ad-card flush"><div class="vw-out-h"><b>Course outline</b><small>Click to open it in the viewer</small></div><div data-outline><div class="ad-loading"><span class="ad-spin"></span></div></div></aside>
    <section class="vw-stage"><div class="vw-frame ${VW.device}" data-frame><iframe title="Student module preview" src="index.html?preview=1" data-if></iframe></div>
      <p class="ad-hint vw-note">This is the live module as students get it. Locked and hidden lessons are open to you and labelled. Answers are checked against the real key; nothing goes to the sheet or the class record. Quizzes &amp; Exams lists drafts too.</p></section>
  </div>`;
  const iframe = $('[data-if]', box), frame = $('[data-frame]', box);
  $$('[data-dev]', a).forEach(b => b.addEventListener('click', () => {
    VW.device = b.dataset.dev;
    try { localStorage.setItem('aap101.admin.viewer', VW.device); } catch (e) {}
    $$('[data-dev]', a).forEach(x => { x.classList.toggle('on', x === b); x.classList.toggle('open', x === b); x.setAttribute('aria-pressed', x === b); });
    frame.className = 'vw-frame ' + VW.device;
  }));
  $('[data-reload]', a).addEventListener('click', () => { try { iframe.contentWindow.location.reload(); } catch (e) { iframe.src = iframe.src; } });
  $('[data-pop]', a).addEventListener('click', openPreviewWindow);
  if (arg && arg.page) iframe.addEventListener('load', () => setTimeout(() => vwGo(arg.page), 900), { once: true });
  vwOutline($('[data-outline]', box));
  clearInterval(VW_TIMER);
  VW_TIMER = setInterval(() => {
    if (current !== 'viewer' || !document.body.contains(iframe)) { clearInterval(VW_TIMER); return; }
    let p = '';
    try { p = iframe.contentWindow.AAPAuth && iframe.contentWindow.AAPAuth.preview ? iframe.contentWindow.AAPAuth.preview.page() : ''; } catch (e) {}
    if (p !== VW.page) { VW.page = p; $$('.vw-item', box).forEach(x => x.classList.toggle('on', x.dataset.pid === p)); }
  }, 700);
}

/* The module in its own window, signed in as the instructor. No "noopener":
   the new window needs a copy of this tab's Studio session. */
function openPreviewWindow() {
  const w = window.open('index.html?preview=1', 'aap101preview', 'width=1280,height=860');
  if (!w) toast('Your browser blocked the new window. Allow pop-ups for this site.', 'bad');
}

function vwGo(pid) {
  const iframe = $('[data-if]');
  if (!iframe) return navTo('viewer', { page: pid });
  try {
    const w = iframe.contentWindow;
    if (w.AAPAuth && w.AAPAuth.preview) { w.AAPAuth.preview.go(pid); return; }
  } catch (e) {}
  toast('The module is still loading.', 'bad');
}

function vwOutline(el) {
  const pill = st => st && st !== 'Open' ? `<span class="ad-pill ${st === 'Locked' ? 'warn' : 'muted'}">${h(st)}</span>` : '';
  const item = (pid, ico, label, sub, st) => `<button class="vw-item" data-pid="${h(pid)}"><span class="vw-ico">${h(ico)}</span><span class="vw-t"><b>${h(label)}</b>${sub ? `<small>${h(sub)}</small>` : ''}</span>${pill(st)}</button>`;
  const paint = rows => {
    const by = {}; (rows || []).forEach(r => { by[r.id] = r; });
    const term = k => {
      const base = (typeof CONTENT === 'object' ? CONTENT[k].lessons || [] : []).map(l => item(l.id, lessonIcon(l), (by[l.id] && by[l.id].title) || l.title, '', by[l.id] && by[l.id].status)).join('');
      const custom = (rows || []).filter(r => r.kind === 'custom' && r.term === k).sort((x, y) => x.order - y.order).map(c => item(c.id, '★', c.title, 'Your lesson', c.status)).join('');
      return `<div class="vw-sec">${k === 'm' ? 'Midterm' : 'Final Term'}</div>${base}${custom}`;
    };
    el.innerHTML = item('terminal', '⌂', 'Home', '', '') + item('tests', '📝', 'Quizzes & Exams', 'Drafts included', '') + item('grades', '🎓', 'My Grades', '', '') + item('guide', '📘', 'Course Guide', '', '') + term('m') + term('f');
    $$('.vw-item', el).forEach(b => b.addEventListener('click', () => vwGo(b.dataset.pid)));
  };
  api('lessons.list').then(r => paint(r.lessons)).catch(() => paint([]));
}

/* ═════════════════════════ STUDENT PROFILE ═════════════════════════ */

function drawer() {
  const d = document.createElement('div');
  d.className = 'ad-drawer';
  d.innerHTML = `<div class="ad-drawer-card"><div class="ad-loading"><span class="ad-spin big"></span></div></div>`;
  document.body.appendChild(d);
  const close = () => { d.classList.add('out'); setTimeout(() => d.remove(), 250); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape' && !$('.ad-dialog')) close(); };
  document.addEventListener('keydown', key);
  d.addEventListener('click', e => { if (e.target === d) close(); });
  return { el: d, card: $('.ad-drawer-card', d), close };
}
const fmtCode = c => String(c || '').replace(/^(.{3})(.{4})(.{4})$/, '$1-$2-$3');
const fmtNum = n => n === '' || n == null ? '—' : String(Math.round(Number(n) * 100) / 100);
const fmtEq = n => n === '' || n == null ? '—' : Number(n).toFixed(2);

function openStudent(code, onChange) {
  const dr = drawer(), card = dr.card;
  const changed = () => { if (onChange) onChange(); };
  const paint = res => {
    const s = res.student, rec = res.record;
    card.innerHTML = `
      <header class="ad-drawer-h"><div><span class="ad-kicker">${h(s.section || 'No section')}</span><h3 data-nm>${h(s.name)}</h3>
        <p class="ad-muted"><code class="ad-code">${h(fmtCode(s.code))}</code> · ${s.status === 'DISABLED' ? '<span class="ad-pill bad">Disabled</span>' : '<span class="ad-pill ok">Active</span>'}</p></div>
        <button class="ad-icon" data-x aria-label="Close">✕</button></header>
      <div class="ad-drawer-bd">
        <div class="ad-mini-kpis">
          ${miniKpi('Progress', s.progress + '%')}${miniKpi('XP', s.xp)}${miniKpi('Lessons done', s.lessons)}
          ${miniKpi('Time in module', s.minutes >= 60 ? Math.floor(s.minutes / 60) + ' h ' + (s.minutes % 60) + ' m' : s.minutes + ' m')}
          ${miniKpi('Sign-ins', s.logins)}${miniKpi('Last seen', fmtAgo(s.lastSeen))}
        </div>
        <h4 class="ad-sub-h">Class record</h4>
        ${rec ? recordBlock(rec) : '<p class="ad-muted">Not on a class record tab yet. Build or refresh the class record to add them.</p>'}
        <h4 class="ad-sub-h">Quizzes &amp; exams</h4>
        ${res.attempts.length ? `<table class="ad-table compact"><tbody>${res.attempts.map(a => `<tr class="${a.status === 'VOID' ? 'void' : ''}">
          <td><b>${h(a.title)}</b><small>${h(TERMS[a.term] || '')} · ${h(a.slot)} · ${fmtDate(a.submittedAt || a.startedAt)}</small></td>
          <td class="num">${a.score == null ? `<span class="ad-pill muted">${a.status === 'IN_PROGRESS' ? 'Taking' : a.status === 'VOID' ? 'Reset' : 'Pending'}</span>` : `${h(a.score)}<small>/ ${h(a.max)}</small>`}</td>
          <td class="nowrap"><button class="ad-btn sm ghost" data-att="${h(a.id)}">Open</button></td></tr>`).join('')}</tbody></table>`
          : '<p class="ad-muted">No attempts yet.</p>'}
      </div>
      <footer class="ad-drawer-f">
        <button class="ad-btn ghost" data-rename>Correct name</button>
        <button class="ad-btn ghost" data-signout>Sign out everywhere</button>
        ${s.status === 'DISABLED' ? '<button class="ad-btn" data-enable>Enable</button>' : '<button class="ad-btn ghost danger-text" data-disable>Disable</button>'}
        ${rec ? '<button class="ad-btn" data-gb>Edit grades</button>' : ''}
      </footer>`;
    $('[data-x]', card).addEventListener('click', dr.close);
    $$('[data-att]', card).forEach(b => b.addEventListener('click', () => openAttempt(b.dataset.att, () => api('students.get', { code }).then(paint))));
    if ($('[data-gb]', card)) $('[data-gb]', card).addEventListener('click', () => { dr.close(); navTo('gradebook', { tab: rec.tab, code: s.code }); });
    $('[data-rename]', card).addEventListener('click', () => dialog({ title: 'Correct the name', ok: 'Save', body: `
        <label class="ad-lbl">Full name<input data-n maxlength="80" value="${h(s.name)}"></label>
        <p class="ad-muted">Write it as Surname, Given Name (for example: Dela Cruz, Juan) so the class record splits it correctly. Their class record row is updated too.</p>` })
      .then(d => {
        if (!d) return;
        api('students.rename', { code: s.code, name: $('[data-n]', d).value }).then(() => { toast('Name updated.'); changed(); return api('students.get', { code }).then(paint); })
          .catch(e => toast(e.message, 'bad'));
      }));
    $('[data-signout]', card).addEventListener('click', () => confirmBox('Sign out ' + s.name + '?', 'They will be signed out on every device. Their progress is kept.', 'Sign out')
      .then(ok => { if (ok) api('students.signout', { code: s.code }).then(() => toast('Signed out.')).catch(e => toast(e.message, 'bad')); }));
    const setSt = st => api('students.status', { code: s.code, status: st }).then(() => { toast('Done.'); changed(); return api('students.get', { code }).then(paint); }).catch(e => toast(e.message, 'bad'));
    if ($('[data-disable]', card)) $('[data-disable]', card).addEventListener('click', () => confirmBox('Disable ' + s.name + '?', 'They will be blocked immediately until you enable them again.', 'Disable', true).then(ok => { if (ok) setSt('DISABLED'); }));
    if ($('[data-enable]', card)) $('[data-enable]', card).addEventListener('click', () => setSt('ACTIVE'));
  };
  api('students.get', { code }).then(paint).catch(e => {
    card.innerHTML = `<div class="ad-empty"><p>${h(needsUpdate(e) || e.message)}</p><button class="ad-btn ghost" data-x>Close</button></div>`;
    $('[data-x]', card).addEventListener('click', dr.close);
  });
}
function miniKpi(label, val) { return `<div class="ad-mini"><span>${h(label)}</span><b>${h(val)}</b></div>`; }
function recordBlock(rec) {
  const term = t => {
    const x = rec.terms[t];
    return `<div class="ad-rec-term"><div class="ad-rec-th"><b>${t === 'MT' ? 'Midterm' : 'Final Term'}</b><span>${fmtNum(x.grade)} · ${fmtEq(x.eq)}</span></div>
      <ul>${x.items.map(i => `<li class="${i.red ? 'miss' : ''}"><span>${h(i.label)}</span><b>${i.score == null ? (i.red ? 'Missing' : '—') : h(fmtNum(i.score))}<small>/ ${h(i.max)}</small></b></li>`).join('')}</ul></div>`;
  };
  return `<div class="ad-rec">${term('MT')}${term('FT')}</div>
    <p class="ad-rec-final">Final rating <b>${fmtNum(rec.final)}</b> · FG <b>${fmtEq(rec.fg)}</b>${rec.remarks ? ` · <span class="ad-pill ${/Passed/.test(rec.remarks) ? 'ok' : /Failed/.test(rec.remarks) ? 'bad' : 'warn'}">${h(rec.remarks)}</span>` : ''}</p>`;
}

/* An Apps Script that predates this Studio answers new actions with UNKNOWN_OP. */
function needsUpdate(err) {
  return err && err.res && err.res.error === 'UNKNOWN_OP'
    ? 'This part of the Studio needs the latest Apps Script. Paste the updated Admin.gs into the script editor and deploy a new version (Deploy ▸ Manage deployments ▸ Edit ▸ New version).' : '';
}

/* ═════════════════════════ GRADE BOOK ═════════════════════════ */
/* A spreadsheet-style editor for one section's class record tab. Typing a
   score updates the grade at once (same rules as the sheet's formulas);
   Save writes only the cells you changed. */

const GB_KEYS = ['q1', 'q2', 'q3', 'rec', 'att', 'pt1', 'pt2', 'pt3', 'exam'];
const GB_W = { quiz: 30, ra: 10, pt: 30, exam: 30 };
const GB_SCALE = [[96.5, 1], [93.5, 1.25], [90.5, 1.5], [87.5, 1.75], [84.5, 2], [81.5, 2.25], [78.5, 2.5], [75.5, 2.75], [75, 3], [74.01, 4]];
let GB = null;
const r2 = n => Math.round(n * 100) / 100;
const gbEq = v => { if (v === '' || v == null) return ''; const x = r2(v); for (const [m, e] of GB_SCALE) if (x >= m) return e; return 5; };
function gbTerm(cells, max, t) {
  const v = k => cells[t + '.' + k], n = k => (v(k) === '' || v(k) == null ? 0 : Number(v(k))), M = k => max[t + '.' + k];
  if (GB_KEYS.every(k => v(k) === '' || v(k) == null)) return '';
  const q = r2((n('q1') + n('q2') + n('q3')) / (M('q1') + M('q2') + M('q3')) * 100);
  const ra = r2((n('rec') / M('rec') + n('att') / M('att')) / 2 * 100);
  const pt = r2((n('pt1') / M('pt1') + n('pt2') / M('pt2') + n('pt3') / M('pt3')) / 3 * 100);
  const ex = r2(n('exam') / M('exam') * 100);
  return r2(r2(q * GB_W.quiz / 100) + r2(ra * GB_W.ra / 100) + r2(pt * GB_W.pt / 100) + r2(ex * GB_W.exam / 100));
}
function gbCalc(row) {
  const max = {}; GB.cols.forEach(c => { max[c.key] = GB.max[c.key]; });
  const cells = Object.assign({}, row.cells);
  Object.keys(GB.edits).forEach(k => { const [code, key] = k.split('|'); if (code === row.code && key !== 'status') cells[key] = GB.edits[k].value; });
  const mt = gbTerm(cells, max, 'MT'), ft = gbTerm(cells, max, 'FT');
  const fin = mt === '' || ft === '' ? '' : r2((mt + ft) / 2), fg = gbEq(fin);
  const st = String(gbVal(row, 'status')).toUpperCase();
  const remarks = st === 'INC' ? 'Incomplete' : st === 'DROPPED' ? 'Dropped' : fg === '' ? '' : fg <= 3 ? 'Passed' : fg === 4 ? 'Conditional' : 'Failed';
  return { mt, mg: gbEq(mt), ft, ftg: gbEq(ft), final: fin, fg, remarks };
}
function gbVal(row, key) { const e = GB.edits[row.code + '|' + key]; return e ? e.value : key === 'status' ? row.status : row.cells[key]; }
function gbMiss(row, key) { const e = GB.edits[row.code + '|' + key]; return e ? !!e.missing : !!row.missing[key]; }
/* Input columns shown for a term. A quiz column whose maximum is 0 is not used
   this semester and stays hidden unless someone has already typed a score in it. */
function gbKeys(T) {
  if (T === 'ALL') return [];
  return GB_KEYS.map(k => T + '.' + k).filter(k => !(/\.q[23]$/.test(k) && !GB.max[k] && !GB.rows.some(r => r.cells[k] !== '' && r.cells[k] != null)));
}
/* With Quiz 2 and 3 switched off, Quiz 1 is the one term quiz. */
function gbLabel(k) {
  const t = k.split('.')[0];
  if (/\.q1$/.test(k) && !GB.max[t + '.q2'] && !GB.max[t + '.q3'] && /^Quiz 1$/.test(GB.labels[k])) return t === 'MT' ? 'Midterm Quiz' : 'Final Term Quiz';
  return GB.labels[k];
}
const gbDirty = () => !!GB && (Object.keys(GB.edits).length + Object.keys(GB.maxEdits).length + Object.keys(GB.hdrEdits).length) > 0;

function viewGradebook(box, arg) {
  loading(box);
  api('record.tabs').then(res => {
    if (!res.tabs.length) {
      box.innerHTML = `<div class="ad-empty"><div class="ad-empty-ico">✏️</div><h3>No class record yet</h3><p>Build the class record first. It makes one tab per section from the students who registered.</p>
        <button class="ad-btn" data-go>Go to Class Record</button></div>`;
      $('[data-go]', box).addEventListener('click', () => go('record'));
      return;
    }
    const want = arg && arg.tab && res.tabs.some(t => t.tab === arg.tab) ? arg.tab : (GB && res.tabs.some(t => t.tab === GB.tab) ? GB.tab : res.tabs[0].tab);
    loadGradebook(box, res.tabs, want, (arg && arg.term) || (GB && GB.term) || 'MT', arg && arg.code);
  }).catch(err => {
    const up = needsUpdate(err);
    if (up) { box.innerHTML = `<div class="ad-empty"><div class="ad-empty-ico">🔧</div><h3>One more step</h3><p>${h(up)}</p></div>`; return; }
    failed(box, err, () => viewGradebook(box, arg));
  });
}

function loadGradebook(box, tabs, tab, term, focusCode) {
  loading(box);
  api('record.get', { tab }).then(res => {
    GB = { tab, tabs, term, cols: res.cols, rows: res.rows, max: {}, labels: {}, edits: {}, maxEdits: {}, hdrEdits: {}, q: GB && GB.tab === tab ? GB.q : '' };
    res.cols.forEach(c => { GB.max[c.key] = c.max; GB.labels[c.key] = c.label; });
    paintGradebook(box);
    if (focusCode) {
      const tr = $(`tr[data-code="${CSS.escape(focusCode)}"]`, box);
      if (tr) { tr.classList.add('flash'); tr.scrollIntoView({ block: 'center' }); const inp = $('input', tr); if (inp) inp.focus(); }
    }
  }).catch(err => failed(box, err, () => loadGradebook(box, tabs, tab, term, focusCode)));
}

function paintGradebook(box) {
  const a = actions(`<button class="ad-btn ghost" data-csv>⬇ Export CSV</button><button class="ad-btn ghost" data-reload>↻ Reload</button><button class="ad-btn" data-save>Save changes</button>`);
  $('[data-csv]', a).addEventListener('click', gbCsv);
  $('[data-reload]', a).addEventListener('click', () => (gbDirty() ? confirmBox('Discard your changes?', 'Unsaved scores on this tab will be lost.', 'Discard', true) : Promise.resolve(true))
    .then(ok => { if (ok) { GB.edits = {}; GB.maxEdits = {}; GB.hdrEdits = {}; loadGradebook(box, GB.tabs, GB.tab, GB.term); } }));
  $('[data-save]', a).addEventListener('click', e => gbSave(e.currentTarget, box));

  const T = GB.term, keys = gbKeys(T);
  const head2 = keys.map(k => `<th class="gb-max"><input data-max="${k}" value="${h(GB.max[k])}" inputmode="decimal" aria-label="Maximum for ${h(gbLabel(k))}" title="${/\.q[23]$/.test(k) ? 'Maximum score (0 = not used)' : 'Maximum score'}"></th>`).join('');
  box.innerHTML = `
    <div class="gb-bar">
      <select class="ad-select" data-tab aria-label="Section">${GB.tabs.map(t => `<option value="${h(t.tab)}" ${t.tab === GB.tab ? 'selected' : ''}>${h(t.tab)} (${t.students})</option>`).join('')}</select>
      <div class="ad-seg" role="group" aria-label="Term">${[['MT', 'Midterm'], ['FT', 'Final Term'], ['ALL', 'Summary']].map(([k, l]) => `<button data-term="${k}" class="${GB.term === k ? 'on open' : ''}" aria-pressed="${GB.term === k}">${l}</button>`).join('')}</div>
      <input class="ad-search" type="search" placeholder="Find a student…" data-q value="${h(GB.q)}">
      <span class="ad-muted gb-dirty" data-dirty></span>
    </div>
    <p class="ad-hint gb-help">Type a score and press <kbd>Enter</kbd> or the arrow keys to move. Type <kbd>x</kbd> to mark it <b>not submitted</b> (red in the sheet). Row 2 holds each maximum. Click a performance task's name to rename it. In a performance-task cell, press <kbd>R</kbd> or click 📋 to <b>score it with its rubric</b>. <kbd>Ctrl</kbd>+<kbd>S</kbd> saves.</p>
    <div class="ad-card flush"><div class="gb-wrap"><table class="gb">
      <thead><tr><th class="gb-n">#</th><th class="gb-name">Student</th>
        ${T === 'ALL' ? '<th>MT Grade</th><th>MG</th><th>FT Grade</th><th>FTG</th><th>Final</th><th>FG</th><th>Status</th><th>Remarks</th>'
          : keys.map(k => `<th class="gb-h ${/pt\d$/.test(k) ? 'pt' : ''}" ${/pt\d$/.test(k) ? `data-hdr="${k}" title="Rename this performance task"` : ''}>${h(gbLabel(k))}</th>`).join('') + `<th class="gb-calc">${T} Grade</th><th class="gb-calc">${T === 'MT' ? 'MG' : 'FTG'}</th><th>Status</th>`}
      </tr>${T === 'ALL' ? '' : `<tr class="gb-maxrow"><th class="gb-n"></th><th class="gb-name"><small>Maximum</small></th>${head2}<th class="gb-calc"></th><th class="gb-calc"></th><th></th></tr>`}</thead>
      <tbody data-rows></tbody></table></div></div>`;

  $('[data-tab]', box).addEventListener('change', e => {
    const to = e.target.value;
    (gbDirty() ? confirmBox('Leave this section?', 'You have unsaved scores here. Save first, or they will be lost.', 'Leave', true) : Promise.resolve(true))
      .then(ok => { if (ok) loadGradebook(box, GB.tabs, to, GB.term); else e.target.value = GB.tab; });
  });
  $$('[data-term]', box).forEach(b => b.addEventListener('click', () => { GB.term = b.dataset.term; paintGradebook(box); }));
  $('[data-q]', box).addEventListener('input', e => { GB.q = e.target.value; gbRows(box); });
  $$('[data-max]', box).forEach(inp => inp.addEventListener('change', () => {
    const k = inp.dataset.max, n = Number(inp.value);
    const zeroOk = /\.q[23]$/.test(k);
    if (!(n > 0 && n <= 1000) && !(zeroOk && n === 0 && inp.value.trim() !== '')) { toast('A maximum must be between 1 and 1000' + (zeroOk ? ', or 0 if this quiz is not used.' : '.'), 'bad'); inp.value = GB.max[k]; return; }
    GB.max[k] = n; GB.maxEdits[k] = n; inp.classList.add('dirty'); gbRows(box);
  }));
  $$('[data-hdr]', box).forEach(th => th.addEventListener('click', () => {
    const k = th.dataset.hdr;
    dialog({ title: 'Name this performance task', ok: 'Set name', body: `<label class="ad-lbl">Task name<input data-n maxlength="60" value="${h(/^PT \d$/.test(GB.labels[k]) ? '' : GB.labels[k])}" placeholder="e.g. Coffee Painting"></label><p class="ad-muted">Students see this name under My Grades. Leave blank for “${h(k.split('.')[1].toUpperCase().replace('PT', 'PT '))}”.</p>` })
      .then(d => { if (!d) return; const v = $('[data-n]', d).value.trim(); GB.hdrEdits[k] = v; GB.labels[k] = v || k.split('.')[1].toUpperCase().replace('PT', 'PT '); paintGradebook(box); });
  }));
  gbRows(box);
}

function gbRows(box) {
  const T = GB.term, keys = gbKeys(T);
  const q = GB.q.trim().toLowerCase();
  const rows = GB.rows.filter(r => !q || (r.surname + ' ' + r.given + ' ' + r.studno + ' ' + r.code).toLowerCase().includes(q));
  const remPill = t => t ? `<span class="ad-pill ${t === 'Passed' ? 'ok' : t === 'Failed' ? 'bad' : 'warn'}">${h(t)}</span>` : '';
  $('[data-rows]', box).innerHTML = rows.length ? rows.map((r, i) => {
    const c = gbCalc(r), st = gbVal(r, 'status');
    const name = `<td class="gb-n">${GB.rows.indexOf(r) + 1}</td><td class="gb-name"><button class="ad-link" data-prof="${h(r.code)}">${h(r.surname)}, ${h(r.given)}</button>${r.studno ? `<small>${h(r.studno)}</small>` : ''}</td>`;
    if (T === 'ALL') return `<tr data-code="${h(r.code)}">${name}<td class="num">${fmtNum(c.mt)}</td><td class="num">${fmtEq(c.mg)}</td><td class="num">${fmtNum(c.ft)}</td><td class="num">${fmtEq(c.ftg)}</td>
      <td class="num"><b>${fmtNum(c.final)}</b></td><td class="num"><b>${fmtEq(c.fg)}</b></td><td>${h(st || '')}</td><td>${remPill(c.remarks)}</td></tr>`;
    return `<tr data-code="${h(r.code)}">${name}${keys.map((k, j) => {
      const v = gbVal(r, k), miss = gbMiss(r, k), dirty = GB.edits[r.code + '|' + k];
      const pt = /\.pt\d$/.test(k);
      return `<td class="gb-c ${pt ? 'gb-pt' : ''} ${miss ? 'miss' : ''} ${dirty ? 'dirty' : ''}"><input data-k="${k}" data-r="${i}" data-c="${j}" value="${miss && (v === '' || v == null) ? '' : h(v)}" placeholder="${miss ? 'x' : ''}" inputmode="decimal" autocomplete="off" aria-label="${h(r.surname)} ${h(gbLabel(k))}">${pt ? `<button class="gb-rb" data-rb tabindex="-1" title="Score with the rubric" aria-label="Score ${h(r.surname)} with the rubric">📋</button>` : ''}</td>`;
    }).join('')}<td class="num gb-calc" data-g>${fmtNum(T === 'MT' ? c.mt : c.ft)}</td><td class="num gb-calc" data-e>${fmtEq(T === 'MT' ? c.mg : c.ftg)}</td>
      <td class="gb-st ${GB.edits[r.code + '|status'] ? 'dirty' : ''}"><select data-st aria-label="Status"><option value="" ${!st ? 'selected' : ''}>—</option><option ${String(st).toUpperCase() === 'INC' ? 'selected' : ''}>INC</option><option ${String(st).toUpperCase() === 'DROPPED' ? 'selected' : ''}>Dropped</option></select></td></tr>`;
  }).join('') : `<tr><td colspan="14" class="ad-muted center">No students match.</td></tr>`;

  $$('[data-prof]', box).forEach(b => b.addEventListener('click', () => openStudent(b.dataset.prof)));
  $$('input[data-k]', box).forEach(inp => {
    const tr = inp.closest('tr'), row = GB.rows.find(r => r.code === tr.dataset.code), k = inp.dataset.k;
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('input', () => {
      const raw = inp.value.trim(), td = inp.parentNode, id = row.code + '|' + k;
      let e;
      if (/^x$/i.test(raw)) { e = { value: '', missing: true }; inp.value = ''; inp.placeholder = 'x'; }
      else if (raw === '') e = { value: '', missing: false };
      else if (!isNaN(Number(raw))) e = { value: Number(raw), missing: false };
      else { td.classList.add('bad'); return; }
      const over = e.value !== '' && (e.value < 0 || e.value > GB.max[k]);
      td.classList.toggle('bad', over);
      const orig = row.cells[k], origMiss = !!row.missing[k];
      if (e.value === orig && e.missing === origMiss) delete GB.edits[id]; else GB.edits[id] = e;
      td.classList.toggle('dirty', !!GB.edits[id]);
      td.classList.toggle('miss', e.missing);
      if (!e.missing) inp.placeholder = '';
      const c = gbCalc(row);
      $('[data-g]', tr).textContent = fmtNum(GB.term === 'MT' ? c.mt : c.ft);
      $('[data-e]', tr).textContent = fmtEq(GB.term === 'MT' ? c.mg : c.ftg);
      gbDirtyLabel(box);
    });
    const rb = $('[data-rb]', inp.parentNode);
    if (rb) rb.addEventListener('click', () => gbRubric(row, k, inp));
    inp.addEventListener('keydown', e => {
      if (rb && (e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); gbRubric(row, k, inp); return; }
      const r = Number(inp.dataset.r), c = Number(inp.dataset.c);
      const mv = { ArrowUp: [-1, 0], ArrowDown: [1, 0], Enter: [e.shiftKey ? -1 : 1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      if (!mv) return;
      if ((e.key === 'ArrowLeft' && inp.selectionStart > 0) || (e.key === 'ArrowRight' && inp.selectionEnd < inp.value.length)) return;
      e.preventDefault();
      const nx = $(`input[data-r="${r + mv[0]}"][data-c="${c + mv[1]}"]`, box);
      if (nx) nx.focus();
    });
  });
  $$('select[data-st]', box).forEach(sel => sel.addEventListener('change', () => {
    const tr = sel.closest('tr'), row = GB.rows.find(r => r.code === tr.dataset.code), id = row.code + '|status';
    if (sel.value === (row.status || '')) delete GB.edits[id]; else GB.edits[id] = { value: sel.value };
    sel.parentNode.classList.toggle('dirty', !!GB.edits[id]);
    gbDirtyLabel(box);
  }));
  gbDirtyLabel(box);
}

/* ── Score a performance task with its course rubric ──
   The rubrics are the ones shown to students in the lessons (content.js), so
   the criteria and weights always match what students were told. Each
   criterion is rated 4 Excellent · 3 Proficient · 2 Developing · 1 Beginning ·
   0 Missing; points = rating ÷ 4 × weight. The total (out of 100) is scaled to
   the column's maximum and typed into the cell, ready to save. */
const GB_RUBRIC_FOR = { 'MT.pt1': 'R1', 'MT.pt2': 'R2', 'MT.pt3': 'R3', 'FT.pt1': 'R4', 'FT.pt2': 'R5', 'FT.pt3': 'R6' };
function gbRubrics() {
  const out = [];
  if (typeof CONTENT === 'undefined') return out;
  const walk = bs => (bs || []).forEach(b => { if (b && b.t === 'rubric') out.push(b); if (b && b.t === 'reveal') walk(b.blocks); });
  ['m', 'f'].forEach(t => (CONTENT[t].lessons || []).forEach(l => walk(l.blocks)));
  return out.map(b => ({ code: (/\bR\d\b/.exec(b.kicker || '') || [''])[0], title: String(b.title || '').replace(/<[^>]*>/g, ''), crit: (b.crit || []).filter(c => c && c.pts > 0) }));
}
function gbGuessRubric(list, k) {
  const words = String(GB.labels[k] || '').toLowerCase().match(/[a-z]{4,}/g) || [];
  let best = null, score = 0;
  list.forEach(r => { const t = r.title.toLowerCase(); const s = words.filter(w => t.indexOf(w) >= 0).length; if (s > score) { score = s; best = r; } });
  return best || list.find(r => r.code === GB_RUBRIC_FOR[k]) || list[0];
}
function gbRubric(row, k, inp) {
  const list = gbRubrics();
  if (!list.length) return toast('No rubrics were found in the lessons.', 'bad');
  let cur = gbGuessRubric(list, k), marks = {};
  const max = Number(GB.max[k]) || 100;
  const body = `<label class="ad-lbl">Rubric<select data-rsel>${list.map((r, i) => `<option value="${i}" ${r === cur ? 'selected' : ''}>${h(r.code)} · ${h(r.title)}</option>`).join('')}</select></label>
    <div class="gb-rub" data-rgrid></div>
    <div class="gb-rub-total" data-rtot aria-live="polite"></div>`;
  const pending = dialog({ title: `${row.surname}, ${row.given} · ${gbLabel(k)}`, body, ok: 'Use this score', wide: true });
  const d = $$('.ad-dialog').pop();
  const RATE = [[4, 'Excellent'], [3, 'Proficient'], [2, 'Developing'], [1, 'Beginning'], [0, 'Missing']];
  const total = () => cur.crit.reduce((a, c, i) => a + (marks[i] == null ? 0 : marks[i] / 4 * c.pts), 0);
  const weight = () => cur.crit.reduce((a, c) => a + c.pts, 0) || 100;
  const paint = () => {
    $('[data-rgrid]', d).innerHTML = cur.crit.map((c, i) => `<div class="gb-rub-row"><div class="gb-rub-c"><b>${h(c.name)}</b><small>${c.pts} pts</small></div>
      <div class="ad-seg gb-rub-seg" role="radiogroup" aria-label="${h(c.name)}">${RATE.map(([v, l]) => `<button type="button" role="radio" data-ri="${i}" data-rv="${v}" aria-checked="${marks[i] === v}" class="${marks[i] === v ? 'on' : ''}" title="${l}">${v}<span>${l}</span></button>`).join('')}</div></div>`).join('');
    $$('[data-rv]', d).forEach(b => b.addEventListener('click', () => { marks[b.dataset.ri] = Number(b.dataset.rv); paint(); }));
    const done = cur.crit.every((c, i) => marks[i] != null), t = r2(total() / weight() * 100), sc = r2(t / 100 * max);
    $('[data-rtot]', d).innerHTML = done ? `Total <b>${fmtNum(t)}</b> / 100 → <b>${fmtNum(sc)}</b> / ${fmtNum(max)} in the Grade Book`
      : `Rate every criterion (${cur.crit.filter((c, i) => marks[i] != null).length} of ${cur.crit.length} done).`;
    $('[data-o]', d).disabled = !done;
  };
  $('[data-rsel]', d).addEventListener('change', e => { cur = list[Number(e.target.value)]; marks = {}; paint(); });
  paint();
  pending.then(ok => {
    if (!ok) { inp.focus(); return; }
    inp.value = String(r2(total() / weight() * 100 / 100 * max));
    inp.dispatchEvent(new Event('input'));
    inp.focus();
    toast('Score filled in. Save changes to record it.');
  });
}

function gbDirtyLabel(box) {
  const n = Object.keys(GB.edits).length + Object.keys(GB.maxEdits).length + Object.keys(GB.hdrEdits).length;
  const el = $('[data-dirty]', box);
  if (el) el.innerHTML = n ? `<b>${n}</b> unsaved change${n === 1 ? '' : 's'}` : 'All changes saved';
}

function gbSave(btn, box) {
  if (!gbDirty()) return toast('Nothing to save.');
  const bad = Object.keys(GB.edits).filter(id => { const [, k] = id.split('|'); const v = GB.edits[id].value; return k !== 'status' && v !== '' && (v < 0 || v > GB.max[k]); });
  if (bad.length) return toast(bad.length + ' score' + (bad.length > 1 ? 's are' : ' is') + ' above the maximum. Fix the red cells first.', 'bad');
  const cells = Object.keys(GB.edits).map(id => { const [code, key] = id.split('|'); return Object.assign({ code, key }, GB.edits[id]); });
  const maxes = Object.keys(GB.maxEdits).map(key => ({ key, value: GB.maxEdits[key] }));
  const headers = Object.keys(GB.hdrEdits).map(key => ({ key, name: GB.hdrEdits[key] }));
  busy(btn, true, 'Saving…');
  api('record.save', { tab: GB.tab, cells, maxes, headers }).then(res => {
    busy(btn, false);
    GB.cols = res.cols; GB.rows = res.rows; GB.edits = {}; GB.maxEdits = {}; GB.hdrEdits = {};
    res.cols.forEach(c => { GB.max[c.key] = c.max; GB.labels[c.key] = c.label; });
    if (res.errors && res.errors.length) toast('Saved ' + res.written + '. Not saved: ' + res.errors.join(' '), 'bad');
    else toast('Saved ' + res.written + ' change' + (res.written === 1 ? '' : 's') + ' to ' + GB.tab + '.');
    paintGradebook(box);
  }).catch(err => { busy(btn, false); toast(err.message, 'bad'); });
}

function gbCsv() {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const keys = ['MT', 'FT'].reduce((a, t) => a.concat(gbKeys(t)), []);
  const lines = [['Surname', 'Given Name', 'Student Number'].concat(keys.map(k => k.split('.')[0] + ' ' + gbLabel(k)), ['MT Grade', 'MG', 'FT Grade', 'FTG', 'Final', 'FG', 'Status', 'Remarks']).map(q).join(',')]
    .concat(GB.rows.map(r => { const c = gbCalc(r); return [r.surname, r.given, r.studno].concat(keys.map(k => gbMiss(r, k) ? 'x' : gbVal(r, k)), [c.mt, c.mg, c.ft, c.ftg, c.final, c.fg, gbVal(r, 'status'), c.remarks]).map(q).join(','); }));
  download(lines.join('\r\n'), GB.tab.replace(/[^\w\- ]+/g, '') + ' - class record.csv');
}
function download(text, name) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ═════════════════════════ COMMAND PALETTE ═════════════════════════ */
/* Ctrl+K: jump to any view, test, lesson, student or section, or run an action. */

let PAL_CACHE = null;
function paletteItems() {
  if (PAL_CACHE && Date.now() - PAL_CACHE.at < 60000) return Promise.resolve(PAL_CACHE.items);
  const base = VIEWS.map((v, i) => ({ ico: v.ico, label: 'Go to ' + v.label, hint: 'Alt+' + (i + 1), run: () => navTo(v.id) })).concat([
    { ico: '＋', label: 'New quiz or exam', run: () => guardLeave().then(ok => ok && editTest(null)) },
    { ico: '＋', label: 'New lesson', run: () => guardLeave().then(ok => { if (ok) editLesson(null); }) },
    { ico: '🧾', label: 'Build / refresh class record', run: () => navTo('record') },
    { ico: '👁', label: 'Preview the module as a student', run: () => navTo('viewer') },
    { ico: '⬇', label: 'Install the Studio on this computer', run: installApp },
    { ico: '⌨', label: 'Keyboard shortcuts', hint: '?', run: showShortcuts },
    { ico: '↗', label: 'Open the module as instructor (new window)', run: openPreviewWindow }
  ]);
  const soft = p => p.then(r => r, () => null);
  return Promise.all([soft(api('tests.list')), soft(api('students.list')), soft(api('lessons.list')), soft(api('record.tabs'))]).then(([t, s, l, r]) => {
    const items = base.slice();
    if (t) t.tests.forEach(x => items.push({ ico: '📝', label: x.title, sub: TERMS[x.term] + ' · ' + x.slot, run: () => guardLeave().then(ok => ok && editTest(x.id)) }));
    if (t) t.tests.filter(x => x.submitted || x.inProgress).forEach(x => items.push({ ico: '📊', label: 'Results: ' + x.title, run: () => navTo('results', x.id) }));
    if (l) l.lessons.filter(x => x.kind === 'custom').forEach(x => items.push({ ico: '📚', label: x.title, sub: 'Your lesson', run: () => guardLeave().then(ok => { if (ok) editLesson(x); }) }));
    if (typeof CONTENT === 'object') ['m', 'f'].forEach(k => (CONTENT[k].lessons || []).forEach(x => {
      items.push({ ico: '✏️', label: 'Edit ' + lessonLabel(x).toLowerCase() + ': ' + x.title, sub: (k === 'm' ? 'Midterm' : 'Final Term') + ' · text, activities and knowledge checks', run: () => guardLeave().then(ok => { if (ok) { LC = null; editBuiltin(x.id); } }) });
      items.push({ ico: '👁', label: lessonLabel(x) + ': ' + x.title, sub: (k === 'm' ? 'Midterm' : 'Final Term') + ' · open in the Module Viewer', run: () => navTo('viewer', { page: x.id }) });
    }));
    if (s) s.students.forEach(x => items.push({ ico: '👤', label: x.name, sub: x.section + ' · ' + fmtCode(x.code), run: () => openStudent(x.code) }));
    if (r) r.tabs.forEach(x => items.push({ ico: '✏️', label: 'Grade Book: ' + x.tab, sub: x.students + ' students', run: () => navTo('gradebook', { tab: x.tab }) }));
    PAL_CACHE = { at: Date.now(), items };
    return items;
  });
}

function openPalette() {
  if ($('.ad-pal') || !ss.get(K_TOK) || !$('.ad-shell')) return;
  const d = document.createElement('div');
  d.className = 'ad-dialog ad-pal';
  d.innerHTML = `<div class="ad-pal-card" role="dialog" aria-modal="true" aria-label="Command palette">
    <input class="ad-pal-in" placeholder="Search tests, lessons, students, sections or actions…" aria-label="Search" autocomplete="off">
    <ul class="ad-pal-list" role="listbox"><li class="ad-pal-empty"><span class="ad-spin"></span></li></ul>
    <div class="ad-pal-f"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div></div>`;
  document.body.appendChild(d);
  const inp = $('.ad-pal-in', d), list = $('.ad-pal-list', d);
  let items = [], shown = [], sel = 0;
  const close = () => { d.remove(); document.removeEventListener('keydown', key, true); };
  const run = it => { close(); it.run(); };
  const paint = () => {
    const words = inp.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    shown = items.filter(it => { const s = (it.label + ' ' + (it.sub || '')).toLowerCase(); return words.every(w => s.includes(w)); }).slice(0, 40);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.innerHTML = shown.length ? shown.map((it, i) => `<li role="option" class="${i === sel ? 'on' : ''}" data-i="${i}" aria-selected="${i === sel}"><span class="ad-pal-ico">${h(it.ico)}</span>
      <span class="ad-pal-t"><b>${h(it.label)}</b>${it.sub ? `<small>${h(it.sub)}</small>` : ''}</span>${it.hint ? `<kbd>${h(it.hint)}</kbd>` : ''}</li>`).join('') : '<li class="ad-pal-empty">Nothing matches.</li>';
    const on = $('li.on', list); if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const key = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(); }
    else if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); run(shown[sel]); }
  };
  document.addEventListener('keydown', key, true);
  d.addEventListener('click', e => { if (e.target === d) close(); const li = e.target.closest('li[data-i]'); if (li) run(shown[Number(li.dataset.i)]); });
  inp.addEventListener('input', () => { sel = 0; paint(); });
  inp.focus();
  paletteItems().then(x => { items = x; paint(); }).catch(() => { items = []; paint(); });
}

function showShortcuts() {
  const row = (k, t) => `<tr><td class="nowrap">${k.split(' ').map(x => `<kbd>${h(x)}</kbd>`).join(' ')}</td><td>${h(t)}</td></tr>`;
  dialog({ title: 'Keyboard shortcuts', ok: 'Got it', cancel: '', body: `<table class="ad-table compact ad-keys"><tbody>
    ${row('Ctrl K', 'Command palette: jump to anything')}
    ${row('Ctrl S', 'Save the quiz, lesson or grade book you are editing')}
    ${row('Alt 1 … Alt ' + VIEWS.length, 'Switch section (Overview … Class Record)')}
    ${row('?', 'This list')}
    ${row('Enter ↑ ↓ ← →', 'Move between cells in the Grade Book')}
    ${row('x', 'In the Grade Book: mark a requirement not submitted')}
    ${row('Esc', 'Close a dialog or panel')}</tbody></table>` });
}

/* ═════════════════════════ DESKTOP APP ═════════════════════════ */
/* The Studio is an installable web app: Chrome or Edge put it in its own
   window with a desktop and Start menu shortcut. */

let INSTALL_EVT = null;
const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); INSTALL_EVT = e; $$('[data-install]').forEach(b => { b.hidden = false; }); });
window.addEventListener('appinstalled', () => { INSTALL_EVT = null; $$('[data-install]').forEach(b => { b.hidden = true; }); toast('Installed. Open “AAP101 Studio” from your desktop or Start menu.'); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('studio-sw.js', { scope: './admin.html' }).catch(() => {}); });
}

function installApp() {
  if (isStandalone()) return toast('You are already using the desktop app.');
  if (INSTALL_EVT) {
    const ev = INSTALL_EVT; INSTALL_EVT = null;
    ev.prompt();
    return ev.userChoice.then(c => { if (c && c.outcome !== 'accepted') INSTALL_EVT = ev; }).catch(() => {});
  }
  dialog({ title: 'Put the Studio on your desktop', ok: 'Got it', cancel: '', wide: true, body: `
    <ol class="ad-steps">
      <li><b>Google Chrome:</b> click the install icon <span class="ad-code">⊕</span> at the right end of the address bar, or open the <b>⋮</b> menu ▸ <b>Cast, save and share</b> ▸ <b>Install page as app…</b> Press <b>Install</b>.</li>
      <li><b>Microsoft Edge:</b> open the <b>⋯</b> menu ▸ <b>Apps</b> ▸ <b>Install this site as an app</b>. Tick <b>Create desktop shortcut</b> if Edge asks.</li>
      <li>The Studio opens in its own window. On Windows it is added to the Start menu; to add a desktop icon, open <span class="ad-code">chrome://apps</span>, right-click <b>AAP101 Studio</b> ▸ <b>Create shortcuts…</b> ▸ tick <b>Desktop</b>.</li>
    </ol>
    <p class="ad-muted">It always loads the latest version of the Studio, so nothing needs updating on your computer. For safety you sign in each time you open it.</p>` });
}

/* ═════════════════════════ BOOT ═════════════════════════ */

if (ss.get(K_TOK)) renderShell(); else renderLogin();

})();
