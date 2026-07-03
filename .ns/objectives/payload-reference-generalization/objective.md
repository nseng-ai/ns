# Payload reference generalization

## Thesis

The `stack-artifact-reference-payload-file-options` branch added the right capability to `ts/packages/pr-address` — payload fields sourced from saved artifacts via `--payload-file` and `--<key>-reference` options — but implemented its one new idea ("a payload field comes from exactly one source: the embedded payload key XOR a reference option") three times in three styles: a generic file-private helper (`resolveDiffInput`), a bespoke positional clone (`resolvePlanPrepInput`), and an open-coded if/else block (`build-stack-resolve-thread-payloads`), plus a copy-pasted stack-plan shape schema in two files.

This objective consolidates that into a single mechanism in `json-input.ts` and grows it into a declarative per-operation payload spec — the generalized payload-management concept that is ultimately clinkr-shaped. It is deliberately created as a **standalone, possibly duplicative record** while `pr-address-ts-thermo-review-followups` and `ts-clinkr-commander` are open on other lines; after everything merges to master, the three records get reconciled (see Assumptions and Risks, and the reconciliation roadmap row).

## Scope

- One shared XOR-source resolver (`resolveReferenceBackedField` or similar) in `json-input.ts`, replacing `resolveDiffInput` (`stack-feedback-diff-current.ts`), `resolvePlanPrepInput` (`stack-feedback.ts`), and the inline block in `stack-resolve-thread-payloads.ts`; error messages generated in one place (review finding #1).
- One reference-validation rule (review findings #2, #3): either delete the shallow shape-schema layer and let downstream deep validation speak, or define each artifact shape once in its canonical contracts module — and make `loadArtifactReference` diagnostics consistent (include Zod detail, or use shape-only schemas everywhere). Today `--prep-reference` deep-validates but emits an opaque one-liner while the embedded path gets `z.prettifyError` output.
- Document and pin the stdin edge: piping a payload while passing all reference options silently ignores stdin instead of rejecting it as a mixed source — the only place mixing is tolerated (review finding #4).
- A declarative per-operation payload spec — `loadOperationPayload(invocation, { commandName, payloadSchema, fields })` — that owns source-count rejection, the "all fields reference-backed ⇒ payload optional" rule, reference loading, and message templates, consuming the shared resolver (review finding #5a).
- Post-merge reconciliation of this record with `pr-address-ts-thermo-review-followups` and `ts-clinkr-commander`: merge or cross-reference overlapping rows and assign ownership of the parked spec-driven generation work (#5b).

## Non-Goals

- The `asdl-dev` `commandFailure` positional-call crash (review finding #0) — fixed and tracked separately; not this record's work.
- No behavior changes: envelope text, exit codes, and artifact write order stay identical, except where error-message unification deliberately updates fixtures.
- Not implementing clinkr payload/JSON-input support itself — `ts-clinkr-commander` lists JSON-input loading as an explicit v1 non-goal; this objective only keeps the spec design clinkr-compatible.
- Spec-driven generation of option allowlists and `--json-schema` request documents from the payload spec (#5b) is parked, not in scope: it collides with the thermo-review objective's "single operation table" row and clinkr's schema-first design; reconciliation decides where it lives.
- File-size decomposition of `stack-feedback.ts` (934 lines and growing, review finding #6) — owned by the thermo-review objective's decomposition rows; noted here only so reconciliation sees it.

## Completion Criteria

- Exactly one implementation of the embedded-key-XOR-reference-option policy exists, in `json-input.ts`; the three current implementations are deleted and all three operations call it.
- Exactly one rule governs reference artifact validation and diagnostics, applied to all three reference options (`--prep-reference`, `--stack-plan-reference`, `--current-prep-reference`); the duplicated `stackPlanReferenceShapeSchema` copies are gone.
- The stdin-with-fully-reference-backed-inputs behavior is documented in the CLI reference and pinned by a scenario test.
- A declarative payload spec drives payload + reference resolution for the three reference-backed operations; adding the next reference-backed field is a spec entry, not a new helper.
- Full pr-address Vitest suite green; envelope fixtures unchanged except deliberately unified error messages, each fixture change reviewed as intentional.
- Reconciliation done: overlapping rows merged or explicitly cross-referenced across the three records, and #5b ownership decided and recorded.

## Assumptions and Risks

Assumptions:

- Standalone-by-design: the user explicitly chose (2026-06-10) to create this record now, accept duplication against the two open objectives, merge everything to master, and reconcile afterward. Reconciliation notes have been planted in both overlapping records.
- The pr-address scenario suite (292 tests, including mixed-source rejection and missing/malformed/wrong-shape reference coverage added by the source branch) is sufficient to make the consolidation behavior-checked refactoring rather than risky rewriting.
- The three operations named above are the only reference-backed-input consumers today; `--payload-file` plumbing through `loadJsonInput` is already shared and needs no rework.

Risks:

- Overlap drift: `pr-address-ts-thermo-review-followups`' "Canonical contracts modules" row independently plans stack-plan schema consolidation, and its "Single operation table" row covers schema-doc/dispatch unification adjacent to #5b. Executing both on divergent branches will conflict; the reconciliation row and the planted notes are the mitigation.
- clinkr divergence: clinkr v1 excludes JSON-input loading, but pr-address migrates to clinkr last. If the payload-spec design here ignores clinkr conventions (snake_case schema keys, derived `--kebab-case` options), the eventual lift becomes a rewrite instead of a move. Mitigation: keep the `--<key>-reference` derivation convention and schema-first shape aligned with clinkr's registration model.
- Error-message unification touches envelope bytes; careless fixture refresh could mask real regressions. Each fixture diff must be individually attributable to a message-template change.

## Open Questions

- Does #5b (one spec generating both the option allowlist and the request-schema document) land here, in the thermo-review objective's "single operation table" row, or only when pr-address migrates to clinkr?
- Shape layer: delete (downstream validators like `invalid_stack_plan_shape` already speak) or keep-but-canonical (earlier "wrong file at this path" diagnostics)? One rule must win for all three reference options.
- When pr-address migrates to clinkr, does `loadOperationPayload` become a clinkr feature (first-class payload/reference support, currently a clinkr non-goal "until a TS CLI needs them" — this is that need) or stay package-local?

## Closure

Outcome: intentionally subsumed into `pr-address-typescript-port` (2026-06-10).

This record was created deliberately as a standalone, possibly-duplicative record while `pr-address-ts-thermo-review-followups` and `ts-clinkr-commander` were open on other lines; its own roadmap's "post-merge reconciliation" row is satisfied by this consolidation. The PR 1–3 rows (shared XOR-source resolver, one reference-validation/diagnostics rule, declarative `loadOperationPayload` spec, stdin-edge documentation and pinning) moved to the survivor's sequenced roadmap as its payload/reference-consolidation group.

Dispositions recorded with the closure: the parked #5b (spec-driven option/schema generation from the payload spec) dissolves into the clinkr shell migration rather than landing standalone, per this record's own overlap analysis; the eventual `loadOperationPayload` lift decision (clinkr first-class vs package-local) is owned by `ts-cli-foundation`'s payload-home decision row, with the survivor keeping the spec design clinkr-compatible in the meantime.

The thesis, scope, and roadmap above are preserved as historical source material; active tracking now belongs to `.asdl/objectives/pr-address-typescript-port/`.
