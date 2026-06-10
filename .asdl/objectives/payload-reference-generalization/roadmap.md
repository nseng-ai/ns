# Roadmap

## Work

- [ ] PR 1 — shared XOR-source resolver in `json-input.ts`
      Promote `resolveDiffInput` (rename, add `commandName` param), migrate `stack-feedback-plan`, `stack-feedback-diff-current`, and `build-stack-resolve-thread-payloads` onto it; delete `resolvePlanPrepInput` and the inline block; document and pin the stdin-with-both-references edge.
      Evidence: pr-address suite green; envelope fixtures unchanged except unified message templates.
- [ ] PR 2 — one reference-validation and diagnostics rule
      Decide the shape-layer question (delete vs canonical single definition), apply it to all three reference options, and make `loadArtifactReference` failure diagnostics consistent with the embedded-path `z.prettifyError` output.
- [ ] PR 3 — declarative per-operation payload spec
      `loadOperationPayload(invocation, { commandName, payloadSchema, fields })` consuming the PR 1 resolver; owns source-count rejection, payload-optionality when all fields are reference-backed, and reference loading; the three operations declare specs instead of orchestrating.
- [ ] Post-merge reconciliation across the three records
      After this branch, the thermo-review-followups stack, and the clinkr migration work merge to master: merge or cross-reference the overlapping rows (stack-plan canonical schema, single operation table, clinkr payload support), decide #5b ownership, and update or close records accordingly.

## Parked

- [ ] Spec-driven generation of option allowlists and `--json-schema` request documents from the payload spec (#5b) — blocked on the reconciliation ownership decision; collides with `pr-address-ts-thermo-review-followups`' "Single operation table" row and `ts-clinkr-commander`'s schema-first registration model.
