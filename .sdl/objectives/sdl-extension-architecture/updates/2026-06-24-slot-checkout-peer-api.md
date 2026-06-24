# Slot checkout Peer API slice

## Summary

Slot capability migration has begun as a child Objective at `.sdl/objectives/slot-capability-extension/`. The first slice introduces a curated `@sdl/slot/api` checkout Peer API and migrates CCC checkout consumers away from `slot checkout ... --format json --no-clipboard` subprocess parsing.

The standalone `slot` CLI remains the human-facing command surface for this slice; no `sdl slot ...` command face was added.

## Objective Impact

This is the first concrete Slot row under ADR 0009 Phase 2. It validates the `@sdl/<cap>/api` convention for a CCC-consumed capability while keeping the broader Slot command-face, `slot gt`, and docs/context migration as child Objective follow-up work.

## Follow-Ups

Complete validation for the checkout Peer API slice, then continue Slot migration through the child Objective rather than expanding the parent architecture Objective directly.
