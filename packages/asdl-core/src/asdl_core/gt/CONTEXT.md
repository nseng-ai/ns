# asdl_core.gt

## Graphite metadata store contract

### Data source

`RealGtGateway.stack()` resolves the Git common directory with:

```sh
git rev-parse --git-common-dir
```

It then reads Graphite's SQLite metadata store at:

```text
<git-common-dir>/.graphite_metadata.db
```

The database is opened read-only with SQLite URI `mode=ro`.

### Stable query slice

The only Graphite schema surface `stack()` depends on is this named-column query:

```sql
SELECT branch_name, parent_branch_name, children, validation_result
FROM branch_metadata
```

Do not use `SELECT *`. Do not depend on Graphite-owned columns outside this slice.

### Migration policy assumption

Graphite versions since the SQLite metadata store shipped have used additive Kysely migrations for
this table: new nullable columns may appear, while the four-column stack slice remains stable. Future
additive columns are tolerated because the query names its columns explicitly.

If Graphite renames one of these columns, removes one, or drops the table, `stack()` returns a
`GtCommandFailure` whose message starts with `Graphite metadata schema mismatch:`.

### What lives where

- `stack()` reads the SQLite metadata store and never mutates it.
- `parent_of`, `children_of`, `trunk`, `branch_info`, `restack_upstack`, and `sync` still shell out
  to `gt`.
- Graphite owns both the metadata database and any mutation of it; asdl reads the stack snapshot only.

### Why no legacy fallback

The old human-facing stack text parser is gone. If the metadata store is unavailable or has an
unsupported schema, callers get a structured failure instead of a degraded best-effort stack walk.

### What we do not read

`stack()` does not read any columns outside `branch_name`, `parent_branch_name`, `children`, and
`validation_result`. Future Graphite columns are intentionally ignored.
