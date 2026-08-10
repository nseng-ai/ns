# Slot List Filesystem Ownership

## Summary

Runner checkpoint `5a7e455ad80fe1da4de710b1f4c8f122ba3b76ed` moved the typed `slot list` command assembly into its filesystem route. The central registry no longer carries `list` or duplicate `ls` specs, while `ls` remains filesystem alias metadata.

## Objective Impact

The dedicated Phase 1 `slot list` ownership row is complete. List scenarios and the plain-command Graphite assertion now exercise the production filesystem command face. Focused parent verification passed the Slots package typecheck, all 355 Slots tests, and `git diff --check`; no other command or Phase 2 outcome was migrated.

## Follow-Ups

- Migrate `slot checkout` ownership and completion wiring as the next focused Runner step.
- Keep the central registry and legacy command face for commands not yet migrated.
- Preserve the temporary legacy-outcome adapter until Phase 2.
