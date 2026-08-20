# Handoff: Split the combined Flow provider PR into the required Graphite stack

Continuation focus: Correct the delivery-shape failure by splitting combined commit `8f5849129` and PR #4261 into the three Graphite branches/PRs required by the authoritative attached branch-context plan. The user explicitly approved proceeding with the destructive local-history and external Graphite/GitHub mutations needed to do this.

## Context

Branch `provider-explicit-flow-autobranch-families` implements provider-explicit Flow command families for Graphite (`gt`) and official `github/gh-stack` v0.1.0 (`gs`). The attached branch-context plan required three independently reviewable PRs, but the implementation was kept as one uncommitted cumulative diff. Running `ns flow gt submit` checkpointed all work into one commit and created one PR instead of the required stack.

## Current State

- Current branch: `provider-explicit-flow-autobranch-families`.
- Combined commit: `8f5849129e9d211c83289fd1caffb0a8dd3c4906` (`[cp] Add provider-specific Flow command surfaces`).
- Combined PR: GitHub #4261, https://github.com/nseng-ai/ns/pull/4261; Graphite version 1.
- Graphite currently reports this branch with parent `master`.
- The worktree was clean immediately after submission.
- The combined implementation passed `just`; the default TypeScript suite passed 6,208 tests.
- One unrelated integration failure remained in `ts/packages/public/ns/test/integration/objectives-command-host.test.ts` (the malformed unrelated filesystem mount case expected exit 0 and received 2).
- No split branches or replacement PRs have been created yet.

## Decisions / Findings

- Required stack shape and order:
  1. `flow-gt-command-group-cutover`
  2. `flow-gs-autobranch-provider`
  3. `flow-gs-autoslot-and-surface-completion`
- PR 1 owns the alias-free `ns flow gt` cutover, stable command identities, Pi argv updates, GT skill renames, and independently truthful live docs/tests.
- PR 2 owns the private provider seam, Graphite adapter preservation, official gh-stack v0.1.0 adapter, provider-aware dirty/latest-commit transactions and recovery, GS autobranch/latest CLI/Pi/skills, capability-matrix update, and tests/docs.
- PR 3 owns GS autoslot, shared provider-bound autoslot composition, final parity/docs/live-reference sweep, and final skill topology verification.
- The user has now explicitly authorized correcting the mistake, including destructive local history and external Graphite/GitHub changes.
- Use Graphite (`gt`) as the default branch/commit/submit mechanism. Inspect topology before mutation and preserve the authoritative plan’s exact slice boundaries.
- Do not mutate Branch Memory while implementing the attached plan. Do not rewrite ADR 0049 or historical Objective records.
- The implementation underwent repeated standards/spec review. Important corrected behavior includes actual gh-stack v0.1.0 optional JSON fields, non-mutating latest planning, conservative failed-init reporting, SHA-verified stash recovery, exact latest recovery facts, and provider-bound clean GS autoslot coverage. Preserve those corrections while splitting.

## Next Steps

1. Load the attached branch-context plan and the `code-graphite` skill before changing topology.
2. Reconfirm branch/worktree/Graphite/GitHub state (`git status`, `git log`, `gt branch info`, and PR #4261).
3. Plan a safe split of combined commit `8f5849129` into the three exact landing batches above. Prefer reconstructing commits by path/hunk classification from the combined commit while retaining all reviewed fixes in their owning slice.
4. Create/restack the three Graphite branches in dependency order. Ensure each intermediate PR is independently truthful and green; do not leave PR 1 referring to GS behavior that only lands in PR 2 or PR 3.
5. Update or replace PR #4261 as appropriate so the final GitHub/Graphite state is a three-PR stack, not one cumulative PR. Record what happened to #4261.
6. Validate each slice with focused tests and the plan’s required gates; then validate the cumulative stack. Report the known unrelated integration failure only if it reproduces.
7. Confirm final `gt` topology, three PR URLs, commit boundaries, clean worktrees, and absence of accidental changes.

## Investigation Sources

- Source session ID: 01a0207d-4bc9-7e2f-8ca3-ee3163d2f267
- Source session log: /Users/schrockn/.pi/agent-ns-dev/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-08--/2026-08-20T18-44-37-449Z_01a0207d-4bc9-7e2f-8ca3-ee3163d2f267.jsonl
- Related files:
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-ZDaqYB/fb4c5126-9950-447f-8452-bc6624003196.jsonl` — PR 3 implementation session and validation evidence.
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-DdCQ40/bd6e29a8-5b3b-473c-a293-0e589f65809e.jsonl` — remediation of official gh-stack v0.1.0 and recovery blockers.
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-nOIaU8/5c451b7f-d50a-402e-b0c9-3203633e5676.jsonl` — final stash-recovery, autoslot test-architecture, and lockfile remediation.
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-2MIX7M/1143cb2f-bd69-4bcf-90e3-4ab94e8988f7.jsonl` — final GS latest recovery-facts and synchronized-warning remediation.
  - `ts/packages/incubating/extensions/flow/src/api/command-surfaces.ts` — final command identity and CLI/Pi surface inventory.
  - `ts/packages/incubating/extensions/flow/src/autobranch/provider.ts` — Graphite/gh-stack provider seam and v0.1.0 adapter boundary.
  - `ts/packages/incubating/extensions/flow/src/autobranch/dirty-transaction.ts` — provider-aware dirty transaction and stash recovery.
  - `ts/packages/incubating/extensions/flow/src/autobranch/latest-commit-transaction.ts` — provider-aware latest-commit mutation and recovery.
  - `ts/packages/incubating/extensions/flow/src/autoslot/autoslot.ts` — shared GT/GS autoslot workflow.
  - `docs/conventions/stack-provider-capability-matrix.md` — rebaselined official gh-stack v0.1.0 facts.

## Useful Commands / Files

```bash
git status --short
git log --oneline --decorate -5
git show --stat --oneline 8f5849129
gt branch info --no-interactive
gh pr view 4261
```

The authoritative implementation plan remains attached to branch context under key `provider-explicit-flow-autobranch-families.md` in namespace `branch-context`. Use it as the source of truth for path ownership, slice boundaries, STOP conditions, and validation requirements.
