# Restack-resolve provider and recovery contract settled

## Summary

Disposable no-remote experiments against the installed official `github/gh-stack` v0.1.0 found a public provider-native mechanism for local inter-branch restacking: `gh stack rebase --no-trunk`, with `--downstack` for explicit narrower scope and `gh stack rebase --continue` for resumable conflict stops. Reproducible commands and observations are recorded in `docs/research/gh-stack-v0.1.0-restack-resolve-contract.md`, and the user-facing contract is now recorded in the GS README.

`gh stack sync` is rejected for restack-resolve because it couples rebasing to fetch, push, PR synchronization, and remote stack mutation. Plain `gh stack rebase` is rejected because it pulls from the remote by default. A GS-owned raw-Git cascade is rejected for the normal path because it duplicates the provider transaction and recovery machinery and leaves public provider base facts stale until provider reconciliation.

## Objective Impact

The GS-native restack-resolve roadmap row is now in progress with its provider and recovery decision complete. The implementation may proceed without a standalone provider-module phase: the CLI should add only deterministic version/topology/cleanliness/worktree preflight, public provider invocation, structured outcome classification, and independent Git/provider postcondition evidence required by this command.

The first slice is intentionally local and inter-branch only. It does not fetch or update trunk, rebase the bottom layer onto changed trunk, push branches, or mutate GitHub. Those effects remain deferred to the reconciliation slice. Conflicts are resumable partial state rather than rollback: resolution stays sequential in the initiating worktree, invokes continue at most once per accepted stop, escalates ambiguous intent while leaving the operation stopped, and never aborts without explicit user authorization.

## Follow-Ups

- Implement `ns gs restack-resolve` against the settled v0.1.0 command and recovery contract with fake-driven and real-adapter coverage.
- Derive the portable GS skill from the provider-independent safety policy in `code-gt-restack-resolve` without carrying Graphite commands, topology helpers, or bookkeeping assumptions into GS.
- Add `/ns:gs:restack-resolve` as a thin router to the portable skill, with routing and parity coverage.
- Keep trunk integration, push, PR/GitHub reconciliation, and support for later provider versions in their evidence-gated slices.
