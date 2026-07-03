# Kernel and Extension Model Documentation

## Summary

The SDL extension architecture documentation now records the command-first kernel/extension model. `ts/packages/sdl/README.md` distinguishes SDL kernel mechanics from project-local workflow policy, documents project-local SDL extensions as the current restored command mechanism, keeps future bundled first-party extensions as deferred design space, and states the evidence-driven SDK promotion rule. `ts/packages/sdl/docs/sdk-reference.md` clarifies that `@sdl/sdl/sdk` is intentionally small, owns curated lower-package re-exports as first-party SDK vocabulary, and remains the authoritative public export inventory.

Context language now includes SDL kernel, project-local SDL extension, future bundled SDL extension, and command-first SDK promotion terms. `CONTEXT-MAP.md` points to that vocabulary and resolves the prior SDK re-export ownership note. Pi docs now state that SDL extension discovery is CLI-only today and exact `/sdl:*` mirrors are static engineered adapters requiring explicit tests/parity metadata. `.sdl/extensions/AGENTS.md` records the helper-promotion escalation path and cautions that generated/bundled command artifacts are not the default authoring model.

## Objective Impact

This completes the documentation row for the command-first SDL extension architecture Objective. The docs now explain kernel responsibilities, public SDK imports, internal migration exports, project-local extension discovery, project-local versus future bundled extension criteria, static Pi mirror limitations, and the rule for promoting new SDK capabilities from command evidence.

The slice does not promote any new SDK helper and does not decide which parked sophisticated workflow should become the next pressure test. Those decisions remain in the closure-boundary row.

## Follow-Ups

- Use the documented cut lines to record the command-first closure boundary without folding parked bundled-extension, dynamic Pi mirror, Handoff, Objective, Slot, or broader capability-modeling work into this Objective.
- Treat future SDK helper promotions, submit unbundling, dynamic Pi mirror discovery, and first bundled/sophisticated workflow migration as separate follow-up candidates unless closure explicitly chooses otherwise.
