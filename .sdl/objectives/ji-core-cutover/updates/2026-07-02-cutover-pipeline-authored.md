# Cutover execution pipeline authored (plan artifact, invariants, runbook)

## Summary

The "author the cutover workflow script" roadmap row is implemented — as a checked-in,
re-runnable pipeline under `cutover/` rather than a session-scoped script, so the
entire process (candidate generation → classification → assembly → validation →
execution) can be replayed mechanically at the landing window or any drift re-check.

- **Engine decision:** the generic `.claude/workflows/refactor-swarm-workflow.js` is
  reused unmodified; everything cutover-specific is data (`cutover-plan.json`) plus
  procedure (`cutover-runbook.md`). This also closes the objective's last open
  question (script placement): consumer instance, objective-colocated, no promotion
  intended (pattern-promotion stays Parked).
- **Pipeline:** deterministic generator (10 surface greps + allowlist + survivor
  baselines, pre/post-mv modes) → prepass path-rule bucketing → Workflow-driven
  read-only classification of the 90 judgment files (frozen as
  `classification-decisions.json`) → `assemble-plan.py` synthesis with hard
  validation (totality over all 490 candidates, pairwise disjointness of the 461-path
  work-list, anchor coverage, skip audit, post-mv path resolution).
- **Plan shape:** 120 simple entries, 8 coordinated changesets (cs1–cs8), 28
  homogeneous cohorts, 28 documented skips, 21 adversarial invariants, split into 3
  sequential engine chunks; simple tier runs sonnet, the 5 hardest changesets carry
  opus overrides.
- **Adversarial pass:** a 5-lens skeptic workflow (inventory completeness, wrong
  skips, over-rename leakage, invariant soundness, runbook self-sufficiency) produced
  14 findings (3 blockers — most notably `node-runtime-cli.test.ts` escaping the
  candidate sweep entirely, fixed with a new generator pattern); all folded in and
  archived with resolutions at `cutover/dry-run/verify-findings.json`.

## Objective Impact

- Roadmap row 3 (author the workflow) is complete; row 4 (drift re-check) is now a
  mechanical `generate-candidates.sh` re-run + diff, and row 5 (execute the landing)
  is runbook §B. The user executes the dry-run per runbook §B (throwaway worktree;
  artifacts captured under `cutover/dry-run/`).
- **Inventory drift found and folded in:** the cutover inventory does not enumerate
  `SDL_*` env var names, `@@SDL_*@@` shim substitution tokens, or brand machine-key
  strings (`sdl-command-ack`, `sdl-cli-command-output`, `sdl-harness-session-id`,
  `sdl-pi-cli-command-extension.jsonl`). All rename in-window per the standing
  "no sdl-brand literal survives" resolution; recorded in runbook §C with an owner
  note that shell-exported `SDL_*` vars on owner machines must be renamed during the
  machine migration (parent row).
- Two silent-failure surfaces beyond the inventory's eight were promoted to
  coordinated changesets: the shim token pair (cs8) and the duplicated
  `ji-cli-command-output` message-type literal (added to the twins invariant).

## Follow-Ups

- User-managed dry-run per runbook §B; findings fold back into the pipeline inputs
  and `assemble-plan.py` regenerates the plan.
- At the real landing window: re-run pipeline steps A1–A5 same-day (drift re-check
  row), then runbook §B on the dedicated branch.
- Machine-migration checklist (parent objective) must add: rename shell-exported
  `SDL_*` env vars to `JI_*`.
