/* ══════════════════════════════════════════════════════════════
   AAP101 · CONFIGURATION
   ──────────────────────────────────────────────────────────────
   THIS IS THE ONLY FILE YOU NEED TO EDIT.

   Paste the Google Apps Script "Web app URL" between the quotes
   on the ENDPOINT line below. It looks like:

     https://script.google.com/macros/s/AKfycb.....long.....string/exec

   Step-by-step instructions are in SETUP_GUIDE.md.
   ══════════════════════════════════════════════════════════════ */
'use strict';

window.AAP_CONFIG = {

  /* ① Paste your Web app URL here (keep the quotes). */
  ENDPOINT: 'https://script.google.com/macros/s/AKfycbz58d-JYZ6KFhGcXTeLbcd7tRbGF9O13fjQKtPeMaPxaPGH6FZSmI6vvkktuQYi7mNHMA/exec',

  /* ② Leave everything below alone unless you know what you're changing. */

  // How often the module quietly sends data to the sheet, in seconds.
  SYNC_SECONDS: 20,

  // Send immediately once this many events have piled up.
  SYNC_AT_EVENTS: 8,

  // When nothing is happening, check in this often to keep study time live.
  HEARTBEAT_SECONDS: 180,

  // How long a student stays logged in before re-entering their code (days).
  SESSION_DAYS: 180,

  // Minutes of no clicking/scrolling before we stop counting study time.
  IDLE_MINUTES: 3,

  // Set to true to print sync activity to the browser console while testing.
  DEBUG: false
};
