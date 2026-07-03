# Dry-run 1 executed; findings + owner rulings folded into the pipeline

## Summary

The landing-window dry-run (runbook §B) ran end-to-end and finished green: 3 chunks
(~190 engine agents, 0 failures), 2 fix rounds (budget exactly consumed), full
`just` gate green (3803 tests), all §B5 smoke tests pass (`ji --help`, old shim
gone, `ji objective list`, `load-orientations`). The rehearsal validated the
architecture — partition totality held with ZERO unowned files in every residual
sweep — and exposed input gaps, all now folded. Artifacts:
`cutover/dry-run/1-*.{json,txt,md}`; the narrative findings doc is
`cutover/dry-run/1-findings.md`.

## What the rehearsal taught

- **Two pipeline escapees.** `kernel/src/extensions/loader.ts` (snake_case
  diagnostic code `sdl_extension_contribution_import_failed`) matched no generator
  pattern and no invariant; `address/src/core/feedback-summary.ts`
  (`<!-- sdl-reviewer:` PR-comment marker) likewise. Every other real defect was a
  hint gap (env-var-name string values, `sdl-command-ack` machine keys,
  `sdl_toml_invalid`), not a mis-assignment.
- **7 of 10 invariant failures were false positives** — greps written stricter
  than the brief's identifier-survivor rules (SCREAMING `SDL_*` identifiers,
  `.sdlTier` property access, the `sdl-cli-design` skill name, `join(…,"sdl",…)`
  src-dir builders, absence-assertion tombstones, both frozen baselines, and a
  legacy-format fallback misread as a cutover shim).
- **Ownership splits create two-phase desyncs**: style-guard test (cs2) vs its
  support modules (chunk-2 cohorts); a production prompt-md routed to chunk 3
  after the chunk-2 test that asserts it.
- **Gate mechanics**: reused checkouts need `rm -rf ts/node_modules` before
  `pnpm install` relinks `.bin/ji`; expect `dprint-fix` + `ts-format-fix` rounds;
  ambient `FORCE_COLOR=3` fails two clinkr tests spuriously.
- **Model economics**: haiku (simple) / sonnet (complex + verify) with opus
  overrides stripped produced zero capability-attributable misses.

## Owner rulings (2026-07-02, recorded in runbook §C and the brief)

1. Brand PROSE ("SDL kernel", message prose, doc titles) → branding row (explicit
   DO-NOT-TOUCH).
2. `<!-- sdl-reviewer:` marker → RENAMES; recognition of pre-cutover GitHub PR
   comments knowingly breaks.
3. Brand-named tmpdir prefixes → rename to `ji-`; package-name-derived prefixes
   (`sdl-flow-…`) survive.
4. Historical-fact prose in live docs stays verbatim.

## Amendments folded

- `generate-candidates.sh`: G11 (`sdl_[a-z_]+` string literals + `<!-- sdl-`
  marker); both survivor baselines re-derived (objectives-tree exclusion,
  XDG-context exclusion, line-count semantics).
- `invariants.json`: +`residual-snake-codes` (now 22); survivor carve-outs and
  position-based judging added to residual-env-vars, residual-machine-keys,
  residual-dot-sdl, residual-namespace, residual-bin-argv, style-guard-bucket,
  scope-untouched-baseline, no-compat-shim.
- `brief.md`: env-var-NAME positions spelled out; snake-code, marker, and
  tmpdir-prefix rename rules added; brand-prose, historical-fact, and
  absence-assertion survivor rules added.
- `anchors.json`: loader.ts + the style-guard support trio joined cs2 (desync
  eliminated); cs3/cs5/cs6 notes name the previously-missing env vars and machine
  keys; feedback-summary.ts anchored; CONTEXT-MAP hint covers `sdl slot gt`.
- `assemble-plan.py`: production-embedded `ts/packages/**/src/**.md` routes to
  chunk 1 (was: all md → chunk 3, after the tests that assert it).
- `classification-decisions.json`: project-agents.ts and
  pr-stack-feedback-instructions.md hints extended.

## Post-restack drift absorbed (fold-time §A pass)

The pipeline branch was restacked onto refactored trunk after the dry-run, so the
fold included a full §A regenerate/prepass/classify/assemble cycle:
`cs9-graphite-command-channel` added (typed `command: "sdl"` union pair from the
land/stack refactor, absorbing the retired `command-exec.ts` anchor);
`submit-failure-catalog.ts` and `pi-child-session-gateway.ts` hand-classified
(4-file delta; classify-workflow skipped deliberately — grep evidence in the
decision entries); `pr-facts.ts` decision pruned (in-window content refactored
away). `assemble-plan.py` validates green: **121 simple / 9 changesets /
29 cohorts / 28 skips / 22 invariants** (chunks 102s+9c / 3s+16c / 16s+13c),
baselines re-frozen at 940 `@sdl/` files / 153 src-dir survivor lines.

## Deviations from the runbook recorded

Dry-run ran in worktree slot-09 (owner choice) rather than /tmp — which surfaced
the reused-checkout pnpm relink quirk now documented in §B4; the interrupted
chunk-1 session was resumed via `resumeFromRunId` (idempotent re-run, engine
behaved correctly); models ran downgraded (haiku/sonnet) with owner approval.

## Next

The dry-run roadmap row is complete. Remaining before the real landing: same-day
§A re-run at the window, then §B on a dedicated branch (runbook §B6 real-landing
wrap-up: parity-table evidence, Semantic Update, hand-back to parent
`rename-sdl-to-ji`).
