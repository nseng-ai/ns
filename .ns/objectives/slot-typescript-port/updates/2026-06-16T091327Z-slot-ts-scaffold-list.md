# Semantic Update: slot TS scaffold + list

Implemented the first TypeScript `@asdl/slot` package scaffold under `ts/packages/slot`.

Preserved contracts:

- `slot-NN` naming remains two-digit and rejects non-managed names such as `slot-7`, `slot-100`, and `slot-xx`.
- Pool inventory is derived from `git worktree list` state, not persisted metadata.
- JSON list envelope preserves `pool_size`, `repo_name`, and row field names `slot_name`, `branch`, `operation`, `worktree_path`, `status`.
- `~/.slots/repos/<repo>/worktrees` path derivation is implemented through injected `slotsRoot`/repo context.
- Plain `slot` uses package-local git/storage gateways and does not depend on Graphite.

Validation:

- `pnpm --dir ts/packages/slot run test` — pass.
- `pnpm --dir ts/packages/slot run check` — pass.
- `pnpm --dir ts --filter @asdl/slot exec node src/cli.ts list --format json` — pass; returned exit 0 with a valid JSON envelope for the current checkout.

Notes:

- The workspace lockfile was refreshed so the new package's local workspace links resolve.
