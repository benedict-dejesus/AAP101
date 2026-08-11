# AAP101 — Setup Guide

**For: Benedict C. de Jesus, LPT.**
Written for a non-technical reader. Follow it top to bottom, once.

You will do this **one time**. Budget about 20 minutes. After that the system
runs by itself and you only ever look at the spreadsheet.

---

## What we built, in plain language

Your module lives on GitHub (a website). Your class list lives in Google Sheets.
Websites cannot talk to Google Sheets directly, so we added a small program that
sits inside your spreadsheet and acts as the **doorman**.

```
   Student's phone                  The doorman              Your spreadsheet
  ┌───────────────┐            ┌──────────────────┐        ┌────────────────┐
  │  AAP101       │  "here's   │  Google Apps     │ writes │ AAP101_Database│
  │  module on    │──my code──▶│  Script          │───────▶│  · AccessCodes │
  │  GitHub Pages │            │  (the doorman)   │        │  · LoginLog    │
  │               │◀──yes/no───│                  │        │  · Assessments │
  └───────────────┘            └──────────────────┘        │  · Runtime     │
                                                            │  · EventLog    │
                                                            └────────────────┘
```

The important part: **the 600 access codes are never inside the website.** A
student who inspects your web page finds nothing. Only the doorman knows the
codes, and it only ever answers "yes" or "no".

---

## Step 1 — Put the doorman inside your spreadsheet

1. Open your database — the **AAP101_Database** spreadsheet in your Google Drive.

   > The link to it is deliberately **not written down in this repository**. This
   > file is published on the public web along with the module, and a spreadsheet
   > ID posted publicly is one wrong sharing setting away from handing out your
   > whole class list. Find the sheet in Drive instead, and keep its sharing set
   > to **Restricted**.

2. In the top menu click **Extensions ▸ Apps Script**.
   A new tab opens with a code editor. There is a file called `Code.gs`
   containing a few lines like `function myFunction() {}`.

3. **Delete everything** in that editor. Click inside it, press `Ctrl+A`, then
   `Delete`. The editor should be completely empty.

4. Open the file `_apps-script/Code.gs` from your AAP101 project folder
   (Notepad or VS Code will do). Select all of it (`Ctrl+A`), copy (`Ctrl+C`).

5. Click back into the empty Apps Script editor and paste (`Ctrl+V`).

6. Click the **floppy-disk Save icon** (or `Ctrl+S`).

7. At the top left, where it says *Untitled project*, click it and name it
   `AAP101 Doorman`. Press OK.

---

## Step 2 — Create the 600 access codes

1. Go back to your **spreadsheet tab** and **refresh the page** (`F5`).
   Wait a few seconds.

2. A new menu appears in the menu bar: **AAP101 Database**.
   *(If you don't see it, wait 10 seconds and refresh again.)*

   > **Already have students in your sheet?** Do **not** click ① — that is for
   > an empty database. Click **② Preview the upgrade** instead. It changes
   > nothing and prints a full report of what the upgrade would do. Then, once
   > you have made a backup copy, run **③ Upgrade database**. See
   > *Upgrading an existing database* near the end of this guide.

3. Click **AAP101 Database ▸ ① Set up database (first time only)**.

4. **Google will ask for permission.** This is normal and expected — you are
   giving *your own script* permission to edit *your own spreadsheet*.
   Work through the screens:

   - Click **Continue**
   - Choose your account (**benedictdejesuslpt@gmail.com**)
   - You will see a scary-looking screen: *"Google hasn't verified this app"*.
     This is expected — it means "this app was written by you, not by a
     company Google has vetted." Click the small **Advanced** link at the
     bottom left, then click **Go to AAP101 Doorman (unsafe)**.
   - Click **Allow**.

   > This warning appears because the script is yours and private. It is not a
   > sign that anything is wrong.

5. The menu click may not have completed while you were authorising. If nothing
   happened, click **AAP101 Database ▸ ① Set up database** once more.

6. After a few seconds you get a popup: **"Database ready — 600 access codes
   have been generated."** Click OK.

You now have six tabs at the bottom of the spreadsheet, and the **AccessCodes**
tab is filled with 600 codes that look like `AAP-7K3M-9RTX`.

> ⚠️ **Never sort, delete, or rearrange the rows or columns of the AccessCodes
> tab.** Adding your own notes in a new column to the right is fine.

---

## Step 3 — Publish the doorman

The doorman exists, but the website cannot reach it yet. We need to give it a
web address.

1. Go back to the **Apps Script** tab.

2. Top right, click the blue **Deploy** button ▸ **New deployment**.

3. Next to *Select type*, click the **gear icon ⚙️** and choose **Web app**.

4. Fill in the form exactly like this:

   | Field | What to choose |
   |---|---|
   | Description | `AAP101 live` |
   | **Execute as** | **Me (benedictdejesuslpt@gmail.com)** |
   | **Who has access** | **Anyone** |

   > **"Anyone" is required and it is safe.** It means any student's phone is
   > allowed to *ask* the doorman a question. It does **not** mean anyone can
   > see your spreadsheet. The doorman only ever replies "yes" or "no", and
   > only to someone holding a valid code.

5. Click **Deploy**. Authorise again if prompted.

6. You will see **Web app URL**. It looks like:

   ```
   https://script.google.com/macros/s/AKfycbx...very...long...string/exec
   ```

   Click **Copy**. **Keep this tab open** until Step 4 is done.
https://script.google.com/macros/s/AKfycbz58d-JYZ6KFhGcXTeLbcd7tRbGF9O13fjQKtPeMaPxaPGH6FZSmI6vvkktuQYi7mNHMA/exec
---

## Step 4 — Tell the module where the doorman lives

1. In your AAP101 project folder, open **`assets/config.js`** in Notepad
   (right-click ▸ Open with ▸ Notepad) or VS Code.

2. Find this line near the top:

   ```js
   ENDPOINT: '',
   ```

3. Paste your Web app URL **between the two quote marks**:

   ```js
   ENDPOINT: 'https://script.google.com/macros/s/AKfycbx...long.../exec',
   ```

   Keep the quotes. Keep the comma at the end. Change nothing else.

4. Save the file (`Ctrl+S`).

> If you skip this step the module will show *"This module has not been
> connected to the class database yet"* and nobody can log in. That is
> deliberate — it fails safely rather than letting everyone in.

---

## Step 5 — Publish the website

1. Open **GitHub Desktop**.
2. It will list the changed files on the left.
3. In the **Summary** box at the bottom left, type:
   `Connect module to AAP101_Database`
4. Click **Commit to main**.
5. Click **Push origin** at the top.

Wait 1–2 minutes for GitHub Pages to rebuild, then open your module's public
address. You should see the **access code screen**.

---

## Step 6 — Test it yourself before class

1. Open your module's public URL.
2. Go to your spreadsheet, **AccessCodes** tab, and copy any code from column A.
3. Type it into the module. It should ask for your name — type `TEST STUDENT`,
   section `TEST`, and continue.
4. Answer one quiz question.
5. Wait about 30 seconds, then look at your spreadsheet:
   - **AccessCodes** — that row now shows your name, XP, accuracy
   - **Assessments** — a row for the question you answered
   - **LoginLog** — a row saying `REGISTER · OK — code claimed`

**Then clean up your test:**
- On the AccessCodes tab, find that row and clear the **Student Name**,
  **Section**, and **Device ID** cells, and set **Status** back to `UNUSED`.
- Or simply leave it and don't hand that code to a student.

Also try typing a made-up code like `AAP-ZZZZ-ZZZZ` — it must be refused.

---

## Handing out the codes

Open the **AccessCodes** tab and give each student **one code from column A**.
It does not matter which one. Codes are not pre-assigned to names — the first
student to use a code claims it by typing their name.

Good ways to distribute:
- Message each student their code privately (safest)
- Print the column, cut into strips, hand out in class
- Paste into your LMS as individual private feedback

> Tell students: **"Your code only works on one device — the first one you use
> it on. Use the phone or laptop you will actually study on."**

---

## Day-to-day: what you will actually do

Everything happens in the **AccessCodes** tab — one row per student, updating by
itself while they study.

| Column | Meaning |
|---|---|
| Student Name / Section | What they typed at first login |
| Last Seen | Last time they were active |
| Logins | How many times they came back |
| Total Minutes | Real study time (idle time is not counted) |
| XP / Level / Rank | Their game progress |
| Accuracy % | Correct ÷ total answers |
| Best Streak | Longest run of correct answers |
| Badges / Badge List | Achievements earned |
| Lessons Done | Fully completed lessons |
| **Progress %** | **How far through the whole module they are** |
| Last Page | Where they are right now |

The other tabs are your detailed records:

- **Assessments** — every single answer: which question, right or wrong, which
  attempt number. This is your grading evidence.
- **Runtime** — study sessions and how long each lasted.
- **LoginLog** — every login, including *rejected* attempts. If someone tries to
  share a code you will see `REJECTED — device mismatch` here.
- **EventLog** — badges, level-ups, page visits.

### Useful menu commands

**AAP101 Database ▸ …**

- **Release a device lock…** — a student got a new phone, or reset their
  browser, and can't get in. Type their code; they can log in fresh.
  **Their progress is kept.**
- **Disable an access code…** — block a code entirely (dropped the subject,
  code leaked).
- **Re-enable an access code…** — undo the above.
- **Add 100 more access codes** — if you need more than 600.
- **Class summary** — quick overview: how many claimed, total study hours,
  average XP, how many finished.

---

## Upgrading an existing database

Only needed once, when you install a security update on a sheet that already
has students in it. It **adds** columns; it never renames, moves, clears or
overwrites the ones you already have.

### 1. Look before you leap

**AAP101 Database ▸ ② Preview the upgrade (changes nothing).**

This is a dry run. It writes nothing at all — no cells, no tabs — so you can
run it as often as you like on live data. It prints:

- exactly which columns and tabs would be added
- how many rows would be updated, and how many are already done
- how much XP would carry over (all of it — nobody is reset)
- how many completed activities can be **proven** from each student's own
  history in the Assessments tab
- any activity ids in your history that the answer key does not recognise —
  **fix these before upgrading**, or that progress will not be rebuilt
- a before/after preview of each student's Progress %
- rows worth a second look (see below)
- a verdict: *safe to proceed* or *review first*

A summary appears in a popup. The **full row-by-row report** is in the Apps
Script log: **Extensions ▸ Apps Script**, then press `Ctrl+Enter`.

### 2. Read the two lists, and keep them apart

The preview separates three different things, and the distinction matters:

- **A — the legacy dashboard.** What the sheet says today. Under the old build
  the browser reported its own scores, so none of it was ever checked.
- **B — the reconstructed state.** What the student's Assessments history and
  the answer key can actually account for. This is what gets written.
- **C — evidence that cannot become either.** Kept, labelled, and never used in
  a calculation.

**Section D1 — differences that cannot be rebuilt.** Expected on completely
honest records. Reconstruction has no way to derive a first-try bonus or a
"no misses" badge from a legacy row, so an honest student's figure comes out a
little under. **This is not a sign of anything wrong.**

| In D1 | What it means |
|---|---|
| `XP_UNRECONSTRUCTABLE_DIFF` | The shortfall is within the bonuses this activity set could have earned. Almost certainly genuine and simply not recoverable |
| `BADGES_UNRECONSTRUCTABLE_DIFF` | Same, for "no misses" badges. The old list is kept in `_LegacyBadges_UNVERIFIED` |
| `STATS_PARTIAL_DIFF` | Fewer answer rows than the dashboard counted — consistent with syncs that never landed |
| `DUPLICATE_ROWS_IGNORED` | Identical rows from a retried sync, counted once |

**Section D2 — figures nothing in the history accounts for.** A gap too large
for any missing bonus or lost sync to explain. Worth asking about — but a
broken client or a botched restore can produce this too, so treat it as a
question, not a verdict.

| In D2 | What it means |
|---|---|
| `XP_UNSUPPORTED` | More XP than any bonus could explain |
| `NO_RECOGNISED_HISTORY` | Has XP but not one recognised completed activity |
| `HISTORY_INCOMPLETE` | Claims more activities than history evidences. The gap is written to `_HistoryDelta` |
| `HISTORY_ALL_UNRECOGNISED` | Has Assessments rows, none naming an activity the answer key knows |
| `STATS_UNSUPPORTED` / `BADGES_UNSUPPORTED` | Counts nothing accounts for |
| `IMPOSSIBLE_ACCURACY` | More correct answers than attempts |
| `XP_ABOVE_COURSE_MAX` | More XP than the whole course can award |
| `UNCLAIMED_WITH_PROGRESS` | A code nobody claimed, carrying progress |
| `FORMULA_TEXT` | A name or section beginning with `=`, `+`, `-` or `@`. **Google Sheets runs it as a formula when you open the sheet.** New entries are neutralised automatically; anything already in your sheet was never filtered |

Neither list blocks the upgrade, and neither changes what it does.

### If a student's history is genuinely incomplete

Some students will be under-credited because syncs never landed, not because
they did not do the work. They show up as `HISTORY_INCOMPLETE`, with the size
of the gap in `_HistoryDelta`.

**Do not edit `_ServerGates` by hand.** An unlogged edit to the trusted state is
the exact thing this whole exercise exists to prevent. Use
**AAP101 Database ▸ Grant activity credit…** instead. It:

- credits one activity for one student at a time
- refuses anything not in the answer key
- refuses an activity their history already evidences
- makes you type `GRANT` to confirm
- writes the grant to **SecurityLog** against your Google account, and records
  it in **Assessments** as an instructor credit rather than as student work

So the trusted state always has a provenance: either a student demonstrated it,
or you can see exactly who granted it and when.

### 3. Back up, then upgrade

1. **File ▸ Make a copy** — name it something like
   `AAP101_Database — BACKUP <today's date>`.
2. **AAP101 Database ▸ ③ Upgrade database.**
3. Compare two students against your backup: columns A–X must be identical.

Running the upgrade twice is harmless — it skips rows it has already done.

> **Numbers will drop for some students, XP included.** Under the old build the
> browser reported its own scores, so nothing in the dashboard was ever checked.
> The upgrade rebuilds XP, accuracy, streak, badges, lessons, progress and
> activities from each student's **Assessments history** and the answer key,
> and does not carry over anything that history cannot support. The old figures
> are saved in the hidden `_PreMigration` column, and
> **↩ Restore pre-upgrade figures…** puts them all back.

### What "rebuilt from history" means for each figure

| Figure | Rebuilt from |
|---|---|
| Activities / Lessons / Progress % | Rows in Assessments marked `COMPLETED` or `REPLAY` that name an activity the answer key recognises |
| **XP** | The answer key's value for each of those activities. **First-try and flawless-run bonuses are not rebuilt** — a legacy row cannot show a clean run — so an honest student may land slightly under their old total |
| Correct / Attempts | `CORRECT` and `WRONG` rows naming a recognised activity |
| Best Streak | The longest run of correct answers in the recorded order, or 0 if there are no answer rows |
| Badges | Each badge the old sheet claimed is checked against the history and sorted into one of three states — see below |

Rows naming an activity the answer key does not recognise contribute **nothing
at all** — not XP, not activities, not attempts. That is what stops a
fabricated record from carrying anything into the new system, without anyone
having to identify it by name.

### Badges: the three states

The old build recorded a miss against the activity it happened in, so for the
"no misses" badges — Sharp Eye, Clean Sort, Matchmaker, Flawless Victory — the
history can often settle the question either way. Each claimed badge is sorted
into one of three states:

| State | What it means | What happens |
|---|---|---|
| **PROVEN** | The history demonstrates it — the activity was completed, and where a clean run is required, the answer rows for it contain no miss | Written to `_ServerBadges`. **The student keeps it.** |
| **UNVERIFIED** | The activity was completed, but the answer rows needed to check the condition did not survive. It can be neither shown nor ruled out | **Not** written to `_ServerBadges`. Kept verbatim in `_LegacyBadges_UNVERIFIED` with the reason, and in `_PreMigration`. Counts for nothing |
| **CONTRADICTED** | The history rules it out — no activity that could have earned it, or a recorded miss in the very activity the badge says was clean | **Not** written to `_ServerBadges`. Reported explicitly, and still archived |

Two consequences worth knowing:

- **An honest student whose answer rows survived keeps their no-miss badges** —
  they are re-derived from the evidence, not from the old sheet. This is a
  change from the earlier design, which dropped them all.
- **A badge that is merely unprovable is never deleted from the record.** It
  stops counting, but the claim and the reason are preserved where you can read
  them, and **↩ Restore pre-upgrade figures…** puts the whole old dashboard
  back including the badge list.

Nothing in `_LegacyBadges_UNVERIFIED` is read by any code that computes a
score: XP, Level, Rank, Accuracy, Progress and the activity list are identical
whether the column is populated or empty.

---

## Troubleshooting

**"That access code is not recognised."**
Typo, or the code isn't in the sheet. Dashes, spaces and capitals don't matter —
`aap7k3m9rtx` works the same as `AAP-7K3M-9RTX`. Check the code exists in column A.

**"This access code is already in use on another device."**
Working as designed — someone is trying to reuse a claimed code. If it's a
genuine student who changed phones, use **Release a device lock…**.

**"Could not reach the class database."**
The student has no internet, *or* Step 3/4 wasn't finished. Confirm
`assets/config.js` has the URL and that you pushed it with GitHub Desktop.

**"This module has not been connected to the class database yet."**
Step 4 was missed, or the change wasn't pushed to GitHub.

**Nothing appears in the spreadsheet.**
The module saves up data and sends it every ~20 seconds, and immediately when a
student earns a badge or levels up. Give it a minute. If still nothing, re-check
that **Who has access** is set to **Anyone** in the deployment.

**I edited `Code.gs` — the changes did nothing.**
Apps Script keeps serving the old version until you redeploy. Go to
**Deploy ▸ Manage deployments**, click the **pencil ✏️**, set *Version* to
**New version**, click **Deploy**. The URL stays the same, so you don't need to
touch `config.js`.

**A student says they lost all their progress.**
Their browser data was probably cleared. Their XP and scores are safe in your
sheet. They keep their code and carry on — the sheet is the record of truth for
grading, even if their phone forgets.

---

## Things worth knowing

**Is this secure?** Reasonably, for a classroom. Codes are never in the website,
sessions are cryptographically signed, and each code is locked to one device.
It is not bank-grade — a determined person with lots of time could guess at
codes. There are 1.1 trillion possible codes and only 600 real ones, so guessing
is impractical, and every failed attempt is logged in **LoginLog**.

**Privacy.** You collect names, sections, and study activity. Tell your students
that. The login screen says their name goes into the class record.

**Cost.** Free. Google Apps Script's free quota is far above what one class of
600 will use.

**If Google is down**, students who have already logged in can keep studying
offline — their work is saved on their device and syncs when the connection
returns. Only *first-time* logins need the internet.

---

## Emergency: getting a stuck class in

If something goes wrong on exam day, **do not disable the lock.** Turning the
gate off publishes the whole module — and now that scoring is server-side, an
ungated module also means nobody's work is recorded.

Use these instead, in order:

1. **A student cannot log in on a new phone** — spreadsheet menu ▸ *AAP101
   Database ▸ Release a device lock…*, type their code. Progress is kept.
2. **A whole section cannot log in** — check *Deploy ▸ Manage deployments* still
   says **Who has access: Anyone**, and that `assets/config.js` still holds the
   current web app URL.
3. **The backend is down or Google is throttling** — students who have already
   logged in keep working offline; their answers queue on the device and grade
   when the connection returns. Nothing is lost. Wait it out.
4. **Genuinely nothing else works** — issue fresh codes from *AAP101 Database ▸
   Add 100 more access codes* rather than removing the gate.

---

© Bulacan State University · AAP101 · A.Y. 2026–2027
