# Slot Resize Filesystem Ownership

## Summary

Runner checkpoint `dfc76b88ce5b98c99c7667a9a6dd0e5d5b3d3c89` moved the typed `slot resize` command assembly into its filesystem route and removed resize from the central registry. Resize scenarios now use the fake-driven production filesystem harness.

## Objective Impact

The dedicated Phase 1 `slot resize` ownership row is complete. Focused Slot typecheck, all 354 Slot tests, style-guard checks, full `just` validation, and `git diff --check` passed. The temporary legacy-outcome adapter remains in place, and no other command or Phase 2 outcome was migrated.

## Follow-Ups

- Migrate `slot provision apply` command ownership as the next focused Runner step.
- Keep the central registry and legacy command face for commands not yet migrated.
- Preserve the temporary legacy-outcome adapter until Phase 2.
