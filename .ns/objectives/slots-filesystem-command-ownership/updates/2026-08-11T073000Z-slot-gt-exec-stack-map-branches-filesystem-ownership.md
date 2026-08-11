# Slot GT Exec Stack-Map-Branches Filesystem Ownership

## Summary

Runner checkpoint `2263e11aab1669e07ce77e05c11eb1e33422768c` moved the typed `slot gt exec stack-map-branches` command assembly into its filesystem route and removed stack-map-branches from the central registry. Help and behavior scenarios now use the production filesystem harness.

## Objective Impact

The dedicated Phase 1 `slot gt exec stack-map-branches` ownership row is complete. The harness repo fixture supports the existing no-repository failure coverage. Focused gt-exec scenarios and Slot typecheck, all 356 Slot tests, style-guard checks, full `just` validation, and `git diff --check` passed. No other command or Phase 2 outcome was migrated.

## Follow-Ups

- Migrate `slot gt exec backup-refs` command ownership as the next focused Runner step.
- Keep the central registry and legacy command face for commands not yet migrated.
- Preserve the temporary legacy-outcome adapter until Phase 2.
