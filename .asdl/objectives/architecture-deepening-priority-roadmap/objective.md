# Architecture Deepening Priority Roadmap

## Thesis

The per-package architecture-deepening audit identified more candidate work than should be treated as one undifferentiated refactor queue. This Objective turns that audit into a durable priority roadmap: the highest-value projects are ordered by leverage, locality gain, test payoff, correctness risk, and implementation readiness, while the full audit evidence is preserved as reference material inside this Objective.

The architecture vocabulary is the `improve-codebase-architecture` model: module, interface, implementation, depth, seam, adapter, leverage, locality, the deletion test, and the rule that one adapter is a hypothetical seam while two adapters make a real seam.

## Scope

This Objective tracks disposition of the top ten architecture-deepening projects synthesized from the audit:

1. `asdl-slots`: fix checkout planning-time mutation.
2. `asdl-slots`: introduce a `SlotReleaseWorkflow` or equivalent release-focused module for free/gc cleanup and execution flow.
3. `asdl-core`: localize production gateway construction across consuming packages.
4. `asdl-objectives`: deepen checked-in Objective Markdown storage.
5. `asdl-core`: introduce domain output converters/readers for real Git/GitHub/Graphite adapters.
6. `roaster`: deepen inline findings publication.
7. `asdl-pr-address`: deepen feedback snapshot / prepare-run policy.
8. `areg`: extract init planning and managed-block locality.
9. `vibechk`: deepen run-store behavior and collapse hypothetical Git seam ceremony.
10. `packagechk`: deepen claim orchestration for PyPI/npm claim flows.

Reference audit docs have been moved into this Objective at:

`references/architecture-deepening-audit-per-package/`

Those reference docs are part of the Objective context and should be consulted before implementing, parking, or rejecting any roadmap row.

## Non-Goals

- Re-running the full per-package audit unless the reference docs are stale or contradicted by current code.
- Treating every cleanup item as architecture-deepening work. Low-leverage cleanup from `asdl-handoff`, `aretro`, and `brmem` remains parked unless new evidence changes its priority.
- Broad `clinkr` redesign without a second non-CLI adapter or another concrete reason to introduce a new seam.
- Moving workflow-specific namespace/key/schema rules into `brmem`; workflow packages should continue owning their own namespace contracts.
- Adding execution policy, runner policy, hidden metadata, registries, YAML/frontmatter, UUIDs, or task-database behavior to this Objective.

## Completion Criteria

This Objective is complete when each of the ten priority projects has a durable disposition:

- **shipped** — the deepening/collapse landed, tests target the intended interface, and completion evidence is recorded in an Objective update or closure context;
- **parked-with-reason** — the roadmap row moves to `## Parked` with a concise reason grounded in the audit or later evidence;
- **rejected-with-ADR** — an ADR or equivalent durable decision record explains why the candidate should not be re-suggested by future architecture reviews.

Completion does not require every row to ship. It requires that none of the ten priority projects remain ambiguous.

## Assumptions and Risks

**Assumptions**

- The reference audit reports accurately reflect the current architecture at Objective creation time.
- The priority order is a good starting order, but later implementation evidence may justify reordering through Objective updates.
- The previous closed `architecture-deepening` Objective is historical context, not an active container for this new priority roadmap.
- Moving the audit docs into this Objective is acceptable because the Objective should be self-contained even if top-level `docs/` changes later.

**Risks**

- Some audit findings may become stale before implementation begins. Mitigation: reread the relevant package code and the package-specific reference doc before starting a row.
- `asdl-core` work has high blast radius. Mitigation: keep those rows narrow and preserve existing gateway interfaces unless the row explicitly calls for an interface change.
- `asdl-slots` work may reveal that the release workflow and checkout mutation fix should be split across separate branches or child Objectives. Mitigation: record that decision as an update rather than forcing both through one implementation slice.
- Moving the audit docs out of top-level `docs/` may surprise future readers looking there. Mitigation: this Objective path is checked in and should be referenced from future updates or handoffs that use the audit.

## Open Questions

- Should any of the top ten projects become child Objectives before implementation, especially the high-blast-radius `asdl-core` rows?
- Should the priority order change after re-verifying `asdl-slots` against the current code, given that a previous architecture-deepening Objective already shipped earlier slot lifecycle work?
- Should parked cleanup items from `asdl-handoff`, `aretro`, or `brmem` ever be collected into a separate cleanup Objective, or should they remain opportunistic local refactors?
