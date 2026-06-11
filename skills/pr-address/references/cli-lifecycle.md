# pr-address CLI reference — run lifecycle

Run lifecycle helpers: record per-batch checkpoint evidence and finalize a
run. Shared invocation conventions live in [cli-reference.md](cli-reference.md).

Helpers in this file:

- [`record-batch-checkpoint`](#record-batch-checkpoint)
- [`finalize-run`](#finalize-run)
- [Other commands](#other-commands)

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

| Field                      | Required | Description                                                                                                                 |
| -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `plan`                     | yes      | `data` object returned by `plan-feedback`                                                                                   |
| `batch_id`                 | yes      | Exact `data.batches[].batch_id` to checkpoint                                                                               |
| `commit_sha`               | changes  | Batch commit SHA; required when `changed_files` is non-empty                                                                |
| `changed_files`            | no       | Repository-relative forward-slash paths; absolute paths, traversal, backslashes, empty entries, and duplicates are rejected |
| `validation_commands`      | no       | Commands run for the batch with `status` `passed`, `failed`, or `skipped`, optional exit/summary                            |
| `thread_payload_build`     | threads  | Result from `build-resolve-thread-batch-payload` when the batch has review-thread items                                     |
| `thread_resolution_result` | payload  | Result from `resolve-thread-batch` when `thread_payload_build.payload_ready` is true                                        |
| `non_thread_outcomes`      | items    | One explicit outcome for every selected PR-level review or discussion-comment item                                          |

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

### `finalize-run`

Summarize final unresolved, skipped, and checkpoint evidence for a `pr-address`
run. The helper is local/read-only: it does not mutate GitHub, commit, push,
create branches, or read raw feedback bodies.

Recommended final feedback fetch:

```bash
pr-address exec get-feedback 630 \
  --include-resolved \
  --payload-session-id <payload-session-id> \
  --format json
```

**Invocation:** reads finalization JSON from stdin by default. `--payload-json`
and `--payload-file` are also available; pass only one explicit source.

```bash
pr-address exec finalize-run \
  --payload-file pr-address-finalization.json \
  --format json
```

**Input fields:**

| Field         | Required | Description                                                                                     |
| ------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `feedback`    | yes      | `data` object returned by final `get-feedback`, preferably with `--include-resolved`            |
| `checkpoints` | no       | `data` objects returned by `record-batch-checkpoint` for every completed or attempted run batch |

**Output fields (under `data`):**

| Field                          | Description                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `valid`                        | Whether supplied finalization input is internally consistent                                                   |
| `ready_to_stop`                | Whether no unresolved unskipped threads, failed mutations, incomplete checkpoints, or failed validation remain |
| `all_feedback_addressed`       | Stricter than `ready_to_stop`; false when anything was intentionally skipped/deferred                          |
| `counts`                       | Batch, unresolved, resolved-from-checkpoint, failed, and skipped counts                                        |
| `unresolved_threads`           | Every currently unresolved thread from fresh feedback                                                          |
| `unresolved_unskipped_threads` | Currently unresolved threads that were not explicitly skipped/deferred in checkpoint evidence                  |
| `skipped_items`                | Skipped review threads, PR-level reviews, and discussion comments                                              |
| `checkpoint_summaries`         | Compact per-batch commit, changed-file, thread, non-thread, and failed-validation evidence                     |
| `errors`                       | Structured evidence inconsistencies or failures                                                                |
| `warnings`                     | Non-fatal caveats, such as no checkpoint evidence supplied                                                     |

**Output behavior:**

- `exit_code: 0` only when `data.valid == true` and
  `data.ready_to_stop == true`.
- `exit_code: 1` when unresolved unskipped feedback, failed/incomplete
  checkpoints, failed validation, or semantic input inconsistencies mean the run
  should not be claimed complete. Explicitly skipped items remain visible but do
  not by themselves force exit 1.
- Malformed JSON or conflicting input sources return `exit_code: 2` with an
  error type such as `invalid_json` or `invalid_request`.

## Other commands

Lower-level helpers available via `pr-address exec <command> --format json`.
Use them directly only when the workflow requires it. Run
`<command> --json-schema` for full schemas.

| Command                               | Description                                                                                                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get-feedback`                        | Detailed above. Fetch all PR feedback in payload mode by default; `--payload-mode inline` is a debugging escape hatch. Empty-body reviews are filtered out by default. |
| `read-feedback-detail`                | Detailed above. Read one allowed body/item pointer from a raw payload artifact and return the selected value inline.                                                   |
| `read-feedback-details`               | Detailed above. Read multiple allowed body/item pointers into a managed summary artifact with compact stdout metadata.                                                 |
| `classification-template`             | Detailed above. Build a deterministic fill-in classification scaffold from a compact manifest.                                                                         |
| `validate-feedback-classification`    | Detailed above. Validate a strict classification packet against a compact payload manifest.                                                                            |
| `plan-feedback`                       | Detailed above. Build deterministic execution batches and informational decisions from a validated classification packet.                                              |
| `build-resolve-thread-batch-payload`  | Detailed above. Build and validate the non-mutating payload for `resolve-thread-batch` from a selected single-PR plan batch and explicit decisions.                    |
| `stack-feedback-diff-current`         | Detailed above. Compare a validated stack plan with fresh current stack feedback before review-thread resolution mutation.                                             |
| `build-stack-resolve-thread-payloads` | Detailed above. Build and validate non-mutating per-PR payloads for `resolve-thread-batch` from a selected stack plan batch and explicit decisions.                    |
| `finalize-run`                        | Detailed above. Summarize final unresolved, skipped, and checkpoint evidence without mutating GitHub or printing raw feedback bodies.                                  |
| `summarize-feedback`                  | Fetch compact feedback evidence for a known PR number without semantic classification.                                                                                 |
| `resolve-thread-batch`                | Mutating helper: reply to and resolve multiple PR review threads from one JSON payload.                                                                                |
