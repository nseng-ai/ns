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

### `classification-template`

Build a deterministic fill-in classification scaffold from a compact
`prepare-run` or `get-feedback` payload manifest. The helper uses only manifest
IDs and body locators; it does not read raw payload bodies or decide whether
feedback is actionable.

**Invocation:** reads the bare compact manifest JSON from stdin by default.
`--manifest-json` is also available for direct/manual invocation.

```bash
jq '.data' prepare.json \
  | pr-address exec classification-template --format json
```

**Output fields (under `data`):**

| Field                     | Description                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `manifest_kind`           | `prepare_run` or `get_feedback`                                                                                   |
| `pr_number`               | PR number when present; `null` for a `prepare-run` no-PR manifest                                                 |
| `payload_path`            | Raw payload path echoed from `manifest.payload_reference.payload_path`                                            |
| `counts`                  | Counts for reviews, unresolved review threads, omitted resolved threads, covered thread comments, and discussions |
| `classification_template` | Schema-versioned fill-in scaffold with deterministic IDs and minimal locator refs prefilled                       |

`classification_template` uses the strict classification packet field names and
contains only contract fields. Body locators include only `json_pointer` and
`item_pointer`; context such as `path`, `line`, `author`, `domain`, and
`body_chars` stays in the compact manifest, not in the classification packet.

The raw template is intentionally not a valid completed classification. It uses
`"<fill: actionable|informational>"` disposition placeholders, empty summaries,
and `null` semantic fields so an agent/LLM must fill judgment fields before
calling `validate-feedback-classification`.

Deterministic coverage:

- every PR-level review is included;
- every unresolved review thread is included, with every thread comment listed
  under `covered_comments`;
- resolved review threads are omitted because current validation rejects them;
- every PR discussion comment is included with `needs_reply: false` as the
  default fill-in value.

### `validate-feedback-classification`

Validate a strict PR feedback classification packet against a compact payload
manifest before planning or execution proceeds.

**Invocation:** reads the wrapper JSON from stdin by default. `--payload-json` is
also available for direct/manual invocation.

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

### `resolve-thread-batch`

Reply to and resolve multiple PR review threads with canonical formatting. Use
this after a batch commit instead of looping over `resolve-thread-with-reply`
once per thread.

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

| Command                            | Description                                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get-feedback`                     | Detailed above. Fetch all PR feedback in payload mode by default; `--payload-mode inline` is a debugging escape hatch. Empty-body reviews are filtered out by default. |
| `read-feedback-detail`             | Detailed above. Read one allowed body/item pointer from a raw payload artifact.                                                                                        |
| `classification-template`          | Detailed above. Build a deterministic fill-in classification scaffold from a compact manifest.                                                                         |
| `validate-feedback-classification` | Detailed above. Validate a strict classification packet against a compact payload manifest.                                                                            |
| `summarize-feedback`               | Fetch compact feedback evidence for a known PR number without semantic classification.                                                                                 |
| `get-pr-for-branch`                | Look up the open PR for a branch                                                                                                                                       |
| `get-reviews`                      | Fetch PR-level review submissions (approve, request changes, comment)                                                                                                  |
| `get-review-comments`              | Fetch review threads for a PR                                                                                                                                          |
| `get-discussion-comments`          | Fetch discussion comments for a PR                                                                                                                                     |
| `add-issue-comment`                | Add a discussion comment to a PR                                                                                                                                       |
| `add-reaction`                     | Add a reaction to a comment                                                                                                                                            |
| `add-review-thread-reply`          | Post a reply comment on a PR review thread                                                                                                                             |
| `resolve-thread`                   | Resolve a PR review thread by its GraphQL node ID                                                                                                                      |
| `resolve-thread-batch`             | Reply to and resolve multiple PR review threads from one JSON payload.                                                                                                 |
| `unresolve-thread`                 | Unresolve (reopen) a PR review thread by its GraphQL node ID                                                                                                           |
