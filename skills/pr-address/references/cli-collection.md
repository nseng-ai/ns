# pr-address CLI reference — feedback collection

Collection and inspection helpers: fetch PR feedback, map stack branches to
PRs, and read payload details. Shared invocation conventions, the machine
envelope, harness-session rules, and ID scoping live in [cli-reference.md](cli-reference.md).

Helpers in this file:

- [`prepare-run`](#prepare-run)
- [`get-feedback`](#get-feedback)
- [`stack-feedback-preflight`](#stack-feedback-preflight)
- [`stack-feedback-prep`](#stack-feedback-prep)
- [`map-branch-prs`](#map-branch-prs)
- [`read-feedback-detail`](#read-feedback-detail)
- [`read-feedback-details`](#read-feedback-details)
- [`summarize-feedback`](#summarize-feedback)

### `prepare-run`

Resolve PR context, reopen contested threads, normalize feedback, and return a
compact payload manifest by default.

**Input fields:**

| Field                   | Required | Description                                                                                   |
| ----------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `include_all_threads`   | no       | Include resolved threads for reference (default false)                                        |
| `include_empty_reviews` | no       | Include empty-body `COMMENTED` / `APPROVED` reviews (default false — filtered as noise)       |
| `payload_mode`          | no       | `payload` by default; pass `--payload-mode inline` only for debugging/migration               |
| `harness_session_id`    | payload  | Optional manual/debug override; normally supplied by the harness through `HARNESS_SESSION_ID` |

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
  --format json
```

When `data.found` is `false`, there is no PR for the current branch.

### `get-feedback`

Fetch feedback for a known PR number. Use this for final verification or
read-only triage when the PR number is already known.

**Input fields:**

| Field                   | Required | Description                                                                                   |
| ----------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `pr_number`             | yes      | PR number                                                                                     |
| `include_resolved`      | no       | Include resolved review threads in the manifest (default false)                               |
| `include_empty_reviews` | no       | Include empty-body `COMMENTED` / `APPROVED` reviews (default false — filtered as noise)       |
| `payload_mode`          | no       | `payload` by default; pass `--payload-mode inline` only for debugging/migration               |
| `harness_session_id`    | payload  | Optional manual/debug override; normally supplied by the harness through `HARNESS_SESSION_ID` |

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
  --format json
```

If no PR is found, the JSON envelope uses `exit_code: 1` and `data.found=false`.
Gateway/auth failures use `exit_code: 2`.

### `stack-feedback-preflight`

Initial Graphite-neutral stack feedback preflight. The caller supplies branch
names (usually from `slot gt exec stack-branches`); the helper maps them to open
PRs, freezes the exact stack JSON as a payload artifact, runs unresolved-only
`stack-feedback-prep`, and returns a compact envelope for transcript use. It
does **not** check `gh auth status`, Graphite topology, or worktree cleanliness;
those remain agent-side preconditions.

**Invocation:** reads branches JSON from stdin by default. `--branches-json` is
also available.

```bash
slot gt exec stack-branches \
  | pr-address exec stack-feedback-preflight \
      --stdout-mode compact \
      --format json
```

**Input fields:**

| Field                | Required | Description                                                                                   |
| -------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `branches`           | yes      | Non-empty array of branch names; no blanks and no duplicates                                  |
| `stdout_mode`        | no       | `full` by default for compatibility; use `--stdout-mode compact` for stack-address workflows  |
| `harness_session_id` | payload  | Optional manual/debug override; normally supplied by the harness through `HARNESS_SESSION_ID` |

**Compact output fields (under `data`):**

| Field                     | Description                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `harness_session_id`      | Harness session id used as the payload-store session for the stack run                               |
| `mapping_summary`         | Branch coverage counts: `requested`, `matched`, `missing`                                            |
| `stack_reference`         | Payload artifact containing the frozen `{"stack":[...]}` JSON for later exact refetches              |
| `stack_summary_reference` | Whole-stack full prep artifact from `stack-feedback-prep`                                            |
| `summary`                 | Whole-stack PR, feedback, automation, and needs-agent-review counts                                  |
| `stack[]`                 | Feedback-bearing compact prep rows only                                                              |
| `zero_feedback_prs[]`     | Identity-only `{pr_number, branch}` rows for PRs with no reviews, unresolved threads, or discussions |

Full mode returns the unfiltered full prep result plus `mapping_summary` and
`stack_reference`.

**Exit codes:** `0` — every branch matched and prep ran, including a
zero-feedback stack; `1` — one or more branches lack open PRs (`data` has the
same shape as `map-branch-prs`, prep does not run, and no artifacts are
written); `2` — invalid input, missing repo context, payload-store failure, or
GitHub gateway failure.

For explicit user-approved partial coverage, compose the lower-level helpers:
run `map-branch-prs`, remove the missing branches by hand, then run
`stack-feedback-prep` on the approved subset.

### `stack-feedback-prep`

Fetch feedback for an explicit stack PR list, write payload artifacts, build
classification templates, and summarize obvious automation discussion comments.
The command is Graphite-neutral: callers provide PR/branch metadata and the
helper does not call `gt` or `gh` for stack discovery.

**Invocation:** reads stack JSON from stdin by default. `--stack-json` is also
available. `--stack-reference <payload_path>` reads a previously frozen stack
artifact, is mutually exclusive with `--stack-json`, and does not read stdin.
For agent workflows, set `PR_ADDRESS_STACK_PREP_COMPACT` to a path outside the
worktree root (for example a git-adjacent scratch path) so compact stdout does
not create untracked repository files.

```bash
printf '%s' '{"stack":[{"pr_number":1009,"branch":"feature"}]}' \
  | pr-address exec stack-feedback-prep \
      --stdout-mode compact \
      --format json \
  > "$PR_ADDRESS_STACK_PREP_COMPACT"
```

**Input fields:**

| Field                   | Required | Description                                                                                   |
| ----------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `stack[].pr_number`     | yes      | PR number                                                                                     |
| `stack[].branch`        | yes      | Stack branch name; must be non-empty and unique                                               |
| `stack[].title`         | no       | PR title for provenance                                                                       |
| `stack[].url`           | no       | PR URL for provenance                                                                         |
| `stack[].head_ref_name` | no       | PR head ref for provenance                                                                    |
| `stack[].base_ref_name` | no       | PR base ref for provenance                                                                    |
| `stack_reference`       | no       | Payload artifact path containing `{"stack":[...]}`; mutually exclusive with `stack_json`      |
| `include_resolved`      | no       | Include resolved review threads in manifests (default false)                                  |
| `include_empty_reviews` | no       | Include empty-body `COMMENTED` / `APPROVED` reviews (default false — filtered as noise)       |
| `stdout_mode`           | no       | `full` by default for compatibility; use `--stdout-mode compact` for agent workflows          |
| `harness_session_id`    | payload  | Optional manual/debug override; normally supplied by the harness through `HARNESS_SESSION_ID` |

The stack must be non-empty and have unique PR numbers and branch names. Use
`--stack-reference` for drift/final refetches that must reuse the exact frozen
stack from `stack-feedback-preflight`.

**Full output fields (under `data`, default `--stdout-mode full`):**

| Field                                       | Description                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `harness_session_id`                        | Harness session id used as the payload-store session for the stack run  |
| `include_resolved`                          | Whether resolved review threads were included in the stack manifests    |
| `stack[]`                                   | One compact prep result per PR                                          |
| `stack[].manifest`                          | Compact get-feedback manifest with locators, not body text              |
| `stack[].raw_feedback_reference`            | Raw full feedback envelope reference (`role: raw`)                      |
| `stack[].manifest_summary_reference`        | Per-PR compact manifest summary artifact (`role: summary`)              |
| `stack[].classification_template`           | Deterministic scaffold for LLM classification                           |
| `stack[].classification_template_reference` | Per-PR classification template summary artifact (`role: summary`)       |
| `stack[].discussion_triage`                 | Advisory automation/human/direct-request summary for top-level comments |
| `stack_summary_reference`                   | Whole-stack prep summary artifact (`role: summary`)                     |
| `summary`                                   | Stack-level PR, feedback, automation, and needs-agent-review counts     |

`--stdout-mode compact` keeps the machine-readable full prep in
`data.stack_summary_reference.payload_path` and omits inline `manifest`,
`classification_template`, and `discussion_triage.items` from stdout. Compact
`data.stack[]` entries include PR metadata, `counts`, `raw_feedback_reference`,
`manifest_summary_reference`, `classification_template_reference`, and
`discussion_triage_summary` counts/by-reason. Use the referenced full prep
artifact as the `prep` input to `stack-feedback-plan`.

`discussion_triage` is conservative and advisory. Obvious Vercel, Graphite,
roaster summary, GitHub Actions, and bot status comments are summarized as
`classification_hint: "automation"`; direct-request-like comments become
`needs_agent_review`; non-bot FYI comments become `human_like`. The LLM
classification packet must still classify every discussion comment exactly once.

### `map-branch-prs`

Map a list of branch names to their open PRs with a single `gh pr list` call.
Use this directly only for lower-level mapping or explicit partial-coverage
overrides. For normal stack-wide feedback workflows, use
`stack-feedback-preflight`, which maps branches, freezes stack JSON, and runs the
initial compact prep in one helper. The caller supplies the branch names; the
helper has no Graphite dependency.

**Recommended Graphite-stack invocation:** pipe the structured stack branch list
into the Graphite-neutral mapper:

```bash
slot gt exec stack-branches \
  | pr-address exec map-branch-prs --format json
```

**Direct/manual invocation:** reads the branches JSON from stdin by default.
`--branches-json` is also available for direct/manual invocation.

```bash
printf '%s' '{"branches":["feature-b","feature-a"]}' \
  | pr-address exec map-branch-prs --format json
```

**Input fields:**

| Field      | Required | Description                                                  |
| ---------- | -------- | ------------------------------------------------------------ |
| `branches` | yes      | Non-empty array of branch names; no blanks and no duplicates |

**Output fields (under `data`):**

| Field              | Description                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `branch_prs`       | One entry per matched branch, in input order: `branch`, `pr_number`, `title`, `url`, `head_ref_name`, `base_ref_name` |
| `missing_branches` | Input-order branches with no open PR                                                                                  |
| `summary`          | `requested`, `matched`, and `missing` counts                                                                          |

**Exit codes:** `0` — every branch matched an open PR; `1` — valid input but at
least one branch has no open PR (`message` names the missing branches and
`data` still carries the full partition, so go/stop is readable from the exit
code alone); `2` — invalid input or a `gh` failure.

If multiple open PRs share a head branch, the lowest PR number wins
(deterministic tie-break).

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

All `author` fields in feedback envelopes and selected values are normalized
strings (the login, or an empty string when unknown) — never objects. Do not
write jq filters like `.author.login`; use `.author` directly.

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

As with `read-feedback-detail`, `author` fields in selected values are
normalized strings (login or empty string), never objects.

Malformed JSON, empty selections, duplicate pointers, invalid broad pointers,
missing/non-raw payloads, failed raw envelopes, and value type mismatches return
`exit_code: 2` with an error type/message. The command validates the whole
selection before writing any summary artifact.

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
