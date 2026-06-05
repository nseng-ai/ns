# Removed stale Objective GT stacks parity row

## Summary

The parity table claimed FULL parity for `/objective:gt-stacks` backed by `objective gt stacks --format md`, but the live Objective CLI no longer exposes an `objective gt` command and the live Pi/asdl-objectives source no longer contains the Objective GT stacks surface. The stale row was removed rather than downgraded because removed Pi surfaces should not remain in the living parity table.

Evidence: local CLI help showed only `objective archive` and `objective list`; `objective gt --help` failed with `No such command 'gt'`; source search found no live Pi extension or `asdl-objectives` implementation for `/objective:gt-stacks` / `objective gt stacks`.

## Objective Impact

The parity table now reflects the current surface area instead of preserving a removed command as FULL. The finding confirms the Objective's parity-table-rot risk: table refresh discipline is required, and the parity-review full-sweep mode remains important.

## Follow-Ups

- Do not restore the `/objective:gt-stacks` row unless the Pi surface and `objective gt stacks` CLI are intentionally reintroduced with a valid CLI+skill parity path.
- Continue the open parity-review-skill work so future removed or changed Pi surfaces are caught by a full-sweep refresh instead of manual discovery.
