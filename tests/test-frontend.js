/* Front-end checks: does the published bundle still contain anything a
   student could use to answer, unlock or score without the server? */
const fs = require('fs');
const vm = require('vm');

let pass = 0, fail = 0; const failures = [];
function ok(l, c, x) {
  if (c) { pass++; console.log('  ✅ ' + l); }
  else { fail++; failures.push(l); console.log('  ❌ ' + l + (x !== undefined ? '  → ' + JSON.stringify(x).slice(0, 300) : '')); }
}
function head(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 60 - t.length))); }

const content = fs.readFileSync('assets/content.js', 'utf8');
const app     = fs.readFileSync('assets/app.js', 'utf8');
const auth    = fs.readFileSync('assets/auth.js', 'utf8');
const bundle  = content + '\n' + app + '\n' + auth;

/* Load content.js the way a browser would. */
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(content + '\n;globalThis.CONTENT=CONTENT;globalThis.BADGES=BADGES;globalThis.RANKS=RANKS;', ctx);

function everyBlock(fn) {
  ['m', 'f'].forEach(k => (ctx.CONTENT[k].lessons || []).forEach(les => {
    (function walk(bs) { (bs || []).forEach(b => { if (b.blocks) walk(b.blocks); fn(b, les); }); })(les.blocks);
  }));
}

head('NO ANSWER KEY REACHES THE BROWSER');
{
  let correct = 0, answer = 0, fb = 0, gates = 0, quizzes = 0, sorters = 0, bosses = 0;
  everyBlock(b => {
    if (b.gate) gates++;
    if (b.t === 'quiz')   { quizzes++; b.opts.forEach(o => { if ('correct' in o) correct++; if ('fb' in o) fb++; }); }
    if (b.t === 'sorter') { sorters++; b.items.forEach(i => { if ('answer' in i) answer++; }); }
    if (b.t === 'boss')   { bosses++; b.questions.forEach(q => { if ('correct' in q) correct++; }); }
  });
  ok('F-01 no quiz option carries a `correct` flag', correct === 0, correct);
  ok('F-02 no sorter item carries an `answer`', answer === 0, answer);
  ok('F-03 no quiz option carries feedback text', fb === 0, fb);
  ok('F-04 content.js never says "Correct!"', !/Correct!/.test(content));
  ok('F-05 the questions themselves are all still there',
     quizzes === 4 && sorters === 2 && bosses === 2 && gates === 22,
     { quizzes, sorters, bosses, gates });
  ok('F-06 every quiz option text survived', (() => {
    let n = 0; everyBlock(b => { if (b.t === 'quiz') b.opts.forEach(o => { if (o.txt) n++; }); }); return n === 24;
  })());
  ok('F-07 every boss question and its options survived', (() => {
    let q = 0, o = 0;
    everyBlock(b => { if (b.t === 'boss') b.questions.forEach(x => { q++; o += x.opts.length; }); });
    return q === 18 && o === 72;
  })());
}

head('THE ENGINE CANNOT SCORE OR AWARD BY ITSELF');
{
  ok('F-10 Game.awardXP is gone', !/\bawardXP\s*\(/.test(app));
  ok('F-11 Game.giveBadge is gone', !/\bgiveBadge\s*\(/.test(app));
  ok('F-12 nothing in app.js increments S.xp', !/S\.xp\s*\+=/.test(app), (app.match(/S\.xp\s*\+=/g) || []));
  ok('F-13 nothing in app.js increments S.correct/S.attempts',
     !/S\.(correct|attempts)\s*\+\+/.test(app));
  ok('F-14 S.badges is never pushed to', !/S\.badges\.push/.test(app));
  ok('F-15 every gate clear is guarded by a server verdict', (() => {
    /* passGate() only repaints the screen now, but it must still never fire
       except in response to the server saying "correct". Every call site has
       to sit inside a Grade.submit(...).then(res => ...) callback AND behind a
       guard derived from res.correct. */
    const lines = app.split('\n');
    const bad = [];
    lines.forEach((l, i) => {
      if (!/passGate\(/.test(l)) return;
      if (/function passGate/.test(l) || /window\.passGate/.test(l)) return;

      // inline form:  .then(res => { if(res && res.correct) passGate(...) })
      if (/res\s*&&\s*res\.correct/.test(l)) return;

      // block form: a res.correct-derived guard within 8 lines above, and the
      // Grade.submit that produced `res` within 80.
      const near = lines.slice(Math.max(0, i - 8), i).join('\n');
      const far  = lines.slice(Math.max(0, i - 80), i).join('\n');
      const guarded = /if\s*\(\s*res\.correct\s*\)/.test(near) || /if\s*\(\s*won\s*\)/.test(near);
      const fromServer = /Grade\.submit\(/.test(far) && /\.then\(res\s*=>/.test(far);
      if (guarded && fromServer) return;

      bad.push((i + 1) + ': ' + l.trim());
    });
    return bad.length === 0 || bad;
  })() === true);
  ok('F-15b `won` is defined from the server verdict, never computed locally',
     /const won\s*=\s*!!res\.correct/.test(app) && !/const won\s*=\s*acc\s*>=/.test(app));
  ok('F-16 Grade.submit is the only path to AAPAuth.grade',
     (app.match(/AAPAuth\.grade\(/g) || []).length === 1);
  ok('F-17 the quiz renderer emits an empty response bubble',
     /class="qz-resp"><\/div>/.test(app));
}

head('THE TELEMETRY SNAPSHOT NO LONGER CLAIMS AUTHORITY');
{
  const snap = auth.slice(auth.indexOf('snapshot()'), auth.indexOf('snapshot()') + 400);
  ['xp', 'level', 'rank', 'accuracy', 'correct', 'attempts', 'bestStreak',
   'badgeCount', 'badgeList', 'lessonsDone', 'progressPct', 'activitiesDone']
    .forEach(f => ok('F-20 snapshot no longer sends ' + f, !new RegExp('\\b' + f + '\\s*:').test(snap)));
  ok('F-21 snapshot still sends session minutes and page', /sessionMinutes/.test(snap) && /lastPage/.test(snap));
  ok('F-22 the console tamper handle is behind DEBUG',
     /if \(CFG\.DEBUG\)[\s\S]{0,120}_debug/.test(auth));
  ok('F-23 _debug is not attached unconditionally', !/^\s*_debug:/m.test(auth));
}

head('SERVER STATE IS APPLIED, NOT MERGED');
{
  ok('F-30 applyServerState overwrites gates wholesale', /S\.gates = \{\};/.test(auth));
  ok('F-31 applyServerState overwrites badges wholesale', /S\.badges = \(state\.badges \|\| \[\]\)/.test(auth));
  ok('F-32 boot() renders server state', /AAPAuth\.applyState\(\)/.test(app));
  ok('F-33 login stores the authoritative state', /state: res\.state/.test(auth));
  ok('F-34 sync applies the state it gets back', /if \(res\.state\) applyServerState\(res\.state\)/.test(auth));
  ok('F-35 the module reports its gate list for the key audit', /gates: allGateIds\(\)/.test(auth));
}

head('BOSS ROUND SUBMITS ORIGINAL QUESTION INDICES');
{
  ok('F-40 questions are tagged before shuffling', /_i: i/.test(app));
  ok('F-41 picks carry the original index', /q: questions\[qi\]\._i/.test(app));
  ok('F-42 the round no longer reveals the key mid-round', !/btns\[q\.correct\]/.test(app));
  ok('F-43 the review is rendered from the server reply', /res\.review \|\| \[\]/.test(app));
}

head('SYNTAX + WIRING');
{
  ['assets/app.js', 'assets/auth.js', 'assets/content.js', 'assets/config.js'].forEach(f => {
    let good = true;
    try { new (require('vm').Script)(fs.readFileSync(f, 'utf8')); } catch (e) { good = false; }
    ok('F-50 ' + f + ' parses', good);
  });
  const idx = fs.readFileSync('index.html', 'utf8');
  ok('F-51 index.html still loads all four scripts',
     ['config.js', 'content.js', 'app.js', 'auth.js'].every(f => idx.includes('assets/' + f)));
  ok('F-52 auth.js loads last (it decorates the engine)',
     idx.indexOf('assets/auth.js') > idx.indexOf('assets/app.js'));
  ok('F-53 no leftover reference to the removed helpers',
     !/Game\.checkScholar|ansMap|correctIdx|badgeOnDone/.test(app));
  ok('F-54 the review + checking styles exist',
     /\.boss-review\{/.test(fs.readFileSync('assets/styles.css', 'utf8')) &&
     /\.block\.checking/.test(fs.readFileSync('assets/styles.css', 'utf8')));
}

head('NOTHING SENSITIVE IS PUBLISHED');
{
  ok('F-60 index.txt is no longer in the repo tree', !fs.existsSync('index.txt'));
  ok('F-61 archive/ is git-ignored', /archive\//.test(fs.readFileSync('.gitignore', 'utf8')));

  /* GitHub Pages serves every file in the repo. The answer key lives in a .gs
     file inside this repo, so the ONLY thing keeping it off the public web is
     Jekyll's exclusion. Treat that config as a security control. */
  const cfg = fs.existsSync('_config.yml') ? fs.readFileSync('_config.yml', 'utf8') : '';
  ok('F-64 the Apps Script folder is underscore-prefixed (Jekyll skips it)',
     fs.existsSync('_apps-script/AnswerKey.gs') && !fs.existsSync('google-apps-script'));
  ok('F-65 _config.yml also excludes it by name', /_apps-script\//.test(cfg));
  ok('F-66 _config.yml excludes the tests (they contain answers)', /tests\//.test(cfg));
  ok('F-67 no .nojekyll file — it would switch the exclusions off',
     !fs.existsSync('.nojekyll'));
  ok('F-68 the answer key really does hold the answers (so this matters)',
     /correct:\s*\[?\d/.test(fs.readFileSync('_apps-script/AnswerKey.gs', 'utf8')));
  ok('F-62 the spreadsheet id is not in any published file',
     !/1bnztuQXhjR1SFwOnM2cFSJKefZB/.test(
       fs.readFileSync('SETUP_GUIDE.md', 'utf8') + fs.readFileSync('README.md', 'utf8') + bundle));
  ok('F-63 the "disable the gate" recipe is gone from the guide',
     !/access control disabled/.test(fs.readFileSync('SETUP_GUIDE.md', 'utf8')));
}

console.log('\n' + '═'.repeat(66));
console.log('  ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\n  Failing:'); failures.forEach(f => console.log('   • ' + f)); }
console.log('═'.repeat(66));
process.exit(fail ? 1 : 0);
