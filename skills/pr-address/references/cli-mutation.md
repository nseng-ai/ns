# pr-address CLI mutation helpers

Mutation helpers apply only explicit, validated build artifacts. Do not call raw GitHub write APIs and do not hand-roll reply bodies.

## Single-PR mutation flow

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

Before resolving stack feedback, refresh current prep in the same harness session and diff it against the latest stack plan:

```bash
pr-address exec stack-feedback-prep --stack-json <stack-json> --include-resolved --format json
pr-address exec stack-feedback-diff-current --format json
```

`stack-feedback-diff-current` is session-only: it resolves the latest stack plan and latest current prep artifacts from the payload session. It no longer accepts stdin payloads, payload files, stack plan references, or current prep references. Non-empty stdin is a machine `invalid_request`; removed explicit source flags are raw usage errors.

## Stack mutation flow

When the diff is valid and safe, build explicit stack mutation artifacts from the session plan plus an agent-authored decisions file:

```bash
pr-address exec build-stack-resolve-thread-payloads \
  --batch-id <batch-id> \
  --commit-sha <sha> \
  --decisions-file decisions.json \
  --format json
```

Apply each ready per-PR artifact with `resolve-thread-batch --from-build <payload-path>`. Never resolve threads that are not covered by the validated plan/build artifact.
