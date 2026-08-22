# Handoff: Run code-split-pr against the Saved Plan donor PR

Continuation focus: In a fresh session, run the `code-split-pr` skill properly against donor `eb5ae1f75` (vs `master`) and emit the complete split plan for iteration.

## Context

Branch `hidden-cli-saved-plan-persistence` (PR #4272, commit `eb5ae1f75`) implements the whole "hidden CLI saved-plan persistence" change in one 51-file diff: timestamped Saved Plan filenames, byte-preserving hidden `enriched-plan exec save --content-file`, lock-backed atomic publication, durable explicit-or-latest selection, removal of the Pi `write_saved_plan_file` tool and Saved Plan session evidence, consumer migrations (Branch Context, Herdr), and docs/prompt updates. The user found the PR too large to review and, through iteration, we designed a decision-sized stack shape and authored a new experimental skill, `code-split-pr` (invoke-only, `skills/internal/code/code-split-pr/SKILL.md`), that encodes the approach. That skill now lives on branch `add-code-split-pr-skill` (commit `3afb2ceb4`), stacked on top of the donor branch.

## Current State

- Donor implementation complete and green: `eb5ae1f75` on `hidden-cli-saved-plan-persistence`, submitted as PR #4272 (https://github.com/nseng-ai/ns/pull/4272). All TS gates pass; one unrelated pre-existing integration failure in `packages/public/ns/test/integration/objectives-command-host.test.ts`.
- `code-split-pr` skill created and committed on `add-code-split-pr-skill` (child of the donor branch).
- Informal stack proposal exists (in the source session, not yet a skill-complete plan): 4 decision PRs — (1) define timestamped Saved Plan format, (2) publish via hidden CLI, (3) replace Pi tool with CLI-driven prompts, (4) durable-store-only selection — plus mechanical candidates: test-fixture modernization, retired-tool dead-code deletion, selected-plan shape normalization.
- Rebuild strategy already decided: fresh stack from `master`, donor retained until stack tip diffs to zero against `eb5ae1f75` (except deliberate improvements).
- Not yet done per the skill's own contract: coverage map (donor file → batch), systematic donor learnings mining, executor handoff, and settling the "if feasible" mechanical batches in or out.

## Decisions / Findings

- Each PR must encode one human decision with isolated consequences; mechanical PRs exist only to remove review noise and must be provably behavior-preserving.
- Plan-only skill: `code-split-pr` emits the plan and never mutates branches; it is tool-neutral (no gt/Graphite commands in it).
- Donor learnings that must be mined and classified (discovered during implementation, not in the original plan): lock lease renewal and ownership-token lease; post-link cleanup failures must not fail a completed publication; typed resolve outcomes (`not-found`/`unsafe`/`error`) instead of `unexpected-error`; discriminated timestamped/legacy resolve schemas; `realpathOrResolve` falls back only on ENOENT; concurrent same-timestamp sequence-allocation integration tests.
- Topology flag: `add-code-split-pr-skill` is parented on the donor branch, which is destined to be superseded/closed; it should be re-parented onto `master` before or during the split work.
- This work intentionally overrides the active `clinkr-output-and-interaction-model` Objective (which had deleted `enriched-plan exec save`); the user explicitly approved the override. Do not treat that Objective conflict as a STOP.

## Next Steps

1. In the fresh session, load `.agents/skills/code-split-pr/SKILL.md` and run it against donor diff `master..eb5ae1f75` (`git diff b48e973c4..eb5ae1f75`).
2. Produce the full plan shape: ordered batches with reviewer questions/classes, complete coverage map for all 51 changed files, donor learnings classification, rebuild-strategy recommendation, executor handoff with per-branch validation and diff-to-zero verification.
3. Settle the mechanical candidates (fixture modernization, tool deletion, shape normalization) in or out with explicit non-combination rationale.
4. Iterate the plan with the user until accepted; do not mutate branches during planning.
5. Flag/handle the `add-code-split-pr-skill` re-parent onto `master`.

## Investigation Sources

- Source session ID: 01a029b8-2f9b-7ffa-b59c-d261798a4418
- Source session log: /Users/schrockn/.pi/agent-ns-dev/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-09--/2026-08-22T13-45-31-803Z_01a029b8-2f9b-7ffa-b59c-d261798a4418.jsonl
- Related files:
  - skills/internal/code/code-split-pr/SKILL.md — the skill that defines the workflow to run (on branch `add-code-split-pr-skill`)
  - ts/packages/incubating/extensions/plans/src/plan-store-gateway.ts — densest donor code (locking/publication); key learnings source
  - ts/packages/incubating/extensions/plans/src/saved-plan-format.ts — new format parser; natural bottom-PR content
  - ts/packages/incubating/extensions/plans/src/saved-plan-selection.ts — selection rewrite; top-PR content
  - ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/src/saved-plan-commands.ts — Pi tool removal / prompt-driven save
  - .ns/prompts/branch-context.plans-write.md — the finalization procedure prompts must preserve per batch
  - Subagent session logs from implementation (temp paths, may be gone): /var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-*/*.jsonl — per-slice implementation and review evidence

## Useful Commands / Files

- Donor diff: `git diff b48e973c4..eb5ae1f75 --stat` (51 files; `b48e973c4` is master base)
- Donor file list: `git diff --name-status b48e973c4..eb5ae1f75`
- PR: https://github.com/nseng-ai/ns/pull/4272 (close as superseded only after replacement stack verified)
- Diff-to-zero check at stack top: `git diff eb5ae1f75..HEAD`
- Validation gates: `just ts-deps-check ts-format-check ts-lint ts-check ts-test ts-test-integration ts-test-isolated ts-test-sanity ts-test-typescript-style-guard` and `just dprint-check`
