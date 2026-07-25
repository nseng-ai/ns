# Roadmap

## Work

- [x] Settle the vocabulary and API-surface verdict: **ns extension** replaces capability; qualify ns versus Pi where needed; **extension package API** names a particular extension's curated `/api` surface; README categories become **the core** and **extensions**. Evidence: the 2026-07-25 verdict updates.
- [x] Land the CONTEXT vocabulary layer across root `CONTEXT.md`, `CONTEXT-MAP.md`, and all affected nested contexts. Evidence: `updates/2026-07-25-context-vocabulary-layer-landed.md`.
- [x] Execute the machine-readable cutover with the incubation-zone move. `@nseng-ai/capability-kit` became `@nseng-ai/extension-kit`; tier values and ns-domain symbols became extension-named; all 11 extension packages moved directly from `ts/packages/capabilities/` to `ts/packages/incubator/`; ADR 0044 records the path-derived zone and architecture projection. No old tracked capability path remains.
- [x] Finish the semantic prose sweep across live READMEs, conventions, and skills. The final pass updated `docs/north-star.md`, `docs/conventions/subpackage-conventions.md`, `docs/conventions/adversarial-reviews.md`, `docs/pi/README.md`, and `skills/ns-typescript/SKILL.md`; it classified and retained generic ability/support language in `skills/skill-management/references/umbrella-families.md` and `docs/pi/README.md`, plus literal TypeScript capability symbols.
- [x] Finish terminology reconciliation in `professional-repo-curation/references/root-readme-positioning.md`. The reference now presents **the core**, optional **ns extensions**, **Pi extensions**, tools, and skills without using capability as an ns presentation category.
- [x] Append the final parent handoff Semantic Update, recording the landed ADR 0044 cutover, the 11-extension incubation roster, the clean-zone Extension Kit, deliberately retained mixed-language cases, and passing validation evidence.

## Parked

- None. The code-level rename is no longer parked; it landed with the incubation-zone cutover.
