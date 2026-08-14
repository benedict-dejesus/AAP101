/* ══════════════════════════════════════════════════════════════════════════
   AAP101 · POST-MIGRATION REVISION — ACCEPTANCE SUITE
   ──────────────────────────────────────────────────────────────────────────
   The 33 requirements of the revision brief, numbered exactly as they were
   written there, so a result can be read straight off against the request.

   The premise of the whole suite is a database that has ALREADY been migrated
   and already holds real student progress. Every test runs against that, not
   against a clean sheet, because the thing most worth proving is not that the
   new code works — it is that the new code leaves the migrated record alone.
   ══════════════════════════════════════════════════════════════════════════ */
const { makeRuntime } = require('./gas-harness');

let pass = 0, fail = 0;
const failures = [];
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; failures.push(label); console.log('  ❌ ' + label + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function head(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 62 - t.length))); }

/* ═══════════════ a migrated production-like database ═══════════════
   Two students with history, one untouched code. Migrated once, exactly as
   the live sheet was, and then left alone. */
function migratedDb() {
  const rt = makeRuntime(), g = rt.ctx;
  g.initSheet_(g.SH_CODES, g.CODES_HEADERS);
  g.initSheet_(g.SH_LOGIN, g.LOGIN_HEADERS);
  g.initSheet_(g.SH_ASSESS, g.ASSESS_HEADERS);
  g.initSheet_(g.SH_RUN, g.RUN_HEADERS);
  g.initSheet_(g.SH_EVENT, g.EVENT_HEADERS);
  g.initSheet_(g.SH_SEC, g.SEC_HEADERS);

  /* The 24-column legacy shape, before any hardening column existed. */
  const legacy = [
    ['AAP-MARA-0001', 'ACTIVE', 'Mara Santos', 'BSED-1A', 'dev-old-phone',
     new Date('2026-06-01'), new Date('2026-06-20'), 12, 240,
     /* an inflated legacy dashboard — the browser wrote these */
     900, 5, 'Painter', 95, 40, 42, 9, 12, 'Shutterbug, Clean Sort, Sharp Eye',
     4, 60, 9, 'm2', 's-old', 8],
    ['AAP-NOEL-0002', 'ACTIVE', 'Noel Ramos', 'BSED-1B', 'dev-old-tablet',
     new Date('2026-06-02'), new Date('2026-06-18'), 5, 90,
     210, 2, 'Sketcher', 71, 15, 21, 4, 1, 'Sharp Eye', 1, 26, 6, 'm2', 's-old2', 5],
    ['AAP-FRESH-003', 'UNUSED', '', '', '', '', '', 0, 0, 0, '', '', '', 0, 0, '', '', '', '', '', '', '', '', '']
  ];
  g.sheet_(g.SH_CODES).getRange(2, 1, legacy.length, 24).setValues(legacy);

  /* Their real, evidenced history. */
  g.appendRows_(g.SH_ASSESS, [
    [new Date('2026-06-10'), 'AAPMARA0001', 'Mara Santos', 'BSED-1A', 'm1', 'm1-gal', 'polaroids', 'Studio Wall', 'COMPLETED', 1, 0, 's-1'],
    [new Date('2026-06-11'), 'AAPMARA0001', 'Mara Santos', 'BSED-1A', 'm2', 'm2-dnd', 'sorter', 'Sorting', 'COMPLETED', 1, 0, 's-1'],
    [new Date('2026-06-11'), 'AAPMARA0001', 'Mara Santos', 'BSED-1A', 'm2', 'm2-kc', 'quiz', 'Which is false', 'COMPLETED', 2, 0, 's-1'],
    [new Date('2026-06-13'), 'AAPNOEL0002', 'Noel Ramos', 'BSED-1B', 'm1', 'm1-gal', 'polaroids', 'Studio Wall', 'COMPLETED', 1, 0, 's-3']
  ]);

  g.migrateSchema();
  rt.resetCache();
  return rt;
}

const CODE_M = 'AAP-MARA-0001';
const CODE_N = 'AAP-NOEL-0002';
const CODE_F = 'AAP-FRESH-003';

function rec(g, code) {
  return g.sheet_(g.SH_CODES).getRange(g.findCodeRow_(code), 1, 1, g.CODES_HEADERS.length).getValues()[0];
}
function col(g, code, name) { return rec(g, code)[g.C[name] - 1]; }
function assessRows(rt) {
  const sh = rt.sheets[rt.ctx.SH_ASSESS];
  return sh._cells.slice(1).filter(r => r && r.some(v => v !== '' && v != null));
}
/* Dates stringify inconsistently through JSON; normalise before comparing. */
const norm = v => (v && typeof v.getTime === 'function') ? 'D' + v.getTime() : String(v);
function snapshot(g, code, names) {
  const r = rec(g, code), out = {};
  names.forEach(n => { out[n] = norm(r[g.C[n] - 1]); });
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════
   XP  (brief §17, items 1–8)
   ═══════════════════════════════════════════════════════════════════════ */
head('XP · brief items 1–8');
{
  const rt = migratedDb(), g = rt.ctx;
  /* Mara returns on a brand new phone — the migrated state must come with her. */
  const lg = g.apiLogin_({ code: CODE_M, deviceId: 'dev-new-phone' });
  const auth = { code: CODE_M, token: lg.token, deviceId: 'dev-new-phone' };

  /* m5-kc is NOT in her history, so it is a genuine first clear. */
  const first = g.apiGrade_(Object.assign({ gate: 'm5-kc', answer: 6 }, auth));
  ok('1  first valid completion awards XP',
     first.ok === true && first.correct === true && first.xpAwarded === 60,
     { ok: first.ok, error: first.error, xp: first.xpAwarded });

  const xpAfterFirst = first.state.xp;

  const again = g.apiGrade_(Object.assign({ gate: 'm5-kc', answer: 6 }, auth));
  ok('2  repeated completion awards no duplicate XP',
     again.xpAwarded === 0 && again.state.xp === xpAfterFirst,
     { xp: again.xpAwarded, total: again.state.xp });

  /* A refresh loses the browser's memory entirely and re-submits. */
  const afterRefresh = g.apiGrade_(Object.assign({ gate: 'm5-kc', answer: 6 }, auth));
  ok('3  refresh/retry does not duplicate XP',
     afterRefresh.xpAwarded === 0 && afterRefresh.state.xp === xpAfterFirst, afterRefresh.state.xp);

  /* The exact shape of a lost reply: the client never saw the first answer,
     so it sends the same submission again. */
  const retry1 = g.apiGrade_(Object.assign({ gate: 'm2-tabs', answer: null }, auth));
  const retry2 = g.apiGrade_(Object.assign({ gate: 'm2-tabs', answer: null }, auth));
  ok('4  network retry does not duplicate XP',
     retry1.xpAwarded === 45 && retry2.xpAwarded === 0,
     { first: retry1.xpAwarded, retry: retry2.xpAwarded });

  /* m1-gal was completed months ago and rebuilt by the migration. */
  const old = g.apiGrade_(Object.assign({ gate: 'm1-gal', answer: null }, auth));
  ok('5  previously completed activity returns zero new XP',
     old.ok === true && old.xpAwarded === 0 && old.firstClear === false,
     { xp: old.xpAwarded, firstClear: old.firstClear });

  const bogus = g.apiGrade_(Object.assign({ gate: 'FINAL-EXAM-ANSWERS', answer: 1 }, auth));
  ok('6  invalid activity cannot award XP', bogus.ok === false && bogus.error === 'UNKNOWN_ACTIVITY', bogus);

  /* The client naming its own price, in every field it might try.
     m4-dnd, deliberately: it is not in this student's migrated history, so the
     submission is a genuine first clear and there is a real award for the
     forged fields to try to inflate. (m2-dnd would have paid nothing whatever
     the client sent, which would have proved nothing.) */
  const xpBefore = Number(col(g, CODE_M, 'XP'));
  const greedy = g.apiGrade_(Object.assign({
    gate: 'm4-dnd',
    answer: { potter: 'artisan', painter: 'artist', photographer: 'artist', buntal: 'artisan' },
    xp: 999999, xpAwarded: 999999, award: 999999, state: { xp: 999999 }, clean: true,
    badges: ['scholar', 'final', 'midterm']
  }, auth));
  ok('7  client cannot choose its own XP value',
     greedy.xpAwarded === 80 && Number(col(g, CODE_M, 'XP')) === xpBefore + 80,
     { awarded: greedy.xpAwarded, sheet: col(g, CODE_M, 'XP'), was: xpBefore });
  ok('7b and cannot request a badge the activity does not offer',
     (greedy.state.badges || []).indexOf('scholar') < 0 &&
     (greedy.state.badges || []).indexOf('final') < 0, greedy.state.badges);

  /* Every figure on the dashboard is recomputed from server state on write. */
  const forged = g.apiSync_(Object.assign({ sid: 's-forge', events: [], snapshot: {
    xp: 999999, correct: 500, attempts: 500, progressPct: 100, badgeCount: 15,
    badgeList: 'Full Scholar', activitiesDone: 22, sessionMinutes: 4
  } }, auth));
  ok('8  server state remains authoritative',
     forged.ok === true &&
     Number(col(g, CODE_M, 'XP')) === Number(col(g, CODE_M, 'SXP')) &&
     Number(col(g, CODE_M, 'XP')) !== 999999 &&
     String(col(g, CODE_M, 'BADGE_L')).indexOf('Full Scholar') < 0,
     { xp: col(g, CODE_M, 'XP'), sxp: col(g, CODE_M, 'SXP') });
}

/* ═══════════════════════════════════════════════════════════════════════
   AUTHENTICATION  (items 9–14)
   ═══════════════════════════════════════════════════════════════════════ */
head('AUTHENTICATION · brief items 9–14');
{
  const rt = migratedDb(), g = rt.ctx;

  const lg = g.apiLogin_({ code: CODE_M, deviceId: 'dev-phone' });
  ok('9  valid access code authenticates', lg.ok === true && !!lg.token, lg.error);

  ok('10 same access code works on the same device',
     g.apiCheck_({ code: CODE_M, deviceId: 'dev-phone' }).stage === 'RETURNING' &&
     g.apiSync_({ code: CODE_M, token: lg.token, deviceId: 'dev-phone', events: [], snapshot: {} }).ok === true);

  const onLaptop = g.apiLogin_({ code: CODE_M, deviceId: 'dev-laptop' });
  ok('11 same access code works on another device',
     g.apiCheck_({ code: CODE_M, deviceId: 'dev-laptop' }).ok === true &&
     onLaptop.ok === true && !!onLaptop.token, onLaptop.error);

  const onOtherBrowser = g.apiLogin_({ code: CODE_M, deviceId: 'dev-phone-firefox' });
  ok('12 same access code works on another browser',
     onOtherBrowser.ok === true && !!onOtherBrowser.token, onOtherBrowser.error);

  ok('13 invalid access code is rejected',
     g.apiCheck_({ code: 'AAP-ZZZZ-ZZZZ', deviceId: 'dev-phone' }).error === 'NOT_FOUND' &&
     g.apiLogin_({ code: 'AAP-ZZZZ-ZZZZ', deviceId: 'dev-phone', name: 'Nobody' }).ok === false);

  ok('14 existing migrated accounts remain accessible',
     [CODE_M, CODE_N].every(c => {
       const r = g.apiLogin_({ code: c, deviceId: 'dev-fresh-' + c });
       return r.ok === true && !!r.state && !!r.name;
     }));

  /* The security model that replaced the lock: one live session per code. */
  ok('14b the newest sign-in ends the previous session',
     g.apiSync_({ code: CODE_M, token: lg.token, deviceId: 'dev-phone', events: [], snapshot: {} })
       .error === 'BAD_TOKEN');
  ok('14c a disabled code still stops working immediately', (() => {
    const row = g.findCodeRow_(CODE_N);
    const live = g.apiLogin_({ code: CODE_N, deviceId: 'dev-n' });
    g.sheet_(g.SH_CODES).getRange(row, g.C.STATUS).setValue('DISABLED');
    return g.apiSync_({ code: CODE_N, token: live.token, deviceId: 'dev-n', events: [], snapshot: {} })
             .error === 'DISABLED' &&
           g.apiCheck_({ code: CODE_N, deviceId: 'dev-n' }).error === 'DISABLED';
  })());
  ok('14d a fresh code still has to register',
     g.apiCheck_({ code: CODE_F, deviceId: 'dev-new' }).stage === 'REGISTER');
}

/* ═══════════════════════════════════════════════════════════════════════
   RESUME  (items 15–20)
   ═══════════════════════════════════════════════════════════════════════ */
head('RESUME · brief items 15–20');
{
  const rt = migratedDb(), g = rt.ctx;

  /* Mara works on her old phone and gets somewhere. */
  const phone = g.apiLogin_({ code: CODE_M, deviceId: 'dev-phone' });
  const authP = { code: CODE_M, token: phone.token, deviceId: 'dev-phone' };
  g.apiGrade_(Object.assign({ gate: 'm5-kc', answer: 6 }, authP));
  g.apiGrade_(Object.assign({ gate: 'm5-flip', answer: null }, authP));
  g.apiSync_(Object.assign({ sid: 's-p', events: [], snapshot: { sessionMinutes: 6, lastPage: 'm5' } }, authP));

  const beforeSwitch = {
    xp: Number(col(g, CODE_M, 'SXP')),
    gates: String(col(g, CODE_M, 'SGATES')),
    badges: String(col(g, CODE_M, 'SBADGES')),
    progress: Number(col(g, CODE_M, 'PROGRESS')),
    acts: Number(col(g, CODE_M, 'ACTS'))
  };

  /* Now she picks up a laptop. */
  const laptop = g.apiLogin_({ code: CODE_M, deviceId: 'dev-laptop' });
  ok('15 student resumes from server state',
     laptop.ok === true && laptop.state.xp === beforeSwitch.xp &&
     laptop.state.gates.join(',') === beforeSwitch.gates, laptop.state);
  ok('15b and is handed back the page they were last on',
     laptop.state.lastPage === 'm5', laptop.state.lastPage);

  /* A browser insisting it knows better. */
  const authL = { code: CODE_M, token: laptop.token, deviceId: 'dev-laptop' };
  const lying = g.apiSync_(Object.assign({ sid: 's-l', events: [], snapshot: {
    xp: 0, correct: 0, attempts: 0, progressPct: 0, activitiesDone: 0,
    gates: [], badges: [], sessionMinutes: 1
  } }, authL));
  ok('16 browser localStorage cannot overwrite server progress',
     lying.ok === true && lying.state.xp === beforeSwitch.xp &&
     Number(col(g, CODE_M, 'SXP')) === beforeSwitch.xp, lying.state.xp);

  ok('17 existing completed activities remain completed after device change',
     String(col(g, CODE_M, 'SGATES')) === beforeSwitch.gates &&
     laptop.state.gates.indexOf('m1-gal') >= 0 &&
     laptop.state.gates.indexOf('m5-flip') >= 0, col(g, CODE_M, 'SGATES'));
  ok('18 XP remains unchanged after device change',
     Number(col(g, CODE_M, 'SXP')) === beforeSwitch.xp, col(g, CODE_M, 'SXP'));
  ok('19 badges remain unchanged after device change',
     String(col(g, CODE_M, 'SBADGES')) === beforeSwitch.badges, col(g, CODE_M, 'SBADGES'));
  ok('20 progress remains unchanged after device change',
     Number(col(g, CODE_M, 'PROGRESS')) === beforeSwitch.progress &&
     Number(col(g, CODE_M, 'ACTS')) === beforeSwitch.acts,
     { progress: col(g, CODE_M, 'PROGRESS'), acts: col(g, CODE_M, 'ACTS') });
}

/* ═══════════════════════════════════════════════════════════════════════
   IDEMPOTENCY  (items 21–25)
   ═══════════════════════════════════════════════════════════════════════ */
head('IDEMPOTENCY · brief items 21–25');
{
  const rt = migratedDb(), g = rt.ctx;
  const lg = g.apiLogin_({ code: CODE_M, deviceId: 'dev-a' });
  const auth = { code: CODE_M, token: lg.token, deviceId: 'dev-a' };

  const a1 = g.apiGrade_(Object.assign({ gate: 'm3-tabs', answer: null }, auth));
  const a2 = g.apiGrade_(Object.assign({ gate: 'm3-tabs', answer: null }, auth));
  ok('21 the same completion event twice produces one award',
     a1.xpAwarded === 90 && a2.xpAwarded === 0, { first: a1.xpAwarded, second: a2.xpAwarded });

  const base = Number(col(g, CODE_M, 'SXP'));
  let paid = 0;
  for (let i = 0; i < 10; i++) {
    paid += g.apiGrade_(Object.assign({ gate: 'm3-tabs', answer: null }, auth)).xpAwarded;
  }
  ok('22 the same completion event ten times produces one award',
     paid === 0 && Number(col(g, CODE_M, 'SXP')) === base, { paid, xp: col(g, CODE_M, 'SXP') });

  /* Concurrency: the real server serialises on a script lock, so the honest
     test of the guard is back-to-back submissions with no reply consumed
     between them — whichever runs second must find the gate already set. */
  const before23 = Number(col(g, CODE_M, 'SXP'));
  const burst = [
    g.apiGrade_(Object.assign({ gate: 'm6-quest', answer: null }, auth)),
    g.apiGrade_(Object.assign({ gate: 'm6-quest', answer: null }, auth)),
    g.apiGrade_(Object.assign({ gate: 'm6-quest', answer: null }, auth))
  ];
  ok('23 concurrent duplicate requests cannot create duplicate XP',
     burst.reduce((n, r) => n + r.xpAwarded, 0) === 60 &&
     Number(col(g, CODE_M, 'SXP')) === before23 + 60,
     { awarded: burst.map(r => r.xpAwarded), xp: col(g, CODE_M, 'SXP') });

  const before24 = Number(col(g, CODE_M, 'SXP'));
  const again = g.apiLogin_({ code: CODE_M, deviceId: 'dev-a' });
  const auth24 = { code: CODE_M, token: again.token, deviceId: 'dev-a' };
  g.apiGrade_(Object.assign({ gate: 'm3-tabs', answer: null }, auth24));
  g.apiGrade_(Object.assign({ gate: 'm1-gal', answer: null }, auth24));
  ok('24 re-login cannot create duplicate XP',
     Number(col(g, CODE_M, 'SXP')) === before24, col(g, CODE_M, 'SXP'));

  const before25 = Number(col(g, CODE_M, 'SXP'));
  const gatesBefore = String(col(g, CODE_M, 'SGATES'));
  const dev2 = g.apiLogin_({ code: CODE_M, deviceId: 'dev-b' });
  const auth25 = { code: CODE_M, token: dev2.token, deviceId: 'dev-b' };
  g.apiGrade_(Object.assign({ gate: 'm3-tabs', answer: null }, auth25));
  g.apiGrade_(Object.assign({ gate: 'm6-quest', answer: null }, auth25));
  g.apiGrade_(Object.assign({ gate: 'm1-gal', answer: null }, auth25));
  ok('25 device switching cannot create duplicate XP',
     Number(col(g, CODE_M, 'SXP')) === before25 &&
     String(col(g, CODE_M, 'SGATES')) === gatesBefore,
     { xp: col(g, CODE_M, 'SXP'), was: before25 });
}

/* ═══════════════════════════════════════════════════════════════════════
   MIGRATION PRESERVATION  (items 26–33)

   A full working day against a migrated database — logins from three devices,
   real submissions, syncs, a failed sign-in — and then the question that
   matters: is any of the migration's work disturbed?
   ═══════════════════════════════════════════════════════════════════════ */
head('MIGRATION PRESERVATION · brief items 26–33');
{
  const rt = migratedDb(), g = rt.ctx;

  const IDENT = ['CODE', 'NAME', 'SECTION', 'FIRST'];
  const EVIDENCE = ['PREMIG', 'LEGBADGES', 'HISTDELTA'];
  const STATE = ['SXP', 'SGATES', 'SBADGES'];

  const before = {};
  [CODE_M, CODE_N, CODE_F].forEach(c => {
    before[c] = snapshot(g, c, IDENT.concat(EVIDENCE).concat(STATE));
  });
  const assessBefore = JSON.stringify(assessRows(rt).map(r => r.map(norm)));
  const codesBefore = [CODE_M, CODE_N, CODE_F].map(c => norm(col(g, c, 'CODE')));

  /* ── a normal day of use ── */
  const m1 = g.apiLogin_({ code: CODE_M, deviceId: 'dev-1' });
  const aM = { code: CODE_M, token: m1.token, deviceId: 'dev-1' };
  g.apiGrade_(Object.assign({ gate: 'm5-kc', answer: 6 }, aM));
  g.apiSync_(Object.assign({ sid: 's-1', events: [], snapshot: { sessionMinutes: 4, lastPage: 'm5' } }, aM));

  const m2 = g.apiLogin_({ code: CODE_M, deviceId: 'dev-2' });      // device switch
  const aM2 = { code: CODE_M, token: m2.token, deviceId: 'dev-2' };
  g.apiGrade_(Object.assign({ gate: 'm1-gal', answer: null }, aM2)); // replay, pays nothing
  g.apiSync_(Object.assign({ sid: 's-2', events: [], snapshot: { sessionMinutes: 2, lastPage: 'm1' } }, aM2));

  g.apiLogin_({ code: 'AAP-ZZZZ-ZZZZ', deviceId: 'dev-3', name: 'Nobody' });   // a failure
  const n1 = g.apiLogin_({ code: CODE_N, deviceId: 'dev-4' });
  g.apiSync_({ code: CODE_N, token: n1.token, deviceId: 'dev-4', sid: 's-4',
               events: [{ kind: 'runtime', event: 'session-start', minutes: 0 }],
               snapshot: { sessionMinutes: 1, lastPage: 'm1' } });

  const after = {};
  [CODE_M, CODE_N, CODE_F].forEach(c => {
    after[c] = snapshot(g, c, IDENT.concat(EVIDENCE).concat(STATE));
  });

  ok('26 existing AccessCodes remain unchanged',
     JSON.stringify([CODE_M, CODE_N, CODE_F].map(c => norm(col(g, c, 'CODE')))) === JSON.stringify(codesBefore),
     [CODE_M, CODE_N, CODE_F].map(c => col(g, c, 'CODE')));

  ok('27 existing student names remain unchanged',
     [CODE_M, CODE_N, CODE_F].every(c => before[c].NAME === after[c].NAME) &&
     after[CODE_M].NAME === 'Mara Santos' && after[CODE_N].NAME === 'Noel Ramos',
     { mara: after[CODE_M].NAME, noel: after[CODE_N].NAME });
  ok('27b sections and first-login dates are unchanged too',
     [CODE_M, CODE_N, CODE_F].every(c =>
       before[c].SECTION === after[c].SECTION && before[c].FIRST === after[c].FIRST));

  /* Assessments is append-only: new rows are expected, rewritten ones are not. */
  const assessAfter = assessRows(rt).map(r => r.map(norm));
  const assessBeforeArr = JSON.parse(assessBefore);
  ok('28 existing Assessments rows remain unchanged',
     JSON.stringify(assessAfter.slice(0, assessBeforeArr.length)) === assessBefore,
     { before: assessBeforeArr.length, after: assessAfter.length });
  ok('28b and the tab only ever grew', assessAfter.length >= assessBeforeArr.length);

  ok('29 _PreMigration remains unchanged',
     [CODE_M, CODE_N, CODE_F].every(c => before[c].PREMIG === after[c].PREMIG) &&
     after[CODE_M].PREMIG.indexOf('900') >= 0,
     { was: before[CODE_M].PREMIG.slice(0, 60), now: after[CODE_M].PREMIG.slice(0, 60) });

  ok('30 _LegacyBadges_UNVERIFIED remains unchanged',
     [CODE_M, CODE_N, CODE_F].every(c => before[c].LEGBADGES === after[c].LEGBADGES) &&
     after[CODE_M].LEGBADGES.indexOf('NOT TRUSTED STATE') >= 0,
     after[CODE_M].LEGBADGES.slice(0, 80));
  ok('30b _HistoryDelta remains unchanged',
     [CODE_M, CODE_N, CODE_F].every(c => before[c].HISTDELTA === after[c].HISTDELTA));

  /* Server state MAY grow — she earned 60 XP. It must never be reset. */
  ok('31 _ServerXP is not unexpectedly reset',
     Number(after[CODE_M].SXP) === Number(before[CODE_M].SXP) + 60 &&
     Number(after[CODE_N].SXP) === Number(before[CODE_N].SXP),
     { was: before[CODE_M].SXP, now: after[CODE_M].SXP });

  ok('32 _ServerGates is not unexpectedly reset',
     before[CODE_M].SGATES.split(',').filter(Boolean).every(x => after[CODE_M].SGATES.indexOf(x) >= 0) &&
     after[CODE_N].SGATES === before[CODE_N].SGATES,
     { was: before[CODE_M].SGATES, now: after[CODE_M].SGATES });

  ok('33 _ServerBadges is not unexpectedly reset',
     before[CODE_M].SBADGES.split(',').filter(Boolean).every(x => after[CODE_M].SBADGES.indexOf(x) >= 0) &&
     after[CODE_N].SBADGES === before[CODE_N].SBADGES,
     { was: before[CODE_M].SBADGES, now: after[CODE_M].SBADGES });

  /* The brief's §15: nothing in the revision may re-run the migration. */
  const reMigrate = g.migrateSchema();
  ok('33b the migration reports nothing left to do on an already-migrated sheet',
     /Rows rebuilt:\s+0/.test(reMigrate), reMigrate.split('\n').slice(0, 4));
  ok('33c and re-running it changes no server state',
     Number(col(g, CODE_M, 'SXP')) === Number(after[CODE_M].SXP) &&
     String(col(g, CODE_M, 'SGATES')) === after[CODE_M].SGATES);

  /* §11: the archival columns must never reach a calculation. */
  const row = g.findCodeRow_(CODE_M);
  g.sheet_(g.SH_CODES).getRange(row, g.C.LEGBADGES).setValue(
    JSON.stringify({ legacyCount: 15, legacyList: 'Full Scholar, Midterm Master' }));
  g.sheet_(g.SH_CODES).getRange(row, g.C.HISTDELTA).setValue(9999);
  rt.resetCache();
  const st = g.publicState_(rec(g, CODE_M));
  ok('33d evidence columns cannot influence XP, badges or progress',
     st.xp === Number(after[CODE_M].SXP) &&
     st.badges.indexOf('scholar') < 0 && st.badges.indexOf('midterm') < 0,
     { xp: st.xp, badges: st.badges });
}

/* ═══════════════════════════════════════════════════════════════════════
   THE TWO BUGS, AS REGRESSIONS
   ═══════════════════════════════════════════════════════════════════════ */
head('REGRESSION GUARDS');
{
  const rt = migratedDb(), g = rt.ctx;

  /* R-1 — the write that broke every request.
     writeState_ built a row one cell wider than the range it wrote through,
     which Sheets rejects outright, so apiGrade_ and apiSync_ threw on every
     call and the student saw nothing happen. Assert the contract directly:
     the state columns must all land, including the one past _PreMigration. */
  const lg = g.apiLogin_({ code: CODE_M, deviceId: 'dev-w' });
  const auth = { code: CODE_M, token: lg.token, deviceId: 'dev-w' };
  const res = g.apiGrade_(Object.assign({ gate: 'm5-kc', answer: 6 }, auth));
  ok('R-1 a submission completes without throwing', res.ok === true, res);
  ok('R-1b _ServerTries is actually written, past _PreMigration',
     (() => { try { return !!JSON.parse(String(col(g, CODE_M, 'STRIES')))['m5-kc']; }
              catch (e) { return false; } })(), col(g, CODE_M, 'STRIES'));
  ok('R-1c _PreMigration survived a write that spans it',
     String(col(g, CODE_M, 'PREMIG')).indexOf('migratedOn') >= 0);
  ok('R-1d every column writeState_ targets is either in its block or spilled',
     (() => {
       const C = g.C, lo = C.LAST, hi = C.SYNCN;
       const targets = ['LAST','MINUTES','LASTPAGE','SESSID','SESSMIN','XP','LEVEL','RANK','ACC',
                        'CORRECT','ATTEMPTS','STREAK','BADGE_N','BADGE_L','LESSONS','PROGRESS',
                        'ACTS','SXP','SGATES','SCORRECT','SATTEMPTS','SSTREAK','SRUN','SBADGES',
                        'SYNCAT','SYNCN'];
       /* Everything except STRIES must sit inside the contiguous block … */
       const inBlock = targets.every(k => C[k] >= lo && C[k] <= hi);
       /* … and STRIES must sit outside it, which is why the spill path exists. */
       return inBlock && (C.STRIES < lo || C.STRIES > hi);
     })());

  /* R-2 — the lockout. A device id that changes underneath a student, which is
     ordinary on iOS, must not cost them their account. */
  const reborn = g.apiLogin_({ code: CODE_M, deviceId: 'dev-w-regenerated-by-safari' });
  ok('R-2 a regenerated device id does not lock a student out',
     reborn.ok === true && reborn.state.xp === res.state.xp, reborn.error);
  ok('R-2b and no endpoint answers with DEVICE_LOCKED any more',
     [g.apiCheck_({ code: CODE_M, deviceId: 'dev-anything' }),
      g.apiLogin_({ code: CODE_M, deviceId: 'dev-anything-else' })]
       .every(r => r.error !== 'DEVICE_LOCKED'));
}

console.log('\n' + '═'.repeat(66));
console.log('  ' + pass + ' passed, ' + fail + ' failed');
console.log('═'.repeat(66) + '\n');
if (fail) { failures.forEach(f => console.log('   ❌ ' + f)); process.exit(1); }
