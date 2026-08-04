# Handoff: Audit SDK filesystem cutover deletions

Continuation focus: Determine whether the large deletions in PR #4091 are appropriate, identifying intentional replacement/removal versus lost behavior or coverage.

## Context

On branch `sdk-filesystem-host-cutover`, PR #4091 (`Rebuild SDK host composition on filesystem sources`) replaces the old in-memory SDK extension registry and monolithic command registration with filesystem-discovered command sources and route-local `command.ts` / `metadata.ts` modules. The PR currently reports 4,500 additions, 12,638 deletions across 414 files. The user wants a substantive appropriateness audit, not merely an explanation of where the deletions came from.

## Current State

The branch contains:

- `30d0357a2` — the large filesystem SDK host cutover.
- `faa8999bd` — fixes the Pi smart-restack consumer to accept current Clinkr envelope statuses (`success`, `usage-error`); submitted in PR #4091.

`just` passed before submission: 586 test files and 6,313 tests. PRs #4090 and #4091 were submitted. No deletion audit has yet been completed.

Most deletions are concentrated in `ts/packages/public/sdk/`:

- SDK tests: 5,112 deleted lines.
- SDK source: 3,439 deleted lines.
- SDK docs: 1,118 deleted lines.

Largest removals include the old extension registry, command registry, loader/registry tests, CLI scenario tests, and documentation. Additional deletions remove monolithic command modules in Objectives, PR Feedback, Reviews, and other extensions while adding filesystem route modules.

## Decisions / Findings

- The large deletion count comes from `30d0357a2`, not the small restack-envelope fix.
- PR #4091 is correctly based on `clinkr-scope-local-topology-issues`; this is not an accidental Graphite base-diff issue.
- Passing `just` proves the retained default suite passes, but does not prove every deleted behavior or test assertion has an equivalent replacement.
- The audit should classify removals rather than assume all deletion is justified: obsolete architecture, moved/re-expressed behavior, intentionally narrowed public contract, or accidental coverage/feature loss.
- Pay special attention to deleted SDK tests because several large scenario and registry suites disappeared while replacement test volume is much smaller.

## Next Steps

1. Read the PR intent and authoritative SDK context/README, then inspect the full `30d0357a2^..30d0357a2` diff.
2. Build a deletion inventory by capability: registry/loading, completion, extension options, built-in command hosting, Flow/Reviews/Objective command surfaces, public SDK exports, and documentation.
3. For each deleted source module and major test suite, locate its replacement or document the explicit contract removal. Compare assertions and supported surfaces, not line counts.
4. Check whether specialized integration/isolated/style lanes are relevant and run them if the audit identifies boundaries not covered by `just`.
5. Report concrete findings ranked by severity with file anchors; explicitly state which deletion groups are appropriate and which require restoration or replacement coverage.

## Investigation Sources

- Source session ID: 019fcedc-e7df-7538-8c58-ce2b3b82a606
- Source session log: /Users/schrockn/.pi/agent/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-05--/2026-08-04T22-20-11-615Z_019fcedc-e7df-7538-8c58-ce2b3b82a606.jsonl
- Related files:
  - `ts/packages/public/sdk/CONTEXT.md` — current SDK domain model and intended architecture.
  - `ts/packages/public/sdk/README.md` — canonical SDK user-facing contract after the cutover.
  - `ts/packages/public/sdk/src/extensions/registry.ts` at `30d0357a2^` — removed in-memory registry implementation.
  - `ts/packages/public/sdk/src/extensions/source-inventory.ts` — replacement filesystem source inventory.
  - `ts/packages/public/sdk/src/extensions/source-dev-sources.ts` — replacement source-development discovery.
  - `ts/packages/public/sdk/test/unit/extension-registry.test.ts` at `30d0357a2^` — largest deleted test suite and key behavior inventory.
  - `ts/packages/public/sdk/test/unit/source-inventory.test.ts` — replacement inventory coverage.
  - `ts/packages/public/sdk/test/unit/source-dev-sources.test.ts` — replacement source-discovery coverage.
  - `ts/packages/public/ns/src/cli/preinstalled-command-catalog.ts` — new filesystem-backed host composition.
  - `ts/packages/incubating/extensions/slots/src/ns/slot-ns-command.ts` — representative command adapter changed by the cutover.
  - `ts/packages/internal/hosts/pi/tools/pi-tools/src/code-workflows/restack-preflight.ts` — recently repaired direct machine-envelope consumer.

## Useful Commands / Files

- PR: https://github.com/nseng-ai/ns/pull/4091
- `gh pr view 4091 --json additions,deletions,changedFiles,commits,files`
- `git diff --stat 30d0357a2^ 30d0357a2`
- `git diff --numstat 30d0357a2^ 30d0357a2 | sort -k2,2nr`
- `git diff --diff-filter=D --name-only 30d0357a2^ 30d0357a2`
- `git show 30d0357a2^:<path>` to inspect removed files without changing the worktree.
- Root validation already passed via `just`; consult `ts/AGENTS.md` before selecting additional lanes.
