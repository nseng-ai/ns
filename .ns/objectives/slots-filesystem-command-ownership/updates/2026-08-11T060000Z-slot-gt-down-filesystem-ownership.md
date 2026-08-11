# Slot GT Down Filesystem Ownership

## Summary

Runner checkpoint `e090d0ef84a0cff3c75d6baeccb10cf6754124a6` moved the typed `slot gt down` command assembly into its filesystem route and removed gt-down from the central registry. Help, success, human-rendering, and negative scenarios now use the production filesystem harness.

## Objective Impact

The dedicated Phase 1 `slot gt down` ownership row is complete. Focused Slot typecheck, all 354 Slot tests, style-guard checks, full `just` validation, and `git diff --check` passed. The temporary legacy-outcome adapter remains, and no other command or Phase 2 outcome was migrated.

## Follow-Ups

- Migrate `slot gt free-stack` command ownership as the next focused Runner step.
- Keep the central registry and legacy command face for commands not yet migrated.
- Preserve the temporary legacy-outcome adapter until Phase 2.
