# Roaster child Objective spawned

## Summary

The parent architecture Objective has spawned `.sdl/objectives/roaster-capability-extension/` as the child Objective for the Roaster capability migration.

The new child records Roaster's current position as a TypeScript, gateway-oriented standalone CLI package that still needs Capability-shape alignment: inventory current `roaster` command surfaces, public skills/Pi metadata, Branch Memory review-log semantics, GitHub publication boundaries, package exports, and docs; then prove an SDL Command Face and add/narrow `@sdl/roaster/api` only where concrete in-process consumers need it.

## Objective Impact

Phase 2 step 4 now records Roaster as spawned/in progress rather than unspawned. The parent remains open because Roaster is not yet migrated, PR Address and Aretro still need child disposition, broader `ccc` clean-consumer conversion remains partial, and `@sdl/domain-primitives-transitional` still has live consumers.

This update also corrects parent sequencing after the Handoff child closure: Handoff is now tracked as a closed child migration, not merely materially completed.

## Follow-Ups

- Run `objective-next` on `roaster-capability-extension`; the first planned slice is inventorying Roaster surfaces, consumers, and compatibility-sensitive behavior.
- Continue parent Phase 2 step 4 with remaining unspawned capability children, especially PR Address and Aretro, after or alongside Roaster as appropriate.
- Do not start parent step 6 until Roaster/remaining capability migrations, broader `ccc` clean-consumer work, and transitional-package retirement are complete.
