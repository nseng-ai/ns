# Memjective Metadata Schema

`meta.json` is the repairable metadata sidecar for a memjective body. The
authoritative record is `memjectives/<slug>/body.md`. Metadata exists to track
lineage, branch placement, and timestamps so the skills can carry a memjective
forward cleanly and refresh it after landed work.

## Canonical location

For a memjective slug `<slug>` on branch `<branch>`, the canonical keys are:

```text
memjectives/<slug>/body.md
memjectives/<slug>/meta.json
```

`meta.json` without the sibling `body.md` is invalid state.

## Schema

Current schema version: `1`

```json
{
  "schema_version": 1,
  "slug": "clinkr-contract-redesign",
  "kind": "seed",
  "branch": "master",
  "parent_branch": null,
  "source_branch": null,
  "baseline_head_sha": "abc123",
  "body_updated_at": "2026-04-21T20:00:00Z",
  "meta_updated_at": "2026-04-21T20:00:00Z"
}
```

## Fields

- `schema_version`
  - Integer. Required.
  - Current value is `1`.
- `slug`
  - String. Required.
  - Must match the `<slug>` directory name that contains `body.md` and
    `meta.json`.
- `kind`
  - String enum. Required.
  - Allowed values: `"seed"`, `"snapshot"`.
  - `"seed"` is reserved for the master-branch canonical seed.
  - `"snapshot"` is used for branch-scoped carried-forward or updated state.
- `branch`
  - String. Required.
  - The git branch whose brmem namespace contains this metadata.
  - For seeds this is `"master"`.
- `parent_branch`
  - String or `null`. Required.
  - Best-effort branch-parent hint for the current branch.
  - Use `null` when the parent cannot be determined confidently.
- `source_branch`
  - String or `null`. Required.
  - The branch the body was copied from during carry-forward, when known.
  - `null` for seeds and for snapshots whose source cannot be recovered.
- `baseline_head_sha`
  - String. Required.
  - The destination branch `HEAD` associated with the last metadata refresh.
  - For `create`, this is the branch tip at creation time.
  - For `next`, this is the fresh slice branch `HEAD` before implementation.
  - For `update`, this is refreshed to the current `HEAD`.
- `body_updated_at`
  - RFC 3339 / ISO 8601 UTC timestamp string. Required.
  - Update only when the `body.md` text actually changes.
  - On carry-forward, copy the source `body_updated_at` when available;
    otherwise set it to the carry-forward time.
- `meta_updated_at`
  - RFC 3339 / ISO 8601 UTC timestamp string. Required.
  - Refresh every time `meta.json` is written.

## Required invariants

- `body.md` is authoritative. If metadata disagrees with the body path, repair
  the metadata; do not discard the body.
- `meta.json` must live beside exactly one sibling `body.md`.
- `kind: "seed"` implies:
  - `branch: "master"`
  - `parent_branch: null`
  - `source_branch: null`
- `kind: "snapshot"` implies a branch-scoped working copy. `branch` should
  name the current branch where the snapshot is attached.

## Repair rules

Missing or stale `meta.json` is recoverable.

When repairing:

- keep the existing `body.md` unchanged
- set `schema_version` to `1`
- set `slug` from the body path
- set `kind` from context:
  - `"seed"` on `master`
  - `"snapshot"` otherwise
- set `branch` to the branch containing the entry
- set `parent_branch` best-effort or `null`
- preserve `source_branch` when known; otherwise use `null`
- refresh `baseline_head_sha` from the relevant branch head
- preserve prior `body_updated_at` when it can be trusted; otherwise set it to
  repair time
- always set `meta_updated_at` to repair time

Repair never authorizes silently accepting invalid structural state such as:

- `meta.json` without `body.md`
- multiple `*/body.md` entries on one branch
- legacy flat `^[^/]+\.md$` memjective keys
