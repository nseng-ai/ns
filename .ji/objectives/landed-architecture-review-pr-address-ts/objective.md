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

- **Python parity gate (accepted for schema collapse):** The schema-collapse row is resolved as still gated rather than forced. `@asdl/pr-address` operation specs do not yet carry clinkr `resultSchema` values, so derived documents would fail existing output-schema parity. The pinned `operation-schemas/` mirror remains intentionally until parity can pass without changing the schema surface.
- **Golden-test coupling (de-risked for pass-through deletion):** `string-values` and `reply-formatting` were deleted by folding byte-sensitive helpers into owning modules while preserving the golden tests that cover Python-like repr/tuple rendering and reply formatting.
- **Hidden coupling on merge (de-risked for implemented slices):** The classification slice surfaced only expected callers, and they now import the curated `classification.ts` surface. The stack-feedback triage slice gave discussion triage one owner and moved prep/plan/diff-current consumers onto focused producer-owned contracts. The payload slice moved lookup and manifest behavior into the payload-store domain with a high-level context factory seam. Final sweeps found no references to the old classification leaf paths or deleted pass-through/payload modules.

## Open Questions

- Schema collapse remains a future-gated cleanup: add operation `resultSchema` coverage and re-run parity before deleting `operation-schemas/`.
- No open payload filesystem-seam question remains for this Objective; the seam is pr-address-local and high-level, with node and in-memory factories.
- Future stack-feedback ownership drift should be handled as new work if it appears; this Objective's stack-feedback contract/triage scope is complete.

## Closure

Outcome: completed with the schema-collapse deletion explicitly deferred behind a recorded parity gate. Classification, stack-feedback triage/contracts, payload-store consolidation, and pass-through absorption are implemented. The dual schema mirror remains by design because clinkr-derived output schemas cannot yet match parity fixtures without operation `resultSchema` coverage.

Evidence: local working-tree implementation on branch `payload-store-fake-pass-through-schema` against Graphite parent `stack-feedback-triage-contracts-plan-diff-current`; full `pnpm --dir ts run check`, full `pnpm --dir ts run test`, and `git diff --check` passed.

Follow-up: a future schema-focused Objective can add operation result schemas and remove `operation-schemas/` only after derived schema parity passes.
