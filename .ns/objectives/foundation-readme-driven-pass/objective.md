---
edges:
  - objective: professional-repo-curation
    annotation: Parent umbrella; this pass is its sanctioned parallel Subobjective, calibrating the README-driven graduation gate on foundation packages that remain outside incubation.
---

# Foundation README-Driven Pass

## Thesis

Give foundation packages bottoms-up README-driven development pass in dependency-respecting order: `infra/clinkr`, then `infra/foundation`, then `infra/brmem` and `sdk`, then `extension-kit`. This umbrella creates one Readme-Driven-Development Subobjective per package and owns sequencing, gate calibration, and synthesis. Package-level contract decisions and mismatch backlogs belong to children.

Extension vocabulary verdict and machine-readable rename landed. Former `capability-kit` tail is now `extension-kit`; vocabulary no longer blocks SDK or Extension Kit passes. No package child created yet. First slice remains Clinkr gate dry-run.

## Scope

- Spawn one package-level Readme-Driven-Development Subobjective at a time, starting with Clinkr. Each child develops `references/README-draft.md` as provisional cold-audience contract, audits implementation and callers against it, explicitly dispositions mismatches, discusses refactoring with user before implementation, reconciles package to settled contract, promotes draft to package README, verifies it, and returns lessons here.
- Process packages in dependency-respecting sequence. Clinkr has no internal workspace dependency; Foundation depends on Clinkr; Brmem and SDK can follow Foundation independently; Extension Kit depends on SDK, Foundation, and Clinkr.
- Let public-interface and observable-behavior decisions settle through draft, not silently through implementation.
- Use Clinkr dry-run to calibrate graduation gate. Record process amendments here before applying them to later children.
- Keep packages outside incubator. Pass proves honest-and-explainable contract gate on stable foundation packages before incubating extensions graduate through it.

## Non-Goals

- Moving packages into or out of incubator, changing tiers, or renaming them.
- Incubator-package work.
- Unrelated feature work or redesign. Contract-supporting refactoring requires prior user discussion and approval.
- Performing package audits in umbrella record. Package audits belong to child Objectives.
- Treating existing package READMEs as evidence process completed without required child record, draft, mismatch dispositions, and closure evidence.

## Completion Criteria

- Clinkr, Foundation, Brmem, SDK, and Extension Kit each carry promoted, verified cold-audience README contract delivered by closed Readme-Driven-Development Subobjective.
- Every child's mismatches resolved or explicitly parked in that child record.
- Cross-package lessons and gate-calibration outcomes synthesized here and handed back to `professional-repo-curation` for future incubator graduations.

## Assumptions and Risks

Assumptions:

- Foundation packages do not depend on incubator residents. Their manifests currently support this assumption.
- Serial package passes acceptable though Brmem and SDK are independent after Foundation. Umbrella favors learning transfer over maximum parallelism.

Risks:

- **Perfectionism stall.** README-driven audits can invite redesign. Keep each child bounded to contract reconciliation, require explicit mismatch dispositions, and split unrelated work.
- **Gate drift.** Record process amendments once in umbrella and apply them forward. Do not let each child invent different gate.
- **Existing-doc false confidence.** Brmem and SDK already have READMEs, but no package child or draft exists. Do not mark work complete from file presence alone.
- **Hidden dependency drift.** Recheck manifests as each child starts so clean-foundation assumption does not become stale.

## Open Questions

- What process amendments, if any, does Clinkr dry-run establish for later package children?
- After Foundation, should Brmem and SDK remain deliberately serial for learning transfer, or may their package children proceed in parallel?
