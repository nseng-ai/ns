# pr-address CLI reference

Command reference for `pr-address exec` helpers, with invocation
examples from real sessions.

When this reference is used from the skill, replace literal `pr-address` with
the bundled wrapper at `<skill-dir>/scripts/pr-address-run`.

## Invocation convention

All `pr-address exec <command> --format json` helpers:

- Accept input either as CLI options/arguments (human mode) or — equivalently
  — as a single JSON document on stdin when invoked through the legacy
  `pr-address exec json <command>` subtree. Prefer `--format json` on the
  human surface; the `json` subtree is transitional and will be removed.
- Emit the machine envelope
  `{"exit_code": 0|1|2, "data": ..., "error_type": ..., "message": ...}`
  on stdout. Successful runs set `exit_code: 0` and place the payload under
  `data`. Failures set `exit_code: 2` with `error_type` and `message` (no
  `data`).
- Support `--schema` to print JSON schemas for input/output/error shapes and
  exit without running the operation.

```bash
echo '{"thread_id": "PRRT_kw...", "mode": "fixed", ...}' \
  | pr-address exec json resolve-thread-with-reply
```

The equivalent `--format json` invocation uses positional arguments and
options instead of stdin JSON.

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
    "url": "https://github.com/dagster-io/twerk/pull/104",
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

**Input fields (all required):**

| Field        | Description                                            |
| ------------ | ------------------------------------------------------ |
| `thread_id`  | GraphQL node ID (`PRRT_kw...`). No `pr_number` needed. |
| `mode`       | `pre_existing`, `fixed`, or `explained` (see below)    |
| `message`    | One-line description of what was done                  |
| `commit_sha` | The commit SHA that addressed the feedback             |

`mode` values:

- `pre_existing` — moved/restructured bot comment, no code change
- `fixed` — code change resolved by the current batch commit
- `explained` — already-fixed case or false positive

**Output fields (under `data`):**

| Field                  | Description                               |
| ---------------------- | ----------------------------------------- |
| `thread_id`            | Echo of the input thread ID               |
| `body`                 | The formatted reply body posted to GitHub |
| `comment`              | The created comment object                |
| `was_already_resolved` | Whether the thread was already resolved   |

**Example:**

```bash
pr-address exec resolve-thread-with-reply \
  PRRT_kwDOR4YhMs57SeUg \
  --mode fixed \
  --message "Introduced DetachedHead frozen dataclass as a named sentinel." \
  --commit-sha ac18f2b \
  --format json
```

```json
{
  "exit_code": 0,
  "data": {
    "thread_id": "PRRT_kwDOR4YhMs57SeUg",
    "body": "Fixed in commit ac18f2b: Introduced DetachedHead ...\n\nAddressed via _pr-address_ at 2026-04-16T01:40:33Z\n<!-- pr-address:resolved -->",
    "comment": { "id": 3090302853, "author": "schrockn", ... },
    "was_already_resolved": false
  }
}
```

On error: `{"exit_code": 2, "error_type": "...", "message": "..."}`.

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
when the workflow requires it. Run `<command> --schema` for full schemas.

| Command                   | Description                                                                                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get-feedback`            | Fetch all PR feedback (reviews, threads, discussion comments) in a single batch. Empty-body `COMMENTED` / `APPROVED` reviews are filtered out by default; pass `--include-empty-reviews` (CLI) or `"include_empty_reviews": true` (JSON) to see them. |
| `get-pr-for-branch`       | Look up the open PR for a branch                                                                                                                                                                                                                      |
| `get-reviews`             | Fetch PR-level review submissions (approve, request changes, comment)                                                                                                                                                                                 |
| `get-review-comments`     | Fetch review threads for a PR                                                                                                                                                                                                                         |
| `get-discussion-comments` | Fetch discussion comments for a PR                                                                                                                                                                                                                    |
| `add-issue-comment`       | Add a discussion comment to a PR                                                                                                                                                                                                                      |
| `add-reaction`            | Add a reaction to a comment                                                                                                                                                                                                                           |
| `add-review-thread-reply` | Post a reply comment on a PR review thread                                                                                                                                                                                                            |
| `resolve-thread`          | Resolve a PR review thread by its GraphQL node ID                                                                                                                                                                                                     |
| `unresolve-thread`        | Unresolve (reopen) a PR review thread by its GraphQL node ID                                                                                                                                                                                          |
