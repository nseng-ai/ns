# Internal Pi-Tools Deepening

## Thesis

The 2026-07-04 architecture review of `@internal/pi-tools` found that duplication is concentrated, not uniform: the neutral `@ns/pi` helper subpaths (parity engine, terminal layout, LM-JSON, exec/gh gateways) already absorb most would-be cross-subpackage repetition. What remains is ~320 lines of already-drifting clones inside `pr-previews` (the checks and feedback halves), a ~40-line parity test template copy-pasted into all six subpackage test dirs, and interface-shape friction in three subpackages: incidental export subpaths with zero importers, import-shortening shim fragments, a six-file interrogation flow bounce, and a double barrel. Deepen where the evidence points: merge the pr-previews twins behind one preview-surface module, collapse the parity harness to one helper, and shrink or consolidate the shallow interfaces.

## Scope

Five candidates from the review, in priority order:

1. **pr-previews twins merge (Parked).** The checks/feedback view/command/model clones remain a real deepening candidate, but the work is parked by explicit direction before seam classification or implementation. Reopen only with a concrete reason to pay the abstraction risk and first classify the drifted presentation differences as parameters or accidents.
2. **Parity assertion helper (Strong; touches `@ns/pi`).** One `expectPiSurfaceParity(register, metadata)`-shaped helper beside `@ns/pi/parity/testing`; each subpackage's parity test becomes one call. Stops the template being copied into the next Internal Pi-tool package.
3. **runner-subagents interface narrowing (Landed).** The export map now keeps root, `/extension`, and deliberate `/testing`; dropped `/json-events`, `/presentation`, `/process`, `/runtime`, and `/usage`; deleted the 13-line `usage.ts` shim; retained `extension-api.ts` as the internal type/API home because the pass-through-facade concern was stale against current code.
4. **context-profiler interrogation consolidation (Worth exploring).** Consolidate the five interrogation fragments behind the controller's interface (session/prompt/transcript/render become internals); relocate `InterrogationScope` to the model, where its consumers live; delete the `errors.ts` and `lm-json.ts` shims.
5. **thermo-council flattening (Worth exploring).** One barrel instead of `index.ts` → `extension.ts` → six files; one type home instead of the `contract.ts`/`types.ts` split; fold the `outcomes.ts`/`prompt-blocks.ts`/`constants.ts` fragments into the orchestrator that uses them; give `reviewerOutcomeFromRunnerResult` a deliberate test surface (export it or test through the command).

## Non-Goals

- Moving preview/tool domain behavior into `@ns/pi/shared/*` to deduplicate — explicitly forbidden by the `@ns/pi` AGENTS.md package boundary.
- Splitting the deep god-files that earn their keep (`runner-subagents/subagent-process.ts`, 1159 lines behind one entry point, is the good kind of big).
- New cross-package seams, new export subpaths, or any package/space restructuring — the `internal-packages` Objective owns the space taxonomy.
- A general "test through the interface" sweep across the package; the review observed tests reaching past barrels everywhere, but only candidate 3 addresses it, and only where the export map itself is the symptom.

## Completion Criteria

- Candidate 2 landed: the six parity test files are one-call consumers of a shared helper.
- Candidates 1 and 3–5 each resolved: landed, explicitly parked with rationale, or dropped with recorded rationale — a Semantic Update, or an ADR when the reason should stop future architecture reviews from re-suggesting the same deepening.
- Evidence noted in roadmap rows or Semantic Updates: targeted tests plus relevant repo checks passed for each landed slice.

## Assumptions and Risks

Assumptions:

- The review findings hold: pr-previews clone mass is ~320 lines across view/command/model pairs with confirmed drift (feedback-only `modalRows()` overlay budget, differing footer border chrome, diverged detail glyphs); the parity template is ~90% identical across six files; runner-subagents' `/json-events`, `/presentation`, `/usage` subpaths have zero importers anywhere in `ts/`, `/process`/`/runtime`/`/testing` are test-only, and the root barrel's only production consumer is thermo-council. Re-verify importer facts before cutting exports; they were swept 2026-07-04.
- The two pr-previews view test suites (~530 lines) are strong enough to keep the twins merge honest.
- Narrowing the runner-subagents export map is style-guard-compatible: `NS_TS_EXPORTS_SUBPACKAGE_CONFORMANCE` requires export subpaths to resolve inside declared subpackages; it does not require any particular subpath to exist.

Risks:

- Premature abstraction in the twins merge: some drifted differences may be deliberate per-surface presentation rather than drift bugs. The merge design must classify each difference as parameter or accident before unifying; getting this wrong bakes the wrong interface into the deep module.
- Candidate 2 edits `@ns/pi`, a host package outside pi-tools. Parity helpers are an explicitly neutral `@ns/pi` family, so the change should be additive, but it must coordinate with `cross-harness-parity` conventions rather than inventing new parity vocabulary.
- thermo-council is the thinnest-tested subpackage (one 1142-line integration test over 1929 src lines); flattening its barrels has weak regression cover, which is part of why candidate 5 is worth-exploring rather than strong.
- Grilling may kill candidates 3–5 entirely; the completion criteria deliberately allow resolved-not-landed so this does not strand the Objective.

## Open Questions

- If pr-previews is reopened, where exactly does the preview-surface seam sit — a generic list/detail modal component, a shared base implementation, or a render-function toolkit? Grill before implementation.
- Should `context-profiler/view.ts` (1047 lines, no test imports it) get coverage as part of candidate 4, or as a separate follow-up? The interrogation consolidation must at minimum not grow it.
