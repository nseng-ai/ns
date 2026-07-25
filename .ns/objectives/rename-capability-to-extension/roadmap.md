# Roadmap

## Work

- [x] Settle the vocabulary verdict with the user: **ns extension** replaces capability and covers both technical package and feature area; bare **extension** is permitted when unambiguous, otherwise qualify **ns extension** versus **Pi extension**; README categories become **the core** and **extensions**; `capability-kit` becomes `extension-kit`, documented as shared library for extensions defined in the ns repository. Evidence: `updates/2026-07-25-vocabulary-verdict.md`.
- [ ] Inventory the blast radius: live domain-vocabulary uses of "capability" across docs/, READMEs, skills, CONTEXT files, and Objective records, plus the code-level set (`capability-kit` tier/package, identifiers, config keys, path literals). Classify each as vocabulary-sweep, code-plan, or deliberately-kept.
- [ ] Land the vocabulary layer: root `CONTEXT.md` canonical term + *Avoid* entry, affected nested CONTEXT files, `CONTEXT-MAP.md` routing if needed, and the docs/prose sweep.
- [ ] Reconcile `professional-repo-curation`'s `references/root-readme-positioning.md` taxonomy to the new vocabulary without reopening settled positioning decisions.
- [ ] Write the code-level rename plan (tier directory/package rename, identifiers, literals, sequencing relative to the demotion commit) and hand it to the parent umbrella; record it in a Semantic Update.

## Parked

- Executing the code-level renames — owned by the parent umbrella's demotion-commit sequencing unless the plan concludes a standalone slice is cheaper.
