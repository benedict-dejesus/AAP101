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

1. Open your database:
   <https://docs.google.com/spreadsheets/d/1bnztuQXhjR1SFwOnM2cFSJKefZB__iXS_QocOcFQYsE/edit>

2. In the top menu click **Extensions ▸ Apps Script**.
   A new tab opens with a code editor. There is a file called `Code.gs`
   containing a few lines like `function myFunction() {}`.

3. **Delete everything** in that editor. Click inside it, press `Ctrl+A`, then
   `Delete`. The editor should be completely empty.

4. Open the file `google-apps-script/Code.gs` from your AAP101 project folder
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

## Emergency: turn the lock off

If something goes badly wrong on exam day and you need students in immediately,
open `assets/app.js`, find the line near the very bottom that reads:

```js
  AAPAuth.gate().then(boot).catch(err=>{
```

and change it to:

```js
  boot(); // TEMPORARY: access control disabled
```

Commit and push. **This opens the module to anyone with the link** — undo it as
soon as the emergency passes.

---

© Bulacan State University · AAP101 · A.Y. 2026–2027
