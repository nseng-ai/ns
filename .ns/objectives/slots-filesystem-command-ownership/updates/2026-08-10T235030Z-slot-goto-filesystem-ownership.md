# Slot Goto Filesystem Ownership

## Summary

Runner checkpoint `a4f2cb869e243fd9b4c033753760ca23f0504181` moved the typed `slot goto` command assembly into its filesystem route and removed its central registry spec. The route-neutral context adapter now derives shell cd-directive behavior from the host output format so only human output writes the directive.

## Objective Impact

The dedicated Phase 1 `slot goto` ownership row is complete. Goto scenarios now exercise the production filesystem command face, including clipboard, environment, and format-sensitive shell behavior. Focused parent verification passed the Slots package typecheck, all 354 Slots tests, and `git diff --check`; no other command or Phase 2 outcome was migrated.

## Follow-Ups

- Migrate `slot claim` ownership as the next focused Runner step.
- Keep the central registry and legacy command face for commands not yet migrated.
- Preserve the temporary legacy-outcome adapter until Phase 2.
