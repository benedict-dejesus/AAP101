/* ══════════════════════════════════════════════════════════════════════════
   Apps Script harness.

   Stubs just enough of the Google Apps Script runtime (SpreadsheetApp,
   Utilities, CacheService, LockService, PropertiesService) to run the REAL
   google-apps-script/Code.gs + AnswerKey.gs against an in-memory spreadsheet.

   Nothing here touches the production sheet — this is an empty sheet built
   fresh for each run.
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const path = require('path');

function makeSheet(name) {
  const cells = [];            // cells[r][c], 0-indexed
  const meta = { hidden: [] };

  /* Grows the backing store. WRITES ONLY.
     getValues() must never call this: in real Sheets, reading a range beyond
     the used area returns blanks and changes nothing. If reads allocated here,
     a read-only audit would look like it had written to the sheet — and, worse,
     a genuine stray write would be indistinguishable from a read. */
  function ensure(r, c) {
    while (cells.length <= r) cells.push([]);
    const row = cells[r];
    while (row.length <= c) row.push('');
  }

  /** Non-mutating read. Out-of-range cells read as blank, as they do in Sheets. */
  function peek(r, c) {
    const row = cells[r];
    if (!row) return '';
    const v = row[c];
    return v === undefined ? '' : v;
  }

  const sheet = {
    getName: () => name,
    getLastRow: () => {
      let last = 0;
      for (let r = 0; r < cells.length; r++) {
        if ((cells[r] || []).some(v => v !== '' && v != null)) last = r + 1;
      }
      return last;
    },
    getLastColumn: () => {
      let last = 0;
      for (const row of cells) {
        for (let c = row.length - 1; c >= 0; c--) {
          if (row[c] !== '' && row[c] != null) { last = Math.max(last, c + 1); break; }
        }
      }
      return last;
    },
    getRange(r, c, nr, nc) {
      nr = nr == null ? 1 : nr;
      nc = nc == null ? 1 : nc;
      const range = {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = [];
            for (let j = 0; j < nc; j++) row.push(peek(r - 1 + i, c - 1 + j));
            out.push(row);
          }
          return out;
        },
        setValues(v) {
          for (let i = 0; i < v.length; i++) {
            for (let j = 0; j < v[i].length; j++) {
              ensure(r - 1 + i, c - 1 + j);
              cells[r - 1 + i][c - 1 + j] = v[i][j];
            }
          }
          return range;
        },
        getValue() { return range.getValues()[0][0]; },
        setValue(v) { return range.setValues([[v]]); },
        setFontWeight: () => range, setBackground: () => range,
        setFontColor: () => range, setVerticalAlignment: () => range,
        setFontFamily: () => range, setNumberFormat: () => range
      };
      return range;
    },
    setFrozenRows: () => sheet, setRowHeight: () => sheet,
    autoResizeColumn: () => sheet,
    hideColumns: (start, n) => { meta.hidden.push([start, n]); return sheet; },
    _cells: cells, _meta: meta
  };
  return sheet;
}

function makeRuntime() {
  const sheets = {};
  const props = {};
  const cache = {};
  const logs = [];

  const spreadsheet = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = makeSheet(n))
  };

  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      flush: () => {},
      getUi: () => { throw new Error('no UI in headless mode'); }
    },
    ContentService: {
      MimeType: { JSON: 'JSON', JAVASCRIPT: 'JS' },
      createTextOutput: t => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } })
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      base64EncodeWebSafe: b => {
        const buf = Buffer.isBuffer(b) ? b
          : Array.isArray(b) ? Buffer.from(b.map(x => x & 0xff))
          : Buffer.from(String(b), 'utf8');
        return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
      },
      base64DecodeWebSafe: s =>
        Array.from(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
      computeHmacSha256Signature: (msg, key) =>
        Array.from(crypto.createHmac('sha256', String(key)).update(String(msg), 'utf8').digest()),
      newBlob: bytes => ({
        getDataAsString: () => Buffer.from(bytes.map(x => x & 0xff)).toString('utf8')
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); }
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: k => (k in cache ? cache[k] : null),
        put: (k, v) => { cache[k] = String(v); },
        remove: k => { delete cache[k]; }
      })
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => true, releaseLock: () => {} })
    },
    Logger: { log: m => logs.push(String(m)) }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const dir = process.env.AAP_GS_DIR || '_apps-script';
  for (const f of ['AnswerKey.gs', 'Code.gs']) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  }

  return { ctx, sheets, props, cache, logs, spreadsheet,
           resetCache: () => { for (const k in cache) delete cache[k]; } };
}

module.exports = { makeRuntime, makeSheet };
