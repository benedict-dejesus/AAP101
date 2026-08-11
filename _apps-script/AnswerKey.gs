/* ══════════════════════════════════════════════════════════════════════════
   AAP101 · AUTHORITATIVE ANSWER KEY  (Google Apps Script)

   THIS FILE NEVER LEAVES THE SERVER.

   It lives in the Apps Script project, which only you (the spreadsheet owner)
   can open. The module published on GitHub Pages does not contain a single
   correct answer any more — it renders the questions, sends the student's
   answer here, and displays whatever verdict comes back.

   Every gate in the module appears in exactly one of the two tables below.
   Anything not listed is rejected (see gateSpec_). That is the allowlist.

   ──────────────────────────────────────────────────────────────────────────
   KEEPING THIS IN SYNC WITH assets/content.js

   If you add, remove or reorder a quiz option, a sorter item, or a boss
   question, you must update the matching entry here. Run `auditAnswerKey()`
   from the Apps Script editor after any content change: it reports gates that
   exist here but not in the module, and vice versa, using the gate list the
   module reports at login.
   ══════════════════════════════════════════════════════════════════════════ */

/* ─────────── Objectively gradeable activities ───────────
   The student sends an answer; the server decides whether it is right.
   `xp` is the authoritative award — the browser has no say in it.          */

var GRADED = {

  /* ── Sorters: answer = { itemId: categoryId } ── */
  'm2-dnd': {
    type: 'sorter', xp: 60, mod: 'm', lesson: 2, badgeOnPerfect: 'sorter', bonusFirstTry: 20,
    answers: { 'sunset': 'nature', 'banaue': 'art', 'ai-img': 'art', 'crush': 'nature' }
  },
  'm4-dnd': {
    type: 'sorter', xp: 60, mod: 'm', lesson: 4, badgeOnPerfect: 'sorter', bonusFirstTry: 20,
    answers: { 'potter': 'artisan', 'painter': 'artist', 'photographer': 'artist', 'buntal': 'artisan' }
  },

  /* ── Multi-select quiz: answer = [indices]; must match the key exactly ── */
  'm2-kc': {
    type: 'quiz-multi', xp: 75, mod: 'm', lesson: 2, nOpts: 6,
    correct: [3, 4], badgeOnClean: 'sharp-eye'
  },

  /* ── Single-answer quiz: answer = index ── */
  'm5-kc': { type: 'quiz-single', xp: 60, mod: 'm', lesson: 5, nOpts: 8, correct: 6, badgeOnClean: 'sharp-eye' },
  'f2-kc': { type: 'quiz-single', xp: 55, mod: 'f', lesson: 2, nOpts: 4, correct: 1, badgeOnClean: 'sharp-eye', optional: true },
  'f4-kc': { type: 'quiz-single', xp: 60, mod: 'f', lesson: 4, nOpts: 6, correct: 5, badgeOnClean: 'sharp-eye' },

  /* ── Speed rounds: answer = [{q:<original index>, a:<option index>}] ──
       Graded as a batch when the round ends. `pass` is the fraction needed
       to clear the gate; XP is scaled by accuracy, exactly as the original
       client-side code did, so nobody's expected award changes.            */
  'm5-boss': {
    type: 'boss', xp: 120, mod: 'm', lesson: 5, optional: true, pass: 0.6, nOpts: 4,
    correct: [0, 1, 2, 3, 0, 1, 2, 3]
  },
  'f3-boss': {
    type: 'boss', xp: 130, mod: 'f', lesson: 3, optional: true, pass: 0.6, nOpts: 4,
    correct: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1]
  }
};

/* ─────────── Completion-claim activities ───────────
   Galleries, discovery grids, card decks, memory matches, the quest log and
   the two simulators. There is no secret to check: the student has to have
   seen every card for the module to let them through, and "I saw every card"
   is not something a server can verify from the outside.

   What the server DOES enforce here:
     · the gate must exist in this table (unknown gates are rejected)
     · it can only be cleared once
     · the XP awarded is the number written here, not a number the browser
       sends
   These rows are marked CLAIMED in the Assessments tab so you can tell at a
   glance which progress was checked and which was asserted.

   `claimBadges` is a per-activity allowlist for badges the module may ask for
   on a clear — "Matchmaker" is earned by finishing a memory match without a
   miss, and a miss is no more checkable than the rest of the activity. The
   allowlist is what stops a tampered page requesting "Full Scholar".

   `bonusClean` / `bonusMessy` are the two XP bonuses the original module could
   pay for a match. Clamping to exactly those two values means the worst a
   tampered page can do is claim the better of them.                          */

var CLAIMED = {
  'm1-gal':    { xp: 40,  mod: 'm', lesson: 1, badgeOnClear: 'shutterbug' },
  'm2-tabs':   { xp: 45,  mod: 'm', lesson: 2 },
  'm3-tabs':   { xp: 90,  mod: 'm', lesson: 3, badgeOnClear: 'curator' },
  'm3-match':  { xp: 70,  mod: 'm', lesson: 3, claimBadges: ['matchmaker'], bonusClean: 30, bonusMessy: 15 },
  'm5-flip':   { xp: 80,  mod: 'm', lesson: 5, badgeOnClear: 'flipper' },
  'm6-car':    { xp: 70,  mod: 'm', lesson: 6 },
  'm6-quest':  { xp: 60,  mod: 'm', lesson: 6 },
  'f1-car':    { xp: 85,  mod: 'f', lesson: 1 },
  'f1-match':  { xp: 70,  mod: 'f', lesson: 1, claimBadges: ['matchmaker'], bonusClean: 30, bonusMessy: 15 },
  'f2-tabs':   { xp: 50,  mod: 'f', lesson: 2 },
  'f2-sim':    { xp: 100, mod: 'f', lesson: 2, badgeOnClear: 'exposure' },
  'f3-shot':   { xp: 100, mod: 'f', lesson: 3 },
  'f3-angle':  { xp: 60,  mod: 'f', lesson: 3 },
  'f4-chords': { xp: 80,  mod: 'f', lesson: 4, badgeOnClear: 'guitarist' }
};

/* The only badge ids that exist, and the label written to your "Badge List"
   column. Anything not in this map is dropped — so a tampered client cannot
   invent badges, and cannot use a badge name to get arbitrary text into your
   spreadsheet. Mirrors BADGES in assets/content.js. */
var BADGE_NAMES = {
  'first-steps':  'First Steps',
  'shutterbug':   'Shutterbug',
  'sorter':       'Clean Sort',
  'curator':      'Curator',
  'flipper':      'Movement Buff',
  'sharp-eye':    'Sharp Eye',
  'matchmaker':   'Matchmaker',
  'boss':         'Boss Slayer',
  'perfect-boss': 'Flawless Victory',
  'combo5':       'On Fire',
  'exposure':     'Perfect Exposure',
  'guitarist':    'Chord Collector',
  'midterm':      'Midterm Master',
  'final':        'Final Term Champ',
  'scholar':      'Full Scholar'
};

/* ─────────── Badge evidence model ───────────
   What each badge would take to demonstrate, so a legacy badge claim can be
   sorted into PROVEN / UNVERIFIED / CONTRADICTED instead of simply kept or
   thrown away.

   `condition`:
     'clear'      earned by finishing the activity. Completing it is the whole
                  requirement, so the gate set settles it either way.
     'complete'   earned by finishing a whole module.
     'streak5'    five correct answers in a row.
     'noMiss'     earned by finishing one of these activities with no misses.
                  The old build logged a WRONG row against the activity every
                  time a student got something wrong in it, so where those rows
                  survive the claim can be checked. Where they did not survive,
                  it can be neither proved nor disproved.                     */

var BADGE_EVIDENCE = {
  'shutterbug':   { gates: ['m1-gal'],                          condition: 'clear' },
  'curator':      { gates: ['m3-tabs'],                         condition: 'clear' },
  'flipper':      { gates: ['m5-flip'],                         condition: 'clear' },
  'exposure':     { gates: ['f2-sim'],                          condition: 'clear' },
  'guitarist':    { gates: ['f4-chords'],                       condition: 'clear' },
  'boss':         { gates: ['m5-boss', 'f3-boss'],              condition: 'clear' },
  'first-steps':  { anyGate: true,                              condition: 'clear' },
  'midterm':      { module: 'm',                                condition: 'complete' },
  'final':        { module: 'f',                                condition: 'complete' },
  'scholar':      { module: '*',                                condition: 'complete' },
  'combo5':       {                                             condition: 'streak5' },
  'sorter':       { gates: ['m2-dnd', 'm4-dnd'],                condition: 'noMiss' },
  'sharp-eye':    { gates: ['m2-kc', 'm5-kc', 'f2-kc', 'f4-kc'],condition: 'noMiss' },
  'matchmaker':   { gates: ['m3-match', 'f1-match'],            condition: 'noMiss' },
  'perfect-boss': { gates: ['m5-boss', 'f3-boss'],              condition: 'noMiss' }
};

/** Badge name → id, for reading the legacy "Badge List" column back. */
function badgeIdByName_(name) {
  var n = String(name || '').trim();
  for (var id in BADGE_NAMES) {
    if (BADGE_NAMES.hasOwnProperty(id) && BADGE_NAMES[id] === n) return id;
  }
  return null;
}

/**
 * Sorts one legacy badge claim into a three-state evidence classification.
 *
 * PROVEN        the rebuilt state already demonstrates it (it will be in
 *               _ServerBadges on its own merits, whatever the old sheet said)
 * UNVERIFIED    the activity that could have earned it was completed, but the
 *               history does not contain what it would take to check the
 *               condition. Kept as evidence, never as trusted state.
 * CONTRADICTED  the history positively rules it out — no activity that could
 *               have earned it, or a recorded miss in the very activity the
 *               badge says was clean.
 *
 * @param {string} id     badge id
 * @param {Object} st     the reconstructed state (st.badges = PROVEN set)
 * @param {Object} byGate {gate: {rows, wrong}} from answer-level history
 * @return {{state:string, why:string}}
 */
function classifyLegacyBadge_(id, st, byGate) {
  if (!BADGE_NAMES.hasOwnProperty(id)) {
    return { state: 'CONTRADICTED', code: 'UNKNOWN_BADGE', why: 'not a badge this course defines' };
  }
  if (st.badges[id]) {
    return { state: 'PROVEN', code: 'DEMONSTRATED', why: 'history demonstrates it' };
  }

  var ev = BADGE_EVIDENCE[id];
  if (!ev) return { state: 'CONTRADICTED', code: 'NO_RULE', why: 'no way to earn it is defined' };

  /* Earned simply by finishing something. Not being in the PROVEN set means
     the thing was never finished, which settles it. */
  if (ev.condition === 'clear') {
    if (ev.anyGate) {
      return { state: 'CONTRADICTED', code: 'NOT_COMPLETED', why: 'no completed activity of any kind' };
    }
    return { state: 'CONTRADICTED', code: 'NOT_COMPLETED',
             why: 'requires ' + ev.gates.join(' or ') + ', none of which history shows completed' };
  }
  if (ev.condition === 'complete') {
    return { state: 'CONTRADICTED', code: 'MODULE_INCOMPLETE',
             why: 'requires a finished module; history does not show one' };
  }

  /* Five correct in a row. Checkable only where answer rows survive. */
  if (ev.condition === 'streak5') {
    if (st.attempts === 0) {
      return { state: 'UNVERIFIED', code: 'NO_ANSWER_ROWS', why: 'no answer-level rows survive, so the streak cannot be checked' };
    }
    return { state: 'CONTRADICTED', code: 'STREAK_SHORT',
             why: 'best run in the surviving history is ' + st.streak + ', not 5' };
  }

  /* "No misses". Three outcomes, depending on what survived. */
  if (ev.condition === 'noMiss') {
    var cleared = [], unchecked = [], missed = [];
    for (var i = 0; i < ev.gates.length; i++) {
      var g = ev.gates[i];
      if (!st.gates[g]) continue;
      cleared.push(g);
      var rec = byGate[g];
      if (!rec || !rec.rows) unchecked.push(g);
      else if (rec.wrong > 0) missed.push(g);
    }
    if (!cleared.length) {
      return { state: 'CONTRADICTED', code: 'NOT_COMPLETED',
               why: 'requires ' + ev.gates.join(' or ') + ', none of which history shows completed' };
    }
    if (unchecked.length) {
      return { state: 'UNVERIFIED', code: 'NO_ANSWER_ROWS',
               why: 'completed ' + unchecked.join(', ') + ', but no answer-level rows survive for it, ' +
                    'so a clean run can be neither shown nor ruled out' };
    }
    return { state: 'CONTRADICTED', code: 'MISS_RECORDED',
             why: 'history records a miss in ' + missed.join(', ') +
                  ' — the activity this badge says was completed without one' };
  }

  return { state: 'UNVERIFIED', code: 'NO_RULE', why: 'no rule available to check it' };
}

/* Level curve — mirrors RANKS in assets/content.js. The server computes the
   level and rank it writes to your dashboard; the browser's claim is ignored. */
var RANK_TABLE = [
  { lvl: 1, xp: 0,    name: 'Apprentice' },
  { lvl: 2, xp: 150,  name: 'Sketcher' },
  { lvl: 3, xp: 350,  name: 'Colorist' },
  { lvl: 4, xp: 600,  name: 'Illustrator' },
  { lvl: 5, xp: 900,  name: 'Painter' },
  { lvl: 6, xp: 1250, name: 'Curator' },
  { lvl: 7, xp: 1650, name: 'Maestro' },
  { lvl: 8, xp: 2100, name: 'Virtuoso' }
];


/* ─────────── Per-option feedback ───────────
   These strings used to sit in assets/content.js next to each option, where
   they gave the whole game away: the right answers were the ones whose text
   began "Correct!". They now live here, and the server hands back only the
   line belonging to the option the student actually chose.                 */

var QUIZ_FEEDBACK = {
  "m2-kc": [
    "❌ Incorrect. This statement is TRUE. Please try again.",
    "❌ Incorrect. This statement is TRUE. Please try again.",
    "❌ Incorrect. This statement is TRUE. Please try again.",
    "✅ Correct! This statement is FALSE. The Mayon Volcano was created by a natural process — not by conscious human effort. It cannot be considered art by definition.",
    "✅ Correct! This statement is FALSE. Art can be learned. It is only a matter of exposure, experience, and mentorship. Everyone has the potential to become an artist.",
    "❌ Incorrect. This statement is TRUE. Please try again."
  ],

  "m5-kc": [
    "❌ Incorrect. Please study the art movements and analyze the image, then try again.",
    "❌ Incorrect. Please study the art movements and analyze the image, then try again.",
    "❌ Incorrect. Please study the art movements and analyze the image, then try again.",
    "❌ Incorrect. Please study the art movements and analyze the image, then try again.",
    "❌ Incorrect. Please study the art movements and analyze the image, then try again.",
    "❌ Incorrect. Please study the art movements and analyze the image, then try again.",
    "✅ Correct! This artwork was inspired by an everyday consumer product or item. Pop Art draws from popular culture, advertising, comics, and consumer products — often using bold, flat colors and familiar mass-media imagery.",
    "❌ Incorrect. Please study the art movements and analyze the image, then try again."
  ],

  "f2-kc": [
    "❌ Incorrect. A slower shutter adds <em>more</em> motion blur, and dropping ISO makes the image even darker. Try again!",
    "✅ Correct! A fast shutter freezes the action, a wide aperture lets in more light, and a higher ISO compensates for the low indoor light — accepting some grain as a trade-off.",
    "❌ Incorrect. A narrow aperture lets in <em>less</em> light, making an already-dark photo darker. Try again!",
    "❌ Incorrect. ISO 100 is for bright light. Indoors you need more sensitivity. Try again!"
  ],

  "f4-kc": [
    "❌ Incorrect. This pattern has four quarter notes — each lasts 1 beat. No half note here. Try again!",
    "❌ Incorrect. This is a <strong>whole note</strong> — it lasts 4 full beats. Try again!",
    "❌ Incorrect. This pattern does not contain a half note. Try again!",
    "❌ Incorrect. This pattern does not contain a half note. Try again!",
    "❌ Incorrect. This pattern does not contain a half note. Try again!",
    "✅ Correct! The last note in this pattern is a half note. DUDU (2 beats) + DUDU (2 beats) + D (2 beats) — that final \"D\" lasts 2 beats, making it a half note that completes the measure."
  ]
};

/* ═══════════════════ LOOKUP + SCORING ═══════════════════ */

/** The allowlist. Returns a spec, or null for any gate we do not know. */
function gateSpec_(gate) {
  gate = String(gate || '');
  if (Object.prototype.hasOwnProperty.call(GRADED, gate)) {
    var g = GRADED[gate]; g.gate = gate; g.graded = true; return g;
  }
  if (Object.prototype.hasOwnProperty.call(CLAIMED, gate)) {
    var c = CLAIMED[gate]; c.gate = gate; c.graded = false; c.type = 'claim'; return c;
  }
  return null;
}

/** Every gate the module contains — used for Progress % and Lessons Done. */
function allGates_() {
  var out = [];
  for (var g in GRADED)  if (GRADED.hasOwnProperty(g))  out.push(g);
  for (var c in CLAIMED) if (CLAIMED.hasOwnProperty(c)) out.push(c);
  return out;
}

/** Distinct lessons, as "<mod><lesson>" keys, and the gates each one owns. */
function lessonMap_() {
  var map = {};
  function add(g, spec) {
    var k = spec.mod + spec.lesson;
    if (!map[k]) map[k] = [];
    map[k].push(g);
  }
  for (var g in GRADED)  if (GRADED.hasOwnProperty(g))  add(g, GRADED[g]);
  for (var c in CLAIMED) if (CLAIMED.hasOwnProperty(c)) add(c, CLAIMED[c]);
  return map;
}

function rankFor_(xp) {
  var r = RANK_TABLE[0];
  for (var i = 0; i < RANK_TABLE.length; i++) if (xp >= RANK_TABLE[i].xp) r = RANK_TABLE[i];
  return r;
}

/**
 * Scores one submission against the key.
 *
 * @return {{ok:boolean, correct:boolean, clean:boolean, xp:number,
 *           right:number, total:number, accuracy:number, review:Array,
 *           wrong:Array, badge:string}}
 *         `ok:false` means the answer was malformed — that is a rejected
 *         request, not a wrong answer, and it must not count as an attempt.
 */
function gradeAnswer_(spec, answer) {
  switch (spec.type) {

    case 'quiz-single': {
      var i = Number(answer);
      if (!isFinite(i) || i < 0 || i >= spec.nOpts || Math.floor(i) !== i) {
        return { ok: false, error: 'BAD_ANSWER' };
      }
      var ok1 = (i === spec.correct);
      return { ok: true, correct: ok1, clean: ok1, xp: ok1 ? spec.xp : 0,
               right: ok1 ? 1 : 0, total: 1, accuracy: ok1 ? 100 : 0,
               /* Only ever confirm the option the student actually picked.
                  The key is never sent back on a wrong answer. */
               wrong: ok1 ? [] : [i] };
    }

    case 'quiz-multi': {
      if (!Array.isArray(answer)) return { ok: false, error: 'BAD_ANSWER' };
      if (answer.length === 0 || answer.length > spec.nOpts) return { ok: false, error: 'BAD_ANSWER' };
      var picked = {}, list = [];
      for (var a = 0; a < answer.length; a++) {
        var n = Number(answer[a]);
        if (!isFinite(n) || n < 0 || n >= spec.nOpts || Math.floor(n) !== n) {
          return { ok: false, error: 'BAD_ANSWER' };
        }
        if (!picked[n]) { picked[n] = true; list.push(n); }
      }
      var key = {}, k;
      for (k = 0; k < spec.correct.length; k++) key[spec.correct[k]] = true;

      var wrongPicks = [], missed = 0;
      for (k = 0; k < list.length; k++) if (!key[list[k]]) wrongPicks.push(list[k]);
      for (k = 0; k < spec.correct.length; k++) if (!picked[spec.correct[k]]) missed++;

      var allOk = (wrongPicks.length === 0 && missed === 0);
      return { ok: true, correct: allOk, clean: allOk, xp: allOk ? spec.xp : 0,
               right: allOk ? 1 : 0, total: 1, accuracy: allOk ? 100 : 0,
               /* Enough for the existing feedback wording ("some selected
                  statements are TRUE", "you missed one") without handing over
                  the answer key. */
               wrong: wrongPicks, missedCount: missed };
    }

    case 'sorter': {
      if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
        return { ok: false, error: 'BAD_ANSWER' };
      }
      var ids = [], id;
      for (id in spec.answers) if (spec.answers.hasOwnProperty(id)) ids.push(id);

      var placedWrong = [], nPlaced = 0;
      for (var s = 0; s < ids.length; s++) {
        id = ids[s];
        if (!Object.prototype.hasOwnProperty.call(answer, id)) continue;
        nPlaced++;
        if (String(answer[id]) !== spec.answers[id]) placedWrong.push(id);
      }
      if (nPlaced !== ids.length) return { ok: false, error: 'INCOMPLETE' };

      var sok = (placedWrong.length === 0);
      return { ok: true, correct: sok, clean: sok, xp: sok ? spec.xp : 0,
               right: ids.length - placedWrong.length, total: ids.length,
               accuracy: Math.round(((ids.length - placedWrong.length) / ids.length) * 100),
               /* Which tiles are in the wrong box — the student can see that
                  much on screen already. Not which box is right. */
               wrong: placedWrong };
    }

    case 'boss': {
      if (!Array.isArray(answer)) return { ok: false, error: 'BAD_ANSWER' };
      var total = spec.correct.length;
      if (answer.length !== total) return { ok: false, error: 'BAD_ANSWER' };

      var seen = {}, right = 0, review = [];
      for (var q = 0; q < answer.length; q++) {
        var item = answer[q] || {};
        var qi = Number(item.q), ai = Number(item.a);
        if (!isFinite(qi) || qi < 0 || qi >= total || Math.floor(qi) !== qi || seen[qi]) {
          return { ok: false, error: 'BAD_ANSWER' };
        }
        seen[qi] = true;
        /* -1 is the legitimate "ran out of time" answer. */
        var answered = isFinite(ai) && ai >= 0 && ai < spec.nOpts && Math.floor(ai) === ai;
        var hit = answered && (ai === spec.correct[qi]);
        if (hit) right++;
        review.push({ q: qi, a: answered ? ai : -1, ok: hit, key: spec.correct[qi] });
      }

      var acc = Math.round((right / total) * 100);
      var won = (right / total) >= spec.pass;
      var perfect = (right === total);
      return { ok: true, correct: won, clean: perfect,
               xp: won ? Math.round(spec.xp * (acc / 100)) : 0,
               right: right, total: total, accuracy: acc, perfect: perfect,
               /* The round is over and the gate is settled, so the review can
                  safely show what the right answers were. */
               review: review };
    }

    case 'claim':
      return { ok: true, correct: true, clean: true, xp: spec.xp,
               right: 1, total: 1, accuracy: 100, verified: false };
  }
  return { ok: false, error: 'BAD_GATE' };
}

/**
 * The feedback lines for the options this student actually chose.
 *
 * Scoped on purpose: returning the whole array would be the answer key all
 * over again, since the right ones are the lines that start "✅ Correct!".
 *
 * @return {Object|null} { <optionIndex>: text } for picked options only
 */
function feedbackFor_(spec, answer) {
  var table = QUIZ_FEEDBACK[spec.gate];
  if (!table) return null;

  var picked = [];
  if (spec.type === 'quiz-single') picked = [Number(answer)];
  else if (spec.type === 'quiz-multi' && Array.isArray(answer)) picked = answer.map(Number);
  else return null;

  var out = {}, n = 0;
  for (var i = 0; i < picked.length && i < 10; i++) {
    var k = picked[i];
    if (isFinite(k) && k >= 0 && k < table.length) { out[k] = table[k]; n++; }
  }
  return n ? out : null;
}

/**
 * Which badges this result has earned, given the spec.
 *
 * @param {Array} asked  badge ids the module requested. Honoured only where
 *                       the spec's claimBadges allowlist permits it, so a
 *                       tampered page cannot request whatever it likes.
 */
function badgesFor_(spec, res, firstClear, asked, firstTry) {
  var out = [];
  if (!res.correct || !firstClear) return out;
  if (spec.badgeOnClear) out.push(spec.badgeOnClear);
  /* "Clean Sort" and "Sharp Eye" both mean "no misses" — which is now checked
     against the server's own attempt count, not the page's. */
  if (spec.badgeOnPerfect && res.clean && firstTry) out.push(spec.badgeOnPerfect);
  if (spec.badgeOnClean && res.clean && firstTry) out.push(spec.badgeOnClean);
  if (spec.type === 'boss') {
    out.push('boss');
    if (res.perfect) out.push('perfect-boss');
  }
  if (Array.isArray(asked) && Array.isArray(spec.claimBadges)) {
    for (var i = 0; i < asked.length && i < 5; i++) {
      if (spec.claimBadges.indexOf(asked[i]) >= 0) out.push(asked[i]);
    }
  }
  return out;
}

/* ═══════════════════ MAINTENANCE ═══════════════════ */

/**
 * Run from the Apps Script editor after changing assets/content.js.
 * Compares this key against the gate list the module last reported at login
 * (stored in Script Properties by apiLogin_) and prints any drift.
 */
function auditAnswerKey() {
  var mine = allGates_().sort();
  var raw = PropertiesService.getScriptProperties().getProperty('AAP_CLIENT_GATES');
  var log = ['Server key holds ' + mine.length + ' gates:', '  ' + mine.join(', '), ''];

  if (!raw) {
    log.push('The module has not reported its gate list yet — sign in once as a');
    log.push('test student, then run this again.');
  } else {
    var theirs = JSON.parse(raw).sort();
    var missing = [], extra = [], i;
    for (i = 0; i < theirs.length; i++) if (mine.indexOf(theirs[i]) < 0) missing.push(theirs[i]);
    for (i = 0; i < mine.length; i++) if (theirs.indexOf(mine[i]) < 0) extra.push(mine[i]);

    log.push('Module reports ' + theirs.length + ' gates.');
    log.push(missing.length ? '❌ In the module but NOT in this key (students will be blocked): ' + missing.join(', ')
                            : '✅ Every gate in the module has a key entry.');
    log.push(extra.length ? '⚠️ In this key but not in the module (harmless, but stale): ' + extra.join(', ')
                          : '✅ No stale entries.');
  }

  var msg = log.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('Answer key audit', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return msg;
}
