---
blocked: The ns-foundation README-driven pass awaits completion of the Clinkr dry run and return of its gate-calibration lessons.
edges:
  - objective: professional-repo-curation
    annotation: Parent umbrella; this pass is its sanctioned parallel Subobjective, calibrating the README-driven graduation gate on public infrastructure packages that remain outside incubation.
  - objective: clinkr-readme-driven-development
    annotation: Clinkr package Subobjective; it owns the first contract draft, implementation and caller audit, mismatch dispositions, reconciliation, and gate-calibration lessons returned to this umbrella.
---

# ns-foundation README-Driven Pass

## Thesis

Give the public infrastructure packages a bottoms-up README-driven development pass in dependency-respecting order: `infra/clinkr` → `infra/ns-foundation` → `infra/brmem` and `sdk` → `extension-kit`. This umbrella creates one Readme-Driven-Development Subobjective per package and owns sequencing, gate calibration, and synthesis; package-level contract decisions and mismatch backlogs belong to those children.

The identity and architecture correction from Foundation to ns-foundation is an immediate prerequisite slice and may land before Clinkr closes. The actual ns-foundation README contract draft, implementation and caller audit, reconciliation, and promotion remain gated until the Clinkr Subobjective completes its dry run and returns process amendments.

## Scope

- Complete the hard identity cutover to `@nseng-ai/ns-foundation` as an immediate prerequisite: package path/name, consumers, tooling, current guidance, and architecture record move atomically without compatibility residue.
- Spawn one package-level Readme-Driven-Development Subobjective at a time, beginning with Clinkr. Each child develops `references/README-draft.md` as a provisional cold-audience contract, audits implementation and callers against it, explicitly dispositions mismatches, discusses refactoring with the user before implementation, reconciles the package to the settled contract, promotes the draft to the package README, verifies it, and returns lessons here.
- Process packages in dependency-respecting sequence. Clinkr is the lower generally applicable CLI layer; ns-foundation depends on Clinkr; Brmem and SDK can follow ns-foundation independently; Extension Kit depends on SDK, ns-foundation, and Clinkr.
- Let public-interface and observable-behavior decisions settle through the README draft rather than silently through implementation.
- Use the Clinkr dry run to calibrate the graduation gate, recording process amendments here before applying them to later children.
- Keep these packages outside incubation. The pass proves an honest-and-explainable contract gate on public infrastructure packages before incubating extensions graduate through it.

## Non-Goals

- Redistributing ns-foundation modules or redesigning its exports as part of the identity cutover.
- Designing a replacement package tier in this slice; ns-foundation uses the existing `sdk` tier as its provisional classification.
- Moving these packages into or out of incubation.
- Incubating-package work.
- Unrelated feature work or redesign. Contract-supporting refactoring requires prior user discussion and approval.
- Performing package audits in this umbrella record; package audits belong to child Objectives.
- Treating existing package READMEs as evidence that this process completed without the required child record, draft, mismatch dispositions, and closure evidence.

## Completion Criteria

- The Foundation identity is hard-cut to `@nseng-ai/ns-foundation` with architecture and current guidance aligned, no compatibility package or alias, unchanged exports and behavior, and deferred tier-taxonomy work recorded explicitly.
- Clinkr, ns-foundation, Brmem, SDK, and Extension Kit each carry a promoted, verified cold-audience README contract delivered by a closed Readme-Driven-Development Subobjective.
- Every child's mismatches are resolved or explicitly parked in that child record.
- Cross-package lessons and gate-calibration outcomes are synthesized here and handed back to `professional-repo-curation` for future incubator graduations.

## Assumptions and Risks

Assumptions:

- Public infrastructure packages do not depend on incubating residents. Their manifests currently support this assumption.
- Serializing the package passes is acceptable even though Brmem and SDK are independent after ns-foundation; the umbrella favors learning transfer over maximum parallelism.

Risks:

- **Perfectionism stall.** README-driven audits can invite redesign. Keep each child bounded to contract reconciliation, require explicit mismatch dispositions, and split unrelated work.
- **Gate drift.** Record process amendments once in this umbrella and apply them forward rather than allowing each child to invent a different gate.
- **Existing-doc false confidence.** Brmem and SDK already have READMEs, but no package child or draft exists; do not mark work complete from file presence alone.
- **Hidden dependency drift.** Recheck manifests as each child starts so the public-infrastructure dependency assumption does not become stale.
- **Tier-name ambiguity.** ns-foundation and the author-facing `@nseng-ai/sdk` package now share the `sdk` tier while retaining distinct roles; do not collapse package identity or API ownership into tier membership. Brmem's lower-tier dependency is explicit debt until its planned package pass revisits classification.

## Open Questions

- What process amendments, if any, does the Clinkr dry run establish for later package children?
- After ns-foundation, should Brmem and SDK remain deliberately serial for learning transfer, or may their package children proceed in parallel?
- Does the provisional `sdk` classification remain sufficient after the README-driven package pass, or does later evidence justify a distinct tier?
