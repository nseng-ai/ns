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

All ten priority projects now have durable dispositions. The `asdl-slots`, `asdl-core`, `asdl-objectives`, and `asdl-pr-address` rows shipped with completion evidence in the roadmap and Semantic Updates. The `roaster`, `areg`, `vibechk`, and `packagechk` rows are parked with reasons in the roadmap rather than pursued under this Objective.

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
- The priority order was a good starting order; later implementation evidence and user direction narrowed the final active focus to `asdl-core` adapter conversion/disposition and `asdl-pr-address` feedback workflow deepening, both of which now have shipped dispositions.
- The previous closed `architecture-deepening` Objective is historical context, not an active container for this new priority roadmap.
- Moving the audit docs into this Objective is acceptable because the Objective should be self-contained even if top-level `docs/` changes later.

**Risks**

- Some audit findings may become stale before future follow-up work begins. Mitigation: parked rows should be revalidated before any future unpark decision.
- `asdl-core` work had high blast radius. Mitigation succeeded through narrow Git, GitHub, Graphite, and production-construction slices that preserved existing gateway interfaces while adding focused conversion, reader, and construction locality.
- `asdl-slots` work revealed that the release workflow and checkout mutation fix should be split across separate branches/slices. The checkout mutation fix shipped separately, and the release/free/gc workflow shipped through staged preview-surface and execution-flow consolidation slices with lifecycle-focused tests plus CLI scenario regression coverage.
- Moving the audit docs out of top-level `docs/` may surprise future readers looking there. Mitigation: this Objective path is checked in and should be referenced from future updates or handoffs that use the audit.

## Open Questions

No open questions remain for this Objective. Parked cleanup items from `asdl-handoff`, `aretro`, `brmem`, `roaster`, `areg`, `vibechk`, and `packagechk` should remain opportunistic local refactors unless a future explicit Objective revalidates and un-parks them.

## Closure

Closed as completed. All ten priority architecture-deepening projects have a durable disposition: shipped rows record evidence in the roadmap and Semantic Updates, and lower-priority rows are parked with reasons grounded in the audit and later narrowing decisions. The final `asdl-pr-address` prepare-run workflow slice introduced an in-process workflow module with fake-driven coverage while preserving CLI/payload behavior in the adapter.

Closure caveat: full repository validation still reaches an unrelated TypeScript `ccc` failure in `ts/packages/ccc/src/worktree-status.ts`; focused Python/package validation for the final slice passed. Future work should treat parked cleanup items as new Objective or opportunistic refactor candidates only after current-code revalidation.
