# Slot Foreach Filesystem Ownership

## Summary

Runner checkpoint `7586f28a1c170b00821f392de422d4f818568913` moved the typed `slot foreach` command assembly into its filesystem route and removed foreach from the central registry. Foreach scenarios now use the production filesystem harness with an injected fake command gateway.

## Objective Impact

The dedicated Phase 1 `slot foreach` ownership row is complete. The production face preserves positionals, options, schemas, temporary outcome adaptation, rendering, interaction, progress, and execution behavior. Focused Slot typecheck, all 354 Slot tests, style-guard checks, full `just` validation, and `git diff --check` passed; no other command or Phase 2 outcome was migrated.

## Follow-Ups

- Migrate `slot gc` command ownership as the next focused Runner step.
- Keep the central registry and legacy command face for commands not yet migrated.
- Preserve the temporary legacy-outcome adapter until Phase 2.
