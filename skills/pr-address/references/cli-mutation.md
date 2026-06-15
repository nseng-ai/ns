# pr-address CLI reference — mutation and drift

Mutation helpers and their pre-mutation safety checks: resolve review threads,
reply to reviews and discussions, and diff planned threads against current
state. Shared invocation conventions live in [cli-reference.md](cli-reference.md).

Helpers in this file:

- [`resolve-thread-with-reply`](#resolve-thread-with-reply)
- [`build-resolve-thread-batch-payload`](#build-resolve-thread-batch-payload)
- [`stack-feedback-diff-current`](#stack-feedback-diff-current)
- [`build-stack-resolve-thread-payloads`](#build-stack-resolve-thread-payloads)
- [`resolve-thread-batch`](#resolve-thread-batch)
- [`reply-to-review`](#reply-to-review)
- [`reply-to-discussion`](#reply-to-discussion)

### `resolve-thread-with-reply`

Reply to and resolve a PR review thread with canonical pr-address formatting.

**Positional input fields (all required):**

| Position | Field        | Description                                                    |
| -------- | ------------ | -------------------------------------------------------------- |
| 1        | `thread_id`  | GraphQL node ID (`PRRT_kw...`). No `pr_number` needed.         |
| 2        | `mode`       | `pre_existing`, `fixed`, `explained`, or `planned` (see below) |
| 3        | `message`    | One-line description of what was done or planned               |
| 4        | `commit_sha` | The commit SHA that addressed the feedback; empty for planned  |

**Options:**

| Option              | Required | Description                                                      |
| ------------------- | -------- | ---------------------------------------------------------------- |
| `--provenance-json` | planned  | JSON provenance for `mode=planned`; rejected for all other modes |

`mode` values:

- `pre_existing` — moved/restructured bot comment, no code change. `message`
  and `commit_sha` may be empty strings.
- `fixed` — code change resolved by the current batch commit. Requires a
  non-empty `message` and `commit_sha`.
- `explained` — already-fixed case or false positive. Requires a non-empty
  `message`; `commit_sha` may be an empty string.
- `planned` — concrete deferred follow-up accepted by the operator/user.
  Requires a non-empty `message`, an empty `commit_sha`, and
  `--provenance-json` pointing to an existing local branch or PR. The helper
  validates provenance before mutating GitHub and formats the reply as planned
  follow-up, not as a current-commit fix.

**Output fields (under `data`):**

| Field         | Description                                                      |
| ------------- | ---------------------------------------------------------------- |
| `thread_id`   | Echo of the input thread ID                                      |
| `body`        | The formatted reply body posted to GitHub                        |
| `comment`     | The created comment object                                       |
| `is_resolved` | Post-mutation resolved state                                     |
| `provenance`  | Enriched planned provenance for `mode=planned`; otherwise `null` |

**Example:**

```bash
pr-address exec resolve-thread-with-reply \
  PRRT_kwDOR4YhMs57SeUg \
  fixed \
  "Introduced DetachedHead frozen dataclass as a named sentinel." \
  ac18f2b \
  --format json

pr-address exec resolve-thread-with-reply \
  PRRT_kwDOR4YhMs57SeUg \
  planned \
  "Reuse the Graphite metadata worker on the follow-up branch." \
  "" \
  --provenance-json '{"kind":"local_branch","branch":"reuse-graphite-metadata-worker-refreshes"}' \
  --format json

pr-address exec resolve-thread-with-reply \
  PRRT_kwDOR4YhMs57SeUg \
  planned \
  "The follow-up PR carries the fix." \
  "" \
  --provenance-json '{"kind":"pr","pr_number":1073}' \
  --format json
```

On invalid input: `{"exit_code": 2, "error_type": "...", "message": "..."}`.

### `build-resolve-thread-batch-payload`

Build and validate a mutation-ready thread-resolution artifact from the latest
single-PR `plan-feedback` summary artifact in the current payload session. This
helper does not mutate GitHub.

Use this after making and committing an approved batch. The command resolves the
latest `pr-address-pr-<n>-plan.summary.json` artifact by `--pr-number`, reads an
agent-authored decisions JSON array from `--decisions-file`, and writes a
managed `thread_resolution_build` artifact when a payload is ready.

**Invocation:** no stdin, `--payload-json`, or `--payload-file` input is
accepted for this command.

```bash
pr-address exec build-resolve-thread-batch-payload \
  --pr-number 1009 \
  --batch-id single_file \
  --commit-sha abc1234 \
  --decisions-file decisions.json \
  --format json
```

**Options:**

| Option                 | Required | Description                                                                |
| ---------------------- | -------- | -------------------------------------------------------------------------- |
| `--pr-number`          | yes      | PR whose latest session `plan` summary artifact should be used             |
| `--batch-id`           | yes      | Exact `data.batches[].batch_id`; must be a safe payload descriptor segment |
| `--commit-sha`         | mode     | Batch commit SHA; required when any `fixed` decision lacks item-level SHA  |
| `--continue-on-error`  | no       | Copied into the generated `resolve-thread-batch` payload                   |
| `--decisions-file`     | yes      | JSON array of decisions, not a wrapper object and not a plan payload       |
| `--harness-session-id` | no       | Manual/debug override for payload-session lookup                           |

Resolve decision:

```json
{
  "thread_id": "PRRT_kw...",
  "action": "resolve",
  "mode": "fixed",
  "message": "Updated the guard.",
  "commit_sha": "optional item-level override",
  "provenance": {"kind": "local_branch", "branch": "follow-up-branch"}
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

**Output fields (under `data`):** existing validation fields remain, plus:

| Field             | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `resolved_inputs` | Exact session plan artifact used, as `{plan: PayloadReference}`          |
| `build_reference` | Managed build artifact reference when `payload_ready == true`, else null |

The build artifact contains audit metadata and exactly one canonical nested
`payload` for `resolve-thread-batch --from-build`.

### `stack-feedback-diff-current`

Compare a validated `stack-feedback-plan` result with a freshly fetched current
`stack-feedback-prep` result before any review-thread resolution mutation. This
helper is local/read-only: it does not call GitHub, does not mutate GitHub, and
uses compact manifests only rather than raw feedback bodies.

Preferred session workflow: after `stack-feedback-plan` has written
`pr-address-stack-plan.summary.json`, run a fresh `stack-feedback-prep
--include-resolved` in the same harness session so it writes the latest
`pr-address-stack-prep.summary.json`. Then invoke the diff helper with empty
stdin and no explicit source flags; it resolves those two latest session
artifacts and reports the exact references under `resolved_inputs`.

```bash
printf '%s' '{"stack":[{"pr_number":1009,"branch":"feature"}]}' \
  | pr-address exec stack-feedback-prep \
      --include-resolved \
      --format json

pr-address exec stack-feedback-diff-current \
  --format json
```

Manual/reference compatibility remains available. With both reference options,
no stdin payload is needed at all — point each option at the saved artifact
(`data.stack_plan_reference.payload_path` from the plan run and
`data.stack_summary_reference.payload_path` from the fresh prep run):

```bash
pr-address exec stack-feedback-diff-current \
  --stack-plan-reference /path/to/.../stack-feedback-plan.summary.json \
  --current-prep-reference /path/to/.../stack-feedback-prep.summary.json \
  --format json
```

Embedded payload forms remain available, and one reference may be combined with
an embedded payload carrying the other key:

```bash
printf '%s' '{"stack_plan":{...},"current_prep":{...}}' \
  | pr-address exec stack-feedback-diff-current --format json

pr-address exec stack-feedback-diff-current \
  --payload-file stack-feedback-diff-input.json \
  --format json
```

**Input fields:**

| Field                    | Required | Description                                                                                         |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------------- |
| `stack_plan`             | source   | `data` object returned by `stack-feedback-plan`; must have `valid == true`; omit with its reference |
| `current_prep`           | source   | Fresh `data` object from `stack-feedback-prep --include-resolved` for the same stack                |
| `stack_plan_reference`   | source   | `--stack-plan-reference <path>`: read `stack_plan` from a saved stack plan artifact file            |
| `current_prep_reference` | source   | `--current-prep-reference <path>`: read `current_prep` from a saved prep artifact file              |
| `harness_session_id`     | payload  | Optional manual/debug override for empty-stdin session lookup                                       |

With no explicit source and empty stdin, the helper resolves the latest
`pr-address-stack-plan` summary artifact and latest `pr-address-stack-prep`
summary artifact from the current payload session. Otherwise each input requires
exactly one source: its embedded payload key or its reference option. Mixing a
reference with its embedded key fails with `exit_code: 2`, as does a missing,
unreadable, or non-JSON reference file or a referenced file with the wrong
artifact shape. References are validated by shape, not provenance, so artifacts
from any derived payload session are accepted.

**Output fields (under `data`):**

| Field                                   | Description                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `valid`                                 | Whether inputs are semantically usable for comparison                                           |
| `safe_to_resolve_planned`               | Whether planned thread resolution may proceed without reviewing drift                           |
| `planned_still_unresolved[]`            | Planned actionable review threads still present and unresolved                                  |
| `planned_already_resolved[]`            | Planned actionable review threads now present as resolved                                       |
| `new_unresolved_threads[]`              | Current unresolved review threads not covered by actionable or informational stack plan         |
| `missing_or_outdated_planned_threads[]` | Planned actionable threads absent from current prep or whose location/outdated metadata changed |
| `warnings`                              | Conservative safety warnings, including missing `include_resolved` provenance                   |
| `errors`                                | Structured invalid-input errors such as stack PR mismatch or malformed plan/current data        |
| `summary`                               | Counts for PRs, planned/current thread sets, and every drift category                           |
| `resolved_inputs`                       | Only for empty-stdin session mode: exact `stack_plan` and `current_prep` payload references     |

`safe_to_resolve_planned` is true only when the current prep includes resolved
threads, every planned actionable review thread is still unresolved with
matching path/line/start-line/outdated metadata, and no new unresolved current
threads exist outside the plan's actionable or informational review-thread set.

**Output behavior:**

- No drift and safe provenance: `exit_code: 0`; proceed to
  `build-stack-resolve-thread-payloads` for the selected stack batch.
- New unresolved threads: `exit_code: 1`; reclassify/replan or ask the user.
- Planned already resolved: `exit_code: 1`; skip/rebuild decisions for those
  threads before mutation.
- Missing or outdated planned threads: `exit_code: 1`; stop and inspect/replan.
- Malformed input JSON: `exit_code: 2` with an error type such as
  `invalid_json` or `invalid_request`.

### `build-stack-resolve-thread-payloads`

Build and validate per-PR mutation-ready thread-resolution artifacts from the
latest `stack-feedback-plan` summary artifact in the current payload session.
This helper does not mutate GitHub.

Use this in stack-address workflows after making and committing an approved
stack batch. The command resolves the latest `pr-address-stack-plan.summary.json`,
reads an agent-authored decisions JSON array from `--decisions-file`, and writes
one managed `thread_resolution_build` artifact for each PR entry where
`payload_ready == true`.

**Invocation:** no stdin, `--payload-json`, `--payload-file`, or
`--stack-plan-reference` input is accepted for this command.

```bash
pr-address exec build-stack-resolve-thread-payloads \
  --batch-id local \
  --commit-sha abc1234 \
  --decisions-file decisions.json \
  --format json
```

**Options:**

| Option                 | Required | Description                                                               |
| ---------------------- | -------- | ------------------------------------------------------------------------- |
| `--batch-id`           | yes      | Exact merged `data.batches[].batch_id`; must be a safe descriptor segment |
| `--commit-sha`         | mode     | Batch/omnibus commit SHA; required when any fixed decision lacks an SHA   |
| `--continue-on-error`  | no       | Copied into every generated `resolve-thread-batch` payload                |
| `--decisions-file`     | yes      | JSON array of decisions, each with `pr_number` and `thread_id`            |
| `--harness-session-id` | no       | Manual/debug override for payload-session lookup                          |

Each decision uses the same fields as the single-PR builder, with required
`pr_number`. The helper diagnoses wrong-PR references, other-batch decisions,
informational thread decisions, unknown threads, and mode/action/provenance
errors before any mutation artifact is used.

**Output fields (under `data`):** existing validation fields remain, plus:

| Field                        | Description                                                   |
| ---------------------------- | ------------------------------------------------------------- |
| `resolved_inputs`            | Exact stack plan artifact used, as `{plan: PayloadReference}` |
| `payloads[].build_reference` | Managed per-PR build artifact reference for ready entries     |

Do not call `resolve-thread-batch` for entries with `payload_ready == false`.
Call it with `--from-build <payloads[].build_reference.payload_path>` for ready
entries.

### `resolve-thread-batch`

Reply to and resolve multiple PR review threads with canonical formatting from
an explicit managed build artifact. This command never reads stdin, never accepts
agent-composed payload JSON, and never resolves the latest artifact implicitly.

Build the artifact first with `build-resolve-thread-batch-payload` or
`build-stack-resolve-thread-payloads`, then pass the exact managed payload path:

```bash
pr-address exec resolve-thread-batch \
  --from-build /tmp/asdl/sessions/<session>/payloads/...resolve-build.summary.json \
  --format json
```

**Options:**

| Option         | Required | Description                                                   |
| -------------- | -------- | ------------------------------------------------------------- |
| `--from-build` | yes      | Absolute path to a managed `thread_resolution_build` artifact |

Omitting `--from-build` returns `error_type: explicit_artifact_required` and no
GitHub calls. The path must be a managed payload artifact under the payload-store
layout; arbitrary JSON files are rejected by the payload-store boundary.

The command validates the build artifact shape, confirms it is a ready
thread-resolution build, validates every nested payload item and planned
provenance before the first GitHub write, then applies replies/resolutions.

**Output fields (under `data`):**

| Field           | Description                                    |
| --------------- | ---------------------------------------------- |
| `total`         | Number of input items                          |
| `resolved`      | Number successfully replied-to and resolved    |
| `failed`        | Number that hit a gateway/API mutation failure |
| `skipped`       | Number skipped after a failure                 |
| `all_succeeded` | Whether every item succeeded                   |
| `results`       | Ordered per-item results                       |

Gateway/API mutation failures after validation return `exit_code: 1` with the
partial result data. By default the command stops at the first failed item and
marks later items skipped; with artifact payload `continue_on_error: true`, it
attempts later items and still returns `exit_code: 1` if any item failed.

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
