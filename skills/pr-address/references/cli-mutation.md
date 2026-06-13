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

Build and validate the JSON payload for `resolve-thread-batch` from a
single-PR `plan-feedback` result, one selected batch, the batch commit SHA, and
explicit post-edit decisions. This helper does not mutate GitHub.

Use this after making and committing an approved batch, before calling the
mutating `resolve-thread-batch` helper.

**Invocation:** reads JSON from stdin by default. `--payload-json` and
`--payload-file` are also available for direct/manual invocation; pass only one
explicit payload source.

```bash
printf '%s' '{"plan":{...},"batch_id":"single_file","commit_sha":"abc1234","decisions":[{"thread_id":"PRRT_kw...","action":"resolve","mode":"fixed","message":"Updated the guard."}]}' \
  | pr-address exec build-resolve-thread-batch-payload --format json
```

**Input fields:**

| Field               | Required | Description                                                                                   |
| ------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `plan`              | yes      | `data` object returned by single-PR `plan-feedback`; do not pass merged `stack-feedback-plan` |
| `batch_id`          | yes      | Exact `data.batches[].batch_id` to build from                                                 |
| `commit_sha`        | mode     | Batch commit SHA; required when any `fixed` decision lacks an item-level SHA                  |
| `continue_on_error` | no       | Copied into the generated `resolve-thread-batch` payload                                      |
| `decisions`         | yes      | One explicit `resolve` or `skip` decision for every review-thread item in the selected batch  |

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

`plan` must be the `data` object from single-PR `plan-feedback`; do not pass
merged `stack-feedback-plan` output. Stack plans include PR/branch provenance
and stack-level validation summaries that this per-PR builder intentionally does
not consume. Stack-plan-shaped input is rejected with a concise
`stack_feedback_plan_not_supported` or `invalid_request` diagnostic.

`mode` is `fixed`, `pre_existing`, `explained`, or `planned`. `fixed` requires
a non-empty `message` and a batch or item-level `commit_sha`; `explained`
requires a non-empty `message`; `pre_existing` ignores `message` and
`commit_sha` and they should be omitted. `planned` requires a non-empty
`message` and syntactically valid provenance, and rejects item-level
`commit_sha`. A top-level batch `commit_sha` may be present for fixed decisions
in the same payload and is ignored by planned items. Provenance is only valid
for planned decisions. The builder checks provenance shape only; the mutating
`resolve-thread-batch` helper validates that the branch or PR exists before any
GitHub mutation.

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
messages/commit SHAs, missing planned provenance, planned item-level commit SHA
misuse, invalid provenance shape, provenance on non-planned decisions, and
non-empty resolution fields on skip/pre-existing items. It validates any
generated payload through the same pre-mutation rules as
`resolve-thread-batch`, except that live branch/PR existence checks happen in
the mutating helper.

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

### `stack-feedback-diff-current`

Compare a validated `stack-feedback-plan` result with a freshly fetched current
`stack-feedback-prep` result before any review-thread resolution mutation. This
helper is local/read-only: it does not call GitHub, does not mutate GitHub, and
uses compact manifests only rather than raw feedback bodies.

Run a fresh prep with resolved threads immediately before diffing:

```bash
printf '%s' '{"stack":[{"pr_number":1009,"branch":"feature"}]}' \
  | pr-address exec stack-feedback-prep \
      --include-resolved \
      --format json
```

Then diff the saved plan against that fresh prep. With both reference options,
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

Each input requires exactly one source: its embedded payload key or its
reference option. Mixing a reference with its embedded key fails with
`exit_code: 2`, as does a missing, unreadable, or non-JSON reference file or a
referenced file with the wrong artifact shape. References are validated by
shape, not provenance, so artifacts from any derived payload session are accepted.

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

Build and validate per-PR JSON payloads for `resolve-thread-batch` from a
validated `stack-feedback-plan` result, one selected stack batch, the batch
commit SHA, and explicit post-edit decisions. This helper does not mutate
GitHub.

Use this in stack-address workflows after making and committing an approved
stack batch. The merged stack plan remains the provenance source; callers do not
reconstruct per-PR `plan-feedback` wrappers.

**Invocation:** reads JSON from stdin by default. `--payload-json` and
`--payload-file` are also available for direct/manual invocation; pass only one
explicit payload source. `--stack-plan-reference <path>` reads `stack_plan`
directly from a saved stack plan artifact
(`data.stack_plan_reference.payload_path` from the plan run), so the payload
only needs the batch fields and decisions:

```bash
printf '%s' '{"batch_id":"local","commit_sha":"abc1234","continue_on_error":true,"decisions":[{"pr_number":1009,"thread_id":"PRRT_kw...","action":"resolve","mode":"fixed","message":"Fixed in the stack-tip omnibus commit."}]}' \
  | pr-address exec build-stack-resolve-thread-payloads \
      --stack-plan-reference /path/to/.../stack-feedback-plan.summary.json \
      --format json
```

The embedded form remains available:

```bash
printf '%s' '{"stack_plan":{...},"batch_id":"local","commit_sha":"abc1234","continue_on_error":true,"decisions":[{"pr_number":1009,"thread_id":"PRRT_kw...","action":"resolve","mode":"fixed","message":"Fixed in the stack-tip omnibus commit."}]}' \
  | pr-address exec build-stack-resolve-thread-payloads --format json
```

**Input fields:**

| Field                  | Required | Description                                                                                         |
| ---------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `stack_plan`           | source   | `data` object returned by `stack-feedback-plan`; must have `valid == true`; omit with its reference |
| `stack_plan_reference` | source   | `--stack-plan-reference <path>`: read `stack_plan` from a saved stack plan artifact file            |
| `batch_id`             | yes      | Exact merged `data.batches[].batch_id` to build from                                                |
| `commit_sha`           | mode     | Batch/omnibus commit SHA; required when any `fixed` decision lacks an item-level SHA                |
| `continue_on_error`    | no       | Copied into every generated `resolve-thread-batch` payload                                          |
| `decisions`            | yes      | One explicit `resolve` or `skip` decision for every review-thread item in the selected batch        |

Exactly one stack plan source is required: the embedded `stack_plan` payload
key or `--stack-plan-reference`. Passing both fails with `exit_code: 2`, as
does a missing, unreadable, or non-JSON reference file or a referenced file
that is not a `stack-feedback-plan` data artifact. References are validated by
shape, not provenance.

Each decision requires `pr_number` and `thread_id`, plus the same resolution
fields used by the single-PR builder. The `pr_number` requirement lets the
helper diagnose wrong-PR references deterministically.

Resolve decision:

```json
{
  "pr_number": 1009,
  "thread_id": "PRRT_kw...",
  "action": "resolve",
  "mode": "fixed",
  "message": "Fixed in the stack-tip omnibus commit.",
  "commit_sha": "optional item-level override",
  "provenance": {"kind": "local_branch", "branch": "follow-up-branch"}
}
```

Skip decision:

```json
{
  "pr_number": 1009,
  "thread_id": "PRRT_kw...",
  "action": "skip",
  "skip_reason": "User deferred this thread to a follow-up."
}
```

`mode` is `fixed`, `pre_existing`, `explained`, or `planned`, with the same
mode-specific field rules as `build-resolve-thread-batch-payload`. The helper
builds inline review-thread payloads only; PR-level reviews and discussion
comments are reported as ignored non-thread items for other helpers.

**Output fields (under `data`):**

| Field                      | Description                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `valid`                    | Whether the selected stack batch and decisions are semantically valid                            |
| `payloads_ready`           | Whether at least one per-PR entry has a ready `resolve-thread-batch` payload                     |
| `batch_id`                 | Selected stack batch ID                                                                          |
| `review_thread_count`      | Review-thread items in the selected stack batch                                                  |
| `resolved_thread_count`    | Items included across generated per-PR payloads                                                  |
| `skipped_thread_count`     | Explicitly skipped review-thread items                                                           |
| `ignored_non_thread_items` | Selected-batch PR-level reviews or discussion comments that require other helpers                |
| `skipped_items`            | Explicit skip reasons with PR/thread summaries                                                   |
| `payloads[]`               | Per-PR entries with `pr_number`, `branch`, counts, `payload_ready`, and optional ready `payload` |
| `errors`                   | Structured semantic decision errors                                                              |
| `warnings`                 | No-payload explanations, such as no review-thread items or all threads skipped                   |

For each `data.payloads[]` entry where `payload_ready == true`, pipe that
entry's `payload` to `resolve-thread-batch`. If `payload_ready == false`, do not
call the mutating helper for that PR; report warnings/skipped/non-thread items
instead.

Validation rejects invalid stack plan shape/state, unknown stack batches,
missing decisions, duplicate `(pr_number, thread_id)` decisions, wrong-PR
references, decisions for other stack batches, informational thread decisions,
unknown threads, and the same mode/action/provenance field errors as the
single-PR builder.

**Output behavior:**

- Valid decisions with at least one resolved thread: `exit_code: 0`,
  `data.payloads_ready == true`, and ready per-PR payloads can be piped to
  `resolve-thread-batch`.
- Valid decisions with no payload needed: `exit_code: 0`,
  `data.payloads_ready == false`, and `data.warnings` explains why.
- Well-formed but invalid decisions: `exit_code: 1`, `data.valid == false`, no
  ready payloads, and `data.errors` describes all known issues.
- Malformed/empty input: `exit_code: 2` with an error type such as
  `invalid_json` or `invalid_request`.

### `resolve-thread-batch`

Reply to and resolve multiple PR review threads with canonical formatting. After
a batch commit, prefer `build-resolve-thread-batch-payload` for single-PR runs or
`build-stack-resolve-thread-payloads` for stack runs, then call this mutating
helper only for ready payloads.

**Invocation:** reads JSON from stdin by default. `--payload-json` is also
available for direct/manual invocation.

```bash
printf '%s' '{"commit_sha":"abc1234","items":[{"thread_id":"PRRT_kw...","mode":"fixed","message":"Updated the guard."}]}' \
  | pr-address exec resolve-thread-batch --format json

printf '%s' '{"items":[{"thread_id":"PRRT_kw...","mode":"planned","message":"The follow-up PR carries the fix.","provenance":{"kind":"pr","pr_number":1073}}]}' \
  | pr-address exec resolve-thread-batch --format json
```

**Payload fields:**

| Field               | Required | Description                                                      |
| ------------------- | -------- | ---------------------------------------------------------------- |
| `commit_sha`        | no       | Batch commit SHA used by `fixed` items; ignored by planned items |
| `continue_on_error` | no       | Attempt later items after a mutation failure                     |
| `items`             | yes      | Non-empty ordered array of thread jobs                           |

Each `items[]` entry:

| Field        | Required | Description                                                                                        |
| ------------ | -------- | -------------------------------------------------------------------------------------------------- |
| `thread_id`  | yes      | GraphQL review-thread node ID                                                                      |
| `mode`       | yes      | `fixed`, `pre_existing`, `explained`, or `planned`                                                 |
| `message`    | mode     | Required for `fixed`, `explained`, and `planned`; ignored by `pre_existing`                        |
| `commit_sha` | no       | Item-level override for the top-level commit SHA; rejected by `planned`                            |
| `provenance` | planned  | `{kind:"local_branch",branch:"..."}` or `{kind:"pr",pr_number:1073}`; rejected for all other modes |

Validation happens for the whole payload before any GitHub mutation. Duplicate
`thread_id` values, empty `items`, malformed JSON, missing required `message` /
`commit_sha`, planned item-level `commit_sha`, non-planned provenance, missing
planned provenance, missing local branches, or missing PRs produce
`exit_code: 2` with no mutation. Planned provenance is captured during
that pre-mutation validation step, so branch HEAD OIDs and PR states in replies
are explicitly labelled as batch-start snapshots, not live references. Existing
PR provenance may be OPEN, CLOSED, or MERGED; the canonical reply includes the
observed PR state snapshot.

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
`body`, `comment`, `is_resolved`, and enriched `provenance` for planned items.
Failed/skipped items carry `error_type`/`error_message`.

Gateway/API mutation failures after validation return `exit_code: 1` with the
partial result data. By default the command stops at the first failed item and
marks later items skipped; with `continue_on_error: true`, it attempts later
items and still returns `exit_code: 1` if any item failed.

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
