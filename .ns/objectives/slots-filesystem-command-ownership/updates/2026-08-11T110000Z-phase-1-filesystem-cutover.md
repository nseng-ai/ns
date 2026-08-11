# Phase 1 Filesystem Cutover

## Summary

Runner checkpoint `1ae4d794f1eeb4b20ec257c1f553246f234be891` deleted the central Slot spec registry, name-based loader, legacy programmatic command face, `./command-face` export, and duplicate test topology. A topology-free fixture remains for API and domain tests, while CLI scenarios and completion use the production filesystem command tree.

## Objective Impact

Phase 1 is complete. Colocated route `command.ts` files and filesystem metadata are now the sole Slot CLI topology, and aliases remain only in route metadata. Focused Slot typecheck, all 364 Slot tests, style guard, removed-symbol scanning, full `just`, and `git diff --check` passed. Phase 2 outcome modernization may now begin one command per Runner step.

## Follow-Ups

- Begin Phase 2 with the dedicated `slot list` outcome-modernization row.
- Keep each applicable command in its own modernization step.
- Delete temporary legacy-to-modern translation only in the final Phase 2 cleanup after every applicable command is modernized.
