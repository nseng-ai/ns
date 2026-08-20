# Handoff: Explore provider-native Flow branching experiences

Continuation focus: Explore an appropriate Flow product design where Graphite and github/gh-stack do not try to perform the same exact workflow. Embrace each provider’s underlying constraints and offer the best safe experience each can support.

## Context

Branch `flow-gs-autoslot-and-surface-completion` is the tip of a three-PR Graphite stack that added provider-explicit Flow command families. PR #4263 introduced a shared autobranch provider seam plus substantial dirty-worktree and latest-commit transaction/recovery logic. The resulting symmetry is expensive because Flow currently promises equivalent automatic behavior across Graphite and gh-stack even though their mutation and rollback capabilities differ.

The user wants to reconsider that product premise rather than merely refactor the current implementation.

## Current State

- Stack:
  1. `flow-gt-command-group-cutover` — PR #4262
  2. `flow-gs-autobranch-provider` — PR #4263
  3. `flow-gs-autoslot-and-surface-completion` — PR #4264
- Original combined PR #4261 was closed as superseded.
- Current branch is `flow-gs-autoslot-and-surface-completion`; the worktree was clean after submission.
- The final cumulative tree still matches original combined commit `8f5849129`.
- PR #4263 is large mainly because it implements and tests provider-aware dirty-worktree and latest-commit recovery across Git, stash state, and provider-private topology.
- No simplification has been implemented or planned yet.

## Decisions / Findings

- `provider.ts` abstracts topology inspection, source preparation, initialization, child creation/adoption, and postcondition verification for Graphite and gh-stack.
- `dirty-transaction.ts` stashes pending work, prepares the provider, creates a child, safely restores the exact stash, commits, and reports detailed recovery facts for partial failures.
- `latest-commit-transaction.ts` destructively extracts the latest commit into a child. Graphite and gh-stack require different mutation sequences; gh-stack additionally needs child pre-creation/adoption and cannot safely roll back one metadata entry.
- Most complexity follows from the product promise of cross-provider behavioral symmetry and transactional recovery, not merely poor module boundaries.
- A prior recommendation was to simplify aggressively by supporting autobranch only for dirty work, requiring explicit provider initialization, and treating provider-attachment failures as forward-only after preserving a committed Git child. That is useful input, not a settled decision.
- The next design exploration should not assume GT and GS need matching commands or semantics. It should preserve explicit provider selection and provider-private-state isolation from ADR 0049.

## Next Steps

1. Design at least three deliberately asymmetric product alternatives, grounded in actual Graphite and github/gh-stack capabilities.
2. For each provider, identify its natural happy path, safe failure boundary, and provider-native recovery mechanism before choosing commands.
3. Consider whether GT should retain `branch-latest-commit` while GS offers a different or narrower operation, rather than deleting the feature globally.
4. Consider provider-native initialization and attachment UX instead of a universal preparation transaction.
5. Compare alternatives by user value, surprise, destructive behavior, implementation size, recovery burden, and module depth/locality.
6. Recommend one concrete command surface and behavioral contract. Explicitly list which current modules, result variants, tests, skills, and docs could be deleted or simplified.
7. Do not mutate the existing stack until the user selects a direction.

## Investigation Sources

- Source Pi session ID: 01a020d5-b3e1-765f-8187-7aafad783195
- Source Pi session log: /Users/schrockn/.pi/agent-ns-dev/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-08--/2026-08-20T20-21-11-265Z_01a020d5-b3e1-765f-8187-7aafad783195.jsonl
- Related files:
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-y877dO/c24bf32e-4325-4ac7-985a-dcfd77c575a9.jsonl` — local three-branch split session and validation evidence.
  - `ts/packages/incubating/extensions/flow/src/autobranch/provider.ts` — current shared Graphite/gh-stack provider seam and adapters.
  - `ts/packages/incubating/extensions/flow/src/autobranch/dirty-transaction.ts` — dirty-worktree transaction and stash/provider recovery complexity.
  - `ts/packages/incubating/extensions/flow/src/autobranch/latest-commit-transaction.ts` — provider-specific destructive latest-commit extraction and recovery.
  - `ts/packages/incubating/extensions/flow/src/autobranch/latest-commit-preparation.ts` — eligibility and topology planning before latest-commit mutation.
  - `ts/packages/incubating/extensions/flow/CONTEXT.md` — canonical Flow vocabulary and ownership boundaries.
  - `docs/adr/0049-opt-in-provider-neutral-stacking.md` — accepted constraints on explicit provider selection, partial capabilities, observed postconditions, and private-state isolation.
  - `docs/conventions/stack-provider-capability-matrix.md` — recorded provider capability differences and gh-stack version facts.
  - `ts/packages/incubating/extensions/flow/test/autobranch/gh-stack-provider.test.ts` — concrete gh-stack adapter behavior and malformed/ambiguous cases.
  - `ts/packages/incubating/extensions/flow/test/autobranch/dirty-worktree-transaction.test.ts` — recovery scenarios currently required by dirty-flow symmetry.
  - `ts/packages/incubating/extensions/flow/test/autobranch/latest-commit.test.ts` — recovery scenarios currently required by latest-commit symmetry.

## Useful Commands / Files

```bash
git status --short --branch
ns slot gt exec stack-branches --format json
git diff --stat flow-gt-command-group-cutover..flow-gs-autobranch-provider
gh pr view 4263 --json additions,deletions,changedFiles,baseRefName,headRefName,url
```

PRs: https://github.com/nseng-ai/ns/pull/4262, https://github.com/nseng-ai/ns/pull/4263, https://github.com/nseng-ai/ns/pull/4264
