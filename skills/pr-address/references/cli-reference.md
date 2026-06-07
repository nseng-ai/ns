# pr-address CLI reference

Command reference for `pr-address exec` helpers, with invocation examples from real
sessions.

When this reference is used from the skill, replace literal `pr-address` with the
bundled wrapper at `<skill-dir>/scripts/pr-address-run`.

## Invocation convention

All `pr-address exec <command> --format json` helpers:

- Accept input as CLI options/arguments and produce the machine envelope
  `{"exit_code": 0|1|2, "data": ..., "error_type": ..., "message": ...}`
  on stdout.
- Successful runs set `exit_code: 0` and place the payload under `data`.
- Negative, non-fatal outcomes set `exit_code: 1`, include `message`, and may
  include `data` with partial evidence.
- Failures set `exit_code: 2` with `error_type` and `message` (no `data`).
- Support `--json-schema` to print JSON schemas for input/output/error shapes
  and exit without running the operation.

```bash
pr-address exec resolve-thread-with-reply \
  PRRT_kw... fixed "Updated the guard." abc1234 --format json
```

### Payload artifact commands

`prepare-run` and `get-feedback` default to `payload_mode: "payload"`. In
payload mode, the command prints a compact manifest under `data` and writes the
full feedback envelope to a store-owned `.raw.json` payload. The manifest carries
`payload_reference.payload_path` plus item-level body locators; it does not paste
full review bodies into the main transcript.

Payload mode requires one caller-supplied payload session id, passed with
`--payload-session-id <id>` or the `ASDL_PAYLOAD_SESSION_ID` environment
variable. The id must be a lowercase safe path segment matching
`^[a-z0-9][a-z0-9._-]{0,127}$`. Use the same id for every payload feedback
command in one skill invocation.

Use `--payload-mode inline` only as an explicit debugging or migration escape
hatch. Inline mode prints the full raw payload and does not require a payload
session id.

## ID scoping

- **`thread_id`** — GraphQL node IDs (e.g. `PRRT_kwDO...`). Globally unique
  across all PRs. No `pr_number` needed for thread operations.
- **`comment_id`** — REST numeric IDs. Require `pr_number` alongside them.
- **`pr_number`** — required for operations scoped to a PR (reviews,
  discussion comments, feedback fetches).

## Composite helpers

### `prepare-run`

Resolve PR context, reopen contested threads, normalize feedback, and return a
compact payload manifest by default.

**Input fields:**

| Field                   | Required | Description                                                                                         |
| ----------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `include_all_threads`   | no       | Include resolved threads for reference (default false)                                              |
| `include_empty_reviews` | no       | Include empty-body `COMMENTED` / `APPROVED` reviews (default false — filtered as noise)             |
| `payload_mode`          | no       | `payload` by default; pass `--payload-mode inline` only for debugging/migration                     |
| `payload_session_id`    | payload  | Required in payload mode unless `ASDL_PAYLOAD_SESSION_ID` is set; must match the safe-segment rules |

**Default payload output fields (under `data`):**

| Field                  | Description                                                                    |
| ---------------------- | ------------------------------------------------------------------------------ |
| `payload_mode`         | `payload` for the default workflow                                             |
| `payload_reference`    | Store-owned payload metadata, including `payload_path`, `session_id`, and size |
| `found`                | Whether a PR was found for the current branch                                  |
| `current_branch`       | Branch name                                                                    |
| `number`               | PR number                                                                      |
| `title`                | PR title                                                                       |
| `url`                  | PR URL                                                                         |
| `head_ref_name`        | PR head branch                                                                 |
| `base_ref_name`        | PR base branch (needed for restructured-file detection)                        |
| `state`                | PR state (`OPEN`, `CLOSED`, `MERGED`)                                          |
| `counts`               | Review/thread/comment counts, including resolved/unresolved thread totals      |
| `reviews`              | Compact PR-level review items with `body_locator`, not body text               |
| `review_threads`       | Compact inline-thread items with comment locators, not body text               |
| `discussion_comments`  | Compact discussion-comment items with `body_locator`, not body text            |
| `reopened_thread_ids`  | Thread IDs reopened by contested-thread detection                              |
| `restructured_files`   | Moved/copied paths from `git diff --name-status -M -C`                         |
| `warnings`             | Non-fatal issues to show the user                                              |
| `error` / `returncode` | Optional failure details when no PR is found                                   |

Manifest items carry locators rather than bodies:

- `reviews[]`: `id`, `author`, `state`, `submitted_at`, `body_locator`.
- `review_threads[]`: `thread_id`, `path`, `line`, `start_line`,
  `is_resolved`, `is_outdated`, `comment_count`, `item_pointer`, `comments[]`.
- `review_threads[].comments[]`: `id`, `author`, `path`, `line`, `start_line`,
  `created_at`, `body_locator`.
- `discussion_comments[]`: `comment_id`, `author`, `url`, `body_locator`.
- `body_locator`: `body_chars`, `json_pointer`, `item_pointer`, and domain
  metadata that identifies the review/thread/comment source.

Inline output (`--payload-mode inline`) returns the full raw normalized arrays
under `data` and should not be the default skill path.

**Example:**

```bash
pr-address exec prepare-run \
  --payload-session-id pr-address-20260604t120000z-a1 \
  --format json
```

When `data.found` is `false`, there is no PR for the current branch.

### `get-feedback`

Fetch feedback for a known PR number. Use this for final verification or
read-only triage when the PR number is already known.

**Input fields:**

| Field                   | Required | Description                                                                                         |
| ----------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `pr_number`             | yes      | PR number                                                                                           |
| `include_resolved`      | no       | Include resolved review threads in the manifest (default false)                                     |
| `include_empty_reviews` | no       | Include empty-body `COMMENTED` / `APPROVED` reviews (default false — filtered as noise)             |
| `payload_mode`          | no       | `payload` by default; pass `--payload-mode inline` only for debugging/migration                     |
| `payload_session_id`    | payload  | Required in payload mode unless `ASDL_PAYLOAD_SESSION_ID` is set; must match the safe-segment rules |

**Default payload output fields (under `data`):**

| Field                 | Description                                                               |
| --------------------- | ------------------------------------------------------------------------- |
| `payload_mode`        | `payload` for the default workflow                                        |
| `payload_reference`   | Store-owned payload metadata, including `payload_path`                    |
| `pr_number`           | PR number                                                                 |
| `counts`              | Review/thread/comment counts, including resolved/unresolved thread totals |
| `reviews`             | Compact PR-level review items with body locators                          |
| `review_threads`      | Compact inline-thread items with comment locators                         |
| `discussion_comments` | Compact discussion-comment items with body locators                       |

`include_resolved` may include resolved reference threads in the manifest.
Current classification validation requires every unresolved thread exactly once
and rejects resolved threads as actionable work.

**Example:**

```bash
pr-address exec get-feedback 630 \
  --payload-session-id pr-address-20260604t120000z-a1 \
  --format json
```

If no PR is found, the JSON envelope uses `exit_code: 1` and `data.found=false`.
Gateway/auth failures use `exit_code: 2`.

### `stack-feedback-prep`

Fetch feedback for an explicit stack PR list, write payload artifacts, build
classification templates, and summarize obvious automation discussion comments.
The command is Graphite-neutral: callers provide PR/branch metadata and the
helper does not call `gt` or `gh` for stack discovery.

**Invocation:** reads stack JSON from stdin by default. `--stack-json` is also
available.

```bash
printf '%s' '{"stack":[{"pr_number":1009,"branch":"feature"}]}' \
  | pr-address exec stack-feedback-prep \
      --payload-session-id pr-stack-address-20260604t120000z-a1 \
      --format json
```

**Input fields:**

| Field                   | Required | Description                                                                             |
| ----------------------- | -------- | --------------------------------------------------------------------------------------- |
| `stack[].pr_number`     | yes      | PR number                                                                               |
| `stack[].branch`        | yes      | Stack branch name; must be non-empty and unique                                         |
| `stack[].title`         | no       | PR title for provenance                                                                 |
| `stack[].url`           | no       | PR URL for provenance                                                                   |
| `stack[].head_ref_name` | no       | PR head ref for provenance                                                              |
| `stack[].base_ref_name` | no       | PR base ref for provenance                                                              |
| `include_resolved`      | no       | Include resolved review threads in manifests (default false)                            |
| `include_empty_reviews` | no       | Include empty-body `COMMENTED` / `APPROVED` reviews (default false — filtered as noise) |
| `payload_session_id`    | payload  | Required unless `ASDL_PAYLOAD_SESSION_ID` is set; must match the safe-segment rules     |

The stack must be non-empty and have unique PR numbers and branch names.

**Output fields (under `data`):**

| Field                                       | Description                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `payload_session_id`                        | Payload session used for the stack run                                  |
| `stack[]`                                   | One compact prep result per PR                                          |
| `stack[].manifest`                          | Compact get-feedback manifest with locators, not body text              |
| `stack[].raw_feedback_reference`            | Raw full feedback envelope reference (`role: raw`)                      |
| `stack[].manifest_summary_reference`        | Per-PR compact manifest summary artifact (`role: summary`)              |
| `stack[].classification_template`           | Deterministic scaffold for LLM classification                           |
| `stack[].classification_template_reference` | Per-PR classification template summary artifact (`role: summary`)       |
| `stack[].discussion_triage`                 | Advisory automation/human/direct-request summary for top-level comments |
| `stack_summary_reference`                   | Whole-stack prep summary artifact (`role: summary`)                     |
| `summary`                                   | Stack-level PR, feedback, automation, and needs-agent-review counts     |

`discussion_triage` is conservative and advisory. Obvious Vercel, Graphite,
roaster summary, GitHub Actions, and bot status comments are summarized as
`classification_hint: "automation"`; direct-request-like comments become
`needs_agent_review`; non-bot FYI comments become `human_like`. The LLM
classification packet must still classify every discussion comment exactly once.

### `stack-feedback-plan`

Validate stack classifications, run deterministic per-PR planning, merge batches
by `plan-feedback` order, write a stack plan summary artifact, and produce a
compact decision docket.

**Invocation:** reads payload JSON from stdin by default. `--payload-json` is
also available.

```bash
printf '%s' '{"prep":{...},"classifications":[{"pr_number":1009,"classification":{...}}]}' \
  | pr-address exec stack-feedback-plan \
      --payload-session-id pr-stack-address-20260604t120000z-a1 \
      --format json
```

**Input fields:**

| Field                              | Required | Description                                                                         |
| ---------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `prep`                             | yes      | Complete `data` object from `stack-feedback-prep`                                   |
| `classifications[].pr_number`      | yes      | PR number matching exactly one prep stack entry                                     |
| `classifications[].classification` | yes      | Complete LLM classification packet for that PR                                      |
| `payload_session_id`               | payload  | Required unless `ASDL_PAYLOAD_SESSION_ID` is set; must match the safe-segment rules |

Every prep PR must have exactly one classification. Unknown, duplicate, or
missing PR classifications fail with `exit_code: 2`.

**Output fields (under `data`):**

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

If validation fails, the command returns `exit_code: 1`, includes structured
`data.validation.per_pr[]` diagnostics, does not write a merged stack plan, and
sets `data.stack_plan_reference` to `null`. If validation succeeds, it returns
`exit_code: 0`.

Semantic classification remains LLM-owned. This helper validates and merges
classification packets; it does not infer arbitrary review meaning from prose.

### `read-feedback-detail`

Read one allowed detail from a payload `.raw.json` feedback envelope. Use this
for targeted full-body inspection instead of pasting the full raw payload.

**Input fields:**

| Field          | Required | Description                                                     |
| -------------- | -------- | --------------------------------------------------------------- |
| `payload_path` | yes      | Raw payload path from `manifest.payload_reference.payload_path` |
| `json_pointer` | yes      | JSON Pointer copied from a manifest item or body locator        |

Allowed pointer families:

- `/data/reviews/<n>`
- `/data/reviews/<n>/body`
- `/data/review_threads/<n>`
- `/data/review_threads/<n>/comments/<m>`
- `/data/review_threads/<n>/comments/<m>/body`
- `/data/discussion_comments/<n>`
- `/data/discussion_comments/<n>/body`

**Output fields (under `data`):**

| Field          | Description                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `payload_path` | Echo of the raw payload path                                                                                                          |
| `json_pointer` | Echo of the selected pointer                                                                                                          |
| `detail_kind`  | `review`, `review_body`, `review_thread`, `thread_comment`, `thread_comment_body`, `discussion_comment`, or `discussion_comment_body` |
| `value`        | Selected JSON value or body text                                                                                                      |

Invalid broad pointers, unrelated pointers, missing files, and malformed
payloads return `exit_code: 2` with an error type/message.

**Example:**

```bash
pr-address exec read-feedback-detail \
  --payload-path /tmp/asdl/sessions/.../payloads/...raw.json \
  --json-pointer /data/review_threads/0/comments/0/body \
  --format json
```

### `read-feedback-details`

Read multiple allowed details from one payload `.raw.json` feedback envelope,
write the selected values to a managed `.summary.json` artifact in the same
payload session, and return only compact metadata on stdout. Prefer this helper
when classification or execution needs several original bodies/items.

**Invocation:** reads the selection JSON from stdin by default.
`--selection-json` is also available for direct/manual invocation.

```bash
printf '%s' '{"payload_path":"/tmp/asdl/sessions/.../payloads/...raw.json","json_pointers":["/data/reviews/0/body"]}' \
  | pr-address exec read-feedback-details --format json
```

**Input fields:**

| Field           | Required | Description                                                                      |
| --------------- | -------- | -------------------------------------------------------------------------------- |
| `payload_path`  | yes      | Raw payload path from `manifest.payload_reference.payload_path`                  |
| `json_pointers` | yes      | Non-empty array of allowed JSON Pointers copied from manifest body/item locators |

Allowed pointer families are the same as `read-feedback-detail`:

- `/data/reviews/<n>`
- `/data/reviews/<n>/body`
- `/data/review_threads/<n>`
- `/data/review_threads/<n>/comments/<m>`
- `/data/review_threads/<n>/comments/<m>/body`
- `/data/discussion_comments/<n>`
- `/data/discussion_comments/<n>/body`

**Output fields (under `data`):**

| Field                        | Description                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `payload_path`               | Echo of the raw payload path                                                                                        |
| `selected_payload_reference` | Store-owned reference for the `.summary.json` artifact containing selected values                                   |
| `details`                    | One compact entry per requested pointer: source pointer, detail kind, artifact pointer, value kind, and char counts |
| `counts`                     | Requested/selected counts split into body-value and item-value totals                                               |

The stdout JSON intentionally omits selected body text and full selected item
objects. To inspect a selected value, read
`data.selected_payload_reference.payload_path` and resolve that detail's
`artifact_json_pointer` (for example `/details/0/value`) inside the artifact.

**Artifact shape:**

```json
{
  "source_payload_path": "/tmp/asdl/sessions/.../payloads/...raw.json",
  "details": [
    {
      "json_pointer": "/data/reviews/0/body",
      "detail_kind": "review_body",
      "value": "full selected body text stored in the summary artifact"
    }
  ]
}
```

Malformed JSON, empty selections, duplicate pointers, invalid broad pointers,
missing/non-raw payloads, failed raw envelopes, and value type mismatches return
`exit_code: 2` with an error type/message. The command validates the whole
selection before writing any summary artifact.

### `classification-template`

Build a deterministic classification scaffold from a compact payload manifest.
Use this after `prepare-run` or `get-feedback` in default payload mode and
before asking the LLM to fill semantic judgments.

**Invocation:** reads a bare compact manifest object from stdin by default.
`--manifest-json` and `--manifest-file` are also available.

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

**Preferred split invocation:** pass the compact manifest and classification
packet separately, avoiding wrapper JSON assembly.

```bash
pr-address exec validate-feedback-classification \
  --manifest-file manifest.json \
  --classification-file classification.json \
  --format json

pr-address exec validate-feedback-classification \
  --manifest-json '<manifest-json>' \
  --classification-json '<classification-json>' \
  --format json
```

Split mode requires exactly one manifest source (`--manifest-json` or
`--manifest-file`) and exactly one classification source
(`--classification-json` or `--classification-file`). It rejects explicit wrapper
sources (`--payload-json` or `--payload-file`) mixed with split inputs. Stdin is
only consumed in legacy wrapper mode when no split source is provided.

**Legacy wrapper invocation:** reads wrapper JSON from stdin by default.
`--payload-json` and `--payload-file` are also available for compatibility.

```bash
printf '%s' '{"manifest":{...},"classification":{...}}' \
  | pr-address exec validate-feedback-classification --format json
```

**Wrapper shape:**

```json
{
  "manifest": "<prepare-run or get-feedback data object>",
  "classification": "<schema_version: 1 classification packet>"
}
```

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

- Valid packet: `exit_code: 0`, `data.valid == true`.
- Well-formed but invalid packet: `exit_code: 1`, message
  `PR feedback classification failed validation.`, `data.valid == false`, plus
  structured `data.counts` and `data.errors` diagnostics.
- Malformed/empty input: `exit_code: 2` with an error type such as
  `invalid_json` or `invalid_request`.

### `plan-feedback`

Build a deterministic execution plan from a compact manifest and strict
classification packet. The helper validates internally before planning, uses
only compact manifest locators and classification summaries, and does not read
or print raw feedback body text.

**Invocation:** reads the wrapper JSON from stdin by default. `--payload-json` is
also available for direct/manual invocation.

```bash
printf '%s' '{"manifest":{...},"classification":{...}}' \
  | pr-address exec plan-feedback --format json
```

**Wrapper shape:** same as `validate-feedback-classification`:

```json
{
  "manifest": "<prepare-run or get-feedback data object>",
  "classification": "<schema_version: 1 classification packet>"
}
```

**Output fields (under `data`):**

| Field           | Description                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------- |
| `valid`         | Whether validation passed and a plan was produced                                             |
| `manifest_kind` | `prepare_run` or `get_feedback`                                                               |
| `pr_number`     | PR number when present                                                                        |
| `payload_path`  | Raw payload path echoed from `manifest.payload_reference.payload_path`                        |
| `validation`    | Full validation result used by the planner                                                    |
| `counts`        | Plan counts when valid: actionable/informational totals, batch totals, and source-kind splits |
| `batches`       | Ordered actionable batches                                                                    |
| `informational` | Explicit informational review, review-thread, and discussion-comment items                    |
| `warnings`      | Sparse non-fatal planning notes                                                               |

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
  "valid": true,
  "batches": [
    {
      "batch_id": "single_file",
      "complexity": "single_file",
      "approval_required": false,
      "items": [
        {
          "source_kind": "review_thread",
          "thread_id": "PRRT_...",
          "covered_comment_ids": [123456],
          "path": "src/app.py",
          "line": 42,
          "summary": "Guard rejects empty payloads.",
          "action_summary": "Add a failing test and fix the guard."
        }
      ]
    }
  ],
  "informational": []
}
```

### `resolve-thread-with-reply`

Reply to and resolve a PR review thread with canonical pr-address formatting.

**Positional input fields (all required):**

| Position | Field        | Description                                            |
| -------- | ------------ | ------------------------------------------------------ |
| 1        | `thread_id`  | GraphQL node ID (`PRRT_kw...`). No `pr_number` needed. |
| 2        | `mode`       | `pre_existing`, `fixed`, or `explained` (see below)    |
| 3        | `message`    | One-line description of what was done                  |
| 4        | `commit_sha` | The commit SHA that addressed the feedback             |

`mode` values:

- `pre_existing` — moved/restructured bot comment, no code change. `message`
  and `commit_sha` may be empty strings.
- `fixed` — code change resolved by the current batch commit. Requires a
  non-empty `message` and `commit_sha`.
- `explained` — already-fixed case or false positive. Requires a non-empty
  `message`; `commit_sha` may be an empty string.

**Output fields (under `data`):**

| Field         | Description                               |
| ------------- | ----------------------------------------- |
| `thread_id`   | Echo of the input thread ID               |
| `body`        | The formatted reply body posted to GitHub |
| `comment`     | The created comment object                |
| `is_resolved` | Post-mutation resolved state              |

**Example:**

```bash
pr-address exec resolve-thread-with-reply \
  PRRT_kwDOR4YhMs57SeUg \
  fixed \
  "Introduced DetachedHead frozen dataclass as a named sentinel." \
  ac18f2b \
  --format json
```

On invalid input: `{"exit_code": 2, "error_type": "...", "message": "..."}`.

### `build-resolve-thread-batch-payload`

Build and validate the JSON payload for `resolve-thread-batch` from a
`plan-feedback` result, one selected batch, the batch commit SHA, and explicit
post-edit decisions. This helper does not mutate GitHub.

Use this after making and committing an approved batch, before calling the
mutating `resolve-thread-batch` helper.

**Invocation:** reads JSON from stdin by default. `--payload-json` is also
available for direct/manual invocation.

```bash
printf '%s' '{"plan":{...},"batch_id":"single_file","commit_sha":"abc1234","decisions":[{"thread_id":"PRRT_kw...","action":"resolve","mode":"fixed","message":"Updated the guard."}]}' \
  | pr-address exec build-resolve-thread-batch-payload --format json
```

**Input fields:**

| Field               | Required | Description                                                                                  |
| ------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `plan`              | yes      | `data` object returned by `plan-feedback`                                                    |
| `batch_id`          | yes      | Exact `data.batches[].batch_id` to build from                                                |
| `commit_sha`        | mode     | Batch commit SHA; required when any `fixed` decision lacks an item-level SHA                 |
| `continue_on_error` | no       | Copied into the generated `resolve-thread-batch` payload                                     |
| `decisions`         | yes      | One explicit `resolve` or `skip` decision for every review-thread item in the selected batch |

Resolve decision:

```json
{
  "thread_id": "PRRT_kw...",
  "action": "resolve",
  "mode": "fixed",
  "message": "Updated the guard.",
  "commit_sha": "optional item-level override"
}
```

Skip decision:

```json
{
  "thread_id": "PRRT_kw...",
  "action": "skip",
  "skip_reason": "User deferred this thread to a follow-up."
}
```

`mode` is `fixed`, `pre_existing`, or `explained`. `fixed` requires a non-empty
`message` and a batch or item-level `commit_sha`; `explained` requires a
non-empty `message`; `pre_existing` ignores `message` and `commit_sha` and they
should be omitted.

**Output fields (under `data`):**

| Field                      | Description                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `valid`                    | Whether the selected batch and decisions are semantically valid                             |
| `payload_ready`            | Whether `data.payload` should be piped to `resolve-thread-batch`                            |
| `batch_id`                 | Selected batch ID                                                                           |
| `review_thread_count`      | Review-thread items in the selected batch                                                   |
| `resolved_thread_count`    | Items included in the generated payload                                                     |
| `skipped_thread_count`     | Explicitly skipped review-thread items                                                      |
| `ignored_non_thread_items` | Selected-batch PR-level reviews or discussion comments that require other helpers           |
| `skipped_items`            | Explicit skip reasons with thread summaries                                                 |
| `payload`                  | Ready `resolve-thread-batch` payload, or `null` when no inline-thread payload should be run |
| `errors`                   | Structured semantic decision errors                                                         |
| `warnings`                 | No-payload explanations, such as no review-thread items or all threads skipped              |

Validation rejects missing decisions, duplicate thread IDs, decisions for other
batches, informational thread decisions, unknown threads, invalid modes, missing
messages/commit SHAs, and non-empty resolution fields on skip/pre-existing
items. It validates any generated payload through the same pre-mutation rules as
`resolve-thread-batch`.

**Output behavior:**

- Valid decisions with at least one resolved thread: `exit_code: 0`,
  `data.payload_ready == true`, and `data.payload` can be piped to
  `resolve-thread-batch`.
- Valid decisions with no payload needed: `exit_code: 0`,
  `data.payload_ready == false`, `data.payload == null`, and `data.warnings`
  explains why.
- Well-formed but invalid decisions: `exit_code: 1`, `data.valid == false`,
  `data.payload == null`, and `data.errors` describes all known issues.
- Malformed/empty input: `exit_code: 2` with an error type such as
  `invalid_json` or `invalid_request`.

### `resolve-thread-batch`

Reply to and resolve multiple PR review threads with canonical formatting. After
a batch commit, prefer `build-resolve-thread-batch-payload` to build and validate
this payload, then call this mutating helper only when `data.payload_ready` is
true.

**Invocation:** reads JSON from stdin by default. `--payload-json` is also
available for direct/manual invocation.

```bash
printf '%s' '{"commit_sha":"abc1234","items":[{"thread_id":"PRRT_kw...","mode":"fixed","message":"Updated the guard."}]}' \
  | pr-address exec resolve-thread-batch --format json
```

**Payload fields:**

| Field               | Required | Description                                  |
| ------------------- | -------- | -------------------------------------------- |
| `commit_sha`        | no       | Batch commit SHA used by `fixed` items       |
| `continue_on_error` | no       | Attempt later items after a mutation failure |
| `items`             | yes      | Non-empty ordered array of thread jobs       |

Each `items[]` entry:

| Field        | Required | Description                                                     |
| ------------ | -------- | --------------------------------------------------------------- |
| `thread_id`  | yes      | GraphQL review-thread node ID                                   |
| `mode`       | yes      | `fixed`, `pre_existing`, or `explained`                         |
| `message`    | mode     | Required for `fixed` and `explained`; ignored by `pre_existing` |
| `commit_sha` | no       | Item-level override for the top-level commit SHA                |

Validation happens for the whole payload before any GitHub mutation. Duplicate
`thread_id` values, empty `items`, malformed JSON, or missing required
`message` / `commit_sha` produce `exit_code: 2` with no mutation.

**Output fields (under `data`):**

| Field           | Description                                    |
| --------------- | ---------------------------------------------- |
| `total`         | Number of input items                          |
| `resolved`      | Number successfully replied-to and resolved    |
| `failed`        | Number that hit a gateway/API mutation failure |
| `skipped`       | Number skipped after a failure                 |
| `all_succeeded` | Whether every item succeeded                   |
| `results`       | Ordered per-item results                       |

Per-item `status` is `resolved`, `failed`, or `skipped`. Successful items carry
`body`, `comment`, and `is_resolved`. Failed/skipped items carry
`error_type`/`error_message`.

Gateway/API mutation failures after validation return `exit_code: 1` with the
partial result data. By default the command stops at the first failed item and
marks later items skipped; with `continue_on_error: true`, it attempts later
items and still returns `exit_code: 1` if any item failed.

### `record-batch-checkpoint`

Validate and record compact evidence for one selected `plan-feedback` batch.
Run this after the batch commit and after relevant GitHub mutation helpers have
returned. The helper does not mutate GitHub, commit, push, create branches, or
print raw feedback bodies. Its only write is an optional managed `.summary.json`
checkpoint artifact when `plan.payload_path` points at a payload-backed run.

**Invocation:** reads checkpoint JSON from stdin by default. `--payload-json` and
`--payload-file` are also available; pass only one explicit source.

```bash
printf '%s' '{"plan":{...},"batch_id":"single_file","commit_sha":"abc1234","changed_files":["src/example.py"],"validation_commands":[{"command":"uv run pytest ...","status":"passed","exit_code":0}],"thread_payload_build":{...},"thread_resolution_result":{...},"non_thread_outcomes":[{"source_kind":"review","review_id":"PRR_...","action":"replied","result_comment_id":12345}]}' \
  | pr-address exec record-batch-checkpoint --format json

pr-address exec record-batch-checkpoint \
  --payload-file batch-checkpoint.json \
  --format json
```

**Input fields:**

| Field                      | Required | Description                                                                                      |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `plan`                     | yes      | `data` object returned by `plan-feedback`                                                        |
| `batch_id`                 | yes      | Exact `data.batches[].batch_id` to checkpoint                                                    |
| `commit_sha`               | changes  | Batch commit SHA; required when `changed_files` is non-empty                                     |
| `changed_files`            | no       | Relative changed paths; absolute paths, traversal, empty entries, and duplicates are rejected    |
| `validation_commands`      | no       | Commands run for the batch with `status` `passed`, `failed`, or `skipped`, optional exit/summary |
| `thread_payload_build`     | threads  | Result from `build-resolve-thread-batch-payload` when the batch has review-thread items          |
| `thread_resolution_result` | payload  | Result from `resolve-thread-batch` when `thread_payload_build.payload_ready` is true             |
| `non_thread_outcomes`      | items    | One explicit outcome for every selected PR-level review or discussion-comment item               |

Each `non_thread_outcomes[]` entry uses `source_kind: "review"` with
`review_id`, or `source_kind: "discussion_comment"` with
`discussion_comment_id`. `action` is one of:

- `replied` — requires `result_comment_id`
- `skipped` — requires `skip_reason`
- `no_reply_needed` — requires a summary explaining why no reply was needed

**Output fields (under `data`):**

| Field                  | Description                                                                     |
| ---------------------- | ------------------------------------------------------------------------------- |
| `valid`                | Whether supplied checkpoint evidence is semantically valid                      |
| `batch_complete`       | Whether evidence indicates the batch is complete and successful                 |
| `batch_id`             | Selected batch ID                                                               |
| `complexity`           | Selected batch complexity                                                       |
| `approval_required`    | Whether the selected batch required approval                                    |
| `pr_number`            | PR number from the plan                                                         |
| `payload_path`         | Source payload path from the plan, if any                                       |
| `checkpoint_reference` | Managed summary artifact reference, or `null` for non-payload plans             |
| `commit_sha`           | Trimmed batch commit SHA                                                        |
| `changed_files`        | Validated changed-file evidence                                                 |
| `validation_commands`  | Validated command evidence                                                      |
| `selected_items`       | Compact selected plan item identities and summaries                             |
| `thread_summary`       | Thread counts plus resolved, failed, skipped, and explicitly skipped thread IDs |
| `non_thread_outcomes`  | Validated PR-level review/discussion outcome evidence                           |
| `errors`               | Structured evidence errors                                                      |
| `warnings`             | Non-fatal caveats, such as no payload path and therefore no artifact            |

**Output behavior:**

- Complete successful evidence returns `exit_code: 0` with
  `data.batch_complete == true`.
- Well-formed but incomplete or failed evidence returns `exit_code: 1` with
  structured data; do not treat the batch as done while
  `data.batch_complete == false`.
- Malformed JSON or conflicting input sources return `exit_code: 2` with an
  error type such as `invalid_json` or `invalid_request`.

### `summarize-feedback`

Fetch compact feedback evidence for a known PR number without dumping full raw
review/discussion/comment JSON. This helper compresses source evidence only; it
does not decide actionability, complexity, or batch membership.

**Input fields:**

| Field                   | Required | Description                                                                             |
| ----------------------- | -------- | --------------------------------------------------------------------------------------- |
| `pr_number`             | yes      | PR number                                                                               |
| `include_resolved`      | no       | Include resolved review threads in the returned `review_threads` array (default false)  |
| `include_empty_reviews` | no       | Include empty-body `COMMENTED` / `APPROVED` reviews (default false — filtered as noise) |
| `body_chars`            | no       | Max characters per body excerpt, 1 through 4000 (default 320)                           |

**Example:**

```bash
pr-address exec summarize-feedback 630 --format json
```

**Output fields (under `data`):**

| Field                 | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `found`               | Whether the PR was found                                           |
| `pr`                  | PR number/title/url/head/base/state metadata                       |
| `counts`              | Review/thread/comment counts, including resolved/unresolved totals |
| `reviews`             | Review ID, author, state, submitted time, compact body excerpts    |
| `review_threads`      | Thread location/resolution state and first-comment excerpts        |
| `discussion_comments` | Discussion comment excerpts plus mechanical source evidence        |

Discussion comments include `source_kind` (`automation_like` or `human_like`)
and `source_evidence` such as `bot_author`, `graphite_link`, `vercel_marker`,
`roaster_marker`, or `asdl_reviewer_marker`. These are conservative mechanical
signals only; when uncertain the helper reports `human_like`.

Gateway/auth failures use `exit_code: 2`.

### `reply-to-review`

Post a formatted reply to a PR-level review submission.

**Input fields (all required):**

| Field              | Description                                            |
| ------------------ | ------------------------------------------------------ |
| `pr_number`        | PR number (reviews are PR-scoped, not globally unique) |
| `review_author`    | GitHub login of the reviewer                           |
| `summary_markdown` | Markdown summary of changes made to address the review |

**Output fields (under `data`):**

| Field     | Description                               |
| --------- | ----------------------------------------- |
| `body`    | The formatted reply body posted to GitHub |
| `comment` | The created comment object                |

**Example:**

```bash
pr-address exec reply-to-review \
  104 \
  reviewer-login \
  "- Used LBYL pattern in local_git.py\n- Added type alias for RestructuredFiles" \
  --format json
```

### `reply-to-discussion`

Reply to a PR discussion comment and add a +1 reaction.

**Input fields (all required):**

| Field            | Description                                                |
| ---------------- | ---------------------------------------------------------- |
| `pr_number`      | PR number                                                  |
| `comment_id`     | REST numeric comment ID (requires `pr_number` for scoping) |
| `comment_author` | GitHub login of the original commenter                     |
| `original_body`  | Body of the comment being replied to (used for quoting)    |
| `response`       | Your reply text                                            |

**Output fields (under `data`):**

| Field            | Description                                    |
| ---------------- | ---------------------------------------------- |
| `body`           | The formatted reply body posted to GitHub      |
| `comment`        | The created comment object                     |
| `reaction_added` | Whether the +1 reaction was added successfully |
| `reaction`       | The reaction type (`+1`)                       |
| `warning`        | Non-null if the reaction failed                |

Reaction failure produces a warning, not a batch failure.

## Other commands

Lower-level helpers available via `pr-address exec <command> --format json`.
The composite helpers above call these internally — use them directly only when
the workflow requires it. Run `<command> --json-schema` for full schemas.

| Command                              | Description                                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get-feedback`                       | Detailed above. Fetch all PR feedback in payload mode by default; `--payload-mode inline` is a debugging escape hatch. Empty-body reviews are filtered out by default. |
| `read-feedback-detail`               | Detailed above. Read one allowed body/item pointer from a raw payload artifact and return the selected value inline.                                                   |
| `read-feedback-details`              | Detailed above. Read multiple allowed body/item pointers into a managed summary artifact with compact stdout metadata.                                                 |
| `classification-template`            | Detailed above. Build a deterministic fill-in classification scaffold from a compact manifest.                                                                         |
| `validate-feedback-classification`   | Detailed above. Validate a strict classification packet against a compact payload manifest.                                                                            |
| `plan-feedback`                      | Detailed above. Build deterministic execution batches and informational decisions from a validated classification packet.                                              |
| `build-resolve-thread-batch-payload` | Detailed above. Build and validate the non-mutating payload for `resolve-thread-batch` from a selected plan batch and explicit decisions.                              |
| `summarize-feedback`                 | Fetch compact feedback evidence for a known PR number without semantic classification.                                                                                 |
| `get-pr-for-branch`                  | Look up the open PR for a branch                                                                                                                                       |
| `get-reviews`                        | Fetch PR-level review submissions (approve, request changes, comment)                                                                                                  |
| `get-review-comments`                | Fetch review threads for a PR                                                                                                                                          |
| `get-discussion-comments`            | Fetch discussion comments for a PR                                                                                                                                     |
| `add-issue-comment`                  | Add a discussion comment to a PR                                                                                                                                       |
| `add-reaction`                       | Add a reaction to a comment                                                                                                                                            |
| `add-review-thread-reply`            | Post a reply comment on a PR review thread                                                                                                                             |
| `resolve-thread`                     | Resolve a PR review thread by its GraphQL node ID                                                                                                                      |
| `resolve-thread-batch`               | Mutating helper: reply to and resolve multiple PR review threads from one JSON payload.                                                                                |
| `unresolve-thread`                   | Unresolve (reopen) a PR review thread by its GraphQL node ID                                                                                                           |
