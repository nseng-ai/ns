# Single-PR planning

Run planning after validation succeeds.

```bash
pr-address exec plan-feedback --pr-number <pr-number> --format json
```

`plan-feedback` reads the latest manifest and validated classification from the payload session. It returns:

- `batches[]` for actionable work grouped by complexity.
- `informational[]` for non-mutating or user-decision items.
- `counts` and `warnings` for routing.

## Batch semantics

Actionable complexity order is:

1. `pre_existing`
2. `local`
3. `single_file`
4. `cross_cutting`
5. `complex`

`cross_cutting` and `complex` batches require explicit approval before execution. `pre_existing` batches usually resolve with explanatory replies after the user approves the exact wording.

## Informational review threads

Informational review threads can still require a user decision. Use the plan output to ask whether to act, dismiss, or skip; do not silently resolve them.

## Next step

For an approved batch, author resolver decisions outside the worktree and pass them to `build-resolve-thread-batch-payload`.
