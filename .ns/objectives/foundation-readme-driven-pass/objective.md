---
edges:
  - objective: professional-repo-curation
    annotation: Parent umbrella; this pass is its sanctioned parallel Subobjective, calibrating the README-driven graduation gate on the foundation packages that never move.
---

# Foundation README-Driven Pass

## Thesis

The foundation packages — the clean zone the repo will be judged on — get a bottoms-up README-driven development pass, in place and in dependency order: `infra/clinkr` → `infra/foundation` → `infra/brmem` → `sdk` → `capability-kit`. This is an umbrella Objective: each package pass is created as its own Readme-Driven-Development Subobjective with its own draft, decisions, reconciliation work, and closure evidence; this umbrella owns ordering, gate calibration, and synthesis of cross-package lessons — never package-level mismatch backlogs. These packages never move; the pass proves the graduation gate on the cheapest, most stable packages before anything in the incubator uses it.

The pass is the parent umbrella's sanctioned parallel track: it proceeds independently through the infra packages while the capability→extension rename is in flight, and sequences the extension-adjacent tail (`sdk`, `capability-kit`) behind that rename's vocabulary verdict so contracts are drafted in the settled vocabulary.

## Scope

- Per-package Readme-Driven-Development Subobjectives, spawned one at a time in dependency order, `clinkr` first (smallest, zero internal deps) as the gate dry-run. Each Subobjective: develops `references/README-draft.md` as the package's provisional cold-audience contract through a human-steered interrogative process; audits exports, behavior, errors, configuration, tests, examples, and caller expectations against the emerging contract; records every mismatch in its own roadmap with an explicit disposition (implement, rename, split, deprecate, delete, or deliberately amend the draft); probes accidental implementation complexity relative to the contract; discusses every proposed refactoring with the user before implementation (including refactoring proposed before the draft settles); reconciles implementation to the settled contract; promotes the draft to the package README; verifies it; and returns lessons and closure evidence here for synthesis.
- Public-interface and observable-behavior decisions settle through the draft rather than being decided silently by implementation work.
- Gate calibration: the clinkr dry-run may amend the process itself; amendments are recorded here and applied to subsequent children.
- Sequencing: `sdk` and `capability-kit` passes start only after the `rename-capability-to-extension` vocabulary verdict, and `capability-kit`'s pass adopts whatever rename plan that verdict produced for the tier.

## Non-Goals

- These packages never move; no demotion, no directory changes owned here (tier renames belong to the rename plan and the parent's sequencing).
- The gate is "honest and explainable", never "ideal": no unrelated feature work or redesign inside a package pass; contract-supporting refactoring only after discussion and approval.
- No incubator-package work of any kind.
- This umbrella performs no package audit directly; all audit work lives in the per-package children.

## Completion Criteria

- All five foundation packages carry promoted, verified cold-audience README contracts, each delivered by a closed Readme-Driven-Development Subobjective.
- Every child's mismatch dispositions are resolved or explicitly parked in that child's record.
- Synthesis: cross-package lessons and gate calibration outcomes are recorded here, and the calibrated gate definition is handed back to the parent umbrella for incubator graduations.

## Assumptions and Risks

Assumptions:

- Foundations need no incubator dependencies, so the pass runs unblocked in place. Disproven if an audit surfaces a hidden dependency on an incubator-destined package.
- One-package-at-a-time is fast enough; the pass does not gate the parent's demotion commit or first ship. Disproven if a foundation contract decision turns out to block a graduation.

Risks:

- **Perfectionism stall.** README-driven audits invite redesign. Mitigation: the child-record boundary, explicit dispositions, and the user-approval gate for every refactoring; a slice growing unrelated work gets split out.
- **Vocabulary churn in drafts.** Contracts drafted mid-rename could bake in the old term. Mitigation: infra packages rarely use the term; `sdk`/`capability-kit` are hard-ordered behind the rename verdict.
- **Gate drift across children.** Each child amending the process ad hoc erodes consistency. Mitigation: calibration amendments are recorded here, once, and applied forward.

## Open Questions

- Does the clinkr dry-run change the Readme-Driven-Development process definition, and what amendments carry forward?
- Does `capability-kit`'s pass execute the tier rename itself, or draft against the post-rename name and leave the move to the parent's sequencing?
