# Semantic Update: slot TS init + resize lifecycle

Implemented TypeScript pool lifecycle primitives for `slot init` and `slot resize` in `ts/packages/slot`.

Preserved contracts:

- Pool bounds remain `1..99`; invalid values return `invalid_size`.
- `slot init` refuses an already initialized pool with `pool_already_initialized`.
- Metadata directories are ensured before worktree creation.
- Init/grow create detached worktrees from the trunk branch.
- Resize grow fills absent slot numbers before extending (e.g. existing `[1, 3]`, target `4` creates `2` and `4`).
- Resize shrink removes the highest records after the target prefix.
- Unsafe shrink reports all assigned, dirty, and operation-in-progress offenders via `resize_unsafe`.

Validation:

- `pnpm --dir ts/packages/slot run test` — pass.
- `pnpm --dir ts/packages/slot run check` — pass.

Safety note:

- Tests use package-local constructor-state fakes; they do not touch real `~/.slots` or non-temp worktrees.
