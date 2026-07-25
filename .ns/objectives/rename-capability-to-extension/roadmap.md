# Roadmap

## Work

- [x] Settle the vocabulary verdict with the user: **ns extension** replaces capability and covers both technical package and feature area; bare **extension** is permitted when unambiguous, otherwise qualify **ns extension** versus **Pi extension**; README categories become **the core** and **extensions**; `capability-kit` becomes `extension-kit`, documented as shared library for extensions defined in the ns repository. Evidence: `updates/2026-07-25-vocabulary-verdict.md`.
- [x] Inventory the blast radius: live domain-vocabulary uses of "capability" across docs/, READMEs, skills, CONTEXT files, and Objective records, plus the code-level set (`capability-kit` tier/package, identifiers, config keys, path literals). Classified in `references/blast-radius-inventory.md` as vocabulary-sweep, code-plan, or deliberately-kept; evidence: `updates/2026-07-25-blast-radius-inventory.md`.
- [~] Land the vocabulary layer: root `CONTEXT.md` canonical term + *Avoid* entry, **extension package API** as the replacement for **Capability API**, affected nested CONTEXT files, `CONTEXT-MAP.md` routing if needed, and the docs/prose sweep. API-term evidence: `updates/2026-07-25-extension-package-api-verdict.md`. The CONTEXT slice has landed — root `CONTEXT.md`, `CONTEXT-MAP.md`, and all 12 nested live CONTEXT files; evidence: `updates/2026-07-25-context-vocabulary-layer-landed.md`. Remaining: the prose sweep of live READMEs, `docs/`, and skills enumerated in `references/blast-radius-inventory.md`.
- [ ] Reconcile `professional-repo-curation`'s `references/root-readme-positioning.md` taxonomy to the new vocabulary without reopening settled positioning decisions.
- [ ] Write the code-level rename plan (tier directory/package rename, identifiers, literals, sequencing relative to the demotion commit) and hand it to the parent umbrella; record it in a Semantic Update. Two sequencing inputs are now settled from the parent's roadmap and one is not; evidence: `updates/2026-07-25-parent-sequencing-inputs-and-package-set.md`. The plan must state the directory-move set (14 residents) and the tier-value set (11 declarants) as distinct lists. Still open: whether the cutover lands inside the demotion commit or in one adjacent hard-cutover commit.

## Parked

- Executing the code-level renames — owned by the parent umbrella's demotion-commit sequencing unless the plan concludes a standalone slice is cheaper.
