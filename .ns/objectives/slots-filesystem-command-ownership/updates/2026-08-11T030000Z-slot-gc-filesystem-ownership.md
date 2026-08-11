# Slot GC Filesystem Ownership

## Summary

Runner checkpoint `b0d9bf32cca8d6810faa1752d8a11d0ffd35bab6` moved the typed `slot gc` command assembly into its filesystem route and removed gc from the central registry. All gc scenarios now use the production filesystem harness.

## Objective Impact

The dedicated Phase 1 `slot gc` ownership row is complete. Focused Slot typecheck and all 13 gc scenarios, all 354 Slot tests, style-guard checks, `git diff --check`, and a clean full `just` rerun passed. The first `just` attempt had unrelated brmem and ns-dev test timeouts; both focused reruns and the subsequent full run passed. No other command or Phase 2 outcome was migrated.

## Follow-Ups

- Migrate `slot init` command ownership as the next focused Runner step.
- Keep the central registry and legacy command face for commands not yet migrated.
- Preserve the temporary legacy-outcome adapter until Phase 2.
