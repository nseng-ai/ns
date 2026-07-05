# Internal Pi-Tools Deepening

## Thesis

The 2026-07-04 architecture review of `@internal/pi-tools` found that duplication is concentrated, not uniform: the neutral `@ns/pi` helper subpaths (parity engine, terminal layout, LM-JSON, exec/gh gateways) already absorb most would-be cross-subpackage repetition. What remains is ~320 lines of already-drifting clones inside `pr-previews` (the checks and feedback halves), a ~40-line parity test template copy-pasted into all six subpackage test dirs, and interface-shape friction in three subpackages: incidental export subpaths with zero importers, import-shortening shim fragments, a six-file interrogation flow bounce, and a double barrel. Deepen where the evidence points: merge the pr-previews twins behind one preview-surface module, collapse the parity harness to one helper, and shrink or consolidate the shallow interfaces.

## Scope

Five candidates from the review, in priority order:

1. **pr-previews twins merge (Parked).** The checks/feedback view/command/model clones remain a real deepening candidate, but the work is parked by explicit direction before seam classification or implementation. Reopen only with a concrete reason to pay the abstraction risk and first classify the drifted presentation differences as parameters or accidents.
2. **Parity assertion helper (Strong; touches `@ns/pi`).** One `expectPiSurfaceParity(register, metadata)`-shaped helper beside `@ns/pi/parity/testing`; each subpackage's parity test becomes one call. Stops the template being copied into the next Internal Pi-tool package.
3. **runner-subagents interface narrowing (Landed).** The export map now keeps root, `/extension`, and deliberate `/testing`; dropped `/json-events`, `/presentation`, `/process`, `/runtime`, and `/usage`; deleted the 13-line `usage.ts` shim; retained `extension-api.ts` as the internal type/API home because the pass-through-facade concern was stale against current code.
4. **context-profiler interrogation consolidation (Landed).** The interrogation scope model now lives in `model.ts`; production consumers still route through the controller/view seam while prompt/render/session/transcript remain source-internal units with focused tests; the `errors.ts` and `lm-json.ts` shims are deleted in favor of direct neutral helper imports.
5. **thermo-council flattening (Landed).** The root `index.ts` is now the deliberate consumer/test barrel; `extension.ts` is focused on Pi registration/parity and extension host types; `contract.ts` owns public domain/terminal constants and types; adapter/helper types moved to owning modules; `outcomes.ts`, `prompt-blocks.ts`, `constants.ts`, and `types.ts` are deleted; `reviewerOutcomeFromRunnerResult` is a deliberate root-tested helper surface.

## Non-Goals

- Moving preview/tool domain behavior into `@ns/pi/shared/*` to deduplicate — explicitly forbidden by the `@ns/pi` AGENTS.md package boundary.
- Splitting the deep god-files that earn their keep (`runner-subagents/subagent-process.ts`, 1159 lines behind one entry point, is the good kind of big).
- New cross-package seams, new export subpaths, or any package/space restructuring — the `internal-packages` Objective owns the space taxonomy.
- A general "test through the interface" sweep across the package; the review observed tests reaching past barrels everywhere, but only candidate 3 addresses it, and only where the export map itself is the symptom.

## Completion Criteria

- Candidate 2 landed: the six parity test files are one-call consumers of a shared helper.
- Candidates 1 and 3–5 each resolved: candidate 1 parked with rationale; candidates 3–5 landed with Semantic Updates and roadmap evidence.
- Evidence noted in roadmap rows or Semantic Updates: targeted tests plus relevant repo checks passed for each landed slice.

## Assumptions and Risks

Assumptions:

- The review findings hold: pr-previews clone mass is ~320 lines across view/command/model pairs with confirmed drift (feedback-only `modalRows()` overlay budget, differing footer border chrome, diverged detail glyphs); the parity template is ~90% identical across six files; runner-subagents' `/json-events`, `/presentation`, `/usage` subpaths have zero importers anywhere in `ts/`, `/process`/`/runtime`/`/testing` are test-only, and the root barrel's only production consumer is thermo-council. Re-verify importer facts before cutting exports; they were swept 2026-07-04.
- The two pr-previews view test suites (~530 lines) are strong enough to keep the twins merge honest.
- Narrowing the runner-subagents export map is style-guard-compatible: `NS_TS_EXPORTS_SUBPACKAGE_CONFORMANCE` requires export subpaths to resolve inside declared subpackages; it does not require any particular subpath to exist.

Risks:

- Premature abstraction in the twins merge: some drifted differences may be deliberate per-surface presentation rather than drift bugs. The merge design must classify each difference as parameter or accident before unifying; getting this wrong bakes the wrong interface into the deep module.
- Candidate 2 edits `@ns/pi`, a host package outside pi-tools. Parity helpers are an explicitly neutral `@ns/pi` family, so the change should be additive, but it must coordinate with `cross-harness-parity` conventions rather than inventing new parity vocabulary.
- thermo-council remains comparatively integration-test-heavy, but the flattening slice preserved command behavior and passed the focused thermo-council tests plus format/lint/type/style guards.
- Candidates 3–5 survived grilling and landed; the completion criteria allowed resolved-not-landed for lower-confidence candidates, but no active non-parked deepening work remains.

## Open Questions

- If pr-previews is reopened, where exactly does the preview-surface seam sit — a generic list/detail modal component, a shared base implementation, or a render-function toolkit? Grill before implementation.
- `context-profiler/view.ts` remains large and still lacks direct view tests; candidate 4 did not grow it materially (1047 → 1048 import-only lines). Treat view coverage as a separate follow-up, not unfinished Objective scope.

## Closure

Closed after the final two active candidates landed. Candidate 1 is explicitly parked with rationale; candidates 2–5 have roadmap evidence and Semantic Updates; no non-parked roadmap work remains. Final validation evidence for the closing slice: focused context-profiler and thermo-council Vitest commands passed, and `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just ts-test-typescript-style-guard` passed on 2026-07-05.
