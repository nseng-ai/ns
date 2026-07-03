# Second §A drift pass: objective-runner decomposition absorbed; artifacts re-verified

## Summary

A full runbook §A drift re-check ran against the current tree (branch restacked on
master tip `de41e0dbb`, which includes the Objective Runner begin/finish
decomposition, ADR `0024-objective-runner-begin-finish-decomposition.md`, and the
capability-API rehome `04bcc9b70`). Drift was small and is fully folded: the plan
re-assembles green at **122 simple / 9 changesets / 30 cohorts / 28 skips /
22 invariants** (chunks 103s+9c / 3s+17c / 16s+13c), baselines re-frozen at
**949 `@sdl/` files / 158 src-dir survivor lines**.

## Drift found and folded

- **4 new candidates**, all from the runner begin/finish decomposition:
  - `objective/test/scenario/exec-runner-begin.test.ts`,
    `objective/test/scenario/exec-runner-finish.test.ts`,
    `objective/test/integration/runner-finish-git.test.ts` — auto-bucketed to
    chunk-2 test cohorts by the existing path rules; no hand work.
  - `objective/src/sdl/commands/exec-runner-step.ts` — hand-classified simple
    (precedent: fold-time hand-classification). Only in-window content is
    doc-comment `.sdl/extensions/objective/…` path prose; the
    `"./sdl/commands/…"` exports subpath, `@sdl/*` imports, and identifiers are
    survivors. The file carries an `ADR0024-LEGACY-DELETE(whole file)` marker
    (objective-runner's final slice deletes it) but is live at the window, so it
    stays in the plan; if the deletion lands first, the entry drops out at the
    same-day §A re-run.
- **2 stale simple decisions pruned**: `ts/scripts/render-cli-shim-core.ts` and
  `ts/scripts/source-cli-shim-template` had standalone decisions predating their
  promotion into `cs8-shim-tokens`; prepass now subtracts them from the residue,
  so the dead entries were removed (decisions back to 90).
- The runner work's new brand surface (`SDL_RUNNER_PI_BIN` env var,
  `sdl-objective-runner-` tmpdir prefix in `pi-child-session-gateway.ts`) was
  already covered by the fold-time hand-classification of that file; evidence
  line numbers refreshed.

## Verification beyond the generator diff

- `anchored-not-candidate.txt` empty — no anchor went stale despite the
  capability-API rehome (`src/operations/` → `src/core/operations/` etc.).
- All 476 work-list paths in `cutover-plan.json` map back to existing pre-mv
  files; `skips` and `mvOnly` verified likewise.
- Hand-maintained artifacts (`brief.md`, `invariants.json`, `anchors.json`)
  scanned for path references: no stale file references (the
  `.sdl/prompts/pr-description.md` string is a runtime constant value, not a
  repo file, and is invariant (a)'s subject).
- `assemble-plan.py` REVIEW lines are the five known lockstep couplings, all
  already promoted to changesets or loud test-gated pairs — no new coupling.

## Ground-truth notes surfaced to the parent

- `docs/adr/` now contains **two ADR 0024s** (`0024-rename-sdl-to-ji.md` and
  `0024-objective-runner-begin-finish-decomposition.md`); duplicate numbers also
  exist for 0016 and 0022. References here use filenames, so nothing operative
  breaks; recorded in the parent's refresh update.
- `SDL_RUNNER_PI_BIN` joins the SDL_* env vars that stop working at the landing
  — added to the parent's machine-migration notes.
