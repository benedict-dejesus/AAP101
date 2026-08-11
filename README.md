# AAP2026 — Art Appreciation Interactive Module

Gamified e-learning module for **AAP101 – Art Appreciation**, Bulacan State University.
Instructor & developer: Benedict C. de Jesus, LPT. (Sir Kito)

---

## Access control & the class database

The module is gated: students need an access code issued from the
**AAP101_Database** Google Sheet, and their activity streams back into it live.

**→ Setting this up for the first time: read [`SETUP_GUIDE.md`](SETUP_GUIDE.md).**

How it fits together:

```
GitHub Pages (this repo)  ──asks──▶  Google Apps Script  ──writes──▶  AAP101_Database
   assets/auth.js                    _apps-script/Code.gs        (6 tabs)
```

- The 600 access codes live **only** in the sheet — never in this repo, and
  never in anything shipped to a browser.
- Each code is claimed by the first device that uses it; sharing is refused and
  logged. Release a lock from the sheet's **AAP101 Database** menu.
- Sessions are signed (HMAC-SHA256) and stored in a first-party cookie, mirrored
  to `localStorage` because Safari expires script-set cookies after 7 days.
- Telemetry is queued in `localStorage` and flushed every ~20s, on important
  events, and via `sendBeacon` when the tab closes. Students can work offline;
  the queue drains when the connection returns.
- Progress is namespaced per code (`aap101.progress.v2::AAP-XXXX-XXXX`) so a
  shared phone never mixes two students' XP.

### Where the authority lives

Since the 2026-08 hardening pass, **the browser scores nothing.** When a student
answers, the module sends what they did to Apps Script, which checks it against
a key they cannot reach and replies with the verdict, the XP it decided to
award, and their authoritative progress. The module renders that reply.

That means the published site contains:

- no correct answers (`_apps-script/AnswerKey.gs` holds them)
- no XP values (same)
- no way to mark an activity complete (`_ServerGates` in the sheet holds that)

`S` in `app.js` and `aap101.progress.v2` in `localStorage` are still there, but
they are now a **cache of the server's answer**, overwritten on sign-in and on
every sync. Editing them changes what one student sees for a few seconds and
nothing in the grade book.

`assets/auth.js` still wraps the engine rather than editing it — `showPage` for
page views, plus `applyServerState()`, which is the one-way door the server's
record comes through. New tracking belongs in `auth.js`.

> **The gate fails closed.** If `auth.js` fails to load, the module refuses to
> start rather than opening unlocked. See the emergency playbook at the end of
> `SETUP_GUIDE.md`.

---

## Running it

Open **`index.html`** in any modern browser. No build step, no install.

> Without a configured `assets/config.js` the login screen will say the module
> isn't connected to the database yet — that's expected, not a bug.

> **Note:** open it through a local web server if you can (e.g. `npx http-server .`
> then visit `http://127.0.0.1:8080`). Opening the raw `file://` path works in most
> browsers, but a few block `localStorage`, which is what saves student progress.

---

## File layout

```
index.html            ← launcher / app shell (open this)
assets/
  styles.css          ← all styling and animation
  content.js          ← ALL learning content, badges, chords, levels
  app.js              ← game engine + block renderer + navigation
  config.js           ← ⚙️ the one file you edit: the database URL
  auth.js             ← access codes, sessions, live telemetry
  auth.css            ← login screen styling
_apps-script/
  Code.gs             ← the backend; paste into the Google Sheet's Apps Script
images/               ← image1–57.jpg, video1.mp4 (unchanged)
archive/              ← local only, never published (see .gitignore)
SETUP_GUIDE.md        ← step-by-step setup walkthrough (start here)
```

The module is **data-driven**: lessons live in `content.js` as arrays of blocks.
`app.js` renders each block by its `t` (type) and wires up its behaviour.

### Editing content

To change wording, open `assets/content.js` and edit the text — no HTML surgery
needed. To add a new activity, append a block object to a lesson's `blocks` array:

```js
{t:'quiz', mode:'single', gate:'m2-extra',
 title:'My New Check', kicker:'Knowledge Check',
 q:'Question text?',
 opts:[
   {txt:'Wrong answer'},
   {txt:'Right answer'}
 ]}
```

Notice what is **not** there: no `correct`, no `fb`, no `xp`. Since the
hardening pass those live in `_apps-script/AnswerKey.gs`, which never leaves
the server. Add the matching entry there:

```js
'm2-extra': { type:'quiz-single', xp:50, mod:'m', lesson:2,
              nOpts:2, correct:1, badgeOnClean:'sharp-eye' },
```

and its feedback lines to `QUIZ_FEEDBACK`. Then add the `gate` id to the
lesson's `continue` block `req:[…]` array if it should be required to advance.

> ⚠️ **An activity with no entry in `AnswerKey.gs` cannot be completed** — the
> server rejects gates it does not recognise, by design. After editing content,
> run **AAP101 Database ▸ Check the answer key** in the spreadsheet; it lists
> anything that has drifted out of sync.

---

## Block types

| Type | What it does |
|---|---|
| `heading` `text` `quote` `warn` | Static content |
| `video` | Autoplaying looped video |
| `compare` | Side-by-side "VS" comparison cards |
| `polaroids` | Photos that "develop" as students tap them |
| `discover` | Tile grid — tap to uncover a detail panel |
| `flipdeck` | 3D flip cards |
| `deck` | Swipeable card deck (arrow keys supported) |
| `sorter` | Drag & drop / tap-to-place sorting gauntlet |
| `quiz` | Single- or multi-select knowledge check |
| `match` | Memory-style pairing minigame |
| `boss` | Timed Speed Round with combo multiplier |
| `timeline` | Project quest log with tickable steps |
| `strum` | Playable strumming-pattern trainer |
| `sim-exposure` | Exposure Triangle simulator |
| `sim-guitar` | Guitar chord cheat sheet |
| `continue` | Gated advance button |
| `reveal` | Section hidden until a gate is passed |

---

## Mobile design

Most students will open this on a phone, so the layout is **mobile-first below 768px**:

- **No sidebar on phones.** It is removed entirely (`display:none`) and replaced by a
  thumb-reachable **bottom navigation bar** — Home, Lessons, Trophies, Sound — plus a
  slide-up **lesson sheet** listing every lesson with its lock/complete state.
- **Back navigation** moves from the floating button (which would sit under the nav bar)
  to a chevron in the top bar.
- **Everything scales down**: headings, body text, cards, tiles, images, quiz options,
  flip cards, boss-battle options, and both simulators all shrink at the phone breakpoint.
  Two- and three-column grids collapse; boss options go single-column.
- **Simulators are rebuilt for portrait.** The exposure simulator stacks vertically with
  the preview on top (190px) and enlarged 24px slider thumbs for fingertips. The guitar
  chord picker becomes a horizontally swipeable strip with scroll-snap, and the chord
  diagram scales to 145px (132px on small phones).
- **Touch targets are ≥40px everywhere** — verified programmatically across every page.
- **Safe-area aware** (`env(safe-area-inset-bottom)`) so the nav bar clears the iPhone
  home indicator, and `100dvh` is used so mobile browser chrome doesn't clip the layout.
- **Hover effects are neutralised** on touch devices via `@media(hover:none)`, replaced
  with press/active states.

Verified with no horizontal overflow at 320px, 375px, 768px, and 1280px.

## Game systems

- **XP & levels** — 8 ranks (Apprentice → Virtuoso), shown in the sidebar and topbar.
- **Badges** — 15 achievements, viewable in the 🏅 Trophy Case.
- **Streaks** — consecutive correct answers; 🔥 badge at 5.
- **Bonuses** — first-try sorts and flawless match runs award extra XP.
- **Speed Rounds** — optional timed challenges with a combo multiplier (up to ×5).
- **Report card** — XP, level, accuracy, best streak, and badges at module completion.
- **Progress saving** — the record is the **AccessCodes** tab of your spreadsheet.
  `localStorage` keeps a copy under `aap101.progress.v2` so the module paints
  instantly, and it is refreshed from the server at sign-in and on every sync. A
  student who clears their browser, switches phones, or edits their saved data
  gets their real progress back.

> XP, levels, accuracy, streaks, badges and bonuses are all decided server-side.
> The two exceptions are noted in `AnswerKey.gs`: memory-match "flawless run"
> bonuses and the exploration activities (galleries, decks, simulators), which
> have nothing a server can check. Those are recorded as **CLAIMED** rather than
> **CHECKED** in the Assessments tab.

### Resetting a student's progress

In the browser console (note the per-student suffix):

```js
Object.keys(localStorage)
  .filter(k => k.startsWith('aap101.progress'))
  .forEach(k => localStorage.removeItem(k));
location.reload();
```

This clears the copy on that device only. The authoritative record stays in the
**AccessCodes** tab of the spreadsheet.

---

## Known caveat: image filenames

Some images referenced by the lessons are not present in `images/`. These render as
labelled placeholders showing the expected filename, so nothing breaks — drop the
file in with the right name and it appears automatically. Currently missing:

`image30–36` (Principles of Design), `image42`, `image44`, `image47`,
`image50`, `image51`, `image55`, `image56`.

The welcome video is referenced as `images/Video1.mp4` while the file on disk is
`video1.mp4`. This is fine on Windows and most local servers (case-insensitive), but
would 404 on case-sensitive hosting such as GitHub Pages or Netlify. The app retries
the lowercase spelling automatically, so it works either way — but renaming the file
to match is the cleaner fix if you deploy.

---

© Bulacan State University. Distribution restricted to students enrolled in AAP101
under Sir Kito for the 1st semester of A.Y. 2026–2027.
