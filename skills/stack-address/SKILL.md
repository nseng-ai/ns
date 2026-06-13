---
name: stack-address
description: "Use for explicit stack-wide PR feedback passes across every PR in a Graphite stack; not for single-PR feedback. Triggers also for legacy names code-stack-address and pr-stack-address."
metadata:
  internal: true
allowed-tools:
  - "Bash(gt *)"
  - "Bash(git *)"
  - "Bash(gh *)"
  - "Bash(pr-address *)"
  - "Bash(uv run *)"
  - "Bash(just *)"
  - "Bash(make *)"
  - Read
  - Edit
  - Write
  - Grep
  - Glob
---

# stack-address

Address unresolved feedback across the current Graphite stack by creating or
reusing one child omnibus branch at the stack tip, committing fixes there, and
resolving original lower-stack review threads with explicit stack-tip wording.

Not normal `pr-address`: that skill is scoped to the current PR; this one is
stack-scoped and must use the tested `pr-address exec` stack helpers.

## Load with

- `graphite` for stack topology, navigation, and branch creation.
- `pr-address` for feedback collection, classifier contract, planning, drift
  comparison, payload construction, and GitHub mutations. Load its references
  lazily:
  1. Read `references/cli-reference.md` plus `references/cli-collection.md`
     sections for `map-branch-prs` and `stack-feedback-prep` before prep.
  2. If prep shows zero feedback, report and stop; load no more references.
  3. If feedback exists, read `references/feedback-classifier.md` and relevant
     `references/cli-planning.md` sections.
  4. If actionable work remains, read relevant `references/cli-mutation.md`
     sections and `references/cli-lifecycle.md` when checkpointing.
- `code-gh` for any `gh` use beyond simple PR listing/viewing.
- Language/test skills required by touched files.

## Hard rules

- Operate on the full current Graphite stack by default.
- Require a clean worktree before stack navigation or branch creation unless the
  user explicitly asks to carry existing changes into the omnibus branch.
- Require an open PR for every non-trunk stack branch; stop on missing PRs
  unless the user explicitly overrides.
- Do not `gt submit`, `git push`, or `gh pr create` unless explicitly asked.
- Use one lowercase safe `ASDL_PAYLOAD_SESSION_ID` for the whole run.
- Store helper stdout outside the worktree under `git rev-parse --git-path`; in
  linked worktrees `.git` is a pointer file, not a scratch directory.
- Use `--stdout-mode compact` for `stack-feedback-prep` and
  `stack-feedback-plan`; do not paste full raw payload JSON into the transcript.
- Do not use `--payload-mode inline` except for explicit debugging or migration.
- Use payload artifact references and `read-feedback-details` for body lookup.
  Use `read-feedback-detail` only for exact one-off debugging.
- Stop if any required helper is unavailable: `map-branch-prs`,
  `stack-feedback-prep`, `stack-feedback-plan`, `stack-feedback-diff-current`,
  `build-stack-resolve-thread-payloads`, `resolve-thread-batch`.
- Do not show or execute a stack plan until `stack-feedback-plan` validates all
  classifications and returns a valid merged plan.
- Show a compact validated execution plan before editing.
- Auto-execute only mechanical/simple feedback. Ask before cross-cutting,
  complex, human-sensitive, top-level reply, skip/defer, push, or submit work.
- Before any GitHub review-thread mutation, require committed fixes or verified
  explained/pre-existing decisions, relevant passing checks, a fresh helper-owned
  drift diff, and helper-built payload validation.
- Never hand-roll GitHub review-thread API calls; mutate only through
  `resolve-thread-batch` payloads built by `build-stack-resolve-thread-payloads`.
- Do not manually reconstruct per-PR `plan-feedback` wrappers from a merged
  stack plan.
- Use `(pr_number, thread_id)` in stack review-thread decisions and evidence.
- Do not hide unresolved review threads inside informational counts.
- Treat obvious top-level Vercel, Graphite, roaster summary, and GitHub Actions
  status comments as informational by default; inline review threads remain the
  source of truth for actionable roaster findings.
- Do not show automation discussion bodies in the decision docket unless direct
  request language or uncertainty is detected; summarize counts by reason.
- Do not guess helper fields/enums; read the relevant CLI reference section or
  run `--json-schema`.

## Shared setup

Run helpers from inside the target repository so `gh` can infer `owner/repo`.
Use `pr-address` from `PATH`.

```bash
export ASDL_PAYLOAD_SESSION_ID="pr-stack-address-$(date -u +%Y%m%dt%H%M%Sz)-a1"
STACK_ADDRESS_RUN_DIR="$(git rev-parse --path-format=absolute --git-path "asdl/stack-address/${ASDL_PAYLOAD_SESSION_ID}")"
mkdir -p "$STACK_ADDRESS_RUN_DIR"
STACK_ADDRESS_PREP_COMPACT="$STACK_ADDRESS_RUN_DIR/stack-prep.compact.json"
STACK_ADDRESS_PLAN_COMPACT="$STACK_ADDRESS_RUN_DIR/stack-plan.compact.json"
STACK_ADDRESS_CURRENT_PREP_COMPACT="$STACK_ADDRESS_RUN_DIR/stack-current-prep.compact.json"
STACK_ADDRESS_FINAL_PREP_COMPACT="$STACK_ADDRESS_RUN_DIR/stack-final-prep.compact.json"
```

Helper exits: `0` = use `data`; `1` = structured semantic/validation/operation
failure; `2` = malformed input, precondition failure, or unsupported state.
Stop on `2`.

## Workflow

### 1. Preflight and PR coverage

1. Verify `gh auth status`, `gt ls --stack`, `pr-address` availability, and
   `git status --short --branch` cleanliness.
2. Determine the full Graphite stack from trunk through tip. If starting in the
   middle, move to the tip only after the worktree safety check.
3. Build the non-trunk branch list from `gt ls --stack` and map it to PRs in one
   Graphite-neutral helper call:

   ```bash
   printf '%s' '{"branches":["feature-branch","other-branch"]}' \
     | pr-address exec map-branch-prs --format json
   ```

4. On exit `1`, report `data.missing_branches` and stop unless the user chooses
   otherwise. On exit `0`, build explicit stack JSON from `data.branch_prs`:

   ```json
   {"stack":[{"pr_number":1009,"branch":"feature-branch","title":"Optional PR title","url":"https://github.com/org/repo/pull/1009","head_ref_name":"feature-branch","base_ref_name":"base-branch"}]}
   ```

5. If launching classifier subagents in an asdl checkout, first read
   `.asdl/prompts/subagent-launch.md`.

### 2. Snapshot and classify

Fetch unresolved-only stack feedback:

```bash
printf '%s' '<stack-json>' \
  | pr-address exec stack-feedback-prep \
      --payload-session-id "$ASDL_PAYLOAD_SESSION_ID" \
      --stdout-mode compact \
      --format json \
  > "$STACK_ADDRESS_PREP_COMPACT"
```

Print only compact totals plus PRs with non-zero feedback counts. Include PRs
with no feedback in the scan summary but produce no plan items for them. If
`data.summary` has zero reviews, zero unresolved review threads, and zero
discussion comments across the stack, report the clean scan and stop.

Classification rules:

- Default initial classification to unresolved review threads only.
- Load full prep data from `data.stack_summary_reference.payload_path`.
- Preserve every full prep `stack[]` entry: manifest, raw feedback reference,
  classification template, summary references, and `discussion_triage`.
- Treat `discussion_triage` as advisory; every review, unresolved review thread,
  and discussion comment still needs exactly one classification.
- `summarize-feedback` is read-only triage only; do not use it when
  classification/execution will follow.
- For each PR with feedback, classify from
  `classification_template.classification_template`, compact manifests, payload
  locators, classifier rules, and strict JSON output. Prefer one focused
  subagent per PR when model routing is available.

### 3. Validate and display stack plan

Run `stack-feedback-plan` with `--prep-reference`; do not embed the prep
artifact:

```bash
printf '%s' '{"classifications":[{"pr_number":1009,"classification":{}}]}' \
  | pr-address exec stack-feedback-plan \
      --prep-reference "$(jq -r '.data.stack_summary_reference.payload_path' "$STACK_ADDRESS_PREP_COMPACT")" \
      --payload-session-id "$ASDL_PAYLOAD_SESSION_ID" \
      --stdout-mode compact \
      --format json \
  > "$STACK_ADDRESS_PLAN_COMPACT"
```

Proceed only when exit is `0`, `data.valid == true`, and
`data.validation.all_valid == true`.

Plan display rules:

- Use compact `data.batches` for transcript-visible plan summary.
- Load full plan from `data.stack_plan_reference.payload_path` before drift
  checks and payload building; preserve PR provenance and deterministic ordering.
- Preserve full-plan `informational` and use `data.decision_docket` for
  approval-required work, informational review-thread decisions, and non-
  automation discussion comments that may need reply.
- Display PR/branch, source kind, review/comment/thread identity, path/line,
  summary, action summary, complexity, and approval requirement.
- Auto-proceed only for approved `pre_existing`, `local`, and `single_file`
  items after local verification.

### 4. Create or reuse omnibus branch

Choose branch action only after plan validation.

- If selected batches require no code changes because every decision is
  `explained` or `pre_existing` after stack-tip verification, skip branch
  creation and record "no omnibus branch needed".
- Preserve the stack prefix from the stack tip branch when present:
  `<stack-prefix>/<branch-slug>`.
- Reuse one verified compatible child omnibus branch before creating a new one.
  Compatibility must be proven by Graphite topology or commit/branch context.
- If multiple compatible branches remain, ask the user; in non-interactive
  contexts, stop.
- If creating, derive a 3-7 word kebab-case semantic slug from the validated
  plan's coherent theme, approved batch, paths, or shared mechanism. Do not
  derive from the raw user request alone. Ask/stop on ambiguity.
- Show reuse/adopt/create plus branch name immediately before acting.

Create from stack tip:

```bash
gt create <branch-name> -m "Address PR stack feedback"
```

### 5. Execute approved batches

For each approved batch:

1. Inspect referenced code; verify bot comments against local context.
2. Make the smallest coherent fix, or prepare factual `explained`/
   `pre_existing` decisions for false positives/already-fixed items.
3. Run targeted tests/typechecks for touched packages plus formatter checks;
   escalate to full `just` when changes cross package/language boundaries or no
   targeted check is obvious.
4. Use repo-approved autofixes (`just fix`, `just dprint-fix`) for formatter or
   linter failures; rerun checks.
5. Do not commit a broken batch. Commit coherent batches only after relevant
   checks pass. Split unrelated work even when items share a complexity bucket.
6. Record batch ID, PR number, `(pr_number, thread_id)`, source item identity,
   decision mode, commit SHA, changed files, and validation evidence for every
   addressed/skipped/explained/deferred review-thread item.

Commit format:

```text
Address PR stack feedback (batch N/M)

- <summary 1>
- <summary 2>
```

For explained-only runs, mutation preconditions are stack-tip verification plus
checks already green on the tip; there is no new commit to cite.

### 6. Required pre-mutation drift gate

Immediately before review-thread mutation, refetch current stack feedback with
resolved threads included:

```bash
printf '%s' '<same-stack-json>' \
  | pr-address exec stack-feedback-prep \
      --include-resolved \
      --payload-session-id "$ASDL_PAYLOAD_SESSION_ID" \
      --stdout-mode compact \
      --format json \
  > "$STACK_ADDRESS_CURRENT_PREP_COMPACT"

pr-address exec stack-feedback-diff-current \
  --stack-plan-reference "$(jq -r '.data.stack_plan_reference.payload_path' "$STACK_ADDRESS_PLAN_COMPACT")" \
  --current-prep-reference "$(jq -r '.data.stack_summary_reference.payload_path' "$STACK_ADDRESS_CURRENT_PREP_COMPACT")" \
  --format json
```

Proceed only when exit is `0`, `data.valid == true`, and
`data.safe_to_resolve_planned == true`.

Drift routing:

- `planned_still_unresolved`: eligible when backed by committed/verified work
  and passing checks.
- `planned_already_resolved`: skip/rebuild decisions; do not resolve again.
- `new_unresolved_threads`: reclassify/replan or ask before continuing.
- `missing_or_outdated_planned_threads`: stop and replan or ask.
- Missing `--include-resolved` provenance or warnings: refetch correctly.
- `errors`: stop and fix input, stack, or plan mismatch.

### 7. Build and run mutation payloads

Automatic resolution applies only to inline review-thread items that are
classified actionable or approved, included in the validated plan, addressed or
explained by the omnibus batch, still safe after drift diff, and backed by
required checks.

For each selected batch:

1. Build one decision per selected thread with `pr_number`, `thread_id`,
   `batch_id`, `commit_sha`, and `continue_on_error: true`.
2. Use `action: "resolve"` with mode `fixed`, `explained`, or `pre_existing`,
   or `action: "skip"` with `skip_reason` for deferred threads.
3. Build per-PR payloads with `build-stack-resolve-thread-payloads` and
   `--stack-plan-reference`; do not embed stack-plan JSON.
4. Pipe each `data.payloads[]` entry where `payload_ready == true` to
   `pr-address exec resolve-thread-batch --format json`.
5. Run independent per-PR mutating calls in parallel when safe; the payload
   store is concurrency-safe.
6. Do not mutate entries where `payload_ready == false`; report warnings,
   skipped items, and ignored non-thread items.
7. Fix builder decision errors before mutation. Report partial mutation failures
   with failed thread IDs and retry/fallback guidance.

Use `build-resolve-thread-batch-payload` only for single-PR `plan-feedback`
runs. For PR-level reviews and discussion comments, use `reply-to-review` or
`reply-to-discussion`; ask before top-level human replies unless already
approved.

### 8. Final verification and report

After mutation, fetch verification evidence scoped to touched PRs. Prefer
per-PR `get-feedback --include-resolved` when mutations touched half the stack or
fewer; use full-stack `stack-feedback-prep --include-resolved` only when
whole-stack before/after counts are needed. This is post-mutation verification,
not the drift gate.

Report:

- PRs scanned and before/after unresolved counts.
- Validated batches, approvals, and omnibus branch name.
- Items addressed, skipped, explained, or deferred.
- Commits and commit SHAs.
- Threads resolved and mutation failures.
- Discussion/review replies posted or awaiting approval.
- Checks run and results.
- Manual next steps: review local omnibus commits, run
  `gt submit --no-interactive` when ready, wait for CI, and re-request review if
  needed.

## Push-down status

Already pushed down: stack prep/classification templates, stack plan merge,
drift comparison, stack payload assembly, single-PR validation/planning,
single-PR payload assembly, and branch-to-PR mapping.

Possible future helpers: rerun/idempotency summaries and compact stack
finalization summaries.
