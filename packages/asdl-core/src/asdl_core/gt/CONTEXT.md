# asdl_core.gt

## Graphite metadata store contract

### Data sources

`RealGtGateway.stack()` and `RealGtGateway.branch_graph()` resolve the Git common directory with:

```sh
git rev-parse --git-common-dir
```

They then read Graphite-owned files below that common directory:

```text
<git-common-dir>/.graphite_metadata.db
<git-common-dir>/.graphite_repo_config
```

The SQLite metadata database is opened read-only with URI `mode=ro`. The repo config is read as
JSON and only the non-empty string `trunk` field is part of asdl's contract.

### Stable query slice

The only Graphite schema surface these metadata readers depend on is this named-column query:

```sql
SELECT branch_name, parent_branch_name, children, validation_result
FROM branch_metadata
```

Do not use `SELECT *`. Do not depend on Graphite-owned columns outside this slice.

### `stack()` vs `branch_graph()`

- `stack()` is current-branch-centered. It reads the metadata store for the branch checked out at
  `cwd`, returns a `StackInfo`, and reports `UntrackedBranch` when the current branch is not present
  in Graphite metadata.
- `branch_graph()` is repo/trunk-centered. It reads `.graphite_repo_config` for the configured
  Graphite trunk, reads `.graphite_metadata.db` for branch rows, and returns a `GtBranchGraph` for
  the metadata component reachable from that configured trunk. It does not resolve the current
  branch, so an untracked checkout does not block graph discovery.

### Migration policy assumption

Graphite versions since the SQLite metadata store shipped have used additive Kysely migrations for
this table: new nullable columns may appear, while the four-column stack/graph slice remains stable.
Future additive columns are tolerated because the query names its columns explicitly.

If Graphite renames one of these columns, removes one, or drops the table, metadata reads return a
`GtCommandFailure` whose message starts with `Graphite metadata schema mismatch:`.

### What lives where

- `stack()` reads the SQLite metadata store and never mutates it.
- `branch_graph()` reads the repo config and SQLite metadata store and never mutates either.
- `parent_of`, `children_of`, `trunk`, `branch_info`, `restack_upstack`, and `sync` still shell out
  to `gt`.
- Graphite owns both the metadata database and repo config; asdl only reads structured snapshots.

### Why no human-output fallback

There is no `gt ls` parser and no fallback to other human-facing Graphite output. If the metadata
store, repo config, or supported schema is unavailable, callers get a structured `GtCommandFailure`
instead of a degraded best-effort stack or graph walk.

### What we do not read

Metadata readers do not read any columns outside `branch_name`, `parent_branch_name`, `children`,
and `validation_result`. Future Graphite columns are intentionally ignored.
