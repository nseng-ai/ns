# Roadmap

## Work

- [x] Resolve Q1–Q4 with the owner and record the decisions here and in
      `rename-sdl-to-ji/cutover-inventory.md` — they gate the workflow's edit list.
      Evidence: owner decision 2026-07-02 — everything renames to ji (manifest key
      `"ji"`, `ji.toml`, legacy-fallback prose rewritten to `~/.ji/…`, all small-fry
      literals; `src/sdl/` → `src/ji/` delegated to the parent's package-scope sweep).
      Recorded in `objective.md` Open Questions and the cutover inventory; see update
      `2026-07-02-q1-q4-resolved-everything-is-ji.md`. The workflow-script-placement
      question remains open on the workflow-authoring row.
- [x] Correct operative spec text in `ship-objectives-to-customers` (unbuilt `sdl init`
      scaffolding) and `skill-management-subsystem` (`sdl skills` surface design) so no
      new sdl-named surface gets built pre-cutover.
      Evidence: both Objectives' `objective.md`/`roadmap.md` now spec ji-named surfaces
      (`ji init`, `ji skills`, `@ji/init`, `.ji/objectives/`, `ji.toml`,
      `ji:objectives:*`, `ccc`/`jicc`) with an ADR 0024 naming note in each;
      present-state descriptions, existing package names, Objective slugs, and
      immutable updates left for the parent's sweeps. See update
      `2026-07-02-sibling-specs-corrected-to-ji.md`.
- [x] Author the cutover workflow script (Claude Workflow tool): partition the ATOMIC
      list from `cutover-inventory.md` into disjoint concurrent edit agents, add an
      adversarial verify stage targeting the named silent-failure traps, and emit a
      structured report; decide script placement (session one-shot vs
      `.claude/workflows/`, per the open question).
      Evidence: implemented as the re-runnable pipeline in `cutover/`
      (generator → prepass → classification → `assemble-plan.py` → validated
      `cutover-plan.json`: 118 simple / 8 changesets / 28 cohorts / 21 invariants /
      3 chunks) consumed by the unmodified generic `refactor-swarm-workflow` engine;
      placement decided (consumer instance, objective-colocated, no promotion);
      adversarial 5-lens verification ran over the artifacts. Inventory drift
      (SDL_* env vars, shim tokens, brand machine keys) found and folded in. See
      update `2026-07-02-cutover-pipeline-authored.md` and `cutover/cutover-runbook.md`.
- [x] Dry-run rehearsal of the landing window per `cutover/cutover-runbook.md` §B in
      a throwaway worktree (user-managed); capture reports under `cutover/dry-run/`
      and fold findings back into the pipeline inputs, regenerating the plan via
      `assemble-plan.py`.
      Evidence: dry-run 1 executed 2026-07-02 in worktree slot-09 on branch
      `ji-cutover-dry-run` (owner chose a real worktree over /tmp) — all 3 chunks +
      2 fix rounds ran, `just` gate green (3803 tests), all smoke tests pass.
      Artifacts: `cutover/dry-run/1-*.{json,txt,md}`; findings + owner rulings in
      `cutover/dry-run/1-findings.md` and runbook §C. Two pipeline escapees found
      (snake_case sdl_ codes; the sdl-reviewer PR marker) → G11 generator pattern +
      residual-snake-codes invariant added (22 total); loader.ts + style-guard
      support trio joined cs2; six invariant prompts got survivor carve-outs;
      baselines re-derived; production src/**.md now routes to chunk 1. All
      amendments folded and plan regenerated (121 simple / 9 changesets /
      29 cohorts). See update `2026-07-02-dry-run-1-findings-folded.md`.
- [x] Re-verify the frozen candidate lists against the repo when the landing window
      opens (drift check since the 2026-07-02 snapshot): re-run
      `cutover/generate-candidates.sh` + `prepass.sh`, diff per-surface lists,
      re-classify only the drift, re-assemble (runbook §A).
      Progress note: a full §A pass ran 2026-07-02 during the findings fold (the
      pipeline branch had been restacked onto refactored trunk): post-restack drift
      absorbed — cs9-graphite-command-channel added for the typed argv-channel pair,
      submit-failure-catalog.ts + pi-child-session-gateway.ts hand-classified,
      retired command-exec.ts anchor removed, lists re-frozen. Second §A pass ran
      2026-07-02 (post objective-runner begin/finish decomposition, ADR
      0024-objective-runner-begin-finish-decomposition): 4 new candidates — 3 runner
      test files auto-bucketed to chunk-2 cohorts, `exec-runner-step.ts`
      hand-classified simple (doc-comment `.sdl/extensions/` paths; file is
      ADR0024-LEGACY-DELETE but live at the window); 2 stale simple decisions pruned
      (the shim pair, covered by cs8 since the fold); plan re-assembled green —
      122 simple / 9 changesets / 30 cohorts / 28 skips / 22 invariants, baselines
      re-frozen at 949 `@sdl/` files / 158 src-dir survivor lines; all 476 work-list
      paths verified to exist pre-mv. See update
      `2026-07-02-objective-runner-drift-absorbed.md`. Row stays open for
      the SAME-DAY re-run at the real landing window.
      Closed at the real landing: the owner WAIVED the same-day re-run
      (ruling 2026-07-02, recorded in runbook §C and commit `fa9f55601`); the
      2026-07-02 post-drift §A pass stood as the plan snapshot, and the landing's
      scope-untouched baselines matched it exactly (949 `@sdl/` files /
      158 src-dir survivor lines).
- [x] Execute the landing in one window on a dedicated branch: `git mv .sdl .ji`, run
      the workflow over the ATOMIC list, `pnpm install` to regenerate lockfile/shims,
      and update the `cross-harness-parity` parity table in the same landing.
      Evidence: `just` passes; `ji objective list` and `ji objective exec
      load-orientations` work; no compat codepath introduced; every ATOMIC item
      addressed or explicitly re-bucketed.
      Evidence recorded 2026-07-03: real landing executed on `ji-cutover/landing`
      (B1 mv bracket `ff190fa70` + engine window this commit) — 3 chunks
      (~183 agents, 0 failures), 2 fix rounds (budget exactly consumed), `just`
      green (3994/3994 tests, baseline count matched), all §B5 smoke tests pass,
      parity-table rows 38/51 updated in-window, no compat codepath. Every
      work-list item addressed; 266 skips triaged (survivor-confirmed or
      fix-listed); 5 plan-gap brand machine literals found and renamed. Artifacts:
      `cutover/landing/*`; see update `2026-07-03-real-landing-executed.md`.
- [x] Record landing evidence in the parent `rename-sdl-to-ji` (its cutover row
      completes against this Objective) and hand remaining rename work (machine
      migration, sweeps, repo rename) back to the parent.
      Evidence: parent's `cutover-inventory.md` machine-migration notes gained the
      two landing-discovered items (rc-file `sdl shell integration` sentinel
      blocks; `refs/sdl/flow-land-backup{,-prev}` backup refs) alongside the
      standing `SDL_*` shell-profile env-var item; the parent's core-cutover row
      stays `[~]` until this Objective closes (owner's call). Machine migration,
      vocabulary sweep, package-scope sweep, and the repo rename remain parent
      rows, untouched by this window.

## Parked

- Generalizing the cutover workflow into a reusable platform capability — only if the
  script proves reusable beyond this landing; needs an explicit promotion path per
  `docs/platform-and-consumer.md`.
