# pr-address CLI planning helpers

Planning helpers are session-store first: pipeline-produced artifacts are resolved from the payload session, while agent-authored classification JSON is sent via stdin/`--classification-json` and file-based decisions/evidence stay in explicit files.

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

The agent produces a classification packet from the scaffold, then validates it by PR number. Prefer stdin so no repo scratch file is created:

```bash
printf '%s' "$CLASSIFICATION_JSON" \
  | pr-address exec validate-feedback-classification \
      --pr-number <pr-number> \
      --format json
```

`--classification-json` remains available for compact inline packets. `--classification-file <path>` is allowed only for files outside the current git worktree, such as temp files or externally managed scratch directories; worktree-local paths hard-fail with no override. Validation resolves the manifest from the payload session and persists the validated classification artifact for later planning.

## Classification packet shape

```jsonc
{
  "schema_version": 1,
  "reviews": [
    {
      "review_id": "PRR_...",
      "disposition": "actionable",
      "body_locator": {
        "json_pointer": "/data/reviews/0/body",
        "item_pointer": "/data/reviews/0"
      },
      "summary": "Human-readable classification summary.",
      "action_summary": "Required for actionable items.",
      "complexity": "local",
      "pre_existing": false,
      "informational_reason": null
    }
  ],
  "review_threads": [
    {
      "thread_id": "PRRT_...",
      "disposition": "actionable",
      "thread_item_pointer": "/data/review_threads/0",
      "covered_comments": [
        {
          "comment_id": 123456,
          "body_locator": {
            "json_pointer": "/data/review_threads/0/comments/0/body",
            "item_pointer": "/data/review_threads/0/comments/0"
          }
        }
      ],
      "summary": "Thread summary.",
      "action_summary": "Required for actionable threads.",
      "complexity": "single_file",
      "pre_existing": false,
      "informational_reason": null
    }
  ],
  "discussion_comments": [
    {
      "comment_id": 987654,
      "disposition": "informational",
      "body_locator": {
        "json_pointer": "/data/discussion_comments/0/body",
        "item_pointer": "/data/discussion_comments/0"
      },
      "summary": "Comment summary.",
      "action_summary": null,
      "complexity": null,
      "needs_reply": false,
      "informational_reason": "automation"
    }
  ]
}
```

Enum values:

- `disposition`: `actionable`, `informational`; stack-feedback review threads may also use `voided_by_stack_work`
- `complexity`: `pre_existing`, `local`, `single_file`, `cross_cutting`,
  `complex`
- `informational_reason`: `resolved_reference`, `automation`,
  `acknowledgement`, `approval`, `question_only`, `fyi`, `noise`,
  `already_addressed`, `other`

Semantic validation rules:

- Every PR-level review in the manifest must be classified exactly once.
- Every unresolved review thread in the manifest must be classified exactly
  once.
- Resolved threads must not be classified as actionable work; current validation
  rejects resolved-thread classification.
- Every comment inside each classified unresolved review thread must be covered
  exactly once in `covered_comments`.
- Every PR discussion comment in the manifest must be classified exactly once.
- Unknown IDs, duplicate IDs, missing IDs, invalid locators, and invalid
  enum/schema values are rejected.
- Every item requires a non-empty `summary`.
- `actionable` items require non-empty `action_summary` and non-null
  `complexity`, and must not include `informational_reason`.
- `informational` items require `informational_reason`, and must not include
  `action_summary`, `complexity`, `pre_existing: true`, or `needs_reply: true`.
- `voided_by_stack_work` is stack-feedback-only, review-thread-only, and rejected by single-PR validation. It requires non-empty `summary` and `action_summary` prose and no `complexity`, `informational_reason`, or `pre_existing: true`.
- If `pre_existing` is true, `complexity` must be `pre_existing`; if
  `complexity` is `pre_existing`, `pre_existing` must be true.

**Output behavior:**

- Valid packet: `exit_code: 0`, `data.valid == true`, writes the PR-scoped
  classification artifact, returns `data.classification_reference`, and includes
  `data.resolved_inputs.manifest`.
- Well-formed but invalid packet: `exit_code: 1`, message
  `PR feedback classification failed validation.`, `data.valid == false`,
  includes `data.resolved_inputs.manifest`, plus structured `data.counts` and
  `data.errors` diagnostics.
- Malformed or missing classification input, missing payload session, bad PR
  number, or missing manifest artifact: `exit_code: 2` with `invalid_json`,
  `invalid_request`, or a payload lookup error.
- Removed legacy flags such as `--payload-json`, `--manifest-json`, or
  `--persist-session` produce usage errors (`unknown option`).

## Single-PR plan

`plan-feedback` resolves both the manifest and validated classification from the payload session:

```bash
pr-address exec plan-feedback --pr-number <pr-number> --format json
```

It no longer accepts wrapper payload JSON via stdin or explicit payload flags. Non-empty stdin is a machine `invalid_request`; removed explicit flags are raw usage errors.

## Stack plan

Stack planning uses only session artifacts:

1. Run `stack-feedback-prep` so the session contains stack prep and per-PR manifests/templates.
2. For each PR, run `classification-template --pr-number <pr>`, produce strict classification JSON, then pipe it to `validate-feedback-classification --pr-number <pr>` or pass it via `--classification-json`.
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

**Full output fields (under `data` with `--stdout-mode full`):**

| Field                           | Description                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `valid`                         | Whether all classifications validated and a merged plan was produced                                               |
| `validation.all_valid`          | Aggregate validation boolean                                                                                       |
| `validation.per_pr[]`           | Per-PR validation counts and errors                                                                                |
| `batches[]`                     | Merged batches in `voided_by_stack_work`, `pre_existing`, `local`, `single_file`, `cross_cutting`, `complex` order |
| `batches[].items[]`             | Action or voided stack item with PR/branch provenance and source item metadata                                     |
| `informational[]`               | Informational items with PR provenance, including decision-required threads                                        |
| `automation_discussion_summary` | Compact counts for automation/human/needs-review discussion triage                                                 |
| `decision_docket[]`             | Approval-required work and non-automation discussion decisions to ask about                                        |
| `stack_plan_reference`          | Stack plan summary artifact (`role: summary`) when `valid` is true                                                 |
| `summary`                       | Actionable, approval-required, informational, and automation counts                                                |

A `voided_by_stack_work` batch contains unresolved review threads that lower-stack PRs still show as open, but current stack-tip or upstack work already addressed or voided. These items are not approval-required action work and should not be hidden in informational counts; route them to resolver payload building with an `explained` decision.

Default compact stdout writes the full merged plan to `data.artifacts.produced[]` (`kind: "stack-plan"`) and omits verbose inline planning data from top-level stdout. Compact stdout uses the shared digest: `counts` has plan totals, `artifacts.produced[]` has the stack-plan reference, and `details` carries the validation, decision docket, compact batch display rows, and informational summary needed for routing. Use the referenced full plan artifact for `stack-feedback-diff-current` and `build-stack-resolve-thread-payloads`.

Merged `batches[]` follow `voided_by_stack_work`, `pre_existing`, `local`,
`single_file`, `cross_cutting`, `complex` order, with `approval_required` true
only for `cross_cutting` and `complex`. `informational[]` carries PR provenance and
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
