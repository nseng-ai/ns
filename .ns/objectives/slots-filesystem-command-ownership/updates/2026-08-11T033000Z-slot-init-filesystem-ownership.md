# Slot Init Filesystem Ownership

## Summary

Runner checkpoint `4429fe0d2b709ae1329076afd4dbb841acaf40ff` moved the typed `slot init` command assembly into its filesystem route and removed init from the central registry. Init and affected provisioning scenarios now use the production filesystem harness.

## Objective Impact

The dedicated Phase 1 `slot init` ownership row is complete. The harness exposes its fake storage gateway so init directory effects remain asserted. Focused Slot typecheck, all 354 Slot tests, style-guard checks, full `just` validation, and `git diff --check` passed; no other command or Phase 2 outcome was migrated.

## Follow-Ups

- Migrate `slot resize` command ownership as the next focused Runner step.
- Keep the central registry and legacy command face for commands not yet migrated.
- Preserve the temporary legacy-outcome adapter until Phase 2.
