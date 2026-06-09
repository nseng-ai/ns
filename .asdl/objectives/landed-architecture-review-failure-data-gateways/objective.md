# Landed Architecture Review: Failure-as-Data and Gateway Conventions

## Thesis

The dominant architecture trend in the 2026-06-03 → 06-05 landed-work window was converting throw-based failure paths into discriminated returned data and extracting semantic gateways at external boundaries. The conversions happened package by package — `land-stack`, handoff and objective parsers, the runner runtime, `ResolvePlanEvidence`, `brmem` envelope parsing — without anyone deciding whether they share a contract worth naming.

This child Objective owns that decision. The deliverable is a judgment, not a refactor: either the conversions share enough structure to justify a named convention (documented guidance, and possibly a small helper or exemplar slice), or the per-package patterns are healthy local variation and the topic is parked with rationale. The archived `landed-architecture-review` Objective is provenance for this child, not a binding mandate; current code decides.

## Scope

- Inventory the failure-as-data conversions from the landed window and any that landed since: `LandStackFailure`/`LandStackResult` with `presentLandStackFailure`, handoff and objective parser-as-data conversions, runner runtime results, `ResolvePlanEvidence`, `brmem` envelope parsing, and the removals of `HandoffUsageError`, `CustomCliUsageError`, and `RuntimeResultParseError`.
- Inventory the semantic gateway extractions from the same window — `AregEnvironment`, `SkillxWorkspaceInstaller`, `PlannedBranchGitGateway` / `PlannedBranchBrmemGateway` / `RealPlannedBranchGraphiteGateway` — and how failure data crosses those gateway boundaries.
- Decide whether these share a contract worth naming as a repo convention: discriminant shape, failure/presenter pairing, gateway return-type expectations, and where such guidance should live (skill, repo docs, or code helpers).
- If a convention is adopted, produce one authoritative artifact and optionally apply it to one targeted exemplar slice; if not, park with a written rationale strong enough to prevent re-suggestion.

## Non-Goals

- Do not touch the payload artifact architecture; it is owned by the `agent-payload-artifacts` Objective.
- Do not run an omnibus refactor converting every remaining throw site to returned data; conversion-at-scale is only justified after (and if) a convention is named, and then as separate work.
- Do not introduce a heavyweight Result/Either framework or third-party effect library; any helper must stay small and local.
- Do not force one convention across TypeScript and Python if the languages' idioms genuinely diverge; a per-language answer is an acceptable outcome.
- Do not make routine validation, waiting for CI, or full-repo checks standalone roadmap work.
- Do not mirror progress back into the umbrella Objective after this child has been created.

## Completion Criteria

This Objective is complete when:

- the failure-as-data and gateway-extraction inventory has been re-baselined against current code, not the 2026-06-05 snapshot;
- a named decision is recorded: a shared convention adopted (with its home and authoritative artifact identified) or the topic explicitly parked with rationale;
- if adopted, the convention artifact exists and at most one targeted exemplar slice demonstrates it with evidence;
- assumptions and risks below have been updated through Semantic Updates as evidence changes.

## Assumptions and Risks

Assumptions:

- The throw → discriminated-returned-data trend is a durable direction in this codebase, not an incidental style of one contributor window.
- The inventoried sites are close enough in shape that a comparison can be made by reading current code and tests, without prototype refactors.
- TypeScript guidance already leans errors-as-values via the `typescript-style` skill; the open question is repo-specific contract shape, not whether errors-as-values is desirable.
- Python and TypeScript may resolve differently: the repo's Python favors LBYL and frozen dataclasses, and a single cross-language contract may be the wrong altitude.
- Master has moved since the 2026-06-05 re-baseline; the inventory must be refreshed before any contract is named.

Risks:

- Premature abstraction: naming a shared contract too early could force unification where healthy local variation exists. Mitigation: the parked-with-rationale outcome is a first-class result, not a failure.
- Snapshot drift: the seed inventory is from the 2026-06-03 → 06-05 window; conversions landed since then could change the picture. Mitigation: the first roadmap row is the re-baseline.
- A convention without a home drifts: guidance that lives nowhere enforceable (skill, docs, review checklist) decays. Mitigation: choosing the artifact's home is part of the adoption decision, not an afterthought.
- Scope creep into gateway redesign: comparing gateway boundaries could slide into redesigning them. Mitigation: gateways are inventory subjects here; changing gateway interfaces belongs to future, separately decided work.

## Open Questions

- Do the discriminated failure shapes share enough structure — `kind`-style discriminants, failure/presenter pairing like `presentLandStackFailure` — to justify a named convention or small helper, or is the shared part already fully captured by the `typescript-style` skill?
- Are failure-as-data and gateway-extraction one convention or two? They co-occurred in the landed window but may deserve separate guidance.
- If a convention is adopted, where does it live: the `typescript-style` skill, repo docs, a review checklist, or a code helper?
