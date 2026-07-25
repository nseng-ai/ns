---
edges:
  - objective: professional-repo-curation
    annotation: Parent umbrella; this pass is its sanctioned parallel Subobjective, calibrating the README-driven graduation gate on foundation packages that remain outside incubation.
  - objective: clinkr-readme-driven-development
    annotation: Clinkr package Subobjective; it owns the first contract draft, implementation and caller audit, mismatch dispositions, reconciliation, and gate-calibration lessons returned to this umbrella.
---

# Foundation README-Driven Pass

## Thesis

Give the foundation packages a bottoms-up README-driven development pass in dependency-respecting order: `infra/clinkr` → `infra/foundation` → `infra/brmem` and `sdk` → `extension-kit`. This umbrella creates one Readme-Driven-Development Subobjective per package and owns sequencing, gate calibration, and synthesis; package-level contract decisions and mismatch backlogs belong to those children.

The extension vocabulary verdict and machine-readable rename have landed. The former `capability-kit` tail is now `extension-kit`, so vocabulary no longer blocks the SDK or Extension Kit passes. No package child has yet been created, and the first slice remains the Clinkr gate dry-run.

## Scope

- Spawn one package-level Readme-Driven-Development Subobjective at a time, beginning with Clinkr. Each child develops `references/README-draft.md` as a provisional cold-audience contract, audits implementation and callers against it, explicitly dispositions mismatches, discusses refactoring with the user before implementation, reconciles the package to the settled contract, promotes the draft to the package README, verifies it, and returns lessons here.
- Process packages in a dependency-respecting sequence. Clinkr has no internal workspace dependency; Foundation depends on Clinkr; Brmem and SDK can follow Foundation independently; Extension Kit depends on SDK, Foundation, and Clinkr.
- Let public-interface and observable-behavior decisions settle through the draft rather than silently through implementation.
- Use the Clinkr dry-run to calibrate the graduation gate, recording process amendments here before applying them to later children.
- Keep these packages outside the incubator. The pass proves an honest-and-explainable contract gate on stable foundation packages before incubating extensions graduate through it.

## Non-Goals

- Moving these packages into or out of the incubator, changing their tiers, or renaming them.
- Incubator-package work.
- Unrelated feature work or redesign. Contract-supporting refactoring requires prior user discussion and approval.
- Performing package audits in this umbrella record; package audits belong to child Objectives.
- Treating existing package READMEs as evidence that this process completed without the required child record, draft, mismatch dispositions, and closure evidence.

## Completion Criteria

- Clinkr, Foundation, Brmem, SDK, and Extension Kit each carry a promoted, verified cold-audience README contract delivered by a closed Readme-Driven-Development Subobjective.
- Every child's mismatches are resolved or explicitly parked in that child record.
- Cross-package lessons and gate-calibration outcomes are synthesized here and handed back to `professional-repo-curation` for future incubator graduations.

## Assumptions and Risks

Assumptions:

- Foundation packages do not depend on incubator residents. Their manifests currently support this assumption.
- Serializing the package passes is acceptable even though Brmem and SDK are independent after Foundation; the umbrella favors learning transfer over maximum parallelism.

Risks:

- **Perfectionism stall.** README-driven audits can invite redesign. Keep each child bounded to contract reconciliation, require explicit mismatch dispositions, and split unrelated work.
- **Gate drift.** Record process amendments once in this umbrella and apply them forward rather than allowing each child to invent a different gate.
- **Existing-doc false confidence.** Brmem and SDK already have READMEs, but no package child or draft exists; do not mark work complete from file presence alone.
- **Hidden dependency drift.** Recheck manifests as each child starts so the clean-foundation assumption does not become stale.

## Open Questions

- What process amendments, if any, does the Clinkr dry-run establish for later package children?
- After Foundation, should Brmem and SDK remain deliberately serial for learning transfer, or may their package children proceed in parallel?
