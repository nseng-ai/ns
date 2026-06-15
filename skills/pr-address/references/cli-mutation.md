# pr-address CLI mutation helpers

Mutation helpers apply only explicit, validated build artifacts. Do not call raw GitHub write APIs and do not hand-roll reply bodies.

## Single-PR mutation flow

- [`resolve-thread-with-reply`](#resolve-thread-with-reply)
- [`build-resolve-thread-batch-payload`](#build-resolve-thread-batch-payload)
- [`stack-feedback-diff-current`](#stack-feedback-diff-current)
- [`verify-stack-batch-current`](#verify-stack-batch-current)
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

- `pre_existing` — moved/restructured bot comment, no code change. Leave
  `message` and `commit_sha` empty and do not pass provenance; non-empty
  message/commit or any provenance is invalid.
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

**Invocation:** no stdin or explicit payload-source input is accepted for this
command.

After `plan-feedback --pr-number <pr>` chooses a batch, make code changes locally, then write an agent-authored decisions file and build the mutation payload:

```bash
pr-address exec build-resolve-thread-batch-payload \
  --pr-number <pr-number> \
  --batch-id <batch-id> \
  --commit-sha <sha> \
  --decisions-file decisions.json \
  --format json
```

Apply only a ready build artifact:

```bash
pr-address exec resolve-thread-batch --from-build <payload-path> --format json
```

Record evidence with an agent-authored evidence file:

```bash
pr-address exec record-batch-checkpoint \
  --pr-number <pr-number> \
  --batch-id <batch-id> \
  --commit-sha <sha> \
  --evidence-file evidence.json \
  --format json
```

## Stack diff before stack mutation

Before resolving stack feedback, refresh current review-thread state in the same harness session and diff it against the latest stack plan. Use the frozen stack artifact produced by `stack-feedback-preflight` / `stack-feedback-prep` as the stack reference:

```bash
pr-address exec stack-feedback-thread-state \
  --stack-reference <frozen-stack-reference> \
  --format json
pr-address exec stack-feedback-diff-current --format json
```

`stack-feedback-diff-current` is session-only: it resolves the latest stack plan and latest current thread-state artifacts from the payload session. It no longer accepts stdin payloads, payload files, stack plan references, or current prep references. Non-empty stdin is a machine `invalid_request`; removed explicit source flags are raw usage errors.

### `verify-stack-batch-current`

Before stack mutation, verify the selected batch against the latest current thread-state artifact and the agent-authored decisions file:

```bash
pr-address exec verify-stack-batch-current \
  --batch-id <batch-id> \
  --decisions-file decisions.json \
  --format json
```

The verifier is selected-batch strict: missing, resolved, or metadata-changed selected review threads return `exit_code: 1` and `selected_batch_current: false`. Decisions for missing, duplicate, informational, or other-batch threads are invalid and also return `exit_code: 1`. Unrelated stack drift is reported in warnings/detail fields without blocking a current selected batch.

The verifier writes a managed `pr-address-stack-batch-<batch>-current` summary artifact for both passing and negative structured results. It is advisory evidence and a docs-required workflow step; `build-stack-resolve-thread-payloads` does not yet require a passing verifier artifact.

## Stack mutation flow

When the selected batch verifies current, build explicit stack mutation artifacts from the session plan plus the same agent-authored decisions file:

```bash
pr-address exec build-stack-resolve-thread-payloads \
  --batch-id <batch-id> \
  --commit-sha <sha> \
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

For the stack-only `voided_by_stack_work` batch, select that exact batch id and resolve each selected thread with `mode: "explained"`; do not invent a `voided` mode. The message should say that later stack work already addressed the request and include the prose evidence from the plan item.

```json
[
  {
    "pr_number": 1605,
    "thread_id": "PRRT_kw...",
    "action": "resolve",
    "mode": "explained",
    "message": "Already addressed by later stack work: both diff parsing paths now use the shared parser."
  }
]
```

Only review-thread items in the selected batch require decisions; unrelated complex/actionable batches do not need hand-authored `skip` decisions when resolving `voided_by_stack_work`.

**Output fields (under `data`):** existing validation fields remain, plus:

| Field                        | Description                                                   |
| ---------------------------- | ------------------------------------------------------------- |
| `resolved_inputs`            | Exact stack plan artifact used, as `{plan: PayloadReference}` |
| `payloads[].build_reference` | Managed per-PR build artifact reference for ready entries     |

Do not call `resolve-thread-batch` for entries with `payload_ready == false`.
Apply each ready per-PR artifact with `resolve-thread-batch --from-build <payloads[].build_reference.payload_path>`. Never resolve threads that are not covered by the validated plan/build artifact.

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

| Field                  | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `total`                | Number of input items                                              |
| `resolved`             | Number successfully replied-to and resolved                        |
| `failed`               | Number that hit a gateway/API mutation failure                     |
| `skipped`              | Number skipped after a failure                                     |
| `all_succeeded`        | Whether every item succeeded                                       |
| `results`              | Ordered per-item results                                           |
| `resolved_inputs`      | Exact build artifact consumed, as `{build: PayloadReference}`      |
| `resolution_reference` | Managed `thread_resolution_result` artifact written after mutation |

The resolution artifact is written for successful and partial-negative mutation
attempts, and `record-batch-checkpoint` consumes it from the session. It is not
written for pre-mutation validation errors such as invalid build artifacts,
non-ready build artifacts, malformed payload items, or invalid planned
provenance. A non-ready build artifact fails before mutation with
`invalid_request`; it exists only as checkpoint evidence.

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
