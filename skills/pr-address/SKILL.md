---
name: pr-address
description: Address GitHub PR review feedback with the pr-address session-store workflow.
---

# pr-address

Use `pr-address exec ...` helpers to collect, classify, plan, build, and optionally apply PR feedback resolutions. The durable rule is: **files carry what the agent authored; the session carries what the pipeline produced.**

## Safety rules

- Do not use raw GitHub write endpoints.
- Do not push, submit, publish, merge, or deploy unless the user explicitly asks.
- Do not hand-roll reply bodies or resolve review threads outside ready `pr-address` build artifacts.
- Do not drop unresolved review threads from classification or finalization.
- Classification packets are agent-authored JSON input, normally sent via stdin or `--classification-json`; `validate-feedback-classification` persists the validated packet into the payload session.
- Agent-authored decisions files and checkpoint evidence files remain file-based.
- Pipeline-produced artifacts are resolved from the payload session, not pasted into wrapper JSON.

## Session setup

Use the harness-provided payload session when available. For manual evidence runs:

```bash
export ASDL_PAYLOAD_ROOT="${TMPDIR:-/tmp}/asdl-pr-address-session-store-evidence"
export HARNESS_SESSION_ID="pr-address-$(date -u +%Y%m%dT%H%M%SZ)"
```

## Single-PR flow

1. Collect feedback; this writes manifest/raw artifacts into the session:

   ```bash
   pr-address exec get-feedback <pr-number> --format json
   ```

2. Build a classification scaffold from the session manifest:

   ```bash
   pr-address exec classification-template --pr-number <pr-number> --format json
   ```

3. Produce agent-authored classification JSON from the scaffold and inspected payload details.

4. Validate and persist the classification without creating a repo scratch file:

   ```bash
   printf '%s' "$CLASSIFICATION_JSON" \
     | pr-address exec validate-feedback-classification \
         --pr-number <pr-number> \
         --format json
   ```

5. Plan feedback from session artifacts:

   ```bash
   pr-address exec plan-feedback --pr-number <pr-number> --format json
   ```

6. If mutation is appropriate, implement the selected batch locally, write `decisions.json`, build a ready payload, and apply only that artifact:

   ```bash
   pr-address exec build-resolve-thread-batch-payload \
     --pr-number <pr-number> \
     --batch-id <batch-id> \
     --commit-sha <sha> \
     --decisions-file decisions.json \
     --format json

   pr-address exec resolve-thread-batch --from-build <payload-path> --format json
   ```

7. Record evidence and finalize:

   ```bash
   pr-address exec record-batch-checkpoint \
     --pr-number <pr-number> \
     --batch-id <batch-id> \
     --commit-sha <sha> \
     --evidence-file evidence.json \
     --format json

   pr-address exec get-feedback <pr-number> --include-resolved --format json
   pr-address exec finalize-run --pr-number <pr-number> --format json
   ```

## Stack flow

1. Map/prepare the stack so prep and per-PR manifests/templates are in the session.
2. For each PR, run `classification-template --pr-number <pr>`, produce strict classification JSON, and pipe it to `validate-feedback-classification --pr-number <pr>`; do not create repo-root classification files.
3. Plan the stack from session artifacts:

   ```bash
   pr-address exec stack-feedback-plan --format json
   ```

4. Refresh current feedback in the same session with resolved threads included, then diff against the session plan:

   ```bash
   pr-address exec stack-feedback-prep --include-resolved --format json
   pr-address exec stack-feedback-diff-current --format json
   ```

5. If safe, build stack mutation artifacts from an agent-authored decisions file and apply only ready artifacts:

   ```bash
   pr-address exec build-stack-resolve-thread-payloads \
     --batch-id <batch-id> \
     --commit-sha <sha> \
     --decisions-file decisions.json \
     --format json
   ```

## Removed composed-input surfaces

These helpers are session-only for pipeline-produced artifacts:

- `classification-template --pr-number <pr>`
- `plan-feedback --pr-number <pr>`
- `stack-feedback-plan`
- `stack-feedback-diff-current`

Non-empty stdin to those helpers returns a machine `invalid_request`; removed explicit source flags are raw usage errors. Use the references for details:

- `references/cli-planning.md`
- `references/cli-mutation.md`
- `references/cli-reference.md`
- `references/feedback-classifier.md`

Tiny-feedback fast path: when the manifest has at most five required feedback
items total and they are short bot/outdated/mechanical comments with no
human-sensitive ambiguity, the parent may use `read-feedback-details` for the
needed bodies/items and classify directly from artifact-backed details. Still
start from the generated scaffold, preserve deterministic fields, validate with
`validate-feedback-classification`, and plan with `plan-feedback`. If any item is
human-authored, long, ambiguous, cross-file, or validation fails for semantic
reasons, use the delegated classifier/escalation path instead.

Preferred classification path:

1. For ordinary bounded classification, launch a focused payload-aware runner
   subagent with `dispatch_runner_subagent` and set its optional `model` field to
   the canonical cheap classification model named in the shared Pi launch policy
   when available. The prompt must include the compact manifest,
   `payload_reference.payload_path`, relevant body locators, the generated
   `classification-template`, the `feedback-classifier` rules, the expected
   classification report shape, and completeness requirements.
2. Require the subagent to return a concise prose/Markdown classification report
   keyed by exact review IDs, review-thread IDs, discussion-comment IDs, and
   covered thread-comment IDs. The report must include disposition, summary,
   action summary plus complexity for actionable items, informational reason for
   informational items, `needs_reply` for discussion comments when relevant,
   evidence locators or IDs inspected, confidence/blockers, and coverage counts.
   The report is not the final validation JSON packet.
3. The parent fills only semantic fields in the generated scaffold from the
   report. Preserve all prefilled IDs, body locators, item pointers,
   `thread_item_pointer` values, and `covered_comments` from the scaffold. Write
   the parent-generated classification packet to a file when practical.
4. Follow the escalation conditions and concrete Pi escalation target guidance
   in `references/feedback-classifier.md`.
5. Do not paste the full `.raw.json` payload artifact into the main transcript.
6. If `dispatch_runner_subagent` is unavailable, the requested cheap model is
   not available, or the harness cannot choose a model per dispatch, use the
   fallback path below and classify directly from artifact-backed selected
   detail lookup; do not pretend delegation/model routing occurred.

Fallback path when no subagent/separate subagent or helper is available:

- When multiple bodies/items are needed, batch their compact-manifest pointers
  into artifact-backed detail lookup:

  ```bash
  printf '%s' '<selection-json>' \
    | pr-address exec read-feedback-details --format json
  ```

  where `<selection-json>` is:

  ```json
  { "payload_path": "<payload-path>", "json_pointers": ["<locator-json-pointer>"] }
  ```

- In compact stdout, find the selected-detail summary artifact under
  `data.artifacts.produced[]` with `kind: "selected-feedback-details"`; in full
  stdout, use `data.selected_payload_reference`. Open that artifact's
  `payload_path` and resolve each returned `artifact_json_pointer` for exact
  body text. Do not paste the selected values into the main transcript unless
  strictly necessary.
- Use `read-feedback-detail` only for exact one-off body/item lookup or explicit
  debugging, because it returns the selected value inline.
- Stop if targeted lookup still leaves insufficient evidence. Do not switch to
  full inline payloads by default.

In fallback mode there is no agent-to-agent boundary: the parent may classify
and directly fill the JSON packet itself, while preserving the deterministic
scaffold fields and validating before planning.

Validate before displaying any execution plan. Prefer session-resolved manifest
input so no ad-hoc manifest file or wrapper JSON is needed:

```bash
pr-address exec validate-feedback-classification \
  --pr-number <pr> \
  --classification-file classification.json \
  --format json
```

Successful `--pr-number` validation automatically persists the classification
artifact for `plan-feedback --pr-number`. `validate-feedback-classification` is
session-only at the manifest boundary; non-empty stdin returns a machine
`invalid_request` and removed explicit source flags are raw usage errors.

Validation outcomes:

- If validation exits `0` and `data.valid` is true, continue to plan display.
- If validation exits `1`, inspect `data.counts` and `data.errors`.
  - If the failure is malformed JSON, missing arrays, locator mismatch, copied
    scaffold-field drift, or another parent translation/schema mistake, fix the
    parent-generated packet locally and revalidate.
  - If the failure shows missing or duplicate semantic judgments in the subagent
    report, ask the subagent once for a corrected report with the diagnostics,
    then refill the scaffold and revalidate.
  - If semantic judgment remains ambiguous or human-sensitive, escalate to the
    parent/default strong model or ask the user according to normal approval
    rules.
- If the retry still fails, stop and report the diagnostics.
- If validation exits `2`, treat it as malformed workflow input and stop.

After validation succeeds, ask the helper to turn the persisted classification
artifact into the execution plan:

```bash
pr-address exec plan-feedback \
  --pr-number <pr> \
  --format json
```

If `plan-feedback` exits `1`, inspect
`data.validation.counts` and `data.validation.errors` and handle them like
classification validation failures: fix parent translation/schema mistakes
locally, retry/escalate only for incomplete or ambiguous semantic judgments, then
re-run validation and planning. If it exits `2`, treat it as malformed workflow
input and stop.

The returned plan, not hand-grouped scratch notes, drives execution. In compact
stdout, open the plan artifact from `data.details.plan_reference` or
`data.artifacts.produced[]` with `kind: "plan"` before reading `batches`; full
stdout includes `data.batches` inline.

- Plan `batches` are ordered as `pre_existing`, `local`, `single_file`,
  `cross_cutting`, then `complex`, omitting empty groups.
- `approval_required` is false for `pre_existing`, `local`, and `single_file`;
  true for `cross_cutting` and `complex`.
- Plan `informational` explicitly lists informational reviews, review threads,
  and discussion comments.
- Informational review threads have `user_decision_required: true` and allowed
  decisions `act`, `dismiss`, or `skip`; ask the user per item.
- Informational reviews and discussion comments are summarized explicitly; they
  do not hide unresolved review threads.

Display a compact plan from the full plan (`batches` and `informational`),
including item location, one-line summary, approval/user-decision requirements,
and whether the evidence came from a review, review thread, or discussion
comment.

### 4. Execute approved batches

For each approved batch, do the real engineering work:

- inspect the referenced code
- use `read-feedback-details` when multiple exact original bodies/items are
  needed and were not already provided by the payload-aware classifier answer;
  use `read-feedback-detail` only for a one-off inline lookup/debug check
- decide whether the feedback needs a code change, a reply, or both
- make the edit
- run appropriate tests for the affected project
- fix any failures before committing
- stage only the files changed for that batch
- create exactly one commit for the batch

All `pr-address exec <helper> --format json` helpers emit the machine envelope
`{"exit_code": 0|1|2, "data": ..., "error_type": ..., "message": ...}` on
stdout. Failures exit 2 with `error_type` and `message` set.

**Before calling any `pr-address exec <helper> --format json`, open
`references/cli-reference.md` for the shared conventions and its helper routing
table, then read only the mapped category file's section for that helper**
(`references/cli-collection.md`, `references/cli-planning.md`,
`references/cli-mutation.md`, or `references/cli-lifecycle.md`). Never read all
category files up front. Do not guess field names, omit required fields, or
invent enum values (for example, `mode`). The reference is authoritative — if
it disagrees with memory, the reference wins. If unsure about a field's exact
shape, also run `pr-address exec <helper> --json-schema` to print the JSON
schema.

Commit format:

```text
Address PR review comments (batch N/M)

- <summary 1>
- <summary 2>
```

Treat these cases specially:

- outdated inline threads: verify whether the issue is already fixed before
  making a new edit
- automated false positives: explain why they are false positives and resolve
  them without a code change
- informational items the user chose to act on: treat them like actionable items
  for that batch

Before execution changes code for a bot comment, verify the local context:

1. read the nearby code, not just the flagged line
2. check whether the requested pattern already exists
3. check whether the bot rule is wrong for this context

If the bot is wrong:

- do not change the code
- resolve the thread with an explanatory reply
- keep the explanation factual and brief

Use the composite helpers for GitHub mutations. Read each helper's entry in
`references/cli-mutation.md` (or `references/cli-lifecycle.md` for
`record-batch-checkpoint` and `finalize-run`) before calling it — do not guess
the JSON shape:

- `build-resolve-thread-batch-payload` — after a single-PR batch commit,
  validate explicit per-thread resolve/skip decisions against the selected
  `plan-feedback` batch and produce the non-mutating payload for
  `resolve-thread-batch`
- `build-stack-resolve-thread-payloads` — for stack runs, validate explicit
  per-thread decisions against a selected `stack-feedback-plan` batch and
  produce per-PR non-mutating payloads for `resolve-thread-batch`
- `resolve-thread-batch` — mutating helper that replies to and resolves every
  inline thread included in a validated batch payload
- `record-batch-checkpoint` — non-GitHub helper that validates compact evidence
  for one completed batch and writes a managed checkpoint artifact when the plan
  came from a payload-backed run
- `resolve-thread-with-reply` — one-off fallback for a single thread
- `reply-to-review` — post a formatted reply to a PR-level review
- `reply-to-discussion` — reply to a discussion comment with reaction

For an approved batch that addresses inline threads, commit first, then call
`build-resolve-thread-batch-payload` with the `plan-feedback` output, the
selected `batch_id`, the batch commit SHA when the current commit fixed the
thread, and one explicit `resolve` or `skip` decision for every review-thread
item in that batch. Use `mode=fixed` for code changes present in the current
commit, `mode=pre_existing` for moved/restructured pre-existing comments,
`mode=explained` for factual false-positive/already-fixed explanations, and
`mode=planned` only when the user/operator explicitly accepts provenance-backed
deferral to an existing local branch or PR. Planned mode requires a non-empty
message and validated provenance; do not use it for vague promises. Provenance
is only valid for `mode=planned`. For pre-existing resolutions, use a decision
like `{ "thread_id": "...", "action": "resolve", "mode": "pre_existing" }`;
if generated optional fields are present, `message` and `commit_sha` must be
null/empty and `provenance` must be null. Non-empty `message`, non-empty
`commit_sha`, or non-null provenance is invalid for `mode: "pre_existing"`.
In batch payloads, planned items reject only
item-level `commit_sha`; a top-level batch `commit_sha` may be present for fixed
items in the same payload and is ignored by planned items. Treat any captured
branch HEAD OID or PR state in the reply as a batch-start snapshot, not a live
reference.

Inspect the builder result:

- If `data.payload_ready` is true, pipe `data.payload` to
  `resolve-thread-batch --format json`.
- If `data.payload_ready` is false, do not call `resolve-thread-batch`; report
  the warning/skipped items and handle any PR-level review or discussion-comment
  items with the appropriate helpers.
- If the builder exits 1, fix the structured decision errors before mutating
  GitHub.

After committing the batch and after any relevant GitHub mutation helper has
returned, run `record-batch-checkpoint` with the session-resolved plan,
selected `batch_id`, `--commit-sha <sha>` for code-changing batches or
`--no-code-change` for no-code pre-existing/already-addressed batches,
validation command evidence, any `build-resolve-thread-batch-payload` result,
any `resolve-thread-batch` result, and explicit PR-level review or discussion
comment outcomes. Use repository-relative forward-slash paths in
`changed_files`. Include the returned `data.checkpoint_reference` in your final
summary and use it as finalization evidence. If it exits 1 or returns
`data.batch_complete == false`, do not treat the batch as done: fix the missing
or failed evidence, or report a blocker.

Common footguns (the reference is still the source of truth):

- Missing decisions never mean skip; every review-thread item needs an explicit
  `resolve` or `skip` decision.
- `build-resolve-thread-batch-payload` is per-PR: pass `plan-feedback` output,
  not merged `stack-feedback-plan` output. For stack runs, pass the validated
  `stack-feedback-plan` output plus explicit `(pr_number, thread_id)` decisions
  to `build-stack-resolve-thread-payloads`, then call `resolve-thread-batch` per
  ready payload.
- `resolve-thread-batch` reads JSON from stdin by default. Invalid payloads fail
  before mutation; gateway failures may return `exit_code: 1` with partial
  result data.
- `resolve-thread-with-reply` uses positional fields and `mode` must be one of
  `pre_existing`, `fixed`, `explained`, or `planned`. `planned` also requires
  `--provenance-json` naming an existing local branch or PR; non-planned modes
  reject provenance. Anything else is rejected.

Do not hand-roll reply bodies. The helper commands own the marker, timestamp,
and standard formatting.

### 5. Verify and hand off

After the last batch, re-fetch current feedback with resolved-thread state and
run deterministic finalization:

```bash
pr-address exec get-feedback <pr_number> \
  --include-resolved \
  --format json

# Session-resolved finalization reads the latest feedback, plan, and checkpoint artifacts:
pr-address exec finalize-run \
  --pr-number <pr_number> \
  --format json
```

Finalization is session-only: it reads the latest feedback, plan, and checkpoint
artifacts from the payload session rather than a hand-composed payload.

If `finalize-run` exits 1 or returns `data.ready_to_stop == false`, do not claim
the PR-address run is complete. Report the helper's unresolved unskipped
threads, failed/incomplete checkpoints, and skipped items.

If `data.ready_to_stop == true`, the final summary should cite the helper result,
checkpoint references, commits, skipped items, and normal next steps: review the
local commits, push when ready, wait for CI, and re-request review if needed. Use
selected-detail lookup or explicit inline mode only if full body text is required
for debugging; finalization itself should not dump bodies.

Do not run `git push`. Do not run `gt submit`.

## Rules

- Work on the current branch. Do not create a branch or a new PR.
- Never push. Commits stay local for the user to review first.
- Do not use raw GitHub review-thread reply endpoints. Use the helper commands
  above.
- Do not drop unresolved review threads during classification.
- Do not show or execute a plan until `validate-feedback-classification` accepts
  the classification packet and `plan-feedback` emits the deterministic plan.
- Retry invalid classification once with structured diagnostics, then fail
  closed.
- Do not paste full raw payload JSON into the main transcript by default.
- Do not commit a broken batch.
- Record skipped items in the final summary.

## Summary persistence

The skill validates classification before acting and may keep the validated
packet in scratch context for this run. After each executed batch,
`record-batch-checkpoint` can write a compact `.summary.json` checkpoint artifact
inside the same derived payload session. Treat checkpoint artifacts as audit evidence,
not as a hidden task database or automatic resume queue.
