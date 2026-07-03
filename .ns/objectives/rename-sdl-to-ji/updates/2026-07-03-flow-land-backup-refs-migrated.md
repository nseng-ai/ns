# Flow land backup refs migrated to ji namespace

## Summary

Migrated the remaining pre-cutover Flow land backup refs from the legacy `refs/sdl/`
namespace into the current `refs/ji/` namespace. Collision preflight found no existing
corresponding `refs/ji/flow-land-backup*` targets, so each old ref was recreated at the
same suffix under `refs/ji/` and then deleted from `refs/sdl/` with object-id
verification.

Result after migration:

- `refs/sdl/flow-land-backup`: 0 refs remaining.
- `refs/sdl/flow-land-backup-prev`: 0 refs remaining.
- `refs/ji/flow-land-backup`: 18 refs total.
- `refs/ji/flow-land-backup-prev`: 2 refs total.

## Objective Impact

One more manual machine-migration sub-surface is complete: pre-cutover Flow land recovery
breadcrumbs are now visible under the post-cutover `ji` backup-ref namespace, and the old
`sdl` backup-ref namespace no longer carries live refs in this repository.

The broader manual migration roadmap row remains open for saved-plan migration,
checkout/worktree slot path migration, and any straggler branch repair.

## Follow-Ups

- Move or intentionally retire `$XDG_STATE_HOME/sdl/enriched-plan` into the ji namespace.
- Complete checkout/worktree slot path migration and record post-migration `ji objective
  list` evidence.
- Repair any straggler branches that still carry pre-cutover paths during restack.
