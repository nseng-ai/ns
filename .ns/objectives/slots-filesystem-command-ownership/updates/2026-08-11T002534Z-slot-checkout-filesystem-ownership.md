# Slot Checkout Filesystem Ownership

## Summary

Runner checkpoint `ece521dcdf4a9d15e853fa9976a769f92e8a69eb` moved the typed `slot checkout` command assembly and completion wiring into its filesystem route. The central registry no longer carries `checkout` or duplicate `co` specs, while `co` remains filesystem alias metadata.

## Objective Impact

The dedicated Phase 1 `slot checkout` ownership row is complete. Affected checkout and provisioning scenarios now exercise the production filesystem command face. Focused Slot checks, all 355 Slot tests, full `just` validation, and `git diff --check` passed; no other command or Phase 2 outcome was migrated.

## Follow-Ups

- Migrate `slot goto` command ownership as the next focused Runner step.
- Keep the central registry and legacy command face for commands not yet migrated.
- Preserve the temporary legacy-outcome adapter until Phase 2.
