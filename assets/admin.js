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
  { id: 'students', ico: '👥', label: 'Students' },
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
          <a class="ad-side-link" href="index.html" target="_blank" rel="noopener">Open student module ↗</a>
          <button class="ad-side-link" data-signout>Sign out</button>
        </div>
      </aside>
      <div class="ad-main">
        <header class="ad-top"><h2 id="ad-title"></h2><div class="ad-top-actions" id="ad-actions"></div></header>
        <section class="ad-view" id="ad-view"></section>
      </div>
    </div>`;
  $$('.ad-nav-btn').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
  $('[data-signout]').addEventListener('click', () => { ss.del(K_TOK); renderLogin(); });
  const fromHash = (location.hash || '').slice(1);
  go(VIEWS.some(v => v.id === fromHash) ? fromHash : 'overview');
}

function go(view, arg) {
  current = view;
  if (location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
  $$('.ad-nav-btn').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  $('#ad-actions').innerHTML = '';
  $('#ad-title').textContent = (VIEWS.find(v => v.id === view) || {}).label || '';
  const box = $('#ad-view');
  box.scrollTop = 0; window.scrollTo(0, 0);
  ({ overview: viewOverview, tests: viewTests, results: viewResults, lessons: viewLessons, students: viewStudents, record: viewRecord }[view])(box, arg);
}
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
      `;
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
          return `<div class="ad-slot"><div class="ad-slot-h"><b>${h(slot)}</b><span>Class record column ${COLS[term + '|' + slot]}</span></div>
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
  const a = actions(`<button class="ad-btn ghost" data-back>← All tests</button><button class="ad-btn ghost" data-preview>Preview</button><button class="ad-btn" data-save>Save</button>`);
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

window.addEventListener('beforeunload', e => { if (ED && ED.dirty && current === 'tests') { e.preventDefault(); e.returnValue = ''; } });

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
    box.innerHTML = `<p class="ad-lead">Lock a lesson to keep students out until you're ready, hide it, or rename it. Built-in lessons keep their activities. New lessons you write appear after them in the same term.</p>` +
      ['m', 'f'].map(k => {
        const base = (builtins[k].lessons || []).map(l => ({ id: l.id, num: l.num, title: l.title, desc: l.desc, kind: 'builtin', o: byId[l.id] }));
        const custom = rows.filter(r => r.kind === 'custom' && r.term === k).sort((x, y) => x.order - y.order);
        return `<section class="ad-sec"><h3 class="ad-sec-h">${k === 'm' ? 'Midterm' : 'Final Term'}</h3><div class="ad-card flush"><ul class="ad-lessons">
          ${base.map(l => lessonRow(l.id, l.num, (l.o && l.o.title) || l.title, (l.o && l.o.desc) || l.desc, (l.o && l.o.status) || 'Open', 'builtin')).join('')}
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
          toast(`${base ? 'Lesson ' + base.num : '“' + cur.title + '”'} is now ${b.dataset.st.toLowerCase()}.`);
          viewLessons(box);
        }).catch(e => toast(e.message, 'bad'));
      }));
      $('[data-edit]', row).addEventListener('click', () => kind === 'custom' ? editLesson(byId[id]) : renameBuiltin(id, byId[id], box));
    });
  }).catch(err => failed(box, err, () => viewLessons(box)));
}

function findBuiltin(id) {
  for (const k of ['m', 'f']) { const l = (CONTENT[k].lessons || []).find(x => x.id === id); if (l) return l; }
  return null;
}

function lessonRow(id, num, title, desc, status, kind) {
  return `<li class="ad-lesson ${status.toLowerCase()}" data-id="${h(id)}" data-kind="${kind}">
    <span class="ad-lesson-n ${kind}">${h(num)}</span>
    <div class="ad-lesson-t"><b>${h(title)}</b><small>${h(desc || (kind === 'custom' ? 'Your lesson' : ''))}</small></div>
    <div class="ad-seg" role="group" aria-label="Status">${['Open', 'Locked', 'Hidden'].map(s => `<button data-st="${s}" class="${status === s ? 'on ' + s.toLowerCase() : ''}" aria-pressed="${status === s}">${s === 'Open' ? '🔓' : s === 'Locked' ? '🔒' : '🙈'} ${s}</button>`).join('')}</div>
    <button class="ad-btn sm ghost" data-edit>${kind === 'custom' ? 'Edit' : 'Rename'}</button>
  </li>`;
}

function renameBuiltin(id, row, box) {
  const base = findBuiltin(id);
  dialog({ title: 'Lesson ' + base.num, ok: 'Save', body: `
    <label class="ad-lbl">Title<input data-t maxlength="140" value="${h((row && row.title) || '')}" placeholder="${h(base.title)}"></label>
    <label class="ad-lbl">Short description<textarea data-d rows="3" maxlength="400" placeholder="${h(base.desc || '')}">${h((row && row.desc) || '')}</textarea></label>
    <p class="ad-muted">Leave a field blank to keep the original wording.</p>` }).then(d => {
    if (!d) return;
    api('lessons.save', { lesson: { id, kind: 'builtin', status: (row && row.status) || 'Open', title: $('[data-t]', d).value, desc: $('[data-d]', d).value } })
      .then(() => { toast('Saved.'); viewLessons(box); }).catch(e => toast(e.message, 'bad'));
  });
}

const BLOCKS = { heading: 'Heading', text: 'Text', callout: 'Callout', image: 'Image', video: 'Video', divider: 'Divider' };
let LE = null;

function editLesson(row) {
  LE = row ? JSON.parse(JSON.stringify(row)) : { id: '', kind: 'custom', term: 'm', order: 0, title: '', desc: '', status: 'Locked', body: [{ t: 'heading', text: '' }, { t: 'text', text: '' }] };
  const box = $('#ad-view');
  $('#ad-title').textContent = LE.id ? 'Edit lesson' : 'New lesson';
  const a = actions(`<button class="ad-btn ghost" data-back>← Lessons</button>${LE.id ? '<button class="ad-btn ghost danger-text" data-del>Delete</button>' : ''}<button class="ad-btn" data-save>Save lesson</button>`);
  $('[data-back]', a).addEventListener('click', () => go('lessons'));
  if ($('[data-del]', a)) $('[data-del]', a).addEventListener('click', () => confirmBox('Delete this lesson?', 'Students will no longer see it. This cannot be undone.', 'Delete', true)
    .then(ok => { if (ok) api('lessons.delete', { id: LE.id }).then(() => { toast('Lesson deleted.'); go('lessons'); }).catch(e => toast(e.message, 'bad')); }));
  $('[data-save]', a).addEventListener('click', e => {
    if (!LE.title.trim()) return toast('Give the lesson a title.', 'bad');
    busy(e.currentTarget, true, 'Saving…');
    api('lessons.save', { lesson: LE }).then(r => { LE.id = r.id; toast('Lesson saved.'); go('lessons'); }).catch(er => { busy(e.currentTarget, false); toast(er.message, 'bad'); });
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
  $$('[data-l]', box).forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { LE[inp.dataset.l] = inp.type === 'number' ? Number(inp.value) : inp.value; lessonPreview(); }));
  $$('[data-addb]', box).forEach(b => b.addEventListener('click', () => { LE.body.push({ t: b.dataset.addb, text: '', url: '', caption: '', tone: 'info' }); paintBlocks(); }));
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
    $$('[data-b]', n).forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { b[inp.dataset.b] = inp.value; lessonPreview(); }));
    $$('[data-mv]', n).forEach(x => x.addEventListener('click', () => { const j = i + Number(x.dataset.mv); [LE.body[i], LE.body[j]] = [LE.body[j], LE.body[i]]; paintBlocks(); }));
    $('[data-rm]', n).addEventListener('click', () => { LE.body.splice(i, 1); paintBlocks(); });
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

/* ═════════════════════════ STUDENTS ═════════════════════════ */

function viewStudents(box) {
  loading(box);
  api('students.list').then(res => {
    const all = res.students, secs = Array.from(new Set(all.map(s => s.section))).sort();
    box.innerHTML = `<div class="ad-row ad-filter">
        <input class="ad-search" type="search" placeholder="Search name or code…" data-q>
        <select class="ad-select" data-sec><option value="">All sections (${all.length})</option>${secs.map(s => `<option>${h(s)}</option>`).join('')}</select>
        <span class="ad-muted">${res.unclaimed} unclaimed code${res.unclaimed === 1 ? '' : 's'}</span></div>
      <div class="ad-card flush"><div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>Student</th><th>Access code</th><th>Status</th><th>Last seen</th><th class="num">Progress</th><th class="num">XP</th><th></th></tr></thead><tbody data-rows></tbody></table></div></div>`;
    const paint = () => {
      const q = $('[data-q]', box).value.trim().toLowerCase(), sec = $('[data-sec]', box).value;
      const rows = all.filter(s => (!sec || s.section === sec) && (!q || (s.name + ' ' + s.code).toLowerCase().includes(q)));
      $('[data-rows]', box).innerHTML = rows.length ? rows.map(s => `<tr data-code="${h(s.code)}">
        <td><b>${h(s.name)}</b><small>${h(s.section)}</small></td>
        <td><code class="ad-code">${h(s.code.replace(/^(.{3})(.{4})(.{4})$/, '$1-$2-$3'))}</code></td>
        <td>${s.status === 'DISABLED' ? '<span class="ad-pill bad">Disabled</span>' : '<span class="ad-pill ok">Active</span>'}</td>
        <td class="ad-muted">${fmtAgo(s.lastSeen)}</td>
        <td class="num"><div class="ad-meter"><i style="width:${Math.min(100, s.progress)}%"></i></div>${s.progress}%</td>
        <td class="num">${s.xp}</td>
        <td class="ad-row-end"><button class="ad-btn sm ghost" data-sa="signout">Sign out</button>
          ${s.status === 'DISABLED' ? '<button class="ad-btn sm" data-sa="enable">Enable</button>' : '<button class="ad-btn sm ghost danger-text" data-sa="disable">Disable</button>'}</td></tr>`).join('')
        : '<tr><td colspan="7" class="ad-muted center">No students match.</td></tr>';
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
          <tr><td>Quizzes (Quiz 1 + 2 + 3)</td><td class="num"><b>30%</b></td><td class="ad-muted">from the module</td></tr>
          <tr><td>Term exam</td><td class="num"><b>30%</b></td><td class="ad-muted">from the module</td></tr>
          <tr><td>Performance tasks (PT 1–3)</td><td class="num"><b>30%</b></td><td class="ad-muted">you type them</td></tr>
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

/* ═════════════════════════ BOOT ═════════════════════════ */

if (ss.get(K_TOK)) renderShell(); else renderLogin();

})();
