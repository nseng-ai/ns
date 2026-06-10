# First Stack Grill Decisions

## Summary

A grilling session clarified how to attempt the rest of the `pr-address` TypeScript port as one medium Graphite stack while preserving stop gates for unclear public or irreversible decisions.

The default stack should use six ordered branch theses:

1. `runtime-schema` — local TypeScript exec runtime, fallback registry, JSON envelope/input handling, Zod schemas, schema emission, and test seams.
2. `classification-core` — deterministic classification/planning core, including `classification-template`, `validate-feedback-classification`, and `plan-feedback`.
3. `payload-finalize` — non-GitHub-mutating payload, detail, batch-payload, checkpoint, and finalization helpers.
4. `readonly-stack` — GitHub/git-backed read-only collection and stack prep/plan/diff behavior behind adapter-neutral gateways.
5. `mutation-safety` — mutation/reply builders and executor paths behind gateways, validated with fakes only unless live writes are separately approved.
6. `cutover-retirement-playbook` — safe public-path/docs/wrapper/playbook work plus remaining cutover/fallback retirement plan, stopping before unsafe public distribution, plugin, broad deletion, or live external actions.

Resolved execution decisions:

- Keep the six branch theses/order fixed for the preview, but allow the parent to move specific operations between adjacent branches after dependency inspection.
- Runners may decide local implementation details. The parent may decide shared candidates. Ask the user before public or irreversible boundaries.
- Stop implementation before public invocation contract changes, installed/prod distribution changes, live GitHub writes, broad Python fallback deletion, or published/shared package APIs.
- Add Zod locally in `ts/packages/pr-address`; do not extract a shared runtime/schema package in this stack without explicit approval.
- Use byte-for-byte parity for existing golden JSON outputs where practical, including explicit Python/Pydantic `null` compatibility. Use structured semantic parity for generated `--json-schema` documents unless tests or docs assert exact formatting.
- Use Zod as the authoritative runtime schema source and add a local schema-emission helper/dependency if needed.
- Implement real adapters incrementally only when a slice needs them; otherwise rely on gateway interfaces, fakes, and legacy fallback for unproven real paths.
- Keep the Python plugin as the `asdl pr-address ...` compatibility path during this stack unless TS plugin compatibility becomes clearly safe and non-breaking; otherwise record a cutover plan.
- Retire Python fallback per proven operation when TypeScript parity and tests exist; do not broadly delete fallback paths in this stack without explicit approval.
- If final cutover/fallback/playbook work hits a stop condition, land evidence-backed safe docs/tests/plan/playbook changes and stop before the unsafe change.
- Validate each branch with targeted package/golden/scenario checks, broadening for wrapper, distribution, shared, or final-readiness surfaces.
- Record Objective Semantic Updates per meaningful branch group or durable decision point rather than mechanically per branch.

The grilling session itself should stop at diminishing returns, but implementation should use the explicit stop conditions above rather than a soft diminishing-returns rule.

## Objective Impact

The roadmap now contains a durable `## Next Stack Candidate` section that is detailed enough for an `objective-stack-impl` preview without treating the plan as a hidden stack schema or task database.

This does not complete additional implementation rows. It clarifies how the remaining rows should be attempted as one medium stack and where agents must stop for user input.

## Follow-Ups

- Invoke `objective-stack-impl` with `pr-address-typescript-port` when ready.
- The preview should use the six branch theses above and remind the user that PR submission remains manual.
- During execution, stop before public/irreversible boundaries and record safe plans when final cutover or fallback retirement cannot proceed.
