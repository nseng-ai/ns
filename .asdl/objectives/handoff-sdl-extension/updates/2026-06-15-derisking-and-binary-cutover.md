# Derisking and Binary Cutover Decisions

## Summary

The Objective now records three pre-implementation derisking additions: design/spike SDL nested command-tree routing before infrastructure work, prototype `sdl handoff list` as the first Handoff leaf before full inventory/admin migration, and run an explicit standalone `handoff` cutover inventory before removal.

The standalone `handoff` binary cutover policy is now explicit: after SDL parity exists, remove the standalone binary/shim rather than keeping a temporary compatibility command, migration diagnostic, or long-lived parallel surface.

## Objective Impact

This reduces implementation risk by forcing command routing/help/diagnostic behavior and one low-risk Handoff leaf to prove the nested extension model before destructive/admin or create/pickup flows. It also removes ambiguity from the cutover policy: migration work should inventory and remove standalone binary/shim references rather than preserve a compatibility executable.

## Follow-Ups

- Use the routing spike/design note to settle `sdl <group> <leaf>` argv consumption, help behavior, selected loading, and group-vs-leaf collision diagnostics.
- Use `sdl handoff list` as the first concrete Handoff extension leaf and keep non-eager-loading coverage in that slice.
- Before binary removal, inventory `just`, docs, skills, Pi adapter calls, package exports, and tests for standalone `handoff` references.
