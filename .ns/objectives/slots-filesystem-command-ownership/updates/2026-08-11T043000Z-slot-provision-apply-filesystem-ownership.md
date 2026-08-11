# Slot Provision Apply Filesystem Ownership

## Summary

Runner checkpoint `32d952ccdbfc0e2803442d2c3ec899112a6960a5` moved the typed `slot provision apply` command assembly into its filesystem route and removed apply from the central registry. Apply help and scenarios now use the production filesystem harness.

## Objective Impact

The dedicated Phase 1 `slot provision apply` ownership row is complete. Focused provisioning scenarios and Slot typecheck, all 354 Slot tests, style-guard checks, full `just` validation, and `git diff --check` passed. The temporary legacy-outcome adapter remains, and neither provision import nor any Phase 2 outcome was migrated.

## Follow-Ups

- Migrate `slot provision import` command ownership as the next focused Runner step.
- Keep the central registry and legacy command face for commands not yet migrated.
- Preserve the temporary legacy-outcome adapter until Phase 2.
