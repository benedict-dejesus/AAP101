/* ══════════════════════════════════════════════════════════════════════════
   Browser harness.

   Stubs just enough of a browser (DOM, localStorage, fetch) to run the REAL
   assets/config.js + content.js + app.js + auth.js, and wires `fetch` straight
   into a gas-harness backend so the published module talks to the real
   Code.gs / AnswerKey.gs.

   This is what lets a test assert what the module actually SENDS, rather than
   grepping the source for a string that looks about right.
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

/** A DOM node stub that survives everything app.js does to one. */
function fakeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    children: [], dataset: {}, style: {},
    textContent: '', innerHTML: '', className: '', id: '',
    disabled: false, offsetWidth: 100, offsetHeight: 40,
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (on) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { el.children.push(c); return c; },
    insertBefore(c) { el.children.push(c); return c; },
    removeChild(c) { return c; },
    remove() {},
    setAttribute() {}, getAttribute() { return ''; },
    querySelector() { return fakeEl('div'); },
    querySelectorAll() { return []; },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40 }; },
    scrollIntoView() {}, focus() {}, blur() {}, click() {},
    getContext() { return null; }
  };
  Object.defineProperty(el, 'parentNode', { get: () => fakeEl('div') });
  return el;
}

/**
 * @param {object} backend  a gas-harness runtime (its ctx must expose route_)
 * @param {object} [opts]   { debug:true } to expose AAPAuth._debug
 * @returns {object} the vm context — `S`, `Grade`, `AAPAuth`, `CONTENT` etc.
 */
function makeBrowser(backend, opts) {
  opts = opts || {};
  const store = {};
  const sent = [];               // every request body the module posted

  const doc = {
    readyState: 'complete',
    visibilityState: 'visible',
    body: fakeEl('body'),
    documentElement: fakeEl('html'),
    head: fakeEl('head'),
    addEventListener() {}, removeEventListener() {},
    createElement: t => fakeEl(t),
    createTextNode: () => fakeEl('text'),
    querySelector: () => fakeEl('div'),
    querySelectorAll: () => [],
    getElementById: () => null
  };

  const ctx = {
    console, JSON, Math, Date, Promise, Set, Map, WeakMap, Object, Array, String,
    Number, Boolean, Error, RegExp, isFinite, isNaN, parseInt, parseFloat, encodeURIComponent,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: fn => setTimeout(() => fn(Date.now()), 0),
    cancelAnimationFrame: clearTimeout,
    document: doc,
    navigator: { userAgent: 'Mozilla/5.0 Chrome/120 (harness)', onLine: true,
                 sendBeacon: () => true },
    crypto: require('crypto').webcrypto || require('crypto'),
    Blob: function Blob(parts) { this.parts = parts; this.size = 0; },
    screen: { width: 390, height: 844 },
    location: { href: 'https://example.test/', reload() {} },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
      clear: () => { for (const k in store) delete store[k]; }
    },

    /* The transport. Nothing leaves the process: the body goes straight into
       the real route_() and the reply comes back as a fetch-shaped Response. */
    fetch: (url, init) => {
      let body;
      try { body = JSON.parse(init && init.body); }
      catch (e) { return Promise.reject(new Error('BAD_BODY')); }
      sent.push(body);
      let reply;
      try { reply = backend.ctx.route_(body); }
      catch (e) { return Promise.reject(e); }
      const text = JSON.stringify(reply);
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(text) });
    }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);

  const root = path.resolve(__dirname, '..');
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/config.js'), 'utf8'), ctx, { filename: 'config.js' });
  if (opts.debug) vm.runInContext('window.AAP_CONFIG.DEBUG = true;', ctx);
  for (const f of ['assets/content.js', 'assets/app.js', 'assets/auth.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: path.basename(f) });
  }
  /* Lift the engine's lexical declarations onto the context so tests can see
     them, exactly as the browser's script scope does. */
  vm.runInContext(
    'globalThis.S = S; globalThis.Grade = Grade; globalThis.Game = Game;' +
    'globalThis.CONTENT = CONTENT; globalThis.CONT_REQS = CONT_REQS;' +
    'globalThis.registerRequirements = registerRequirements;' +
    'globalThis.passGate = passGate;', ctx);

  ctx.registerRequirements();     // boot() does this before applying state
  ctx.S.sound = false;            // no AudioContext in node

  return { ctx, sent, store };
}

/**
 * Signs a harness student in and hands the module a live session.
 *
 * The device id has to be the module's own — assets/auth.js mints one per
 * browser and the server binds the code to it, so registering under any other
 * id makes every later request come back DEVICE_LOCKED.
 */
function signIn(backend, browser, code, _dev, name) {
  const dbgEarly = browser.ctx.AAPAuth._debug;
  if (!dbgEarly) throw new Error('makeBrowser needs { debug: true } to sign a student in');
  const dev = dbgEarly.deviceId();
  const lg = backend.ctx.apiLogin_({
    code: code, deviceId: dev, name: name || 'Harness Student',
    section: 'TEST-1A', ua: 'Chrome/120', screen: '390x844'
  });
  if (!lg.ok) throw new Error('harness login failed: ' + JSON.stringify(lg));
  const dbg = dbgEarly;
  dbg.Session.data = {
    code: code, token: lg.token, name: name || 'Harness Student',
    section: 'TEST-1A', at: Date.now(), state: lg.state
  };
  return lg;
}

/** Lets every queued promise callback run. */
function settle(n) {
  let p = Promise.resolve();
  for (let i = 0; i < (n || 6); i++) p = p.then(() => new Promise(r => setImmediate(r)));
  return p;
}

module.exports = { makeBrowser, signIn, settle, fakeEl };
