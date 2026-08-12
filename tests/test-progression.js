/* ══════════════════════════════════════════════════════════════════════════
   AAP101 progression tests.

   The other two suites check that the server cannot be lied to. These check
   the opposite failure: that a student who does the work actually gets paid
   for it and actually gets let through.

   Everything here runs the REAL assets/*.js against the REAL Code.gs, with
   `fetch` wired between them — so a request field the module forgets to send
   fails a test here, which no amount of reading either file catches.
   ══════════════════════════════════════════════════════════════════════════ */
const { makeRuntime } = require('./gas-harness');
const { makeBrowser, signIn, settle } = require('./browser-harness');

let pass = 0, fail = 0; const failures = [];
function ok(l, c, x) {
  if (c) { pass++; console.log('  ✅ ' + l); }
  else { fail++; failures.push(l); console.log('  ❌ ' + l + (x !== undefined ? '  → ' + JSON.stringify(x).slice(0, 400) : '')); }
}
function head(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 58 - t.length))); }

function freshBackend() {
  const rt = makeRuntime(); const g = rt.ctx;
  g.initSheet_(g.SH_CODES, g.CODES_HEADERS);
  g.initSheet_(g.SH_LOGIN, g.LOGIN_HEADERS);
  g.initSheet_(g.SH_ASSESS, g.ASSESS_HEADERS);
  g.initSheet_(g.SH_RUN, g.RUN_HEADERS);
  g.initSheet_(g.SH_EVENT, g.EVENT_HEADERS);
  g.initSheet_(g.SH_SEC, g.SEC_HEADERS);
  g.writeCodes_(g.sheet_(g.SH_CODES), 3);
  return rt;
}
const codeAt = (g, r) => String(g.sheet_(g.SH_CODES).getRange(r, 1).getValue());

/** Every gate some Continue button demands — the work that is not optional. */
function requiredGates(ctx) {
  const s = new Set();
  Object.values(ctx.CONT_REQS).forEach(r => r.forEach(g => s.add(g)));
  return [...s];
}

(async function () {

/* ═══════════════════════════════════════════════════════════════════════ */
head('THE MODULE SENDS EVERYTHING THE KEY PAYS FOR');
{
  const be = freshBackend();
  const br = makeBrowser(be, { debug: true });
  const code = codeAt(be.ctx, 2);
  signIn(be, br, code, 'dev-1');

  /* A flawless memory match. assets/app.js passes `clean` and the Matchmaker
     request into Grade.submit; AnswerKey.gs prices both. */
  const res = await br.ctx.Grade.submit({
    gate: 'm3-match', claim: true, clean: true,
    badges: ['matchmaker'], title: 'Match game', label: 'Perfect match run!'
  });
  await settle();

  const body = br.sent[br.sent.length - 1];
  ok('P-01 a flawless match reaches the server as flawless', body && body.clean === true, body);
  ok('P-02 the badge the activity allows is actually requested',
     !!(body && Array.isArray(body.badges) && body.badges.indexOf('matchmaker') >= 0), body && body.badges);

  const spec = be.ctx.gateSpec_('m3-match');
  const due = spec.xp + spec.bonusClean;                    // 70 + 30
  ok('P-03 a flawless match pays the clean-run bonus (' + due + ' XP)',
     res && res.xpAwarded === due, { got: res && res.xpAwarded, due: due });
  ok('P-04 a flawless match earns Matchmaker',
     !!(res && res.state && res.state.badges.indexOf('matchmaker') >= 0),
     res && res.state && res.state.badges);
}

{
  const be = freshBackend();
  const br = makeBrowser(be, { debug: true });
  signIn(be, br, codeAt(be.ctx, 2), 'dev-2');

  /* The same activity finished with misses must NOT get the clean bonus. The
     bonus has to follow what happened, not merely be switched on. */
  const res = await br.ctx.Grade.submit({
    gate: 'f1-match', claim: true, clean: false, badges: [], title: 'Match game'
  });
  await settle();

  const spec = be.ctx.gateSpec_('f1-match');
  ok('P-05 a messy match pays only the messy bonus (' + (spec.xp + spec.bonusMessy) + ' XP)',
     res && res.xpAwarded === spec.xp + spec.bonusMessy, res && res.xpAwarded);
  ok('P-06 a messy match does not earn Matchmaker',
     !!(res && res.state && res.state.badges.indexOf('matchmaker') < 0),
     res && res.state && res.state.badges);
}

{
  /* Play the whole course perfectly, through the module, and check the total
     against the server's own ceiling. A shortfall here means some activity is
     quietly underpaying. */
  const be = freshBackend(); const g = be.ctx;
  const br = makeBrowser(be, { debug: true });
  signIn(be, br, codeAt(g, 2), 'dev-3');

  const K = g.GRADED;
  const plays = [
    ['m1-gal', null, {}], ['m2-tabs', null, {}], ['m3-tabs', null, {}],
    ['m5-flip', null, {}], ['m6-car', null, {}], ['m6-quest', null, {}],
    ['f1-car', null, {}], ['f2-tabs', null, {}], ['f2-sim', null, {}],
    ['f3-shot', null, {}], ['f3-angle', null, {}], ['f4-chords', null, {}],
    ['m3-match', null, { clean: true, badges: ['matchmaker'] }],
    ['f1-match', null, { clean: true, badges: ['matchmaker'] }],
    ['m2-dnd', { sunset: 'nature', banaue: 'art', 'ai-img': 'art', crush: 'nature' }, {}],
    ['m4-dnd', { potter: 'artisan', painter: 'artist', photographer: 'artist', buntal: 'artisan' }, {}],
    ['m2-kc', K['m2-kc'].correct.slice(), {}],
    ['m5-kc', K['m5-kc'].correct, {}],
    ['f2-kc', K['f2-kc'].correct, {}],
    ['f4-kc', K['f4-kc'].correct, {}],
    ['m5-boss', K['m5-boss'].correct.map((a, i) => ({ q: i, a })), {}],
    ['f3-boss', K['f3-boss'].correct.map((a, i) => ({ q: i, a })), {}]
  ];

  let last = null;
  for (const [gate, answer, extra] of plays) {
    last = await br.ctx.Grade.submit(Object.assign({ gate, answer, claim: answer === null, title: gate }, extra));
    await settle(2);
  }
  await settle();

  const ceiling = g.maxAwardableXp_();
  ok('P-07 a flawless run through the module earns every point on offer (' + ceiling + ')',
     last && last.state && last.state.xp === ceiling,
     { got: last && last.state && last.state.xp, ceiling: ceiling });
  ok('P-08 a flawless run clears all 22 gates',
     last && last.state && last.state.gates.length === 22, last && last.state && last.state.gates.length);
  ok('P-09 a flawless run earns every badge the course defines (' + Object.keys(g.BADGE_NAMES).length + ')',
     last && last.state && last.state.badges.length === Object.keys(g.BADGE_NAMES).length,
     last && last.state && last.state.badges);
}

/* ═══════════════════════════════════════════════════════════════════════ */
head('WORK DONE UNLOCKS THE LESSON IT PAID FOR');
{
  /* The scenario students actually hit: the access code is the record, but the
     list of unlocked lessons only ever lived in localStorage. A new phone, a
     cleared cache, a private window, or iOS evicting storage after a week and
     the module has to rebuild lesson access from the server's gate list alone. */
  const be = freshBackend();
  const br = makeBrowser(be, { debug: true });
  const ctx = br.ctx;

  const required = requiredGates(ctx);
  ctx.S.unlocked = { m: [1], f: [1] };            // nothing restored from storage
  ctx.AAPAuth.applyState({
    xp: 1000, level: 6, rank: 'Curator', correct: 12, attempts: 12, accuracy: 100,
    bestStreak: 5, run: 5, gates: required, badges: [],
    lessonsDone: 0, activitiesDone: required.length, progressPct: 80
  });

  /* A lesson is open if the Continue button that unlocks it would be enabled. */
  const shouldBeOpen = { m: new Set([1]), f: new Set([1]) };
  ['m', 'f'].forEach(k => ctx.CONTENT[k].lessons.forEach(les => {
    (function walk(bs) {
      (bs || []).forEach(b => {
        if (b.blocks) walk(b.blocks);
        if (b.t !== 'continue' || !b.unlock) return;
        if ((b.req || []).every(gt => ctx.S.gates[gt])) shouldBeOpen[k].add(b.unlock);
      });
    })(les.blocks);
  }));

  ['m', 'f'].forEach(k => {
    const open = ctx.S.unlocked[k];
    const owed = [...shouldBeOpen[k]].filter(n => !open.includes(n)).sort();
    ok('P-1' + (k === 'm' ? '0' : '1') + ' module ' + k + ': every lesson the student earned is open',
       owed.length === 0, { unlocked: open, lockedOutOf: owed });
  });

  ok('P-12 clearing every required gate opens every lesson in the course', (() => {
    return ['m', 'f'].every(k =>
      ctx.CONTENT[k].lessons.every(l => ctx.S.unlocked[k].includes(l.num)));
  })(), { m: ctx.S.unlocked.m, f: ctx.S.unlocked.f });
}

{
  /* The other half of the rule: rebuilding access must not hand out lessons
     the student has not earned. */
  const be = freshBackend();
  const br = makeBrowser(be, { debug: true });
  const ctx = br.ctx;

  ctx.S.unlocked = { m: [1], f: [1] };
  ctx.AAPAuth.applyState({
    xp: 40, level: 1, rank: 'Apprentice', correct: 1, attempts: 1, accuracy: 100,
    bestStreak: 1, run: 1, gates: ['m1-gal'], badges: ['shutterbug'],
    lessonsDone: 1, activitiesDone: 1, progressPct: 5
  });

  ok('P-13 finishing lesson 1 opens lesson 2', ctx.S.unlocked.m.includes(2), ctx.S.unlocked.m);
  ok('P-14 lesson 3 stays locked until lesson 2 is done', !ctx.S.unlocked.m.includes(3), ctx.S.unlocked.m);
  ok('P-15 the other module is untouched',
     ctx.S.unlocked.f.length === 1 && ctx.S.unlocked.f[0] === 1, ctx.S.unlocked.f);
}

{
  /* Lesson access already granted must never be taken away — a student mid-way
     through a lesson has its gates only partly cleared. */
  const be = freshBackend();
  const br = makeBrowser(be, { debug: true });
  const ctx = br.ctx;

  ctx.S.unlocked = { m: [1, 2, 3], f: [1] };
  ctx.AAPAuth.applyState({
    xp: 40, level: 1, rank: 'Apprentice', correct: 1, attempts: 1, accuracy: 100,
    bestStreak: 1, run: 1, gates: ['m1-gal'], badges: [],
    lessonsDone: 1, activitiesDone: 1, progressPct: 5
  });
  ok('P-16 lessons already open are never re-locked',
     [1, 2, 3].every(n => ctx.S.unlocked.m.includes(n)), ctx.S.unlocked.m);
}

/* ═══════════════════════════════════════════════════════════════════════ */
console.log('\n' + '═'.repeat(66));
console.log('  ' + pass + ' passed, ' + fail + ' failed');
if (failures.length) failures.forEach(f => console.log('   ❌ ' + f));
console.log('═'.repeat(66) + '\n');
process.exit(fail ? 1 : 0);

})().catch(err => { console.error(err); process.exit(1); });
