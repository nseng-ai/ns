# ADR 0002: Singular Handoff Namespace

## Status

Accepted

## Context

Handoff artifacts are workflow-owned Branch Memory entries. Earlier implementation and docs used the plural namespace `handoffs`, while the domain model now names a single workflow-owned **Handoff Namespace** and keeps each artifact identified by a flat Handoff Key.

Keeping both names in normal flows would make storage ambiguous and would require hidden fallback behavior in create, pickup, list, delete, garbage-collection, and Pi status surfaces.

## Decision

Use Branch Memory namespace `handoff` as the canonical Handoff Namespace.

The Handoff Key remains flat:

```text
<semantic-slug>.md
```

Normal handoff flows read and write only namespace `handoff`. They do not silently fall back to `handoffs`, and they do not treat `session-artifacts/handoffs/...` as handoff storage.

Legacy local entries under `handoffs` are handled, if needed, as one-off operational migration work rather than as a permanent compatibility surface or official handoff command.

## Consequences

- There is one canonical technical locator for Handoff Artifacts: namespace `handoff`, key `<semantic-slug>.md`, and the owning branch.
- Normal flows become simpler and easier to reason about because there is no dual-read storage policy.
- Users with old local `handoffs` entries must move them as part of one-off operational work before normal handoff commands will see them.
- Pi worktree status displays Branch Memory namespaces as stored; it does not normalize `session-artifacts/handoffs/...` or legacy `handoffs` entries into `handoff`.
