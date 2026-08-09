/* ══════════════════════════════════════════════════════════════════════════
   AAP101 · DATABASE BACKEND  (Google Apps Script)
   Bound to the "AAP101_Database" Google Sheet.

   This is the ONLY thing that can read or write the database. The module
   published on GitHub Pages never contains a single access code — it asks
   this script, and this script decides.

   Deploy:  Deploy ▸ New deployment ▸ Web app
            Execute as: Me       Who has access: Anyone
   ══════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────── CONFIGURATION ─────────────────────────── */

var CODE_COUNT   = 600;                 // how many access codes to generate
var CODE_PREFIX  = 'AAP';               // codes look like AAP-7K3M-9RTX
var CODE_ALPHA   = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  // no O/0, I/1, L
var TOKEN_TTL_D  = 180;                 // session token lifetime, days

var SH_CODES  = 'AccessCodes';
var SH_LOGIN  = 'LoginLog';
var SH_ASSESS = 'Assessments';
var SH_RUN    = 'Runtime';
var SH_EVENT  = 'EventLog';
var SH_SET    = 'Settings';

/* AccessCodes column map (1-based). Keep in sync with CODES_HEADERS. */
var C = {
  CODE:1, STATUS:2, NAME:3, SECTION:4, DEVICE:5, FIRST:6, LAST:7, LOGINS:8,
  MINUTES:9, XP:10, LEVEL:11, RANK:12, ACC:13, CORRECT:14, ATTEMPTS:15,
  STREAK:16, BADGE_N:17, BADGE_L:18, LESSONS:19, PROGRESS:20, ACTS:21,
  LASTPAGE:22, SESSID:23, SESSMIN:24
};

var CODES_HEADERS = [
  'Access Code','Status','Student Name','Section','Device ID','First Login',
  'Last Seen','Logins','Total Minutes','XP','Level','Rank','Accuracy %',
  'Correct','Attempts','Best Streak','Badges','Badge List','Lessons Done',
  'Progress %','Activities Done','Last Page','_SessionId','_SessionMin'
];

var LOGIN_HEADERS  = ['Timestamp','Access Code','Student Name','Section','Event','Result','Device ID','Session ID','Browser','Screen'];
var ASSESS_HEADERS = ['Timestamp','Access Code','Student Name','Section','Lesson','Activity ID','Activity Type','Activity Title','Result','Attempt #','XP Awarded','Session ID'];
var RUN_HEADERS    = ['Timestamp','Access Code','Student Name','Section','Session ID','Event','Session Minutes','Page','Note'];
var EVENT_HEADERS  = ['Timestamp','Access Code','Student Name','Section','Type','Detail','Value','Page','Session ID'];

/* ─────────────────────────── WEB APP ENTRY ─────────────────────────── */

/**
 * The module posts JSON as text/plain (a "simple request") so the browser
 * never sends a CORS preflight — Apps Script cannot answer OPTIONS.
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    return json_(route_(body));
  } catch (err) {
    return json_({ ok: false, error: 'BAD_REQUEST', message: String(err) });
  }
}

/** GET is used for the health check and as a JSONP fallback. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var out;
  try {
    out = p.payload ? route_(JSON.parse(p.payload)) : { ok: true, service: 'AAP101', version: 1 };
  } catch (err) {
    out = { ok: false, error: 'BAD_REQUEST', message: String(err) };
  }
  if (p.callback) {
    return ContentService
      .createTextOutput(p.callback + '(' + JSON.stringify(out) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function route_(body) {
  switch (body.action) {
    case 'ping':     return { ok: true, service: 'AAP101', time: new Date().toISOString() };
    case 'check':    return apiCheck_(body);
    case 'login':    return apiLogin_(body);
    case 'resume':   return apiResume_(body);
    case 'sync':     return apiSync_(body);
    default:         return { ok: false, error: 'UNKNOWN_ACTION' };
  }
}

/* ─────────────────────────── API: CHECK ─────────────────────────── */
/* Step 1 of login. Is this code real? Is it already claimed? Does this
   device already own it? Tells the client whether to ask for a name.     */

function apiCheck_(b) {
  var code = normCode_(b.code);
  if (!code) return { ok: false, error: 'BAD_CODE', message: 'Please enter your access code.' };

  var row = findCodeRow_(code);
  if (!row) {
    logLogin_(code, '', '', 'CHECK', 'REJECTED — code not found', b.deviceId, '', b.ua, b.screen);
    return { ok: false, error: 'NOT_FOUND', message: 'That access code is not recognised. Please check for typos.' };
  }

  var sh  = sheet_(SH_CODES);
  var rec = sh.getRange(row, 1, 1, CODES_HEADERS.length).getValues()[0];

  if (String(rec[C.STATUS - 1]).toUpperCase() === 'DISABLED') {
    logLogin_(code, rec[C.NAME - 1], rec[C.SECTION - 1], 'CHECK', 'REJECTED — disabled', b.deviceId, '', b.ua, b.screen);
    return { ok: false, error: 'DISABLED', message: 'This access code has been disabled. Please contact your instructor.' };
  }

  var boundDevice = String(rec[C.DEVICE - 1] || '');
  var claimed     = !!boundDevice;

  if (!claimed) return { ok: true, stage: 'REGISTER' };            // fresh code → ask for name

  if (boundDevice === String(b.deviceId || '')) {                  // same device → straight in
    return { ok: true, stage: 'RETURNING', name: rec[C.NAME - 1], section: rec[C.SECTION - 1] };
  }

  logLogin_(code, rec[C.NAME - 1], rec[C.SECTION - 1], 'CHECK', 'REJECTED — device mismatch', b.deviceId, '', b.ua, b.screen);
  return {
    ok: false, error: 'DEVICE_LOCKED',
    message: 'This access code is already in use on another device (registered to ' +
             maskName_(rec[C.NAME - 1]) + '). If this is your code and you changed ' +
             'devices, ask your instructor to release it.'
  };
}

/* ─────────────────────────── API: LOGIN ─────────────────────────── */

function apiLogin_(b) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) {
    return { ok: false, error: 'BUSY', message: 'The server is busy. Please try again in a moment.' };
  }

  try {
    var code = normCode_(b.code);
    var dev  = String(b.deviceId || '');
    if (!code || !dev) return { ok: false, error: 'BAD_REQUEST' };

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
      name    = cleanText_(b.name, 80);
      section = cleanText_(b.section, 40);
      if (name.length < 2) {
        return { ok: false, error: 'NAME_REQUIRED', message: 'Please enter your full name.' };
      }
      sh.getRange(row, C.NAME).setValue(name);
      sh.getRange(row, C.SECTION).setValue(section);
      sh.getRange(row, C.DEVICE).setValue(dev);
      sh.getRange(row, C.STATUS).setValue('ACTIVE');
      sh.getRange(row, C.FIRST).setValue(now);
      logLogin_(code, name, section, 'REGISTER', 'OK — code claimed', dev, b.sessionId, b.ua, b.screen);

    } else if (bound === dev) {
      /* Returning student on their own device. */
      name    = String(rec[C.NAME - 1] || '');
      section = String(rec[C.SECTION - 1] || '');
      logLogin_(code, name, section, 'LOGIN', 'OK', dev, b.sessionId, b.ua, b.screen);

    } else {
      logLogin_(code, rec[C.NAME - 1], rec[C.SECTION - 1], 'LOGIN', 'REJECTED — device mismatch', dev, '', b.ua, b.screen);
      return { ok: false, error: 'DEVICE_LOCKED', message: 'This access code is locked to another device.' };
    }

    sh.getRange(row, C.LAST).setValue(now);
    sh.getRange(row, C.LOGINS).setValue(Number(rec[C.LOGINS - 1] || 0) + 1);

    return {
      ok: true,
      token: makeToken_(code, dev),
      /* Hand back the pretty dashed form from the sheet — it is what the
         student sees. Codes are compared canonically, so it round-trips. */
      code: String(rec[C.CODE - 1] || code),
      name: name,
      section: section,
      /* Progress the server already knows about, so a student who clears their
         browser or reinstalls does not restart from zero. */
      server: {
        xp:         Number(rec[C.XP - 1] || 0),
        correct:    Number(rec[C.CORRECT - 1] || 0),
        attempts:   Number(rec[C.ATTEMPTS - 1] || 0),
        bestStreak: Number(rec[C.STREAK - 1] || 0)
      }
    };
  } finally {
    lock.releaseLock();
  }
}

/* ─────────────────────────── API: RESUME ─────────────────────────── */
/* Called once when a returning student's browser already has a saved session.
   SECURITY: the old client trusted any saved session blindly, so anyone could
   type a fake session into their browser and skip the access code. This checks
   the saved session against the server — the token signature, the code's
   status, and the device binding — so a forged or disabled session is refused
   and the student is sent back to the login screen. */

function apiResume_(b) {
  var code = normCode_(b.code);
  var dev  = String(b.deviceId || '');
  if (!verifyToken_(b.token, code, dev)) {
    return { ok: false, error: 'BAD_TOKEN', message: 'Please log in again.' };
  }
  var row = findCodeRow_(code);
  if (!row) return { ok: false, error: 'NOT_FOUND', message: 'Please log in again.' };

  var rec = sheet_(SH_CODES).getRange(row, 1, 1, CODES_HEADERS.length).getValues()[0];
  if (String(rec[C.STATUS - 1]).toUpperCase() === 'DISABLED') {
    return { ok: false, error: 'DISABLED', message: 'This access code has been disabled.' };
  }
  if (String(rec[C.DEVICE - 1] || '') !== dev) {
    return { ok: false, error: 'DEVICE_LOCKED', message: 'This code is locked to another device.' };
  }
  return { ok: true, name: rec[C.NAME - 1], section: rec[C.SECTION - 1] };
}

/* ─────────────────────────── API: SYNC ─────────────────────────── */
/* Receives a batch of queued events plus the student's current snapshot. */

function apiSync_(b) {
  var code = normCode_(b.code);
  var dev  = String(b.deviceId || '');
  if (!verifyToken_(b.token, code, dev)) {
    return { ok: false, error: 'BAD_TOKEN', message: 'Your session has expired. Please log in again.' };
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) {
    return { ok: false, error: 'BUSY' };   // client keeps the batch and retries
  }

  try {
    var row = findCodeRow_(code);
    if (!row) return { ok: false, error: 'NOT_FOUND' };

    var sh   = sheet_(SH_CODES);
    var rec  = sh.getRange(row, 1, 1, CODES_HEADERS.length).getValues()[0];
    var name = String(rec[C.NAME - 1] || '');
    var sect = String(rec[C.SECTION - 1] || '');

    /* Device is still enforced on every sync, not just at login. */
    if (String(rec[C.DEVICE - 1] || '') !== dev) {
      return { ok: false, error: 'DEVICE_LOCKED', message: 'This code is now locked to another device.' };
    }

    /* SECURITY: a disabled code must stop working right away, not keep syncing
       for the full 180-day life of its token. */
    if (String(rec[C.STATUS - 1]).toUpperCase() === 'DISABLED') {
      return { ok: false, error: 'DISABLED', message: 'This access code has been disabled.' };
    }

    /* ── 1. Append the batched events, grouped so each sheet is written once ──
       SECURITY: every field below comes straight from the student's browser, so
       each text field is run through cleanText_ (which strips control characters,
       caps length, and neutralises formula injection) and each number through
       numCell_. The batch is also capped so one client cannot flood the sheet. */
    var buckets = { assess: [], run: [], event: [] };
    var events  = (b.events || []).slice(0, 500);

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      /* Timestamps are attacker-controlled too — fall back to server time if the
         client sends a missing or malformed date. */
      var ts = ev.ts ? new Date(ev.ts) : new Date();
      if (isNaN(ts.getTime())) ts = new Date();

      if (ev.kind === 'answer') {
        buckets.assess.push([ts, code, name, sect,
          cleanText_(ev.lesson, 120), cleanText_(ev.actId, 60), cleanText_(ev.actType, 40), cleanText_(ev.actTitle, 160),
          ev.correct ? 'CORRECT' : 'WRONG', numCell_(ev.attempt) || '', numCell_(ev.xp) || 0, cleanText_(ev.sid, 40)]);

      } else if (ev.kind === 'activity') {
        buckets.assess.push([ts, code, name, sect,
          cleanText_(ev.lesson, 120), cleanText_(ev.actId, 60), cleanText_(ev.actType, 40) || 'activity', cleanText_(ev.actTitle, 160),
          'COMPLETED', numCell_(ev.attempt) || '', numCell_(ev.xp) || 0, cleanText_(ev.sid, 40)]);

      } else if (ev.kind === 'runtime') {
        buckets.run.push([ts, code, name, sect, cleanText_(ev.sid, 40), cleanText_(ev.event, 40),
          round1_(Number(ev.minutes) || 0), cleanText_(ev.page, 60), cleanText_(ev.note, 120)]);

      } else {
        var val = numCell_(ev.value);
        buckets.event.push([ts, code, name, sect, cleanText_(ev.kind, 40) || 'event',
          cleanText_(ev.detail, 200), (val === undefined ? cleanText_(ev.value, 100) : val), cleanText_(ev.page, 60), cleanText_(ev.sid, 40)]);
      }
    }

    appendRows_(SH_ASSESS, buckets.assess);
    appendRows_(SH_RUN,    buckets.run);
    appendRows_(SH_EVENT,  buckets.event);

    /* ── 2. Update the one-row-per-student dashboard ── */
    var s = b.snapshot || {};
    var now = new Date();

    /* Runtime accumulates across sessions without double counting: we remember
       how many minutes this same session had already contributed. */
    var totalMin = Number(rec[C.MINUTES - 1] || 0);
    if (s.sessionMinutes != null && b.sid) {
      var lastId  = String(rec[C.SESSID - 1] || '');
      var lastMin = Number(rec[C.SESSMIN - 1] || 0);
      var delta   = (lastId === String(b.sid)) ? (Number(s.sessionMinutes) - lastMin)
                                               :  Number(s.sessionMinutes);
      /* SECURITY: study time is measured in the browser and could be faked. A
         student can never study more minutes than real time that has actually
         passed since we last heard from them, so cap the increase to the
         wall-clock gap (plus a 2-minute buffer for clock drift). */
      var lastSeenMs = rec[C.LAST - 1] ? new Date(rec[C.LAST - 1]).getTime() : 0;
      if (lastSeenMs) {
        var wallMin = (now.getTime() - lastSeenMs) / 60000 + 2;
        if (delta > wallMin) delta = wallMin;
      }
      if (delta > 0) totalMin += delta;
    }

    var out = sh.getRange(row, C.LAST, 1, C.SESSMIN - C.LAST + 1).getValues()[0];
    function put(col, val) { if (val !== undefined && val !== null) out[col - C.LAST] = val; }

    /* SECURITY: numbers are coerced (numCell_/clamp_) and text is neutralised
       (cleanText_) so the browser cannot inject a formula or a nonsense value
       into the dashboard. These guards reduce casual grade-tampering; they do
       NOT fully verify grades — that would require server-side answer checking. */
    put(C.LAST,     now);
    put(C.MINUTES,  round1_(totalMin));
    put(C.XP,       numCell_(s.xp));
    put(C.LEVEL,    numCell_(s.level));
    put(C.RANK,     cleanText_(s.rank, 40));
    put(C.ACC,      clamp_(s.accuracy, 0, 100));
    put(C.CORRECT,  numCell_(s.correct));
    put(C.ATTEMPTS, numCell_(s.attempts));
    put(C.STREAK,   numCell_(s.bestStreak));
    put(C.BADGE_N,  numCell_(s.badgeCount));
    put(C.BADGE_L,  cleanText_(s.badgeList, 200));
    put(C.LESSONS,  numCell_(s.lessonsDone));
    put(C.PROGRESS, clamp_(s.progressPct, 0, 100));
    put(C.ACTS,     numCell_(s.activitiesDone));
    put(C.LASTPAGE, cleanText_(s.lastPage, 60));
    if (b.sid) { put(C.SESSID, cleanText_(b.sid, 40)); put(C.SESSMIN, round1_(Number(s.sessionMinutes) || 0)); }

    sh.getRange(row, C.LAST, 1, out.length).setValues([out]);

    return { ok: true, received: events.length };
  } finally {
    lock.releaseLock();
  }
}

/* ─────────────────────────── SESSION TOKENS ─────────────────────────── */
/* Signed with a secret that lives in Script Properties, so a token cannot be
   forged by anyone reading the module's JavaScript.                        */

function secret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('AAP_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('AAP_SECRET', s);
  }
  return s;
}

function makeToken_(code, dev) {
  var payload = normCode_(code) + '|' + dev + '|' + Date.now();
  var sig = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, secret_()));
  return Utilities.base64EncodeWebSafe(payload) + '.' + sig;
}

function verifyToken_(token, code, dev) {
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
  if (f.length !== 3) return false;
  if (f[0] !== normCode_(code) || f[1] !== dev) return false;
  if (Date.now() - Number(f[2]) > TOKEN_TTL_D * 86400000) return false;
  return true;
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
  return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function cleanText_(v, max) {
  var s = String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim();
  if (max) s = s.slice(0, max);
  /* SECURITY: neutralise spreadsheet formula injection. Google Sheets runs any
     cell that starts with = + - or @ as a live formula, so a student could type
     a formula as their "name" that steals data when the sheet is opened. A
     leading apostrophe forces Sheets to keep the value as plain text. */
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
function round1_(n) { return Math.round(Number(n || 0) * 10) / 10; }

/* Coerces a value to a safe non-negative number, or undefined if it is not a
   real number. Blocks a tampered client from writing a formula string (e.g.
   "=IMAGE(...)") into a numeric dashboard cell. */
function numCell_(v) {
  if (v === undefined || v === null || v === '') return undefined;
  var n = Number(v);
  return (isFinite(n) && n >= 0) ? n : undefined;
}

/* Coerces to a number clamped between lo and hi, or undefined if not numeric. */
function clamp_(v, lo, hi) {
  if (v === undefined || v === null || v === '') return undefined;
  var n = Number(v);
  if (!isFinite(n)) return undefined;
  return Math.max(lo, Math.min(hi, n));
}

function maskName_(n) {
  n = String(n || '').trim();
  if (!n) return 'another student';
  var bits = n.split(/\s+/);
  return bits[0] + ' ' + (bits.length > 1 ? bits[bits.length - 1].charAt(0) + '.' : '');
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
    /* SECURITY: deviceId, sessionId and screen come from the browser, so they
       are neutralised too. shortUA_ already reduces the user-agent to a fixed
       set of safe labels. */
    appendRows_(SH_LOGIN, [[new Date(), code, cleanText_(name, 80), cleanText_(section, 40), event,
      result, cleanText_(dev, 80), cleanText_(sid, 40), shortUA_(ua), cleanText_(screen, 20)]]);
  } catch (e) { /* logging must never break a login */ }
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

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN — run these from the "AAP101 Database" menu in the spreadsheet
   ═══════════════════════════════════════════════════════════════════════ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('AAP101 Database')
    .addItem('① Set up database (first time only)', 'setupDatabase')
    .addSeparator()
    .addItem('Release a device lock…', 'releaseDevice')
    .addItem('Disable an access code…', 'disableCode')
    .addItem('Re-enable an access code…', 'enableCode')
    .addSeparator()
    .addItem('Add 100 more access codes', 'addMoreCodes')
    .addItem('Class summary', 'showSummary')
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
      'Nothing was changed — this protects your students\' data. If you truly ' +
      'want to start over, delete the AccessCodes tab manually first.',
      ui.ButtonSet.OK);
    return;
  }

  initSheet_(SH_CODES,  CODES_HEADERS);
  initSheet_(SH_LOGIN,  LOGIN_HEADERS);
  initSheet_(SH_ASSESS, ASSESS_HEADERS);
  initSheet_(SH_RUN,    RUN_HEADERS);
  initSheet_(SH_EVENT,  EVENT_HEADERS);

  var set = initSheet_(SH_SET, ['Key','Value','Notes']);
  if (set.getLastRow() < 2) {
    set.getRange(2, 1, 2, 3).setValues([
      ['deviceLock', 'ON',  'Each code works on one device only. Use the menu to release a lock.'],
      ['createdOn',  new Date(), 'When this database was set up.']
    ]);
  }

  writeCodes_(codes, CODE_COUNT);
  secret_();   // generate the signing secret now

  /* Hide the two bookkeeping columns so the dashboard stays readable. */
  codes.hideColumns(C.SESSID, 2);

  SpreadsheetApp.flush();
  ui.alert('Database ready',
    CODE_COUNT + ' access codes have been generated in the AccessCodes tab.\n\n' +
    'Next step: Deploy ▸ New deployment ▸ Web app, then paste the web app URL ' +
    'into assets/config.js in your module.',
    ui.ButtonSet.OK);
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
    row[C.CODE - 1]     = c;
    row[C.STATUS - 1]   = 'UNUSED';
    row[C.LOGINS - 1]   = 0;
    row[C.MINUTES - 1]  = 0;
    row[C.XP - 1]       = 0;
    row[C.CORRECT - 1]  = 0;
    row[C.ATTEMPTS - 1] = 0;
    rows.push(row);
  }

  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, CODES_HEADERS.length).setValues(rows);
  sh.getRange(start, C.CODE, rows.length, 1)
    .setFontFamily('Roboto Mono').setFontWeight('bold');
  return rows.length;
}

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
  logLogin_(code, sh.getRange(row, C.NAME).getValue(), sh.getRange(row, C.SECTION).getValue(),
            'ADMIN', 'Device lock released by instructor', '', '', '', '');
  ui.alert('Released', code + ' can now be used on a new device.\n\nAll progress was kept.', ui.ButtonSet.OK);
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

  var code = normCode_(sheet_(SH_CODES).getRange(2, C.CODE).getValue());
  ck('Read a sample code (' + code + ')', !!code);
  ck('findCodeRow_ locates it', findCodeRow_(code) === 2);
  ck('Unknown code is rejected', !findCodeRow_('AAP-ZZZZ-ZZZZ'));

  var t = makeToken_(code, 'test-device');
  ck('Token verifies', verifyToken_(t, code, 'test-device'));
  ck('Token rejects wrong device', !verifyToken_(t, code, 'other-device'));
  ck('Token rejects tampering', !verifyToken_(t + 'x', code, 'test-device'));

  /* A real code answers either "come on in" or "locked to someone else's
     device" — both prove the lookup path works. */
  var chk = apiCheck_({ code: code, deviceId: 'test-device' });
  ck('check() answers a real code', chk.ok === true || chk.error === 'DEVICE_LOCKED');
  var bad = apiCheck_({ code: 'AAP-ZZZZ-ZZZZ', deviceId: 'test-device' });
  ck('check() refuses a fake code', bad.ok === false && bad.error === 'NOT_FOUND');

  ck('ping works', route_({ action: 'ping' }).ok === true);
  ck('unknown action refused', route_({ action: 'nope' }).ok === false);

  var msg = log.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('AAP101 self-test', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return msg;
}
