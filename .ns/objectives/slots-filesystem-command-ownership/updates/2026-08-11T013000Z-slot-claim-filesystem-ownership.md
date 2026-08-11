# Slot Claim Filesystem Ownership

## Summary

Runner checkpoint `7a2769ef3a4fa36dc10d7c7f819330e1930d6bc5` moved the typed `slot claim` command assembly into its filesystem route and removed claim from the central registry. Claim behavior and affected provisioning scenarios now use the production filesystem harness.

## Objective Impact

The dedicated Phase 1 `slot claim` ownership row is complete. The harness gained only the current-directory and repository overrides needed to preserve claim coverage. Focused Slot typecheck and scenarios, all 354 Slot tests, style-guard checks, full `just` validation, and `git diff --check` passed; no other command or Phase 2 outcome was migrated.

## Follow-Ups

- Migrate `slot free` command ownership as the next focused Runner step.
- Keep the central registry and legacy command face for commands not yet migrated.
- Preserve the temporary legacy-outcome adapter until Phase 2.
