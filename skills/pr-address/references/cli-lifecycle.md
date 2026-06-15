# pr-address CLI reference — run lifecycle

Run lifecycle helpers: record per-batch checkpoint evidence and finalize a run.
Shared invocation conventions live in [cli-reference.md](cli-reference.md).

Helpers in this file:

- [`record-batch-checkpoint`](#record-batch-checkpoint)
- [`finalize-run`](#finalize-run)
- [Other commands](#other-commands)

### `record-batch-checkpoint`

Validate and record compact evidence for one selected `plan-feedback` batch.
Run this after the batch commit and after relevant GitHub mutation helpers have
returned. The helper does not mutate GitHub, commit, push, create branches, or
print raw feedback bodies. Its only write is a managed PR/batch-scoped
`checkpoint.summary.json` artifact in the current payload session.

**Invocation:** session mode only. The command resolves pipeline-produced facts
from the payload session and reads only agent-authored evidence from
`--evidence-file`. It does not read stdin and does not accept `--payload-json` or
`--payload-file`; those removed flags fail as raw usage errors (`exit 2`, empty
stdout, stderr containing `unknown option ...`).

```bash
pr-address exec record-batch-checkpoint \
  --pr-number 630 \
  --batch-id single_file \
  --commit-sha abc1234 \
  --evidence-file checkpoint-evidence.json \
  --format json
```

Use `--harness-session-id <id>` only as a manual/debug override for payload
session lookup.

**Evidence file shape:**

```json
{
  "validation_commands": [
    {"command": "pnpm --dir ts run test", "status": "passed", "exit_code": 0, "summary": "pr-address tests passed"}
  ],
  "non_thread_outcomes": [
    {"source_kind": "review", "review_id": "PRR_...", "action": "replied", "result_comment_id": 12345},
    {"source_kind": "discussion_comment", "discussion_comment_id": 4101, "action": "no_reply_needed", "summary": "Covered by thread reply."}
  ]
}
```

`validation_commands[]` entries use `status` `passed`, `failed`, or `skipped`,
with optional `exit_code` and `summary`.

Each `non_thread_outcomes[]` entry uses `source_kind: "review"` with
`review_id`, or `source_kind: "discussion_comment"` with
`discussion_comment_id`. `action` is one of:

- `replied` — requires `result_comment_id`
- `skipped` — requires `skip_reason`
- `no_reply_needed` — requires a summary explaining why no reply was needed

**Resolved session inputs:**

The command resolves:

- latest PR `plan.summary.json` artifact for `--pr-number`
- latest PR/batch `resolve-build.summary.json` artifact when the selected batch
  has review-thread items
- latest PR/batch `resolution.summary.json` artifact when the build artifact has
  `payload_ready == true`
- `changed_files` from `--commit-sha` through the git gateway

The exact artifacts used are reported under `data.resolved_inputs`:

```json
{
  "plan": {"payload_path": "...pr-address-pr-630-plan.summary.json"},
  "build": {"payload_path": "...batch-single_file-resolve-build.summary.json"},
  "resolution": {"payload_path": "...batch-single_file-resolution.summary.json"}
}
```

`build` and `resolution` are `null` when the selected plan batch has no
review-thread work or when the resolved build has no ready payload.

**Output fields (under `data`):**

| Field                  | Description                                                                     |
| ---------------------- | ------------------------------------------------------------------------------- |
| `valid`                | Whether resolved and agent-authored checkpoint evidence is semantically valid   |
| `batch_complete`       | Whether evidence indicates the batch is complete and successful                 |
| `batch_id`             | Selected batch ID                                                               |
| `complexity`           | Selected batch complexity                                                       |
| `approval_required`    | Whether the selected batch required approval                                    |
| `pr_number`            | PR number from the plan                                                         |
| `payload_path`         | Source payload path from the plan, if any                                       |
| `checkpoint_reference` | Managed PR/batch checkpoint artifact reference                                  |
| `resolved_inputs`      | Exact session plan/build/resolution artifact references used                    |
| `commit_sha`           | Trimmed batch commit SHA                                                        |
| `changed_files`        | Git-derived changed-file evidence for `--commit-sha`                            |
| `validation_commands`  | Validated command evidence from the evidence file                               |
| `selected_items`       | Compact selected plan item identities and summaries                             |
| `thread_summary`       | Thread counts plus resolved, failed, skipped, and explicitly skipped thread IDs |
| `non_thread_outcomes`  | Validated PR-level review/discussion outcome evidence                           |
| `errors`               | Structured evidence errors                                                      |
| `warnings`             | Non-fatal caveats                                                               |

**Output behavior:**

- Complete successful evidence returns `exit_code: 0` with
  `data.batch_complete == true`.
- Well-formed but incomplete or failed evidence returns `exit_code: 1` with
  structured data; do not treat the batch as done while
  `data.batch_complete == false`.
- Missing session artifacts, invalid evidence JSON, invalid batch IDs, or git
  lookup failures return `exit_code: 2` with a structured error envelope.
- Removed composed-payload flags are raw Clinkr/commander usage errors, not JSON
  envelopes.

### `finalize-run`

Summarize final unresolved, skipped, and checkpoint evidence for a `pr-address`
run. The helper is local/read-only: it does not mutate GitHub, commit, push,
create branches, or read raw feedback bodies into stdout.

**Invocation:** session mode only. First capture fresh final feedback explicitly:

```bash
pr-address exec get-feedback 630 \
  --include-resolved \
  --format json

pr-address exec finalize-run \
  --pr-number 630 \
  --format json
```

Use `--harness-session-id <id>` only as a manual/debug override for payload
session lookup. `finalize-run` does not read stdin and does not accept
`--payload-json` or `--payload-file`; those removed flags fail as raw usage
errors (`exit 2`, empty stdout, stderr containing `unknown option ...`).

**Resolved session inputs:**

The command resolves:

- latest PR `plan.summary.json` artifact for `--pr-number`
- latest PR `feedback.raw.json` artifact, expected from a prior
  `get-feedback --include-resolved`
- latest PR/batch `checkpoint.summary.json` artifact for every batch in the
  resolved plan

Missing planned-batch checkpoints are explicit incomplete evidence. They are not
silently ignored; each missing batch appears as `missing_checkpoint_evidence` in
`data.errors`, and `data.ready_to_stop` is false.

The exact artifacts used are reported under `data.resolved_inputs`:

```json
{
  "plan": {"payload_path": "...pr-address-pr-630-plan.summary.json"},
  "feedback": {"payload_path": "...pr-address-pr-630-feedback.raw.json"},
  "checkpoints": [
    {"batch_id": "single_file", "reference": {"payload_path": "...batch-single_file-checkpoint.summary.json"}}
  ]
}
```

**Output fields (under `data`):**

| Field                          | Description                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `valid`                        | Whether resolved finalization input is internally consistent                                                   |
| `ready_to_stop`                | Whether no unresolved unskipped threads, failed mutations, incomplete checkpoints, or failed validation remain |
| `all_feedback_addressed`       | Stricter than `ready_to_stop`; false when anything was intentionally skipped/deferred                          |
| `resolved_inputs`              | Exact session plan/feedback/checkpoint artifact references used                                                |
| `counts`                       | Batch, unresolved, resolved-from-checkpoint, failed, skipped, and incomplete/missing checkpoint counts         |
| `unresolved_threads`           | Every currently unresolved thread from fresh feedback                                                          |
| `unresolved_unskipped_threads` | Currently unresolved threads that were not explicitly skipped/deferred in checkpoint evidence                  |
| `skipped_items`                | Skipped review threads, PR-level reviews, and discussion comments                                              |
| `checkpoint_summaries`         | Compact per-batch commit, changed-file, thread, non-thread, and failed-validation evidence                     |
| `errors`                       | Structured evidence inconsistencies or failures, including missing checkpoint evidence                         |
| `warnings`                     | Non-fatal caveats, such as no checkpoint evidence supplied                                                     |

**Output behavior:**

- `exit_code: 0` only when `data.valid == true` and
  `data.ready_to_stop == true`.
- `exit_code: 1` when unresolved unskipped feedback, failed/incomplete/missing
  checkpoints, failed validation, or semantic input inconsistencies mean the run
  should not be claimed complete. Explicitly skipped items remain visible but do
  not by themselves force exit 1.
- Missing or malformed session artifacts return `exit_code: 2` with a structured
  error envelope.
- Removed composed-payload flags are raw Clinkr/commander usage errors, not JSON
  envelopes.

## Other commands

Lower-level helpers available via `pr-address exec <command> --format json`.
Use them directly only when the workflow requires it. Run
`<command> --json-schema` for full schemas.

| Command                               | Description                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get-feedback`                        | Fetch all PR feedback in payload mode by default; run with `--include-resolved` before `finalize-run`. Empty-body reviews are filtered out by default. |
| `read-feedback-detail`                | Read one allowed body/item pointer from a raw payload artifact and return the selected value inline.                                                   |
| `read-feedback-details`               | Read multiple allowed body/item pointers into a managed summary artifact with compact stdout metadata.                                                 |
| `classification-template`             | Build a deterministic fill-in classification scaffold from a compact manifest.                                                                         |
| `validate-feedback-classification`    | Validate a strict classification packet against a compact payload manifest.                                                                            |
| `plan-feedback`                       | Build deterministic execution batches and informational decisions from a validated classification packet.                                              |
| `build-resolve-thread-batch-payload`  | Build and validate the non-mutating payload for `resolve-thread-batch` from a selected single-PR plan batch and explicit decisions.                    |
| `stack-feedback-diff-current`         | Compare a validated stack plan with fresh current stack feedback before review-thread resolution mutation.                                             |
| `build-stack-resolve-thread-payloads` | Build and validate non-mutating per-PR payloads for `resolve-thread-batch` from a selected stack plan batch and explicit decisions.                    |
| `finalize-run`                        | Summarize final unresolved, skipped, and checkpoint evidence from session artifacts without mutating GitHub or printing raw feedback bodies.           |
| `summarize-feedback`                  | Fetch compact feedback evidence for a known PR number without semantic classification.                                                                 |
| `resolve-thread-batch`                | Mutating helper: reply to and resolve multiple PR review threads from an explicit build artifact, then write a managed resolution artifact.            |
