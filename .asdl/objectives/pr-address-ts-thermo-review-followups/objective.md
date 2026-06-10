# pr-address TS thermo-review follow-ups

## Thesis

A thermo-nuclear code-quality review of the `ts/packages/pr-address` package (added in the `pr-address-typescript-port` stack) found that the port's craft is strong — byte-parity envelope engineering, errors-as-values discipline, real DI seams — but its structure regressed relative to the Python original: core wire contracts are hand-defined three to four times, two files exceed 1,000 lines, shared Python modules were re-inlined as divergent copies, and one TS-managed route has a verified behavioral divergence from Python.

This objective remediates those findings while the conditions that make remediation cheap still hold: the byte-parity fixture suite guards every restructuring, and the in-repo Python reference (`packages/asdl-pr-address`) is still available to regenerate fixtures and arbitrate parity disputes. Once the port objective deletes the Python package, several of these items become substantially more expensive or impossible to verify.

## Scope

- Behavioral parity corrections found by the review: `read-feedback-detail` (singular) payload containment, `--format=json` acceptance, strict integer argument parsing.
- Contract consolidation: one canonical Zod schema per wire shape (plan, manifest, checkpoint, stack-plan, summaries, classification packet), `z.infer` producer types, deletion of hand-written mirror interfaces and `unknown`-washing seams.
- Structural decomposition: `operation-schemas.ts` (1,322 lines) and `classification-core.ts` (1,316 lines) split below the 1k threshold along boundaries the import graph already proves.
- Deduplication: a single operation table (registry + schema docs + help), one exec argv parser, a shared operation-support layer, a shared thread-decision engine between the single-PR and stack resolve-payload builders, and ports of the Python `thread_index` / `string_values` shared modules.
- Dead-code deletion and small judo moves identified by the review (identity-function chains, parallel-array index joins, `missing_gateway` branch class, `raw-exit` variant).
- Test-suite hardening: real-gateway tests via scripted `ProcessRunner`, tests for the json-schema-parity comparator, fixture regeneration/provenance machinery on the Python side, and consolidation of copy-pasted test scaffolding.

## Non-Goals

- No user-facing `pr-address` workflow redesign and no intentional behavior changes beyond the documented parity corrections (which move TS _toward_ Python behavior, not away from it).
- Not the cutover itself: TypeScript-default flips, wrapper/distribution work, and Python package retirement remain owned by `pr-address-typescript-port`.
- No breaking of the byte-parity envelope contract while the Python reference is live; restructurings must keep envelope text and artifact write order identical.
- No new abstraction beyond what deletes existing duplication — the review's bar is fewer concepts, not rearranged ones.

## Completion Criteria

- The singular `read-feedback-detail` op enforces the same payload containment contract as Python (`read_json_payload_artifact` semantics), with the scenario fixture moved to a contained `sessions/<id>/payloads/` path.
- `--format=json` produces JSON envelopes wherever `--format json` does; non-integer forms like `1e2`/`0x10` are rejected where click's `int` rejects them.
- No source file in the package exceeds 1,000 lines; `operation-schemas.ts` and `classification-core.ts` are decomposed.
- Each wire contract (plan items, manifests, checkpoint, stack plan, compact summaries, classification packet) has exactly one canonical Zod definition; producers type against `z.infer`; the `--json-schema` doc routes import rather than restate; the two contradictory classification-template route schemas are unified.
- One operation table drives dispatch, schema routing, and help; `LEGACY_EXEC_OPERATIONS`, `isTsManaged`, `raw-exit`, and the other dead exports identified in the review are gone.
- One exec argv parser; one gateway-helper module; `PrAddressContext` gateways are required and the `missing_gateway` branch class is deleted.
- The single-PR and stack resolve-payload builders share a thread-decision engine; the `trimRequired` divergence is eliminated by a shared string-values module.
- Real GitHub/git gateway adapters and the json-schema-parity comparator have their own tests; captured-Python fixtures have a regeneration path (script or Python-side parity test) and provenance.
- The full TS suite (`just ts-test` / Vitest) remains green throughout, and envelope byte-parity fixtures pass unchanged except where a parity _correction_ explicitly updates them.

## Assumptions and Risks

Assumptions:

- The byte-parity fixture suite (envelope text, artifact parity, json-schema route parity) is comprehensive enough to make the consolidation/decomposition work behavior-checked refactoring rather than risky rewriting.
- The Python package remains in-repo long enough to regenerate fixtures and arbitrate parity questions; the port objective's retirement phase has not yet deleted it.
- JSON key order in result literals and artifact sequence-number ordering are load-bearing for the parity fixtures; refactors that preserve literal field order and write order keep fixtures byte-identical.
- The three verified behavior corrections (containment, `--format=json`, strict ints) are parity _bugs_, not intentional contract changes — confirmed against the port objective's "preserved or intentionally changed with explicit rationale" criterion.

Risks:

- Time coupling: if `pr-address-typescript-port` deletes `packages/asdl-pr-address` before the fixture-regeneration and parity-correction rows land, this objective loses its reference implementation. Sequence the parity and test-hardening rows early.
  - Mitigated 2026-06-09: this objective's stack forks from the port stack's current graphite branch (`pr-address-ts/schema-routes`), before any Python retirement work, so the in-repo Python reference remains available on this line regardless of the port objective's deletion timing.
- Two open objectives touch the same package; roadmap drift between them is possible. This record owns quality remediation; the port record owns cutover. Cross-reference rather than duplicate rows.
- The contract-consolidation row touches many files at once; doing it after the dead-code and support-layer sweeps (which shrink the surface) keeps each diff reviewable.
- `read-feedback-detail` containment is currently pinned by a TS test asserting the divergent behavior; fixing parity requires changing that test deliberately, which could be mistaken for a regression without the review context.

## Open Questions

- Should the fixture regeneration entry point live as a pytest in `packages/asdl-pr-address/tests/` (drift-detection with `--update`) or as a standalone capture script? The review leaned toward the pytest form so the Python suite guards freshness while both implementations coexist.
- Whether the `stack-feedback-prep` parallel-fetch phase should flip on before or after cutover, given fetch-failure disk-state differs from Python under partial failure (stdout/exit parity is preserved either way).
- Whether `writeTextArtifact` (no production caller) is needed by upcoming log-artifact operations or should be deleted in the dead-code sweep.
