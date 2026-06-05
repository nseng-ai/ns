# Handoff lifecycle

Use this reference to keep handoff vocabulary, storage, branch scope, and workflow surfaces distinct.

## Lifecycle overview

1. Save a directed **Handoff Artifact** for a specific **Continuation Focus**.
2. List or discover saved handoffs in a **List Scope**.
3. Pick up one handoff by **Handoff Slug** or search terms.
4. Treat the artifact content as active context and continue from the recorded next step.
5. Optionally perform explicit admin/cleanup: inspect, copy, move, delete, or garbage-collect stale branch handoffs.

## Terms

- **Handoff Artifact**: a directed Markdown resume note stored as a Branch Memory entry for a future session to continue a specific focus.
- **Continuation Focus**: the explicit future work, decision, verification, or implementation target that a Handoff Artifact is meant to resume.
- **Handoff Slug**: the user-facing semantic name for a handoff, derived from the recognized Markdown entry key by removing `.md`.
- **Handoff Key**: the Branch Memory entry key for a Handoff Artifact in the `handoffs` namespace.
- **Handoffs Namespace**: the workflow-owned Branch Memory namespace named `handoffs` where Handoff Artifacts live.
- **Handoff Summary**: the inventory record for a Handoff Artifact, including branch, Branch State, Handoff Slug, Handoff Key, Handoff Technical Locator, and updated timestamp.
- **Handoff Technical Locator**: storage evidence for a Handoff Artifact: branch plus Branch Memory namespace, entry key, entry locator, and commit when available.
- **Branch State**: whether the local Git branch named by a Handoff Summary is currently `active` or `deleted`.
- **List Scope**: the branch range used when listing Handoff Artifacts: one branch, all active local branches, or all branches including deleted local branches.
- **All-Branches Inventory**: a handoff listing across branches that groups Handoff Summaries by branch and can optionally include deleted local branches.
- **Handoff Garbage Collection**: the explicit operation that previews or deletes Handoff Artifacts whose local branch is deleted.

## Storage contract

```text
Branch Memory namespace: handoffs
Entry key: <semantic-slug>.md
Branch: branch that owns the saved continuation context
```

Rules:

- Handoff keys are flat `<semantic-slug>.md`; normal handoff UX should not create or accept `/`-containing selectors.
- Content is concise UTF-8 Markdown only.
- Do not store secrets, credentials, binary data, generated build output, large logs, task databases, or transcript dumps.
- The semantic slug is the chooser metadata; do not invent a separate index or manifest.
- A handoff is branch-scoped durable context, not a checked-in file and not a commit or PR comment.

## First-class workflow surfaces

Pi slash commands and CLI commands are first-class workflow surfaces over the handoff contract.

Pi surfaces:

```text
/handoff:create <continuation focus>
/handoff:pickup [--branch <branch>] [slug|search words]
/handoff:list [--branch <branch>|--all]
```

CLI surfaces:

```text
handoff list [--branch <branch>|--all] [--include-deleted] --format json
handoff delete [--branch <branch>] [-f|--force] <slug>
handoff gc [--dry-run|-f]
brmem get|check|put|copy|delete ... --namespace handoffs
```

There is no `/handoff:delete` Pi command in the current surface; single-handoff deletion is CLI-only.

`brmem` is the storage/recovery/admin layer. Do not make it the primary public UX when a handoff CLI or Pi surface exists.

## Branch and list scope

- Use the current branch when no branch is provided and the repo is not detached.
- Use explicit `--branch <branch>` when the user names a branch.
- Use `--all` for inventory across active local branches.
- Use `--all --include-deleted` for recovery or cleanup that includes deleted local branches.
