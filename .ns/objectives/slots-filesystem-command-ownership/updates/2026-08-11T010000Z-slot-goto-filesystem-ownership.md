# Slot Goto Filesystem Ownership

## Summary

Runner checkpoint `db958c2157a1e5b8dbbc3dfbd786bf03d1d84a6e` moved the typed `slot goto` command assembly into its filesystem route and removed the command from the central registry. Goto scenarios now use the production filesystem harness.

## Objective Impact

The dedicated Phase 1 `slot goto` ownership row is complete. The route-neutral adapter and harness preserve output-format-sensitive shell directives, injected clipboard behavior, and environment inputs. Focused Slot typecheck, all 354 Slot tests, style-guard checks, full `just` validation, and `git diff --check` passed; no other command or Phase 2 outcome was migrated.

## Follow-Ups

- Migrate `slot claim` command ownership as the next focused Runner step.
- Keep the central registry and legacy command face for commands not yet migrated.
- Preserve the temporary legacy-outcome adapter until Phase 2.
