# Slot Provision Import Filesystem Ownership

## Summary

Runner checkpoint `39a505787d118a52c5ac693f5c6d3dff0a6d0b0e` moved the typed `slot provision import` command assembly into its filesystem route and removed import from the central registry. Import help and scenarios now use the production filesystem harness.

## Objective Impact

The dedicated Phase 1 `slot provision import` ownership row is complete. Focused provisioning scenarios and Slot typecheck, all 354 Slot tests, style-guard checks, full `just` validation, and `git diff --check` passed. The temporary legacy-outcome adapter remains, and no other command or Phase 2 outcome was migrated.

## Follow-Ups

- Migrate `slot gt up` command ownership as the next focused Runner step.
- Keep the central registry and legacy command face for commands not yet migrated.
- Preserve the temporary legacy-outcome adapter until Phase 2.
