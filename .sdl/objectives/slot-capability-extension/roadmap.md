# Roadmap

## Work

- [x] Introduce checkout Peer API and migrate CCC checkout consumers off CLI JSON parsing.
  - Policy: direct execution for the bounded checkout slice; do not change the standalone `slot` CLI surface.
  - Evidence: `@sdl/slot/api` exports typed current and named branch checkout operations; CCC checkout flows consume the Peer API adapter/injection seam instead of `slot checkout --format json`; Slot and CCC package tests/checks passed on 2026-06-24.

- [ ] Define Slot command-face strategy.
  - Decide how the existing `slot` CLI relates to any future `sdl slot ...` or Pi command faces, including compatibility expectations and docs.

- [ ] Decide and migrate `slot gt` Peer API needs.
  - Inventory stack discovery/free-stack consumers, choose which operations deserve curated Peer APIs, and avoid broad internal exports.

- [ ] Remove remaining CLI/deep sibling dependencies from orchestration packages.
  - Migrate remaining first-party consumers that make machine decisions from Slot subprocess output, while preserving human-facing CLI workflows.

- [ ] Document Slot vocabulary/context and above-SDK boundary.
  - Add focused Slot context/docs when the migration needs durable terms beyond the existing ADR 0009 vocabulary.
