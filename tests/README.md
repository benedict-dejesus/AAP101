# AAP101 security tests

Run these after **any** change to `assets/content.js`, `assets/app.js`,
`assets/auth.js`, or `_apps-script/*.gs`.

```bash
node tests/run.js
```

No install, no dependencies — just Node.

> ⚠️ **These files contain answers.** `test-backend.js` submits correct answers
> in order to check that they score. That is why `tests/` is excluded in
> `_config.yml` and must never be published. If you ever remove that exclusion,
> remove these files first.

## What is here

| File | What it checks |
|---|---|
| `gas-harness.js` | Stubs the Apps Script runtime (SpreadsheetApp, Utilities, CacheService, LockService, PropertiesService) so the **real** `Code.gs` and `AnswerKey.gs` run against a throwaway in-memory spreadsheet. Never touches your live sheet. |
| `test-backend.js` | The legitimate student workflow, the 20 adversarial tests from the security audit, spreadsheet formula injection, session revocation, study-time inflation, rate limiting, migration data-preservation, the read-only migration dry run, and answer-key integrity. |
| `test-frontend.js` | That the published bundle contains no answer key, no XP values, and no way to mark an activity complete without the server. |

## The two that matter most

**`T-KEY1` / `T-KEY6`** compare the server's answer key against the gate count
and total XP in `content.js`. If you add or remove an activity and forget to
update `AnswerKey.gs`, these fail — and so would your students, because the
server rejects gates it does not recognise.

**`F-01` to `F-07`** confirm no correct answer, no feedback string and no XP
figure has crept back into a file the browser downloads. If one of these fails,
the module is handing out its own answer key again.

**`T-DRY0` / `T-DRY1`** are a pair. `T-DRY1` asserts the migration dry run does
not write a single cell; `T-DRY0` deliberately writes one cell first to prove
the detector still works. Without the control, `T-DRY1` could pass simply
because the harness had stopped noticing writes — which is exactly what
happened the first time it was run.

**`T-DRY18`** re-runs the real migration and checks that every value it wrote
matches what the dry run predicted. `auditMigration()` and `migrateSchema()`
share one planner (`migrationPlan_`), and this is what keeps them honest.
