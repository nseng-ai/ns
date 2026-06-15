# pr-address CLI reference — classification and planning

Classification and planning helpers: build classification templates, validate
classifications, and produce execution plans. Shared invocation conventions
live in [cli-reference.md](cli-reference.md).

Helpers in this file:

- [`classification-template`](#classification-template)
- [`validate-feedback-classification`](#validate-feedback-classification)
- [`plan-feedback`](#plan-feedback)
- [`stack-feedback-plan`](#stack-feedback-plan)

### `classification-template`

Build a deterministic classification scaffold from a compact payload manifest.
Use this after `prepare-run` or `get-feedback` in default payload mode and
before asking the LLM to fill semantic judgments.

**Preferred session invocation after `get-feedback`:** resolve the latest
`pr-address-pr-<n>-manifest` summary artifact from `HARNESS_SESSION_ID` (or
`--harness-session-id`) and build the scaffold from that manifest.

```bash
pr-address exec classification-template \
  --pr-number <pr> \
  --format json
```

Manual/debug compatibility paths still read a bare compact manifest object from
stdin, `--manifest-json`, or `--manifest-file`.

```bash
printf '%s' '<prepare-run or get-feedback data json>' \
  | pr-address exec classification-template --format json

pr-address exec classification-template \
  --manifest-file manifest.json \
  --format json
```

**Output fields (under `data`):**

| Field                     | Description                                                                |
| ------------------------- | -------------------------------------------------------------------------- |
| `manifest_kind`           | `prepare_run` or `get_feedback`                                            |
| `pr_number`               | PR number, or null for `prepare-run` no-PR manifests                       |
| `payload_path`            | Raw payload artifact path from the compact manifest                        |
| `counts`                  | Prefilled review/thread/comment counts plus resolved-thread omission count |
| `classification_template` | Strict packet-shaped scaffold with placeholder semantic fields             |
| `resolved_inputs`         | Session mode only: exact resolved manifest payload reference               |

The helper copies only deterministic fields: IDs, minimal body locators
(`json_pointer`, `item_pointer`), review-thread item pointers, and exact comment
coverage skeletons. It omits resolved review threads because current validation
rejects resolved-thread classification. The raw template uses
`"<fill: actionable|informational>"` disposition placeholders and empty
summaries, so it is intentionally invalid until the classifier fills semantic
fields.

Invalid manifests, duplicate IDs, malformed JSON, and missing files return
`exit_code: 2` with `invalid_request` or `invalid_json`.

### `validate-feedback-classification`

Validate a strict PR feedback classification packet against a compact payload
manifest before planning or execution proceeds.

**Preferred session invocation after `classification-template --pr-number`:**
resolve the manifest from the payload session and pass the agent-authored
classification packet as a file (or controlled inline JSON).

```bash
pr-address exec validate-feedback-classification \
  --pr-number <pr> \
  --classification-file classification.json \
  --format json
```

Session mode resolves the latest `pr-address-pr-<n>-manifest` summary artifact
from `HARNESS_SESSION_ID` (or `--harness-session-id`). On successful validation it
automatically writes the PR-scoped classification summary artifact and returns
`data.classification_reference`, which `plan-feedback --pr-number` can resolve.
Removed legacy flags such as `--payload-json`, `--payload-file`,
`--manifest-json`, `--manifest-file`, and `--persist-session` are usage errors
(`unknown option`).

**Classification packet shape:**

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

- `disposition`: `actionable`, `informational`
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

### `plan-feedback`

Build a deterministic execution plan from a compact manifest and strict
classification packet. The helper validates internally before planning, uses
only compact manifest locators and classification summaries, and does not read
or print raw feedback body text.

**Preferred session invocation:** after successful
`validate-feedback-classification --pr-number`, resolve the latest manifest and
classification artifacts from the payload session and write the PR-scoped plan
artifact.

```bash
pr-address exec plan-feedback \
  --pr-number <pr> \
  --format json
```

Manual/debug compatibility reads wrapper JSON from stdin by default.
`--payload-json` and `--payload-file` are also available; pass only one explicit
payload source.

```bash
printf '%s' '{"manifest":{...},"classification":{...}}' \
  | pr-address exec plan-feedback --format json
```

**Wrapper shape** for plan-feedback manual/debug compatibility input:

```json
{
  "manifest": "<prepare-run or get-feedback data object>",
  "classification": "<schema_version: 1 classification packet>"
}
```

**Output fields (under `data`):** full stdout includes the complete plan
inline. Default compact stdout writes the complete plan to a plan summary
artifact; open `data.details.plan_reference` or `data.artifacts.produced[]` with
`kind: "plan"` before reading `batches`.

| Field           | Description                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `valid`         | Whether validation passed and a plan was produced                                                       |
| `manifest_kind` | `prepare_run` or `get_feedback`                                                                         |
| `pr_number`     | PR number when present                                                                                  |
| `payload_path`  | Raw payload path echoed from `manifest.payload_reference.payload_path`                                  |
| `validation`    | Full validation result used by the planner                                                              |
| `counts`        | Plan counts when valid: actionable/informational totals, batch totals, and source-kind splits           |
| `batches`       | Full stdout / plan artifact: ordered actionable batches                                                 |
| `informational` | Full stdout / plan artifact: explicit informational review, review-thread, and discussion-comment items |
| `warnings`      | Sparse non-fatal planning notes                                                                         |

Each `batches[]` entry contains:

| Field               | Description                                                                          |
| ------------------- | ------------------------------------------------------------------------------------ |
| `batch_id`          | Complexity name (`pre_existing`, `local`, `single_file`, `cross_cutting`, `complex`) |
| `complexity`        | Same complexity enum value                                                           |
| `approval_required` | `true` for `cross_cutting` and `complex`; `false` otherwise                          |
| `items`             | Action items with exact IDs, locators, file/line context, summaries, and reply flags |

Batch order is deterministic and omits empty batches:

1. `pre_existing`
2. `local`
3. `single_file`
4. `cross_cutting`
5. `complex`

Action items include `source_kind` (`review`, `review_thread`, or
`discussion_comment`), `summary`, `action_summary`, `complexity`, exact review /
thread / comment IDs, compact body locators, and source context such as path,
line, author, URL, covered comment IDs, and `needs_reply` where available.
Review-thread items include `covered_comments[]` with per-comment locators.

Informational items include source kind, summary, informational reason, exact
IDs/locators, and `user_decision_required`. Informational review threads set
`user_decision_required: true` with `allowed_decisions: ["act", "dismiss",
"skip"]`. Informational PR-level reviews and discussion comments are visible but
do not require the same per-item choice by default.

**Output behavior:**

- Valid packet: `exit_code: 0`, `data.valid == true`, with ordered batches and
  informational items.
- Well-formed but invalid packet: `exit_code: 1`, message
  `PR feedback classification failed validation; no plan produced.`,
  `data.valid == false`, `data.validation.errors` populated, and no batches.
- Malformed/empty input: `exit_code: 2` with an error type such as
  `invalid_json` or `invalid_request`.

**Example compact output:**

```json
{
  "operation": "plan-feedback",
  "counts": {"batches": 1, "actionable_items": 1},
  "artifacts": {
    "produced": [{"kind": "plan", "reference": {"payload_path": "...pr-address-pr-630-plan.summary.json"}}]
  },
  "details": {"valid": true, "plan_reference": {"payload_path": "...pr-address-pr-630-plan.summary.json"}}
}
```

The referenced plan artifact contains `batches` and `informational`.

### `stack-feedback-plan`

Validate stack classifications, run deterministic per-PR planning, merge batches
by `plan-feedback` order, write a stack plan summary artifact, and produce a
compact decision docket.

**Invocation:** reads payload JSON from stdin by default. `--payload-json` and
`--payload-file` are also available; pass only one explicit payload source.
`--prep-reference <path>` reads the prep input directly from a saved
`stack-feedback-prep` artifact (for example
the `kind: "stack-prep"` entry under `data.artifacts.produced[]` from a compact prep run), so the
payload only needs `classifications`:

```bash
# Set PR_ADDRESS_STACK_PLAN_COMPACT to a path outside the worktree root.
printf '%s' '{"classifications":[{"pr_number":1009,"classification":{...}}]}' \
  | pr-address exec stack-feedback-plan \
      --prep-reference /path/to/payload-sessions/.../stack-feedback-prep.summary.json \
      --format json \
  > "$PR_ADDRESS_STACK_PLAN_COMPACT"
```

The embedded form remains available:

```bash
printf '%s' '{"prep":{...},"classifications":[{"pr_number":1009,"classification":{...}}]}' \
  | pr-address exec stack-feedback-plan \
      --format json \
  > "$PR_ADDRESS_STACK_PLAN_COMPACT"
```

**Input fields:**

| Field                              | Required | Description                                                                                   |
| ---------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `prep`                             | source   | Complete `data` object from `stack-feedback-prep`; omit when using `--prep-reference`         |
| `classifications[].pr_number`      | yes      | PR number matching exactly one prep stack entry                                               |
| `classifications[].classification` | yes      | Complete LLM classification packet for that PR                                                |
| `prep_reference`                   | source   | `--prep-reference <path>`: read the prep data object from a saved prep artifact file          |
| `harness_session_id`               | payload  | Optional manual/debug override; normally supplied by the harness through `HARNESS_SESSION_ID` |
| `stdout_mode`                      | no       | `compact` by default; use `--stdout-mode full` for manual/debug full inline output            |

Exactly one prep source is required: the embedded `prep` payload key or
`--prep-reference`. Passing both fails with `exit_code: 2`, as does a missing,
unreadable, or non-JSON reference file, or a referenced file that is not a
`stack-feedback-prep` data object (the artifact may come from any payload
session; only its shape is validated, and `stack_summary_reference` is `null`
inside the saved artifact).

Every prep PR must have exactly one classification. Unknown, duplicate, or
missing PR classifications fail with `exit_code: 2`.

**Full output fields (under `data` with `--stdout-mode full`):**

| Field                           | Description                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `valid`                         | Whether all classifications validated and a merged plan was produced                                  |
| `validation.all_valid`          | Aggregate validation boolean                                                                          |
| `validation.per_pr[]`           | Per-PR validation counts and errors                                                                   |
| `batches[]`                     | Merged actionable batches in `pre_existing`, `local`, `single_file`, `cross_cutting`, `complex` order |
| `batches[].items[]`             | Action item with PR/branch provenance and source item metadata                                        |
| `informational[]`               | Informational items with PR provenance, including decision-required threads                           |
| `automation_discussion_summary` | Compact counts for automation/human/needs-review discussion triage                                    |
| `decision_docket[]`             | Approval-required work and non-automation discussion decisions to ask about                           |
| `stack_plan_reference`          | Stack plan summary artifact (`role: summary`) when `valid` is true                                    |
| `summary`                       | Actionable, approval-required, informational, and automation counts                                   |

Default compact stdout writes the full merged plan to `data.artifacts.produced[]` (`kind: "stack-plan"`) and omits verbose inline planning data from top-level stdout. Compact stdout uses the shared digest: `counts` has plan totals, `artifacts.produced[]` has the stack-plan reference, and `details` carries the validation, decision docket, compact batch display rows, and informational summary needed for routing. Use the referenced full plan artifact for `stack-feedback-diff-current` and `build-stack-resolve-thread-payloads`.

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
