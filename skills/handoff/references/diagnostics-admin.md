# Handoff diagnostics and administration

Use this reference for non-happy-path handoff work. Keep diagnostics narrow, inspect before mutating, and refuse ambiguous destructive changes.

## General diagnostics posture

- Prefer `handoff list` for inventory.
- Prefer `handoff gc --dry-run` before deleting stale deleted-branch handoffs.
- Use direct `brmem` commands only for storage/recovery/admin cases where no handoff CLI helper exists.
- Always pass explicit branches in automation.
- Always include `--namespace handoffs` for direct Branch Memory operations.
- For one-handoff copy/move, always include `--key-glob '<semantic-slug>.md'`; otherwise a namespace-level copy may copy or replace more than intended.
- Refuse overwrites/collisions unless the user gives explicit replacement/destructive intent.
- If wording is ambiguous between copy and move, ask before mutating.
- If a handoff appears stale, verify current repo state before following or editing scope.

## Read-only inspection

```bash
handoff list --branch <branch> --format json
handoff list --all --format json
handoff list --all --include-deleted --format json
brmem check <semantic-slug>.md --namespace handoffs --branch <branch> --format json
brmem get <semantic-slug>.md --namespace handoffs --branch <branch>
```

Use inspection results in handoff vocabulary first. Mention namespace, key, entry locator/ref, or commit only as technical evidence or recovery detail.

## Copy one handoff

Use copy when the user says copy, make available on another branch, duplicate, or keep the source while adding to the destination.

Dry-run first when replacement risk matters:

```bash
brmem copy \
  --namespace handoffs \
  --from-branch <source-branch> \
  --to-branch <destination-branch> \
  --key-glob '<semantic-slug>.md' \
  --dry-run \
  --format json
```

Then run without `--dry-run`:

```bash
brmem copy \
  --namespace handoffs \
  --from-branch <source-branch> \
  --to-branch <destination-branch> \
  --key-glob '<semantic-slug>.md' \
  --format json
```

Do not add `--overwrite` unless the user explicitly wants replacement. After copying, verify with `handoff list --branch <destination-branch> --format json` or `brmem check`.

## Move one handoff

Use move when the user explicitly says move, relocate, transfer, or remove from the source after copying.

Move is a three-phase operation:

1. Copy exactly one handoff with `--key-glob '<semantic-slug>.md'`.
2. Verify the destination entry exists and has the expected slug/key.
3. Delete the source entry.

Final source removal:

```bash
brmem delete \
  <semantic-slug>.md \
  --namespace handoffs \
  --branch <source-branch> \
  --format json
```

Report the destination branch, source branch, namespace, key, entry locator/ref, and delete commit when available.

## Delete one handoff

Only delete one explicit handoff that the user or workflow has identified. Preflight with `brmem check` unless the current command already verified it.

Prefer the first-party CLI, which deletes one exact-slug handoff (pass the slug without `.md`):

```bash
handoff delete [--branch <branch>] [-f|--force] <slug>
```

There is no `/handoff:delete` Pi command in the current surface; single-handoff deletion is CLI-only. Use the storage layer directly only when no `handoff delete` helper is available:

```bash
brmem delete <semantic-slug>.md --namespace handoffs --branch <branch> --format json
```

Report branch, namespace, key, locator/ref, and commit.

## Garbage collection

Use `handoff gc --dry-run` first to preview handoffs whose local branch is deleted. Use `handoff gc -f` only after the user confirms deletion or explicitly asked to force cleanup.

Do not confuse deleted-branch cleanup with deleting active-branch handoffs.

## Common recovery and collision cases

- Source handoff missing: list the source branch and ask for corrected slug/branch.
- Destination handoff exists: stop unless explicit overwrite intent is present.
- Destination branch is wrong or absent: surface the command error and ask for correction.
- Deleted branch appears in inventory: call it out as a cleanup candidate, not as active work.
- Multiple plausible slugs: ask the user to choose; do not guess.
- Direct `brmem copy` without `--key-glob` would copy the whole namespace; avoid this for a single handoff.

## Future deterministic helper

If a future `handoff exec ...` admin helper exists for moving, copying, deleting, or repairing handoffs, prefer it over manual `brmem` operations. Until such a helper exists, use the narrow `brmem --namespace handoffs` recipes above.
