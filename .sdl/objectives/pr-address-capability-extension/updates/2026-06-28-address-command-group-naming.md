# Address Command Group Naming

## Summary

The Objective now records the preferred SDL grouped command name for a future PR Address command face: use `sdl address ...`, not `sdl pr-address ...`.

The inventory slice also has PR evidence:

- PR #2291: `Mark PR address inventory complete` — current PR evidence for the completed inventory roadmap row and the durable surface inventory in `updates/2026-06-28-pr-address-surface-inventory.md`.

## Objective Impact

The command-face slice is still open, but its naming target is no longer ambiguous. Future command-face evaluation should assess whether portable PR Address operations should become `sdl address ...` leaves using existing grouped-command mechanics, or whether the standalone `pr-address` CLI remains a documented transitional surface.

This updates the Objective narrative and roadmap guidance without changing the compatibility baseline recorded by the inventory update: the current live surface remains the standalone `pr-address exec ...` CLI, and later implementation must preserve or intentionally cut over existing call sites.

## Follow-Ups

- When command-face work begins, use `sdl address ...` in implementation previews, tests, docs, and decision records unless the user supersedes this naming decision.
- Keep existing `pr-address exec ...` call sites stable until a command-face cutover records parity and affected-call-site updates.