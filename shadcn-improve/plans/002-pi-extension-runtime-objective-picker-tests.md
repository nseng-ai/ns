# Plan 002: Add tests for pi-extension-runtime objective picker and selection paths

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `shadcn-improve/plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat d637e619b..HEAD -- ts/packages/pi-extension-runtime/src/objective-selection.ts ts/packages/pi-extension-runtime/src/objective-picker.ts ts/packages/pi-extension-runtime/src/objective-list.ts`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `d637e619b`, 2026-06-15

## Why this matters

`pi-extension-runtime` has one test file (`test/runtime-helpers.test.ts`) for
nine source modules. Objective selection is on the critical path for skill
invocation across the harness: `chooseActiveObjectiveSlug` lists active
Objectives, gathers git diff/status "changed Objective" evidence to suggest a
default, and drives an interactive picker. The existing test covers only the
**no-picker** branches (no `ui.select`); the entire **picker** path
(`hasUI && ui.select` present) and the pure picker/parsing helpers in
`objective-picker.ts` and `objective-list.ts` are untested. The porcelain
`-z` rename/copy parsing and the "suggest changed Objectives first / view
others" branching are exactly the kind of logic that breaks silently on a
refactor. This plan adds tests for those paths using the package's existing
host-injection pattern (no mocks — a plain `exec` stub).

## Current state

Files in scope (read them before writing tests):

- `ts/packages/pi-extension-runtime/src/objective-selection.ts` — the orchestrator.
  - `chooseActiveObjectiveSlug(host, ctx, spec)` (lines 312–359) — `await ctx.waitForIdle()`, list objectives, then:
    - list failed → notify error (only if picker) → `undefined`.
    - empty records → notify info (only if picker) → `undefined`.
    - no picker (`!hasUI || ui.select === undefined`) → `undefined`.
    - with picker: compute `changedObjectiveSelection` (runs `git diff` + `git status`), then either the compact "changed-or-other" picker (`spec.compactDiffSuggestion`) or a notify + full picker.
  - `objectiveSelectionContextFromCommandContext(ctx)` (lines 60–73) — binds `notify`/`select`/`setStatus` off a `CommandContext`.
  - `listActiveObjectives` runs `host.exec("objective", ["list", "--minimal", "--format", "json"], {...})`.
  - `objectiveDiffChangedSlugs` runs `host.exec("git", ["diff", "--name-status", "-M", "<trunk>...HEAD", "--", ".asdl/objectives"], ...)`.
  - `objectiveStatusChangedSlugs` runs `host.exec("git", ["status", "--porcelain=v1", "-z", "--", ".asdl/objectives"], ...)`.

  Excerpt — picker branching (lines 336–358):
  ```ts
  if (!hasPicker) { return undefined; }
  const changedSelection = await changedObjectiveSelection({ host, ctx, objectiveList, spec });
  if (changedSelection && spec.compactDiffSuggestion) {
    return selectChangedObjectivesOrOther({ ctx, spec, objectiveList, selection: changedSelection });
  }
  if (changedSelection) {
    // notify "Found changed Objective(s) ..."
  }
  return selectObjectiveSlug({ ctx, title: spec.selectionTitle, records: objectiveRecordsWithChangedFirst(...), selection: changedSelection });
  ```

  The `ObjectiveSelectionHost` interface (lines 37–39):
  ```ts
  export interface ObjectiveSelectionHost {
    exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
  }
  ```
  `ExecResult` is `{ code: number; killed: boolean; stdout: string; stderr: string }` (from `@asdl/core/exec`; see the existing test's `host` stub for the exact literal shape).

- `ts/packages/pi-extension-runtime/src/objective-picker.ts` — pure helpers (no I/O):
  - `parseObjectiveDiffChangedSlugs(stdout)` — parses `git diff --name-status` lines; slug is `parts[2]` of `.asdl/objectives/<slug>/...`; handles `R`/`C` rename/copy lines (multiple tab fields).
  - `parseObjectiveStatusChangedSlugs(stdout)` — parses `git status --porcelain=v1 -z` (NUL-separated); two-char status + space + path; skips `!!` (ignored); for rename/copy status consumes the **next** NUL entry as the second path.
  - `changedActiveObjectiveSelection(objectiveList, trunkBranch, allChangedSlugs, changeBasisLabel?)` — intersects changed slugs with active records; returns `undefined` if no changed slugs, blank label, or no active intersection.
  - `formatObjectiveChoice`, `objectiveRecordsWithChangedFirst`, `objectiveChoiceMap`, `objectiveDiffPickerTitle`, and the constant `VIEW_OTHER_OBJECTIVES_CHOICE`.

  Excerpt — porcelain `-z` parsing (lines 31–55):
  ```ts
  const entries = stdout.split("\0");
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] ?? "";
    if (!entry) continue;
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    if (!status.trim() || status === "!!" || !path) continue;
    addObjectiveSlugFromPath(slugs, path);
    if (isRenameOrCopyStatus(status)) {           // status includes "R" or "C"
      const secondPath = entries[index + 1] ?? "";
      addObjectiveSlugFromPath(slugs, secondPath);
      index += 1;
    }
  }
  ```

- `ts/packages/pi-extension-runtime/src/objective-list.ts` — `parseObjectiveList(stdout)`:
  parses a machine envelope (`{ exit_code, data: { trunk_branch, root_path, status_filter, names_only, records: [{ slug, status, latest_update_iso }] } }`) into
  `{ type: "valid", list }` or `{ type: "invalid", message }`. Records require
  `slug: string`, `status: string`, `latest_update_iso: string | null`.

### Conventions to match

- **Test layout & host pattern**: model new files on the **existing**
  `ts/packages/pi-extension-runtime/test/runtime-helpers.test.ts` (real file).
  It builds a `CommandContext` and a `host` with an `async exec(...)` stub that
  inspects `command`/`args` and returns a literal `ExecResult`. Reuse that exact
  pattern. The existing `ExecResult` literal it returns:
  ```ts
  { code: 0, killed: false, stderr: "", stdout: JSON.stringify({ exit_code: 0, data: { ... } }) }
  ```
  and the objective-list `data` shape it uses:
  ```ts
  { trunk_branch: "master", root_path: "/repo", status_filter: "active", names_only: false,
    records: [{ slug: "alpha", status: "active", latest_update_iso: null }] }
  ```
- For the **picker** path, build `ctx` with a `select`:
  ```ts
  const ctx: CommandContext = {
    cwd: "/repo", hasUI: true,
    ui: {
      notify: (m, level?) => notifications.push({ m, level }),
      select: async (title, items) => /* return one of items, or undefined to cancel */,
      setStatus: () => {},
    },
    modelRegistry: { find: () => undefined },
    waitForIdle: async () => {},
  };
  ```
  Pass it through `objectiveSelectionContextFromCommandContext(ctx)` before
  calling `chooseActiveObjectiveSlug`, exactly as the existing test does.
- The `host.exec` stub for picker tests must answer **three** commands:
  `objective list ...`, `git diff ...`, and `git status ... -z ...`. Branch on
  `command`/`args[0]` and return tailored stdout per command.
- **TypeScript style**: no `any` (none in this package — use `unknown` + narrowing
  or the existing typed stubs), `function` declarations for helpers, assert on
  discriminants. Imports use `.ts` suffix and relative `../src/...` paths.
- Do **not** add dependencies.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck this package | `cd /Users/schrockn/code/asdl-tools/ts/packages/pi-extension-runtime && pnpm run check` | exit 0, no tsc errors |
| Run this package's tests | `pnpm --dir /Users/schrockn/code/asdl-tools/ts/packages/pi-extension-runtime run test` | all pass, including new tests |
| Run one new file | `pnpm --dir /Users/schrockn/code/asdl-tools/ts exec vitest run --config vitest.config.ts packages/pi-extension-runtime/test/objective-picker.test.ts` | pass |
| Install (if a fresh checkout) | `pnpm --dir /Users/schrockn/code/asdl-tools/ts install` | exit 0 |

## Scope

**In scope** (the only files you should create):
- `ts/packages/pi-extension-runtime/test/objective-picker.test.ts` (create)
- `ts/packages/pi-extension-runtime/test/objective-list.test.ts` (create)
- `ts/packages/pi-extension-runtime/test/objective-selection-picker.test.ts` (create)

**Out of scope** (do NOT modify):
- Any file under `ts/packages/pi-extension-runtime/src/`. Test-only plan. A real
  bug found via a test is a STOP condition, not a fix-here task.
- The existing `test/runtime-helpers.test.ts` — leave it as is (add new files;
  do not move its cases).

## Git workflow

- Branch: `advisor/002-pi-extension-runtime-objective-tests`.
- Commit message: short imperative subject (e.g. `Add tests for objective picker and selection paths`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Pure helpers — `objective-picker.test.ts`

Create `test/objective-picker.test.ts` importing from `../src/objective-picker.ts`.
Cover (these are pure functions — no host needed):

- `parseObjectiveDiffChangedSlugs`:
  - a normal `M\t.asdl/objectives/alpha/objective.md` line → `["alpha"]`.
  - a rename line `R100\t.asdl/objectives/old/x.md\t.asdl/objectives/new/x.md` → includes both `new` and `old` (sorted, deduped).
  - lines outside `.asdl/objectives/...` or shallower than `<slug>/<file>` → ignored.
  - blank input → `[]`.
- `parseObjectiveStatusChangedSlugs` (NUL-separated — build inputs with `"\0"`):
  - ` M .asdl/objectives/alpha/objective.md` (note 2-char status + space) → `["alpha"]`.
  - an ignored entry `!! .asdl/objectives/zeta/x.md` → excluded.
  - a rename entry `R  .asdl/objectives/new/x.md` followed by a second NUL entry `.asdl/objectives/old/x.md` → includes both `new` and `old`, and does not misparse the consumed second path as its own entry.
  - empty trailing entries ignored.
- `changedActiveObjectiveSelection`:
  - changed slugs that intersect active records → selection with `changedActiveSlugs` in record order.
  - no changed slugs → `undefined`; blank `changeBasisLabel` → `undefined`; changed slugs with no active intersection → `undefined`.
- `objectiveRecordsWithChangedFirst`: with a selection, changed records come
  first, others preserve order; with no selection, returns records unchanged.
- `objectiveChoiceMap`: maps each formatted choice string back to its slug;
  `formatObjectiveChoice` includes the `suggested: only Objective ...` prefix when
  the selection has exactly one changed-and-only active slug equal to the record.
- `objectiveDiffPickerTitle`: single-changed vs multi-changed suffix wording.

Use small inline `ObjectiveList`/`ObjectiveListRecord` literals (see the type in
`objective-list.ts` lines 3–15).

**Verify**: `pnpm --dir /Users/schrockn/code/asdl-tools/ts exec vitest run --config vitest.config.ts packages/pi-extension-runtime/test/objective-picker.test.ts` → pass.

### Step 2: Envelope parsing — `objective-list.test.ts`

Create `test/objective-list.test.ts` importing `parseObjectiveList` from
`../src/objective-list.ts`. Cover:
- valid envelope (the `data` shape from the conventions section) → `{ type: "valid" }` with the records mapped (`latest_update_iso: null` → `latestUpdateIso: null`).
- envelope with a non-array `records` → `{ type: "invalid" }` with a message mentioning the missing fields.
- a record missing `slug`/`status` → `{ type: "invalid" }` mentioning the record index.
- malformed JSON / failure envelope (`{ exit_code: 2, ... }`) → `{ type: "invalid" }`.

**Verify**: `pnpm --dir /Users/schrockn/code/asdl-tools/ts exec vitest run --config vitest.config.ts packages/pi-extension-runtime/test/objective-list.test.ts` → pass.

### Step 3: Picker path — `objective-selection-picker.test.ts`

Create `test/objective-selection-picker.test.ts`. Import `chooseActiveObjectiveSlug`
and `objectiveSelectionContextFromCommandContext` from `../src/objective-selection.ts`,
`VIEW_OTHER_OBJECTIVES_CHOICE` from `../src/objective-picker.ts`, and the
`CommandContext`/`ExecResult` types from `../src/cmux/types.ts` (same import the
existing test uses). Build a `host` whose `exec` branches on command/args:
- `command === "objective"` → return the objective-list envelope (with ≥2 records so "view others" is reachable).
- `command === "git" && args[0] === "diff"` → return diff stdout (code 0).
- `command === "git" && args[0] === "status"` → return `-z` porcelain stdout (code 0).

Record `select` calls (title + items) and `notify` calls. Cover:

- **Happy path, no changes**: git diff/status return empty stdout → no changed
  selection → full picker shown; `select` returns a known choice string → returns
  that record's slug. Assert the `select` was called once with all records.
- **Changed suggestion, compact** (`spec.compactDiffSuggestion: true`): git
  evidence marks one active slug changed → `selectChangedObjectivesOrOther` path.
  Assert the picker title includes the changed-basis suffix and, when there are
  other records, the items include `VIEW_OTHER_OBJECTIVES_CHOICE`. Selecting the
  changed choice returns its slug.
- **View others**: in the compact path, `select` returns `VIEW_OTHER_OBJECTIVES_CHOICE`
  on the first call, then a non-changed record's choice on the second call →
  returns the other slug; assert `select` was called twice.
- **Changed suggestion, non-compact** (`compactDiffSuggestion` absent/false):
  a "Found changed Objective(s) ..." notification is emitted (level `"info"`)
  and the full picker lists changed-first.
- **Cancel**: `select` returns `undefined` → returns `undefined` and notifies
  `"Objective selection cancelled."` (level `"info"`).
- **List failure with picker**: `objective` exec returns `{ code: 2, stderr: "boom", stdout: "" }`
  → returns `undefined` and a single error notification is emitted (assert a
  notify with level `"error"`).
- **Empty list with picker**: `objective` returns an envelope with `records: []`
  → returns `undefined` and an info notification mentioning `/objective:create`.
- **Advisory git failures don't break selection**: git diff/status return
  `{ code: 1, ... }` → no changed selection, full picker still shown (the catch
  branches in `objectiveDiffChangedSlugs`/`objectiveStatusChangedSlugs` swallow
  failures by design — assert selection still proceeds).

**Verify**: `pnpm --dir /Users/schrockn/code/asdl-tools/ts exec vitest run --config vitest.config.ts packages/pi-extension-runtime/test/objective-selection-picker.test.ts` → pass.

### Step 4: Typecheck and full-package test

**Verify**:
- `cd /Users/schrockn/code/asdl-tools/ts/packages/pi-extension-runtime && pnpm run check` → exit 0.
- `pnpm --dir /Users/schrockn/code/asdl-tools/ts/packages/pi-extension-runtime run test` → all pass (existing + new).

## Test plan

- `test/objective-picker.test.ts` — pure parsing/selection helpers (Step 1),
  including the adversarial `-z` rename/copy cases.
- `test/objective-list.test.ts` — envelope parse valid/invalid (Step 2).
- `test/objective-selection-picker.test.ts` — the full picker control flow
  (Step 3), the gap the existing `runtime-helpers.test.ts` leaves open.
- Structural pattern: the `host`/`ctx` stubs in the existing
  `test/runtime-helpers.test.ts`.
- Verification: the per-file `vitest run` commands, then full-package `run test`.

## Done criteria

ALL must hold:

- [ ] `cd /Users/schrockn/code/asdl-tools/ts/packages/pi-extension-runtime && pnpm run check` exits 0.
- [ ] `pnpm --dir /Users/schrockn/code/asdl-tools/ts/packages/pi-extension-runtime run test` exits 0; the three new files run and pass.
- [ ] At least one test exercises each picker branch: full picker, compact changed picker, view-others, cancel, list-failure, empty-list.
- [ ] `git status --porcelain` shows only the three new test files added (no source modified).
- [ ] `shadcn-improve/plans/README.md` status row for 002 updated to DONE.

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts don't match the live code (drift since `d637e619b`).
- The exact shape of `CommandContext`/`ExecResult` in `src/cmux/types.ts` differs
  from the existing test's usage (the type may have required fields not shown
  here) — read that file and adapt the stub; if a required collaborator can't be
  stubbed without real I/O, report it.
- A test written to document *correct* behavior fails because the source is wrong
  — report the suspected bug; do not edit source.
- `ui.select`'s signature differs from `(title, items) => Promise<string | undefined>`
  — report it; the picker assertions depend on it.

## Maintenance notes

- If the "changed Objectives" suggestion UX changes (compact vs notify+full, or
  the `VIEW_OTHER_OBJECTIVES_CHOICE` label), the Step 3 branch assertions need
  updating — keep them asserting on behavior (which slug is returned, how many
  `select` calls) rather than exact title strings where possible.
- If `objective list` JSON gains/renames fields, update `objective-list.test.ts`
  and the host stubs.
- Reviewer should confirm the picker tests assert observable outcomes (returned
  slug, notify level, number of `select` calls) and avoid coupling to incidental
  wording.
</content>
