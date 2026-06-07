---
name: pr-address
description: "Command: pr-address"
allowed-tools:
  - "Bash(*pr-address-run *)"
  - "Bash(*pr-address-run)"
  - "Bash(gh pr view *)"
  - "Bash(gh pr list *)"
  - "Bash(gh auth status)"
  - "Bash(gh repo view *)"
  - "Bash(git status*)"
  - "Bash(git log*)"
  - "Bash(git diff*)"
  - "Bash(git add*)"
  - "Bash(git commit*)"
  - "Bash(git rev-parse*)"
  - "Bash(git remote*)"
  - "Bash(git branch*)"
  - "Bash(just *)"
  - "Bash(test -x*)"
  - "Read"
  - "Edit"
  - "Write"
  - "Grep"
  - "Glob"
---

<!-- PUBLIC SKILL: Do not reference asdl-internal module paths or class names in this file. Describe CLI operations, not implementation. See AGENTS.md section "Public Skill Authoring". -->

# pr-address

Address review comments on the current branch's PR, end-to-end. The skill
prepares one normalized feedback snapshot, classifies it with LLM judgment,
validates that classification, executes approved batches, commits locally, and
resolves or replies to the matching GitHub feedback. It never pushes.

## When to use

Run this skill only when the user explicitly invokes `pr-address` by name in
their current harness. Do not trigger it from natural-language requests like
"fix review feedback".

If the user wants a read-only pass, stop after the execution plan. Do not edit
code, commit, or mutate GitHub.

## Guarantees

- Works only on the current branch's PR.
- Never pushes. The user pushes manually after reviewing local commits.
- Default feedback fetching uses payload artifacts so raw review bodies stay out
  of the main transcript.
- Classification must validate before execution planning proceeds.
- Every PR-level review, unresolved inline review thread, covered thread
  comment, and PR discussion comment must be accounted for in the validated
  classification packet.
- `cross_cutting`, `complex`, and informational items require user input before
  execution.
- GitHub mutations go through `pr-address exec` operations, not raw `gh api`
  calls.

## How `pr-address` is invoked

This skill bundles a wrapper at `scripts/pr-address-run` that dispatches to
either `uv run pr-address` (when the current working directory is inside an
asdl checkout) or `uvx --from asdl-pr-address pr-address` (otherwise), so the
skill works without a local clone.

Resolve the wrapper from this skill's own directory, not from a harness-specific
path. For the rest of this document, `<pr-address-runner>` means the executable
at `<skill-dir>/scripts/pr-address-run`, where `<skill-dir>` is the directory
containing this `SKILL.md`.

Common locations are:

- `skills/pr-address/scripts/pr-address-run` in an asdl checkout
- `.agents/skills/pr-address/scripts/pr-address-run` in an installed skill
  mirror

Wherever this skill or `references/cli-reference.md` shows `pr-address ...`,
substitute `<pr-address-runner>`. For example:

```bash
<pr-address-runner> exec prepare-run \
  --payload-session-id pr-address-20260604t120000z-a1 \
  --format json
```

`ASDL_PR_ADDRESS_MODE=local|prod` overrides the auto-detection if needed.

## Prerequisites

1. `test -x <pr-address-runner>` succeeds.
2. `gh auth status` is healthy.
3. The current branch has an open PR.

Stop on the first failed prerequisite and report the problem clearly.

The working tree does not need to be clean. `pr-address` is allowed to run with
uncommitted edits in the tree. The operator is responsible for staging only the
files belonging to each batch (see step 4).

## Workflow

### 1. Preflight

Run the prerequisite checks above before fetching any feedback.

Choose one payload session id for this skill invocation. It must be a lowercase
safe path segment matching `^[a-z0-9][a-z0-9._-]{0,127}$`. Example:
`pr-address-20260604t120000z-a1`.

Pass the same id to every default payload feedback command with
`--payload-session-id <payload-session-id>`, or set
`ASDL_PAYLOAD_SESSION_ID=<payload-session-id>` in the command environment. Do
not rely on commands to invent a session id.

If the surrounding harness is in a planning-only mode, stop after printing the
execution plan. Do not edit files, commit, or call GitHub mutation commands.

### 2. Prepare the run

Use the composite helper in default payload mode:

```bash
<pr-address-runner> exec prepare-run \
  --payload-session-id <payload-session-id> \
  --format json
```

Pass `{"include_all_threads": true}` only when the user explicitly wants
resolved threads included for reference. Otherwise let it default to `false`.

Pass `{"include_empty_reviews": true}` only when the user explicitly wants to
see raw empty-body `COMMENTED` / `APPROVED` reviews (they are filtered out as
noise by default).

`prepare-run` is the source of truth for the mechanical setup. It:

- resolves the current branch and its PR
- fetches one feedback snapshot with resolved threads included as needed
- reopens contested threads previously resolved by `pr-address`
- drops empty-body `COMMENTED` / `APPROVED` reviews unless
  `include_empty_reviews=true`
- returns `data.payload_mode: "payload"` in the default workflow
- returns `data.payload_reference.payload_path`, pointing to the full raw
  payload envelope
- returns compact `reviews`, `review_threads`, and `discussion_comments` with
  body locators rather than full bodies
- returns `restructured_files` for moved/copied paths
- returns counts and any warnings that should be shown to the user before
  continuing

For read-only stack triage where PR numbers are already known, use
`<pr-address-runner> exec summarize-feedback <pr_number> --format json` to
reduce token volume. Do not use it as a replacement for `prepare-run` in the
current-branch workflow; it does not reopen contested threads or return
restructured-file evidence.

If the result has `data.found: false`, stop and report that there is no PR for
the current branch.

If the payload counts show no reviews, unresolved review threads, or discussion
comments, report that there is no outstanding feedback and stop.

### 3. Classify, validate, and plan

Open `references/feedback-classifier.md` and follow its strict packet contract.
The classifier output is a JSON packet with `schema_version: 1` and explicit
`reviews`, `review_threads`, and `discussion_comments` entries.

Generate a deterministic scaffold from the compact manifest before asking the
LLM to classify semantics:

```bash
printf '%s' '<prepare-run data json>' \
  | <pr-address-runner> exec classification-template --format json
```

The scaffold pre-fills IDs, locators, item pointers, and coverage skeletons.
The raw scaffold is intentionally invalid until the classifier fills semantic
fields such as `disposition`, `summary`, `action_summary`, `complexity`, and
`informational_reason`.

When running in an asdl checkout, also read `.asdl/prompts/subagent-launch.md`
before launching a payload-aware summarizer/subagent. That policy describes how
to pass payload paths and locators without pasting raw payload JSON.

Preferred classification path:

1. For ordinary bounded classification, launch a focused payload-aware runner
   subagent with `dispatch_runner_subagent` using a configured cheap/fast Pi
   model pattern in its optional `model` field, for example a local alias such
   as `haiku` when available. The prompt must include the compact manifest,
   `payload_reference.payload_path`, relevant body locators, the generated
   `classification-template`, the `feedback-classifier` rules, the strict packet
   contract, and completeness requirements.
2. Require the summarizer to return only the strict classification packet,
   preserving all prefilled IDs/locators/coverage fields and filling only the
   semantic judgment fields.
3. Do not use a cheap model for unusually ambiguous feedback or comments that
   require complex cross-file code-context reasoning; use the default/strong
   model path instead by omitting `model` or passing a stronger configured model
   pattern.
4. Do not paste the full `.raw.json` payload artifact into the main transcript.
5. If `dispatch_runner_subagent` is unavailable or the harness cannot choose a
   model per dispatch, use the fallback path below and classify directly from
   artifact-backed selected detail lookup; do not pretend delegation occurred.

Fallback path when no subagent/separate subagent or helper is available:

- When multiple bodies/items are needed, batch their compact-manifest pointers
  into artifact-backed detail lookup:

  ```bash
  printf '%s' '<selection-json>' \
    | <pr-address-runner> exec read-feedback-details --format json
  ```

  where `<selection-json>` is:

  ```json
  { "payload_path": "<payload-path>", "json_pointers": ["<locator-json-pointer>"] }
  ```

- Inspect `data.selected_payload_reference.payload_path` plus each returned
  `artifact_json_pointer` for exact body text. Do not paste the selected values
  into the main transcript unless strictly necessary.
- Use `read-feedback-detail` only for exact one-off body/item lookup or explicit
  debugging, because it returns the selected value inline.
- Stop if targeted lookup still leaves insufficient evidence. Do not switch to
  full inline payloads by default.

Validate before displaying any execution plan. Prefer split manifest and
classification inputs so no ad-hoc wrapper JSON is needed:

```bash
<pr-address-runner> exec validate-feedback-classification \
  --manifest-file manifest.json \
  --classification-file classification.json \
  --format json
```

Direct JSON options are also supported for controlled invocations:

```bash
<pr-address-runner> exec validate-feedback-classification \
  --manifest-json '<prepare-run data json>' \
  --classification-json '<classification packet json>' \
  --format json
```

Legacy wrapper stdin remains a compatibility fallback:

```bash
printf '%s' '{"manifest":{...},"classification":{...}}' \
  | <pr-address-runner> exec validate-feedback-classification --format json
```

Validation outcomes:

- If validation exits `0` and `data.valid` is true, continue to plan display.
- If validation exits `1`, inspect `data.counts` and `data.errors`, pass those
  diagnostics plus the original manifest/template evidence to a stronger/default
  model for one correction attempt, then revalidate.
- If the retry still fails, stop and report the diagnostics.
- If validation exits `2`, treat it as malformed workflow input and stop.

After validation succeeds, ask the helper to turn the validated packet into the
execution plan:

```bash
printf '%s' '<json wrapper>' \
  | <pr-address-runner> exec plan-feedback --format json
```

Use the same wrapper shape as validation. If `plan-feedback` exits `1`, inspect
`data.validation.counts` and `data.validation.errors`, pass those diagnostics
plus the original manifest/template evidence to a stronger/default model for one
correction attempt, then re-run validation and planning. If it exits `2`, treat
it as malformed workflow input and stop.

The returned plan, not hand-grouped scratch notes, drives execution:

- `data.batches` is ordered as `pre_existing`, `local`, `single_file`,
  `cross_cutting`, then `complex`, omitting empty groups.
- `approval_required` is false for `pre_existing`, `local`, and `single_file`;
  true for `cross_cutting` and `complex`.
- `data.informational` explicitly lists informational reviews, review threads,
  and discussion comments.
- Informational review threads have `user_decision_required: true` and allowed
  decisions `act`, `dismiss`, or `skip`; ask the user per item.
- Informational reviews and discussion comments are summarized explicitly; they
  do not hide unresolved review threads.

Display a compact plan from `data.batches` and `data.informational`, including
item location, one-line summary, approval/user-decision requirements, and
whether the evidence came from a review, review thread, or discussion comment.

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
`references/cli-reference.md` and read that helper's input field table and enum
values.** Do not guess field names, omit required fields, or invent enum values
(for example, `mode`). The reference is authoritative — if it disagrees with
memory, the reference wins. If unsure about a field's exact shape, also run
`pr-address exec <helper> --json-schema` to print the JSON schema.

Substitute the wrapper path documented above for every literal `pr-address`
shown in that reference.

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
`references/cli-reference.md` before calling it — do not guess the JSON shape:

- `build-resolve-thread-batch-payload` — after a batch commit, validate explicit
  per-thread resolve/skip decisions against the selected `plan-feedback` batch
  and produce the non-mutating payload for `resolve-thread-batch`
- `resolve-thread-batch` — mutating helper that replies to and resolves every
  inline thread included in a validated batch payload
- `resolve-thread-with-reply` — one-off fallback for a single thread
- `reply-to-review` — post a formatted reply to a PR-level review
- `reply-to-discussion` — reply to a discussion comment with reaction

For an approved batch that addresses inline threads, commit first, then call
`build-resolve-thread-batch-payload` with the `plan-feedback` output, the
selected `batch_id`, the batch commit SHA, and one explicit `resolve` or `skip`
decision for every review-thread item in that batch. Use `mode=fixed` for code
changes, `mode=pre_existing` for moved/restructured pre-existing comments, and
`mode=explained` for factual false-positive/already-fixed explanations.

Inspect the builder result:

- If `data.payload_ready` is true, pipe `data.payload` to
  `resolve-thread-batch --format json`.
- If `data.payload_ready` is false, do not call `resolve-thread-batch`; report
  the warning/skipped items and handle any PR-level review or discussion-comment
  items with the appropriate helpers.
- If the builder exits 1, fix the structured decision errors before mutating
  GitHub.

Common footguns (the reference is still the source of truth):

- Missing decisions never mean skip; every review-thread item needs an explicit
  `resolve` or `skip` decision.
- `resolve-thread-batch` reads JSON from stdin by default. Invalid payloads fail
  before mutation; gateway failures may return `exit_code: 1` with partial
  result data.
- `resolve-thread-with-reply` uses positional fields and `mode` must be one of
  `pre_existing`, `fixed`, or `explained`. Anything else is rejected.

Do not hand-roll reply bodies. The helper commands own the marker, timestamp,
and standard formatting.

### 5. Verify and hand off

After the last batch, re-fetch current feedback with default payload mode:

```bash
<pr-address-runner> exec get-feedback <pr_number> \
  --payload-session-id <payload-session-id> \
  --format json
```

This returns a compact payload manifest by default. Use selected-detail lookup
or explicit inline mode only if full body text is required for debugging.

Summarize:

- total actionable items addressed
- commits created
- threads resolved
- discussion comments replied to
- anything still unresolved
- anything explicitly skipped by the user

Finish with manual next steps:

1. review the local commits
2. push when ready
3. wait for CI
4. re-request review if needed

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
- Do not use `--payload-mode inline` unless debugging/migrating or when
  payload artifact and selected-detail paths cannot provide enough evidence.
- Do not commit a broken batch.
- Record skipped items in the final summary.

## Summary persistence

The current skill validates classification before acting and may keep the
validated packet in scratch context for this run. Durable `.summary.json`
persistence is intentionally not required for v1; add it only when a concrete
reload/replay workflow needs a supported `pr-address exec` write command.
