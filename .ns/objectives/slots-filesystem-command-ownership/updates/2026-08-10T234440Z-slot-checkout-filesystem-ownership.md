# Slot Checkout Filesystem Ownership

## Summary

Runner checkpoint `34b8d415de68139f3afa9f3c36a5ebbfe2ef0712` moved the typed `slot checkout` command assembly and completion wiring into its filesystem route. The central registry no longer carries `checkout` or duplicate `co` specs, while `co` remains filesystem alias metadata.

## Objective Impact

The dedicated Phase 1 `slot checkout` ownership row is complete. Checkout and related provisioning scenarios now exercise the production filesystem command face. Focused parent verification passed the Slots package typecheck, all 355 Slots tests, and `git diff --check`; no other command or Phase 2 outcome was migrated.

## Follow-Ups

- Migrate `slot goto` ownership as the next focused Runner step.
- Keep the central registry and legacy command face for commands not yet migrated.
- Preserve the temporary legacy-outcome adapter until Phase 2.
