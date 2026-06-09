# Roadmap

## Work

- [ ] Restore `read-feedback-detail` (singular) Python containment parity
  Rewrite `readFeedbackDetail` (`src/read-feedback-detail.ts:39-60`) as a thin composition of the plural op's existing helpers (`readRawClinkrEnvelope`, `resolvePayloadJsonPointer`, `detailKindForPointer`); delete the bespoke `readJsonFile`, local `resolveJsonPointer`, `isJsonValue`, `JsonValue`, duplicate `pythonRepr`. Move the scenario fixture to a contained `sessions/<id>/payloads/` path and assert the Python rejection messages. Evidence: parity error cases (relative path, symlink, uncontained dir) covered.
- [ ] Fix CLI argument compat gaps: `--format=json` and strict integer parsing
  Centralize `--format` handling once in `cli.ts` (both `--format json` and `--format=json`), stripping it before handlers; replace `Number()` coercion with strict `/^-?\d+$/` parsing in `summarize-feedback.ts:110` and `feedback-collection.ts:216` so `1e2`/`0x10` are usage errors as in click.
- [ ] Dead-code sweep
  Delete `LEGACY_EXEC_OPERATIONS`, `isTsManaged`, the `raw-exit` dispatch variant, `isActionComplexity` (only cast in the package), `getFeedbackInlineResultSchema` (feedback-collection copy), `validResolutionModesText`, `stackFeedbackPrFixture`, the verbatim `parseOptions` copy in `classification-core.ts:1205`, and unreachable `--json-schema` skip branches; prune speculative `index.ts` barrel exports to the real embedding contract.
- [ ] Shared operation-support layer and unified argv parser
  One `parseExecArgs(args, { valueOptions, flagOptions, allowPositionals })` replacing the four hand-rolled parsers (delete `managed-options.ts`); move `githubGateway`/`gitGateway` (one return shape), `gatewayOptions`, `gatewayFailure*`, `trimOptional`, `errorMessage`, `isRecord` into a support module so features stop importing from `feedback-collection.ts`; single `RESOLUTION_MARKER`; `APPROVAL_REQUIRED_COMPLEXITIES` moves to `feedback-plan-contracts.ts`.
- [ ] Single operation table driving dispatch, schema routing, and help
  Merge the registry definitions, `SCHEMA_DOCUMENT_BUILDERS`, and the hardcoded `execHelp()` list into one `{ name, handler, schemaDocument }` table with `satisfies` enforcement of handler-schema 1:1; `--json-schema` routes through the same table as dispatch.
- [ ] Make `PrAddressContext` gateways required; delete the `missing_gateway` branch class
  Remove the optionality on `github`/`git`, the per-operation two-step guards, and the synthetic `missing_gateway` envelope; convert the one omitted-gateway test to in-memory fakes.
- [ ] Canonical contracts modules and `unknown`-seam removal
  One Zod definition per wire shape (stack-plan via the compositional `stack-feedback-diff-current` pattern; checkpoint contracts shared by producer and `finalization.ts`; compact summaries; classification template unified across its two contradictory routes); producers typed with `z.infer`; type `buildGetFeedbackPayloadManifest`/`buildPrepareRunPayloadManifest` against gateway domain types; typed `FinalizeRunResult` (delete `resultValue`); drop the `recordBatchCheckpoint`/`finalizeRun` double-parse; delete `planSourceItemBase`/`PlanSourceItemFields`; replace the `mode as ResolutionMode` cast with a guard; delete `parseNonThreadKeyId`. Evidence: json-schema route parity fixtures unchanged.
- [ ] Decompose the two 1k-line files
  `operation-schemas.ts` (1,322) into a per-domain `operation-schemas/` directory importing the canonical contracts; `classification-core.ts` (1,316) into packet/validation/planning/operations modules along its existing import-graph seams. Fold in the local judo moves: identity-function code/message helpers become template literals/tables, plan builders collapse to one partition pass with shared source-field extractors, `requiredAt` index joins become per-element joins.
- [ ] Shared thread-decision engine and Python shared-module ports
  Extract the decision-validation/application core duplicated (~250-300 lines) between `resolve-thread-batch-payload.ts` and `stack-resolve-thread-payloads.ts`, parameterized by subject identity; port `stack_feedback_thread_index` and `string_values` equivalents; eliminate the `trimRequired` silent-empty divergence in `stack-feedback-diff-current.ts:446`. Evidence: envelope byte-parity fixtures unchanged.
- [ ] Split `stack-feedback-prep` into parallel fetch planning and ordered artifact writes
  Phase 1 fetches per-PR data concurrently (first failure in input order wins); phase 2 writes artifacts sequentially in stack order so sequence numbers stay byte-identical. Decide flip-on timing per the open question.
- [ ] Consolidate test scaffolding and align test layout
  Shared `run-scenario`/`temp`/`golden` support modules replacing the six hand-rolled CLI harnesses and repeated temp-dir/clock/golden helpers (~300 lines); move function-level golden tests from `test/scenario/` to `test/unit/` and legacy-gateway tests to `test/gateways/` per the repo layout convention; make `payload-operations` error cases order-independent; name the fake error-string constants the envelope fixtures depend on. Ordered before test hardening so new tests are written against the consolidated scaffolding rather than the harnesses it deletes.
- [ ] Test hardening while the Python reference is in-repo
  Real-gateway tests for `RealPrAddressGitHubGateway`/`RealPrAddressGitGateway` via scripted `ProcessRunner` (lookup-miss vs failure, GraphQL errors, `comments.nodes`, non-numeric ids, restructure lines); known-mismatch tests for the `json-schema-parity.ts` comparator; a fixture regeneration/drift-detection entry point on the Python side plus provenance stamps on captured fixtures.

## Parked

- [ ] Discriminated classified-item union narrowing after validation (deletes `requiredActionComplexity` throw and nullable-complexity plumbing) — worthwhile, but touches the validation/planning seam; revisit after the decomposition row lands.
- [ ] Post-cutover fixture simplification: replace byte-exact `expected_envelope_text` comparisons with structural equality plus one byte-format test per emitter, and delete the parity comparator + captured fixtures alongside the Python package retirement (owned jointly with `pr-address-typescript-port`).
