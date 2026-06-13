# Landed Architecture Review — pr-address TypeScript

## Thesis

The recently-landed `@asdl/pr-address` TypeScript CLI (~10.7k LOC across 50 modules) and the common code it sits on (`@asdl/clinkr`, `@asdl/core`) carry recurring architectural friction: behaviour fragmented across many shallow modules, types split from the logic that enforces them, and one external dependency reached without a seam. A deepening review surfaced five candidates that turn shallow modules into deep ones — more behaviour behind smaller interfaces, fewer places to test, fewer places a change must land. This Objective tracks all five through to landing.

## Scope

- Deepen the classification subsystem into one module tested through one interface, removing `planning`'s dependency on a private `validation` artifact type.
- Consolidate the stack-feedback prep/plan modules and eliminate the duplicated discussion-triage logic and the reach-through into `prep` internals.
- Fold the payload store/lookup/manifest modules into one deep `PayloadStore` behind an injected filesystem seam, matching the existing github/git gateway pattern.
- Absorb the shallow pass-through modules that fail the deletion test.
- Collapse the dual schema definitions (runtime Zod + hand-authored `--json-schema` doc mirror) into one source of truth, gated on Python parity retiring.

## Non-Goals

- Reworking the clinkr command seam — it is already a deep module and serves pr-address well.
- Reworking the github/git gateway seam — it is already a clean two-adapter (real + in-memory) seam and is the model the rest of the package should converge toward.
- Changing user-facing CLI behaviour, command names, envelopes, or exit codes. These are internal deepenings, not contract changes.
- Forcing retirement of the legacy Python fallback; ADR-0004 owns that decision. This Objective consumes the gate, it does not move it.

## Completion Criteria

- Classification is one module whose interface is `validate → plan`; manifest-view building, semantic-rule checks, and planning are internal seams; the private-artifact leak is gone; tests assert at the one interface and the leaf-level tests are deleted.
- Discussion-triage classification (`triageSummary`, `DIRECT_REQUEST_MARKERS`, the hint enum) is defined once; `plan` consumes a triage result through an interface rather than reaching into `prep.stack[].discussion_triage.items[]`; `diff-current` no longer re-derives the plan/prep wire schemas.
- Payload read/write/manifest go through one `PayloadStore` interface with a node-fs adapter in prod and an in-memory adapter in tests; payload logic is testable without real temp directories.
- The shallow pass-throughs that fail the deletion test cleanly are inlined or folded into their owning module; any kept for golden-test parity are deliberately flagged as test seams.
- The dual schema definitions are collapsed to one source of truth with clinkr deriving the doc — OR this row is explicitly resolved as still gated, with the gate state recorded.
- Evidence: targeted unit/scenario tests and the TS validation commands (`pnpm --dir ts run test`, `pnpm --dir ts run check`, or `just ts-test`) pass for each landed slice.

## Assumptions and Risks

Assumptions:

- The five candidates are independent enough to land as separate slices; classification, stack-feedback, and payload deepenings do not block each other.
- clinkr's `--json-schema` derivation (`group.ts:323` falls back to `buildJsonSchemaDocument(schema)`) is sufficient to replace the hand-authored doc mirror once parity is no longer required.
- The github/git gateway pattern (real + in-memory adapters) is the right template for the payload filesystem seam.

Risks:

- **Python parity gate (not de-risked):** Candidate 1 and the parity-dependent parts of Candidate 5 are blocked on the legacy Python `--json-schema` parity requirement retiring (ADR-0004 frames the Python path as temporary). If parity must hold longer than expected, those rows stay blocked and the largest LOC win is deferred.
- **Golden-test coupling:** Several shallow modules (`string-values`, `reply-formatting`) exist for byte-for-byte Python parity under golden tests. Inlining them prematurely would break parity tests; they must be flagged, not deleted, until parity stops mattering.
- **Hidden coupling on merge (de-risked for classification):** The classification slice surfaced only expected callers, and they now import the curated `classification.ts` surface; final sweeps found no references to the old leaf module paths or the leaked validation artifact helper.

## Open Questions

- Is the legacy Python `--json-schema` parity requirement still live, or close enough to retirement that Candidate 1 can be pulled now rather than parked?
- Should the payload filesystem seam reuse an existing `@asdl/core` filesystem gateway if one exists, or define a pr-address-local port?
- For the stack-feedback `contracts.ts` hub (286 LOC mixing wire schemas, result types, and operation field specs): decompose it as part of Candidate 3, or as a separate follow-up?
