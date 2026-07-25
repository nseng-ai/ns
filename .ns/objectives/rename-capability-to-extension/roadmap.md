# Roadmap

## Work

- [x] Settle vocabulary and API-surface verdict: **ns extension** replaces capability; qualify ns versus Pi where needed; **extension package API** names particular extension's curated `/api` surface; README categories become **the core** and **extensions**. Evidence: 2026-07-25 verdict updates.
- [x] Land CONTEXT vocabulary layer across root `CONTEXT.md`, `CONTEXT-MAP.md`, and all affected nested contexts. Evidence: `updates/2026-07-25-context-vocabulary-layer-landed.md`.
- [x] Execute machine-readable cutover with incubation-zone move. `@nseng-ai/capability-kit` became `@nseng-ai/extension-kit`; tier values and ns-domain symbols became extension-named; all 11 extension packages moved directly from `ts/packages/capabilities/` to `ts/packages/incubator/`; ADR 0044 records path-derived zone and architecture projection. No old tracked capability path remains.
- [~] Finish semantic prose sweep across live READMEs, conventions, and skills. Verified residue includes `docs/north-star.md`, `docs/conventions/subpackage-conventions.md`, `docs/conventions/adversarial-reviews.md`, `docs/pi/README.md`, `skills/ns-typescript/SKILL.md`, and `skills/skill-management/references/umbrella-families.md`. Preserve historical/wayfinding records, immutable updates, external fixture values, and generic ability/support meanings.
- [~] Finish terminology reconciliation in `professional-repo-curation/references/root-readme-positioning.md`. Headings and package grouping already use **The core** and **Extensions**, but live prose still says “core capabilities,” “capabilities,” and capability-extension in retired ns-domain sense.
- [ ] Append final parent handoff Semantic Update after prose sweep, recording landed ADR 0044 cutover, 11-extension incubation roster, clean-zone Extension Kit, and any deliberately retained mixed-language cases. Then close this Objective if no material rename work remains.

## Parked

- None. Code-level rename no longer parked; it landed with incubation-zone cutover.
