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

- The throw → discriminated-returned-data trend is a durable direction in this codebase, not an incidental style of one contributor window. Supported by the 2026-06-09 re-baseline: conversions and extractions kept landing through 2026-06-09 with zero reversals.
- The inventoried sites are close enough in shape that a comparison can be made by reading current code and tests, without prototype refactors. Supported: the 2026-06-09 re-baseline characterized every site by reading alone.
- TypeScript guidance already leans errors-as-values via the `typescript-style` skill; the open question is repo-specific contract shape, not whether errors-as-values is desirable. Confirmed 2026-06-09: the adopted contract is gateway-specific shape guidance; the general rule stays in `typescript-style`.
- Python and TypeScript may resolve differently: the repo's Python favors LBYL and frozen dataclasses, and a single cross-language contract may be the wrong altitude. Strengthened by the re-baseline: Python itself is split (asdl-core gateways return failure domain objects; areg gateways raise domain exceptions). Resolved 2026-06-09: the adopted contract is TypeScript-only; the Python split is parked.
- Master has moved since the 2026-06-05 re-baseline; the inventory must be refreshed before any contract is named. Discharged 2026-06-09: the refresh is recorded in `updates/2026-06-09-1423-rebaseline-failure-data-and-gateway-inventory.md`.

Risks:

- Premature abstraction: naming a shared contract too early could force unification where healthy local variation exists. Mitigation: the parked-with-rationale outcome is a first-class result, not a failure. Discharged 2026-06-09: everything without observed drift was parked; the one adopted contract codifies what existing gateways already do.
- Snapshot drift: the seed inventory is from the 2026-06-03 → 06-05 window; conversions landed since then could change the picture. De-risked 2026-06-09: the re-baseline against master `e9062814` is complete; conversions landed after that commit are ordinary future drift, not a blocker for naming a contract.
- A convention without a home drifts: guidance that lives nowhere enforceable (skill, docs, review checklist) decays. Mitigation: choosing the artifact's home is part of the adoption decision, not an afterthought.
- Scope creep into gateway redesign: comparing gateway boundaries could slide into redesigning them. Mitigation: gateways are inventory subjects here; changing gateway interfaces belongs to future, separately decided work.

## Open Questions

All resolved 2026-06-09 by the contract decision (`updates/2026-06-09-1659-gateway-result-contract-decision.md`):

- Do the discriminated failure shapes justify a named convention, or is the shared part already captured by the `typescript-style` skill? — Split answer: parser shapes are already covered by `typescript-style` errors-as-values (parked); the gateway result shape is a real contract worth naming (adopted).
- One convention or two? — Two concerns; only the gateway result contract is adopted.
- Where does it live? — The "Result unions" section of the `typescript-fake-driven-testing` skill, extended into the authoritative artifact. Documentary form; no code helper.
