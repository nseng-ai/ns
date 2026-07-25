# Roadmap

## Work

- [x] Settle the vocabulary and API-surface verdict: **ns extension** replaces capability; qualify ns versus Pi where needed; **extension package API** names a particular extension's curated `/api` surface; README categories become **the core** and **extensions**. Evidence: the 2026-07-25 verdict updates.
- [x] Land the CONTEXT vocabulary layer across root `CONTEXT.md`, `CONTEXT-MAP.md`, and all affected nested contexts. Evidence: `updates/2026-07-25-context-vocabulary-layer-landed.md`.
- [x] Execute the machine-readable cutover with the incubation-zone move. `@nseng-ai/capability-kit` became `@nseng-ai/extension-kit`; tier values and ns-domain symbols became extension-named; all 11 extension packages moved directly from `ts/packages/capabilities/` to `ts/packages/incubator/`; ADR 0044 records the path-derived zone and architecture projection. No old tracked capability path remains.
- [~] Finish the semantic prose sweep across live READMEs, conventions, and skills. Verified residue includes `docs/north-star.md`, `docs/conventions/subpackage-conventions.md`, `docs/conventions/adversarial-reviews.md`, `docs/pi/README.md`, `skills/ns-typescript/SKILL.md`, and `skills/skill-management/references/umbrella-families.md`. Preserve historical/wayfinding records, immutable updates, external fixture values, and generic ability/support meanings.
- [~] Finish terminology reconciliation in `professional-repo-curation/references/root-readme-positioning.md`. The headings and package grouping already use **The core** and **Extensions**, but live prose still says “core capabilities,” “capabilities,” and capability-extension in the retired ns-domain sense.
- [ ] Append the final parent handoff Semantic Update after the prose sweep, recording the landed ADR 0044 cutover, the 11-extension incubation roster, the clean-zone Extension Kit, and any deliberately retained mixed-language cases; then close this Objective if no material rename work remains.

## Parked

- None. The code-level rename is no longer parked; it landed with the incubation-zone cutover.
