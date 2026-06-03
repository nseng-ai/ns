# pr-address CLI reference

Command reference for `pr-address exec` helpers, with invocation
examples from real sessions.

When this reference is used from the skill, replace literal `pr-address` with
the bundled wrapper at `<skill-dir>/scripts/pr-address-run`.

## Invocation convention

All `pr-address exec <command> --format json` helpers:

- Accept input as CLI options/arguments and produce the machine envelope
  `{"exit_code": 0|1|2, "data": ..., "error_type": ..., "message": ...}`
  on stdout.
- Successful runs set `exit_code: 0` and place the payload under `data`.
- Negative, non-fatal outcomes set `exit_code: 1`, include `message`, and may
  include `data` with partial evidence.
- Failures set `exit_code: 2` with `error_type` and `message` (no `data`).
- Support `--json-schema` to print JSON schemas for input/output/error shapes and
  exit without running the operation.

```bash
pr-address exec resolve-thread-with-reply \
  PRRT_kw... fixed "Updated the guard." abc1234 --format json
```

## ID scoping

- **`thread_id`** — GraphQL node IDs (e.g. `PRRT_kwDO...`). Globally unique
  across all PRs. No `pr_number` needed for thread operations.
- **`comment_id`** — REST numeric IDs. Require `pr_number` alongside them.
- **`pr_number`** — required for operations scoped to a PR (reviews,
  discussion comments, feedback fetches).

## Composite helpers

### `prepare-run`

Resolve PR context, reopen contested threads, and normalize feedback.

**Input fields:**

| Field                   | Required | Description                                                                             |
| ----------------------- | -------- | --------------------------------------------------------------------------------------- |
| `include_all_threads`   | no       | Include resolved threads for reference (default false)                                  |
| `include_empty_reviews` | no       | Include empty-body `COMMENTED` / `APPROVED` reviews (default false — filtered as noise) |

**Output fields (under `data`):**

| Field                 | Description                                             |
| --------------------- | ------------------------------------------------------- |
| `found`               | Whether a PR was found for the current branch           |
| `current_branch`      | Branch name                                             |
| `number`              | PR number                                               |
| `title`               | PR title                                                |
| `url`                 | PR URL                                                  |
| `head_ref_name`       | PR head branch                                          |
| `base_ref_name`       | PR base branch (needed for restructured-file detection) |
| `state`               | PR state (`OPEN`, `CLOSED`, `MERGED`)                   |
| `reviews`             | Array of PR-level review submissions                    |
| `review_threads`      | Array of normalized inline review threads               |
| `discussion_comments` | Array of top-level PR discussion comments               |
| `reopened_thread_ids` | Thread IDs reopened by contested-thread detection       |
| `restructured_files`  | Moved/copied paths from `git diff --name-status -M -C`  |
| `warnings`            | Non-fatal issues to show the user                       |

**Example:**

```bash
pr-address exec prepare-run --format json
```

```json
{
  "exit_code": 0,
  "data": {
    "found": true,
    "current_branch": "implement-push-down-refactor",
    "number": 104,
    "title": "Add composite pr-address operations",
    "url": "https://github.com/dagster-io/asdl/pull/104",
    "head_ref_name": "implement-push-down-refactor",
    "base_ref_name": "master",
    "state": "OPEN",
    "reviews": [ ... ],
    "review_threads": [ ... ],
    "discussion_comments": [ ... ],
    "reopened_thread_ids": [],
    "restructured_files": [],
    "warnings": []
  }
}
```

When `data.found` is `false`, there is no PR for the current branch.

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

```json
{
  "exit_code": 0,
  "data": {
    "thread_id": "PRRT_kwDOR4YhMs57SeUg",
    "body": "Fixed in commit ac18f2b: Introduced DetachedHead ...\n\nAddressed via _pr-address_ at 2026-04-16T01:40:33Z\n<!-- pr-address:resolved -->",
    "comment": { "id": 3090302853, "author": "schrockn", ... },
    "is_resolved": true
  }
}
```

On invalid input: `{"exit_code": 2, "error_type": "...", "message": "..."}`.

### `resolve-thread-batch`

Reply to and resolve multiple PR review threads with canonical formatting.
Use this after a batch commit instead of looping over
`resolve-thread-with-reply` once per thread.

**Invocation:** reads JSON from stdin by default. `--payload-json` is also
available for direct/manual invocation.

```bash
printf '%s' '{"commit_sha":"abc1234","items":[{"thread_id":"PRRT_kw...","mode":"fixed","message":"Updated the guard."}]}' \
  | pr-address exec resolve-thread-batch --format json
```

**Payload fields:**

| Field               | Required | Description                                       |
| ------------------- | -------- | ------------------------------------------------- |
| `commit_sha`        | no       | Batch commit SHA used by `fixed` items            |
| `continue_on_error` | no       | Attempt later items after a mutation failure      |
| `items`             | yes      | Non-empty ordered array of thread resolution jobs |

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

| Field           | Description                                      |
| --------------- | ------------------------------------------------ |
| `total`         | Number of input items                            |
| `resolved`      | Number successfully replied-to and resolved      |
| `failed`        | Number that hit a gateway/API mutation failure   |
| `skipped`       | Number skipped after a failure                   |
| `all_succeeded` | Whether every item succeeded                     |
| `results`       | Ordered per-item results with status and details |

Per-item `status` is `resolved`, `failed`, or `skipped`. Successful items carry
`body`, `comment`, and `is_resolved`. Failed/skipped items carry
`error_type`/`error_message`.

Gateway/API mutation failures after validation return `exit_code: 1` with the
partial result data. By default the command stops at the first failed item and
marks later items skipped; with `continue_on_error: true`, it attempts later
items and still returns `exit_code: 1` if any item failed.

### `summarize-feedback`

Fetch compact feedback evidence for a known PR number without dumping full raw
review/discussion/comment JSON. This helper compresses source evidence only;
it does not decide actionability, complexity, or batch membership.

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

If no PR is found, the JSON envelope uses `exit_code: 1` and `data.found=false`.
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

```json
{
  "exit_code": 0,
  "data": {
    "body": "Addressed review feedback from @reviewer-login:\n- Used LBYL pattern ...\n\n_Addressed via pr-address at ..._",
    "comment": { "id": 12345678, ... }
  }
}
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

| Field            | Description                                           |
| ---------------- | ----------------------------------------------------- |
| `body`           | The formatted reply body posted to GitHub             |
| `comment`        | The created comment object                            |
| `reaction_added` | Whether the +1 reaction was added successfully        |
| `reaction`       | The reaction type (`+1`)                              |
| `warning`        | Non-null if the reaction failed (not a batch failure) |

**Example:**

```bash
pr-address exec reply-to-discussion \
  104 \
  4256544189 \
  reviewer-login \
  "Can we add a named type for this return value?" \
  "Done — introduced RestructuredFiles TypeAlias." \
  --format json
```

```json
{
  "exit_code": 0,
  "data": {
    "body": "> @reviewer-login wrote:\n> Can we add a named type ...\n\nDone — introduced ...\n\n_Addressed via pr-address at ..._",
    "comment": { "id": 98765432, ... },
    "reaction_added": true,
    "reaction": "+1",
    "warning": null
  }
}
```

Reaction failure produces a warning, not a batch failure.

## Other commands

Lower-level helpers available via `pr-address exec <command> --format json`.
The composite helpers above call these internally — use them directly only
when the workflow requires it. Run `<command> --json-schema` for full schemas.

| Command                   | Description                                                                                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get-feedback`            | Fetch all PR feedback (reviews, threads, discussion comments) in a single batch. Empty-body `COMMENTED` / `APPROVED` reviews are filtered out by default; pass `--include-empty-reviews` (CLI) or `"include_empty_reviews": true` (JSON) to see them. |
| `summarize-feedback`      | Fetch compact feedback evidence for a known PR number without semantic classification.                                                                                                                                                                |
| `get-pr-for-branch`       | Look up the open PR for a branch                                                                                                                                                                                                                      |
| `get-reviews`             | Fetch PR-level review submissions (approve, request changes, comment)                                                                                                                                                                                 |
| `get-review-comments`     | Fetch review threads for a PR                                                                                                                                                                                                                         |
| `get-discussion-comments` | Fetch discussion comments for a PR                                                                                                                                                                                                                    |
| `add-issue-comment`       | Add a discussion comment to a PR                                                                                                                                                                                                                      |
| `add-reaction`            | Add a reaction to a comment                                                                                                                                                                                                                           |
| `add-review-thread-reply` | Post a reply comment on a PR review thread                                                                                                                                                                                                            |
| `resolve-thread`          | Resolve a PR review thread by its GraphQL node ID                                                                                                                                                                                                     |
| `resolve-thread-batch`    | Reply to and resolve multiple PR review threads from one JSON payload.                                                                                                                                                                                |
| `unresolve-thread`        | Unresolve (reopen) a PR review thread by its GraphQL node ID                                                                                                                                                                                          |
