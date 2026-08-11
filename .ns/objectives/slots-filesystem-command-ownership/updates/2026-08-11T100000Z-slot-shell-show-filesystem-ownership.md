# Slot Shell Show Filesystem Ownership

## Summary

Runner checkpoint `aaae332ab4d383b9ff512c892bf530ea11c476dd` moved the typed `slot shell show` definition, schema, options, handler, modern SDK outcomes, and human renderer into its filesystem route. Show is no longer in the shared shell command array or name-based loader.

## Objective Impact

The dedicated Phase 1 `slot shell show` ownership row is complete while preserving its already-modern outcome behavior. Production-filesystem scenarios cover help and schema, human rendering, shell detection, JSON success, and unsupported-shell failure. Focused Slot checks, all 361 Slot tests, style guard, full `just`, and `git diff --check` passed. Shell install, cutover, and Phase 2 remain untouched.

## Follow-Ups

- Migrate `slot shell install` command ownership as the next focused Runner step.
- Perform the separate Phase 1 cutover only after shell install lands.
- Preserve the temporary legacy-outcome adapter until Phase 2.
