---
name: stack-address
description: "Use when the user explicitly wants a stack-wide PR feedback pass: address all feedback in this Graphite stack, make an omnibus PR for stack feedback, retroactively resolve comments across the stack, or run pr-address across every PR in the stack. Also triggers for legacy names code-stack-address or pr-stack-address."
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

Address unresolved feedback across every PR in the current Graphite stack by
creating or reusing one child omnibus branch at the stack tip, committing fixes
there, and resolving the original lower-stack review threads with explicit
stack-tip wording.

This is intentionally **not** normal `pr-address`: `pr-address` is scoped to the
current branch's PR. This skill is stack-scoped and routes deterministic stack
mapping, planning, drift comparison, and payload construction through tested
`pr-address exec` helpers.

## Contents

- [When to use](#when-to-use)
- [Required supporting skills](#required-supporting-skills)
- [Guarantees](#guarantees)
- [Workflow](#workflow)
- [Rules](#rules)
- [CLI push-down candidates](#cli-push-down-candidates)

## When to use

Use when the user explicitly wants a stack-wide feedback pass, for example:

- "address all feedback in this stack"
- "make an omnibus PR for stack feedback"
- "retroactively resolve comments across the stack"
- "run pr-address across every PR in the stack"

Do not trigger from ordinary single-PR review feedback requests; use
`pr-address` for those.

## Required supporting skills

Load these when their domain is touched:

- `graphite` — stack topology, branch creation, and navigation.
- `pr-address` — feedback payloads, classifier contract, stack planning,
  pre-mutation drift diffing, and GitHub mutation helpers. Load its reference
  docs lazily, in stages — never all up front:
  1. Read `references/cli-reference.md` (routing index + shared conventions)
     and the `references/cli-collection.md` sections for `map-branch-prs` and
     `stack-feedback-prep`, then run the prep.
  2. If the stack summary shows zero feedback, report and STOP — load no other
     reference docs.
  3. Only when feedback exists, read `references/feedback-classifier.md` and
     the relevant `references/cli-planning.md` sections.
  4. Only when the validated plan has actionable items, read the relevant
     `references/cli-mutation.md` sections (and `references/cli-lifecycle.md`
     when checkpointing).
- `code-gh` — any `gh` use beyond simple PR listing/viewing.
- Language/test skills as needed for code changes, e.g. `typescript-style`,
  `dignified-python`, `pytest`, or fake-driven testing skills.

## Guarantees

- Operates on the full current Graphite stack by default.
- Requires strict open-PR coverage for every non-trunk stack branch; stop on
  missing PRs unless the user explicitly overrides.
- Requires a clean worktree before stack navigation or branch creation unless
  the user explicitly asks to carry existing changes into the omnibus branch.
- Creates or reuses one child omnibus branch at the stack tip when code changes
  are required. Reuse a verified compatible branch before deriving a new
  semantic branch name.
- Does **not** run `gt submit`, `git push`, or `gh pr create` by default.
- Uses one payload session id for the stack run; normal operation does not
  create ad hoc `/tmp` scratch directories or paste raw payload JSON.
- Requires `map-branch-prs`, `stack-feedback-prep`, `stack-feedback-plan`,
  `stack-feedback-diff-current`, `build-stack-resolve-thread-payloads`, and
  `resolve-thread-batch`. If a required helper is unavailable, stop and report;
  do not manually reconstruct the stack workflow.
- Shows a compact validated execution plan before editing.
- Auto-executes only mechanical/simple feedback; asks before cross-cutting,
  complex, or human-sensitive work.
- Requires committed fixes, relevant passing checks, and a fresh helper-owned
  drift diff before any GitHub review-thread mutation.
- Builds stack mutation payloads only with
  `build-stack-resolve-thread-payloads`, then mutates only through
  `resolve-thread-batch`; never hand-roll GitHub review-thread API calls.

## Workflow

### Shared helper conventions

- Run the `pr-address` CLI on `PATH` (installed from an asdl checkout with
  `just install-pr-address`); command examples are literal.
- Choose one lowercase safe payload session id for the whole run. Pass it with
  `--payload-session-id <payload-session-id>` or set
  `ASDL_PAYLOAD_SESSION_ID` consistently.
- Helper exit codes: `0` means use `data`; `1` means structured semantic,
  validation, or operation-level failure; `2` means malformed input,
  precondition failure, or unsupported state and should stop the run.
- Use payload artifact references and `read-feedback-details` for body lookup.
  Use `read-feedback-detail` only for exact one-off lookup/debugging.
- Normal stack operation must use `--stdout-mode compact` for
  `stack-feedback-prep` and `stack-feedback-plan`. Save helper stdout to local
  files with `>` and print only small `jq` summaries; do not `tee` full helper
  JSON into the transcript.
- Do not use `--payload-mode inline` except for explicit debugging or migration.
- Run every GitHub-hitting helper from inside the target repository: `gh`
  resolves `owner/repo` from the cwd's git remotes, and these operations fail
  fast with `repo_context_required` outside a git work tree.
- When summarizing prep/plan output with `jq`, filter to PRs with non-zero
  feedback counts; print stack totals plus only the interesting per-PR rows.
- In linked worktrees `.git` is a pointer file, not a directory — never use
  `.git/` as a scratch location; derive real git paths with
  `git rev-parse --git-dir` if a git-adjacent path is ever needed.

### 1. Preflight and stack PR coverage

1. Verify `gh auth status`, `gt ls --stack`, and executable pr-address runner.
2. Inspect `git status --short --branch`; require a clean worktree before stack
   navigation or branch creation.
3. Determine the full current Graphite stack from trunk through tip. If starting
   in the middle, move to the tip only after the worktree safety check.
4. Map every non-trunk stack branch to an open PR in one call: build the branch
   list from `gt ls --stack` and pipe it to the Graphite-neutral helper (the
   caller supplies branch names, so the helper itself has no `gt` dependency):

   ```bash
   printf '%s' '{"branches":["feature-branch","other-branch"]}' \
     | pr-address exec map-branch-prs --format json
   ```

   - Exit `0`: build the stack JSON below from `data.branch_prs`.
   - Exit `1`: at least one branch has no open PR; stop and report
     `data.missing_branches` unless the user explicitly chooses otherwise.
5. Build explicit Graphite-neutral stack JSON from `data.branch_prs`:

   ```json
   {
     "stack": [
       {
         "pr_number": 1009,
         "branch": "feature-branch",
         "title": "Optional PR title",
         "url": "https://github.com/org/repo/pull/1009",
         "head_ref_name": "feature-branch",
         "base_ref_name": "base-branch"
       }
     ]
   }
   ```

6. If launching classifier subagents in an asdl checkout, read
   `.asdl/prompts/subagent-launch.md` before dispatch.

### 2. Initial stack snapshot and classification

Fetch the initial unresolved-only stack snapshot:

```bash
printf '%s' '<stack-json>' \
  | pr-address exec stack-feedback-prep \
      --payload-session-id <payload-session-id> \
      --stdout-mode compact \
      --format json \
  > stack-prep.compact.json

jq '{exit_code, summary:.data.summary,
    stack:(.data.stack
      | map(select((.counts.reviews + .counts.unresolved_review_threads + .counts.discussion_comments) > 0))
      | map({pr_number, branch, counts:.counts}))}' \
  stack-prep.compact.json
```

The `jq` filter intentionally drops zero-feedback PRs from the transcript; the
`summary` totals still cover the whole stack.

Rules:

- If `data.summary` shows zero reviews, zero unresolved review threads, and
  zero discussion comments across the stack, report the clean scan and STOP —
  do not load classifier/planning/mutation docs and do not create any branch.
- Initial classification defaults to unresolved review threads only.
- Use compact stdout for transcript-visible summaries. Load the full prep data
  for classification/planning from `data.stack_summary_reference.payload_path`.
- Preserve every full prep `stack[]` entry from that artifact: manifest, raw
  feedback reference, classification template, summary references, and
  `discussion_triage`.
- Include PRs with no feedback in the scan summary, but produce no plan items.
- Treat `discussion_triage` as advisory. Every review, unresolved review thread,
  and discussion comment still needs exactly one classification.
- `summarize-feedback` may be used only for quick read-only triage when no
  classification/execution will follow.

For each PR with feedback:

1. Read `skills/pr-address/references/feedback-classifier.md`.
2. Start from `classification_template.classification_template` in the full prep
   artifact.
3. Classify with compact manifests, payload locators, generated template,
   classifier rules, and strict JSON output. Prefer one focused subagent per PR
   when model routing is available; otherwise classify directly from the same
   packet.
4. Use the shared feedback-detail lookup policy when exact bodies/items are
   needed.

### 3. Validate and merge the stack plan

Run `stack-feedback-plan` with `--prep-reference` pointing at the saved full
prep artifact and one classification per PR; do not re-embed the prep artifact
in the payload:

```bash
printf '%s' '{"classifications":[{"pr_number":1009,"classification":{...}}]}' \
  | pr-address exec stack-feedback-plan \
      --prep-reference "$(jq -r '.data.stack_summary_reference.payload_path' stack-prep.compact.json)" \
      --payload-session-id <payload-session-id> \
      --stdout-mode compact \
      --format json \
  > stack-plan.compact.json

jq '{exit_code, valid:.data.valid, summary:.data.summary, batches:(.data.batches|map({batch_id, item_count, approval_required}))}' \
  stack-plan.compact.json
```

Rules:

- Proceed only when the helper exits `0`, `data.valid == true`, and
  `data.validation.all_valid == true`.
- Use compact `data.batches` for the transcript-visible execution plan.
- Load the full stack plan from `data.stack_plan_reference.payload_path` before
  drift checks and payload building; that full artifact preserves PR provenance
  and deterministic `pre_existing`, `local`, `single_file`, `cross_cutting`,
  `complex` ordering.
- Preserve full-plan `informational`; never hide unresolved review threads
  inside informational counts.
- Use `data.decision_docket` for approval-required work, informational review
  thread decisions, and non-automation discussion comments that may need reply.
- Display a compact plan before editing: PR number/branch, source kind, review
  ID/comment ID/`(pr_number, thread_id)`, path/line when available, summary,
  action summary, complexity, and approval requirement.
- Auto-proceed only for approved `pre_existing`, `local`, and `single_file`
  items after local verification. Ask before `cross_cutting`, `complex`,
  informational-thread choices, and top-level human replies.

### 4. Create or reuse the omnibus branch

Select the branch action only after the stack plan validates.

**Already-addressed fast path:** if the validated plan's selected batches
require no code changes (every decision will be `explained` or `pre_existing`
after verification against the stack tip), skip omnibus-branch creation
entirely — proceed directly to the drift gate (step 6) and payload building,
and record "no omnibus branch needed" in the final report.

- Preserve the stack prefix from the stack tip branch when present:
  `<stack-prefix>/<branch-slug>`.
- Reuse one verified compatible child omnibus branch before creating any new
  branch. Compatible means Graphite topology or commit/branch context proves it
  belongs to the current stack-wide feedback workflow.
- If multiple compatible branches remain, ask the user; in non-interactive
  contexts, stop.
- If creating, derive a 3-7 word kebab-case semantic slug from the validated
  stack plan's coherent theme, approved batch, paths, or shared mechanism. Do
  not derive from the raw user request alone. Ask/stop on ambiguity.
- Show reuse/adopt/create plus branch name immediately before acting.

When creating a new branch, run from the stack tip:

```bash
gt create <branch-name> -m "Address PR stack feedback"
```

Do not push or submit by default.

### 5. Execute approved batches

The validated `stack-feedback-plan` data object is the source of truth.

For each approved batch:

1. Inspect referenced code, not just comment excerpts.
2. Verify bot comments against local context before editing.
3. Make the smallest coherent fix.
4. For false positives or already-fixed items, do not change code; prepare a
   factual `explained` resolution message.
5. Run targeted tests/typechecks for touched packages plus formatter checks.
   Escalate to full `just` when changes cross package/language boundaries or no
   targeted check is obvious.
6. If formatter/linter failures occur, use repo-approved autofixes (`just fix`,
   `just dprint-fix`) rather than hand-formatting. Rerun checks.
7. Commit coherent batches. Split unrelated work even when items share a
   complexity bucket.
8. Record stack-plan `batch_id`, PR number, `(pr_number, thread_id)`, source
   item identity, decision mode, commit SHA, changed files, and validation
   evidence for every review-thread item addressed, skipped, explained, or
   deferred.

Commit message format:

```text
Address PR stack feedback (batch N/M)

- <summary 1>
- <summary 2>
```

For explained-only runs (the fast path in step 4), the "committed fixes plus
passing checks" mutation precondition reads as: verification against current
stack-tip code plus checks already green on the tip. There is no new commit to
point at; `explained`/`pre_existing` resolution messages reference the existing
tip state.

### 6. Required pre-mutation drift check

Immediately before any review-thread mutation, fetch fresh current stack
feedback with resolved threads included:

```bash
printf '%s' '<same-stack-json>' \
  | pr-address exec stack-feedback-prep \
      --include-resolved \
      --payload-session-id <payload-session-id> \
      --stdout-mode compact \
      --format json \
  > stack-current-prep.compact.json
```

Then compare the saved validated stack plan artifact to the fresh full prep
artifact directly by reference — no stdin payload and no artifact embedding:

```bash
pr-address exec stack-feedback-diff-current \
  --stack-plan-reference "$(jq -r '.data.stack_plan_reference.payload_path' stack-plan.compact.json)" \
  --current-prep-reference "$(jq -r '.data.stack_summary_reference.payload_path' stack-current-prep.compact.json)" \
  --format json
```

Proceed to payload building only when the diff exits `0`, `data.valid == true`,
and `data.safe_to_resolve_planned == true`.

Route drift explicitly:

- `planned_still_unresolved`: eligible for payload building when backed by a
  committed omnibus batch and passing checks.
- `planned_already_resolved`: do not resolve again; skip/rebuild decisions and
  report.
- `new_unresolved_threads`: reclassify/replan or ask the user before
  continuing.
- `missing_or_outdated_planned_threads`: stop, inspect, and replan or ask.
- Missing `--include-resolved` provenance or other warnings: refetch correctly;
  do not proceed.
- `errors`: stop and fix the input, stack, or plan mismatch.

### 7. Build and run mutation payloads

Automatic resolution is limited to inline review-thread items that were
classified actionable or explicitly approved, included in the validated stack
plan, addressed or explained by a committed omnibus batch, still safe after
`stack-feedback-diff-current`, and backed by successful required checks.

For each selected stack batch represented in an omnibus commit:

1. Build one explicit decision for every selected review-thread item, including
   `pr_number` and `thread_id`:
   - `action: "resolve"`, `mode: "fixed"`, plus stack-tip omnibus wording for
     code changes.
   - `action: "resolve"`, `mode: "explained"`, plus factual explanation for
     false positives or already-fixed items.
   - `action: "resolve"`, `mode: "pre_existing"` for moved/restructured
     pre-existing bot comments.
   - `action: "skip"` with `skip_reason` for deferred threads.
2. Include exact `batch_id`, batch `commit_sha`, `continue_on_error: true`, and
   `decisions[]` in the builder input; supply the stack plan with
   `--stack-plan-reference` instead of embedding it.
3. Build non-mutating per-PR payloads:

   ```bash
   printf '%s' '{"batch_id":"local","commit_sha":"<sha>","continue_on_error":true,"decisions":[...]}' \
     | pr-address exec build-stack-resolve-thread-payloads \
         --stack-plan-reference "$(jq -r '.data.stack_plan_reference.payload_path' stack-plan.compact.json)" \
         --format json
   ```

4. For each `data.payloads[]` entry where `payload_ready == true`, pipe
   `payload` to the mutating helper:

   ```bash
   printf '%s' '<data.payloads[n].payload-json>' \
     | pr-address exec resolve-thread-batch --format json
   ```

5. Per-PR `resolve-thread-batch` runs are independent and the payload store is
   concurrency-safe (sequence-numbered artifacts created with exclusive-create
   plus retry), so run the per-PR mutating calls in parallel rather than a
   serial loop.
6. Do not call `resolve-thread-batch` for entries where `payload_ready == false`;
   report warnings, skipped items, and ignored non-thread items.
7. Fix builder decision errors before mutating GitHub. Report mutating-helper
   partial failures with failed thread IDs and retry/fallback guidance.

Use `build-resolve-thread-batch-payload` only for single-PR `plan-feedback`
runs; it does not accept merged `stack-feedback-plan` output.

For PR-level reviews and discussion comments, use `reply-to-review` and
`reply-to-discussion` as appropriate. Ask before replying to top-level human
comments unless the user already approved that action in the plan.

### 8. Final verification and handoff

After mutation, fetch compact final verification evidence scoped to what the
run touched. When mutations touched half the stack or fewer, prefer per-PR
`get-feedback --include-resolved` on only the mutated PRs:

```bash
pr-address exec get-feedback <pr-number> \
  --include-resolved \
  --payload-session-id <payload-session-id> \
  --format json
```

Full-stack prep remains the option when whole-stack before/after counts are
needed for the report:

```bash
printf '%s' '<same-stack-json>' \
  | pr-address exec stack-feedback-prep \
      --include-resolved \
      --payload-session-id <payload-session-id> \
      --stdout-mode compact \
      --format json \
  > stack-final-prep.compact.json
```

This final fetch is post-mutation verification, not the pre-mutation drift
gate.

Report:

- PRs scanned and before/after unresolved counts.
- Validated stack batches and approvals.
- Actionable items addressed, skipped, explained, or deferred.
- Commits and commit SHA(s).
- Threads resolved and any mutation failures.
- Discussion/review replies posted or awaiting approval.
- Checks run and results.
- Omnibus branch name.
- Manual next steps: review local omnibus commit(s), run
  `gt submit --no-interactive` when ready, wait for CI, and re-request review if
  needed.

Never push or submit unless the user explicitly asks for that extra step.

## Rules

- Do not show or execute a stack plan until `stack-feedback-plan` validates all
  classifications and returns a valid merged stack plan.
- Do not paste full raw payload JSON into the transcript by default.
- Do not manually reconstruct per-PR `plan-feedback` wrappers from a merged
  stack plan.
- Do not manually compare pre-mutation current feedback; use fresh
  `stack-feedback-prep --include-resolved` plus `stack-feedback-diff-current`.
- Do not call GitHub mutation helpers until after committed fixes, successful
  required checks, a passing `stack-feedback-diff-current`, and helper-built
  payload validation.
- Use `(pr_number, thread_id)` for stack review-thread mutation decisions and
  evidence.
- Do not hide unresolved review threads inside informational counts.
- Treat obvious top-level Vercel, Graphite, roaster summary, and GitHub Actions
  status comments as informational by default; inline review threads remain the
  source of truth for actionable roaster findings.
- Do not show automation discussion bodies in the decision docket unless direct
  request language or uncertainty is detected; summarize counts by reason.
- Do not guess helper field names or enum values; read the pr-address routing
  index (`pr-address/references/cli-reference.md`) plus the mapped category
  file's section for that helper, or run `--json-schema`.
- Inline review-thread resolution is automatic only for matched addressed
  threads. Top-level human replies, skip/defer choices requiring judgment, and
  submitting/pushing remain confirmation-gated.
- Do not commit a broken batch.
- Record skipped items in the final summary.

## CLI push-down candidates

Already covered by current `pr-address` helpers:

- Stack-wide payload-backed feedback prep and classification template creation:
  `stack-feedback-prep`.
- Stack-wide validation, deterministic plan merge, decision docket, and
  automation discussion summary: `stack-feedback-plan`.
- Pre-mutation current-feedback drift comparison:
  `stack-feedback-diff-current`.
- Stack-native per-PR resolution payload assembly:
  `build-stack-resolve-thread-payloads`.
- Single-PR unresolved-thread completeness and planning:
  `validate-feedback-classification` plus `plan-feedback`.
- Single-PR/per-batch resolution payload assembly:
  `build-resolve-thread-batch-payload`.
- Stack branch → open PR mapping in one call: `map-branch-prs` (Graphite-neutral
  — the caller supplies branch names, so no `gt`-named command is required).

Future deterministic helpers to consider:

- rerun/idempotency summaries across stack PRs
- compact stack finalization summaries
