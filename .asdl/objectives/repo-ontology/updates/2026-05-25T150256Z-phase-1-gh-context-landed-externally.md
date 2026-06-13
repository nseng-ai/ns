# Phase 1 — asdl-core Gh context landed via pr-gateway-unification

## Summary

Reconciled repo-ontology tracking with the landed state of `packages/asdl-core/CONTEXT.md` on master. The Phase 1 `## Gh` section — the fourth asdl-core subdomain after Clinkr, Git, and Gt — is present and complete on trunk, but it was authored by the **pr-gateway-unification** Objective (commit `5d39e051`, #555) rather than by a dedicated repo-ontology grilling session, with the related type cleanup landing in `f6a2cf9b` (#580).

The section meets repo-ontology's per-section criteria (Language entries each with `Avoid:` aliases, followed by a Relationships subsection) and resolves all three disambiguations the roadmap's `## Gh` task had planned:

- **`PRState` vs `PRStateFilter`** — `PRState` is GitHub output about one PR's lifecycle (`OPEN`/`CLOSED`/`MERGED`); `PRStateFilter` is a query input for list/search (`open`/`closed`/`merged`/`all`, where `all` is a filter value, never a lifecycle state). The section records these as distinct surfaces, not casing variants.
- **The review/comment family** — `PRReview` (a submitted review event with a `PRReviewState`), `PRReviewThread` (a resolvable inline conversation owning the PR diff anchor), `PRReviewComment` (one message inside a thread), and `PRDiscussionComment` (top-level timeline comment). `IssueComment` is demoted to an `Avoid:` alias of `PRDiscussionComment`.
- **`PRSummary` vs `PRDetails`** — `PRSummary` is the single canonical PR metadata record; `PRDetails` is demoted to an `Avoid:` alias after #580 deleted `PRDetails` and `IssueGateway` and finalized `PRGateway` as the sole canonical GitHub gateway.

Evidence: these changes are already merged on master (#555, #580); this update writes their post-landing effect on the Objective rather than tracking an open branch. `/CONTEXT-MAP.md` already links the Gh anchor as *Present* (landed with #555), so no map edit was needed here.

## Objective Impact

- `roadmap.md`: Phase 1 `## Gh` task marked `[x]` with completion evidence noting external authorship via #555/#580, the three resolved disambiguations, and that the map already marks the Gh anchor *Present*. This clears the stale `PRDetails` / `IssueGateway` references the task framing carried.
- `objective.md`: revised the session-count assumption to record that sections may be satisfied by an adjacent Objective that owns the underlying code, accepted when they conform to the section criteria rather than re-grilled — lowering the remaining session count, with the trade-off that such sections must be re-checked against the criteria.
- Phase 1 now has one remaining item (`## Top-level utilities`); Phases 2–4 are untouched. The completion criterion requiring H2 sections for `Clinkr`, `Git`, `Gt`, `Gh`, and `Top-level utilities` is now four-fifths met.

## Follow-Ups

- Next roadmap item: Phase 1 `## Top-level utilities` in `packages/asdl-core/CONTEXT.md` — `AsdlPluginSpec` + `context_factory` (`plugin.py`), `get_console` / `make_table` (`console.py`), `format_relative_time` / `state_badge` (`format.py`, interacts with `PRState`), and `AliasedGroup` (`click_utils.py`).
- Phase 4 flagged-ambiguities: the now-canonical gh vocabulary settles the **Review** overload (`PRReview` = a single review event) and the **Comment** surfaces (`PRReviewComment` vs `PRDiscussionComment`); confirm the map's "Flagged ambiguities" candidates against these definitions, and keep the State/status candidate (`PRState`/`PRStateFilter` vs `format.state_badge` vs `packagechk.CheckStatus`) for Phase 4 resolution.
- Phase 3 `asdl-pr-address`: its planned `IssueComment` cross-reference should reconcile package-local naming against core's `PRDiscussionComment` (where `IssueComment` is now an `Avoid:` alias) rather than redefine it.
