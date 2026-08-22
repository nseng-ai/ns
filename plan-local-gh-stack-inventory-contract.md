# Handoff: Plan a simpler local-only gh-stack inventory

Continuation focus: Plan a simpler design for `ns gs list` in a fresh session, centered on local gh-stack state with an honest indication that GitHub was not checked and may differ.

## Context

Branch `gh-stack-inventory-command-activation` currently contains commit `6db6da788` (`[cp] Add gh-stack inventory extension`) and was submitted as PR #4271: https://github.com/nseng-ai/ns/pull/4271. The implemented command combines `<git-common-dir>/gh-stack` with the GitHub Stacks API, strictly reconciles the two sources, and exposes a stable human and machine contract. After submission, the user questioned the feature's size and wants a fresh planning session for a simpler design.

## Current State

- The worktree is clean at `6db6da788`.
- `@nseng-ai/gh-stack` and `ns gs list` are fully implemented and committed.
- The current implementation is about 2,388 added lines: roughly 1,054 production TypeScript, 1,141 tests/fixtures, 126 documentation/context, and 67 registration/metadata lines.
- The largest complexity comes from remote discovery, two-source reconciliation, compatibility validation, strict failure handling, and tests—not table rendering.
- PR #4271 is open and already has generated title/body metadata.
- No simplification has been designed or implemented yet.

## Decisions / Findings

- A local-only command would be substantially simpler because it could remove the GitHub API adapter, pagination and 404/auth handling, remote schemas, remote-only rows, cross-source number/ID reconciliation, composition conflict handling, and live remote PR enrichment.
- The honest contract should say **local provider state; GitHub not checked**. Do not claim that the server is specifically stale: without querying GitHub, ns cannot know whether local state, server state, or both differ.
- Candidate machine evidence is `source: "local"` plus `remoteStatus: "not-checked"`, but this is only a discussion seed, not a settled contract.
- A local-only command can reliably show local branch order, local base, recorded stack number, recorded PR references, local merged flags, and branches without PR references. It cannot reliably claim GitHub-only inventory, current open/closed state, current merge state, creation time, or local/remote agreement.
- Consider simplifying the human status vocabulary so cached local PR references are not presented as live GitHub status.
- The existing PR can be amended if the planning decision is to narrow v1; do not preserve the current remote behavior merely because it is already submitted.

## Next Steps

1. Load the attached branch-context plan only as historical evidence; explicitly identify which settled decisions the simpler proposal would supersede.
2. Inspect the current package anchors rather than repeating broad reconnaissance.
3. Define the exact user question for v1: likely “What stacks does this checkout know about?”
4. Design the smallest honest human and machine contracts for local-only inventory, including the remote-not-checked indication.
5. Decide whether `gh stack --version` preflight is still necessary or whether safely readable local state is sufficient.
6. Identify production modules, tests, failure classes, result fields, and docs that would be deleted or simplified.
7. Produce a reviewed implementation plan for amending PR #4271; do not edit code until the new scope is agreed.

## Investigation Sources

- Source session ID: 01a02778-a367-7782-aa67-14db8d990575
- Source session log: /Users/schrockn/.pi/agent-ns-dev/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-08--/2026-08-22T03-16-52-711Z_01a02778-a367-7782-aa67-14db8d990575.jsonl
- Related files:
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-nOurIA/323fb9ea-91cd-4b3b-a27c-7cb9774139b1.jsonl` — foundation implementation child session and validation evidence.
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-R6qRUo/1e703b09-1b49-42c8-ab7d-a6ab6009ac18.jsonl` — CLI activation, discovery, and documentation child session.
  - `ts/packages/incubating/extensions/gh-stack/src/core/gateways/real.ts` — local and remote adapters; primary deletion/simplification candidate.
  - `ts/packages/incubating/extensions/gh-stack/src/core/gateways/schemas.ts` — local and remote compatibility schemas.
  - `ts/packages/incubating/extensions/gh-stack/src/core/reconcile.ts` — current two-source reconciliation complexity.
  - `ts/packages/incubating/extensions/gh-stack/src/ns/commands/list.ts` — current CLI schema, failure mapping, and renderer contract.
  - `ts/packages/incubating/extensions/gh-stack/test/` — current compatibility, reconciliation, scenario, and integration coverage.
  - `ts/packages/incubating/extensions/gh-stack/README.md` — current user-facing complete-inventory promise.
  - `docs/conventions/stack-provider-capability-matrix.md` — current shipped provider scope statement.

## Useful Commands / Files

- PR: https://github.com/nseng-ai/ns/pull/4271
- Current commit: `6db6da788 [cp] Add gh-stack inventory extension`
- Inspect patch size: `git show --stat --oneline 6db6da788`
- Inspect package: `find ts/packages/incubating/extensions/gh-stack -type f -print | sort`
- Current acceptance commands: `ns gs list`, `ns gs list --format json`, and `ns gs list --json-schema`
