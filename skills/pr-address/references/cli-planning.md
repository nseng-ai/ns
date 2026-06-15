# pr-address CLI planning helpers

Planning helpers are session-store first: pipeline-produced artifacts are resolved from the payload session, while agent-authored JSON stays in files.

## Session prerequisites

Set or inherit the harness payload session before invoking planning helpers:

```bash
export ASDL_PAYLOAD_ROOT="${ASDL_PAYLOAD_ROOT:-$PWD/.asdl/payload-sessions}"
export HARNESS_SESSION_ID="${HARNESS_SESSION_ID:?set by harness}"
```

## Single-PR classification template

`classification-template` builds a classification scaffold from the latest manifest stored for a PR:

```bash
pr-address exec get-feedback <pr-number> --format json
pr-address exec classification-template --pr-number <pr-number> --format json
```

The helper no longer accepts manifest JSON through stdin or explicit manifest flags. Non-empty stdin is a machine `invalid_request`; removed explicit flags are raw usage errors.

## Validate classification

The agent writes a classification packet file from the scaffold, then validates it by PR number:

```bash
pr-address exec validate-feedback-classification \
  --pr-number <pr-number> \
  --classification-file classification.json \
  --format json
```

Validation resolves the manifest from the payload session and persists the validated classification artifact for later planning.

## Single-PR plan

`plan-feedback` resolves both the manifest and validated classification from the payload session:

```bash
pr-address exec plan-feedback --pr-number <pr-number> --format json
```

It no longer accepts wrapper payload JSON via stdin or explicit payload flags. Non-empty stdin is a machine `invalid_request`; removed explicit flags are raw usage errors.

## Stack plan

Stack planning uses only session artifacts:

1. Run `stack-feedback-prep` so the session contains stack prep and per-PR manifests/templates.
2. For each PR, run `classification-template --pr-number <pr>`, write an agent-authored classification file, then run `validate-feedback-classification --pr-number <pr> --classification-file <file>`.
3. Run `stack-feedback-plan` with empty stdin and no payload-source flags:

```bash
pr-address exec stack-feedback-plan --format json
```

`stack-feedback-plan` resolves the latest stack prep and all required per-PR classifications from the current payload session. It no longer accepts stack plan payload JSON, payload files, or prep references; non-empty stdin is a machine `invalid_request` and removed explicit flags are raw usage errors.

### `stack-feedback-plan` behavior

It validates stack classifications, runs deterministic per-PR planning, merges
batches by `plan-feedback` order, writes a stack plan summary artifact, and
produces a compact decision docket. Every prep PR must have exactly one
classification; unknown, duplicate, or missing PR classifications fail with
`exit_code: 2`.

Default compact stdout writes the full merged plan to `data.artifacts.produced[]` (`kind: "stack-plan"`) and omits verbose inline planning data from top-level stdout. Compact stdout uses the shared digest: `counts` has plan totals, `artifacts.produced[]` has the stack-plan reference, and `details` carries the validation, decision docket, compact batch display rows, and informational summary needed for routing. Use the referenced full plan artifact for `stack-feedback-diff-current` and `build-stack-resolve-thread-payloads`.

Merged `batches[]` follow `pre_existing`, `local`, `single_file`,
`cross_cutting`, `complex` order, with `approval_required` true only for
`cross_cutting` and `complex`. `informational[]` carries PR provenance and
decision-required threads; informational review threads set
`user_decision_required: true` with `allowed_decisions: ["act", "dismiss",
"skip"]`.

If validation fails, the command returns `exit_code: 1`, includes structured
`data.validation.per_pr[]` diagnostics, does not write a merged stack plan, and
sets `data.stack_plan_reference` to `null`. If validation succeeds, it returns
`exit_code: 0`.

Semantic classification remains LLM-owned. This helper validates and merges
classification packets; it does not infer arbitrary review meaning from prose.

`stack-feedback-plan` output is a merged stack plan. It is not accepted by
`build-resolve-thread-batch-payload`, which builds per-PR
`resolve-thread-batch` payloads only from single-PR `plan-feedback` results. For
stack runs, pass the merged stack plan plus explicit per-thread decisions to
`build-stack-resolve-thread-payloads`, then pipe each ready per-PR payload to
`resolve-thread-batch`.
