---
name: internal-pr-stack-address
description: "Create a stack-tip omnibus PR that addresses unresolved feedback across every PR in the current Graphite stack, then resolve the original review threads. Use when the user asks to address all feedback in a stack, create an omnibus follow-up PR, retroactively resolve stack comments, or run pr-address across a stack. Internal asdl workflow."
allowed-tools:
  - "Bash(gt *)"
  - "Bash(git *)"
  - "Bash(gh *)"
  - "Bash(uv run *)"
  - "Bash(just *)"
  - "Read"
  - "Edit"
  - "Write"
  - "Grep"
  - "Glob"
metadata:
  internal: true
---

# internal-pr-stack-address

Address unresolved feedback across every PR in the current Graphite stack by
creating a new child branch at the stack tip, committing fixes there, and
resolving the original lower-stack review threads with explicit omnibus wording.

This is intentionally **not** normal `pr-address`: `pr-address` is scoped to the
current branch's PR. This skill is stack-scoped and creates a follow-up omnibus
PR branch at the tip.

## When to use

Use when the user explicitly wants a stack-wide feedback pass, for example:

- "address all feedback in this stack"
- "make an omnibus PR for stack feedback"
- "retroactively resolve comments across the stack"
- "run pr-address across every PR in the stack"

Do not trigger from ordinary single-PR review feedback requests; use
`pr-address` for those.

## Guarantees

- Operates on the full current Graphite stack by default.
- Requires strict open-PR coverage for stack branches; stop on missing PRs
  unless the user explicitly overrides.
- Creates or reuses one child omnibus branch at the stack tip; verified
  compatible branches are adopted before any new semantic branch is created.
- When no compatible branch exists, chooses a specific semantic suffix when the
  validated stack plan has a coherent theme; otherwise asks in interactive
  contexts or stops on ambiguity in non-interactive contexts.
- Does **not** run `gt submit`, `git push`, or `gh pr create` by default.
- Uses one payload session as the durable stack run record; normal operation
  does not create ad hoc `/tmp` scratch directories.
- Uses `stack-feedback-prep` and `stack-feedback-plan` for deterministic stack
  feedback orchestration when available; full inline payload mode is only for
  explicit debugging or migration fallback.
- Requires every stack PR's classification to validate before stack planning
  proceeds.
- Derives executable batches from validated `plan-feedback` semantics through
  `stack-feedback-plan`, not hand-grouped scratch notes.
- Shows a compact execution plan before editing.
- Auto-executes only mechanical/simple feedback; asks before complex or
  human-sensitive work.
- Runs targeted checks plus formatter checks before committing and before
  resolving GitHub comments.
- Automatically resolves addressed inline review threads after re-fetching
  feedback, confirming the unresolved-thread set still matches the committed
  addressed items, passing required checks, and validating helper-built
  resolution payloads.
- Builds GitHub thread-resolution payloads with
  `build-resolve-thread-batch-payload`, then mutates only through
  `resolve-thread-batch`; never hand-roll review-thread mutation API calls.

## Required supporting skills

Load these when their domain is touched:

- `graphite` — stack topology, branch creation, and navigation.
- `pr-address` — payload feedback helpers, classifier contract, deterministic
  planning, and GitHub mutation helpers. Read `references/cli-reference.md`
  before calling each `pr-address exec` helper and
  `references/feedback-classifier.md` before classification.
- `internal-code-gh` — any `gh` use beyond simple PR listing/viewing.
- Language/test skills as needed for code changes, e.g. `typescript-style`,
  `dignified-python`, `pytest`, or fake-driven testing skills.

## Workflow

### Shared helper conventions

- Payload session: choose one valid stack-wide payload session id using the
  `pr-address` CLI reference as the source of truth for allowed syntax. Pass it
  to every default payload feedback command with `--payload-session-id` or set
  `ASDL_PAYLOAD_SESSION_ID` consistently for the run.
- Helper exit codes: `0` means use the returned data; `1` means validation,
  semantic, or operation-level failure with structured diagnostics; `2` means
  malformed input, precondition failure, or unsupported workflow state and should
  stop the run. For mutating helpers, report partial result data and do not roll
  back successful mutations.
- Feedback detail lookup: use `read-feedback-details` for batched selected
  body/item lookup and `read-feedback-detail` only for exact one-off
  lookup/debugging. Do not paste full raw payload artifacts into the transcript
  or switch to inline payload mode by default.

### 1. Preflight

1. Verify prerequisites:
   - `gh auth status` succeeds.
   - `gt ls --stack` succeeds.
   - The `pr-address` runner exists and is executable. Resolve it from the
     installed `pr-address` skill directory, e.g.
     `.agents/skills/pr-address/scripts/pr-address-run`.
2. Inspect `git status --short --branch`.
3. Require a clean worktree before stack navigation or branch creation. If the
   tree is dirty, stop unless the user explicitly asks to carry existing changes
   into the omnibus branch.
4. Determine the full current Graphite stack from trunk through tip. If the user
   starts in the middle, identify the stack tip and move there only after the
   worktree safety check.
5. Resolve every non-trunk stack branch to an open PR with `gh pr list` or
   equivalent. Stop if any branch lacks an open PR unless the user explicitly
   chooses to continue.
6. Choose the stack-wide payload session id for this invocation following the
   shared helper convention above.
7. If running in an asdl checkout and launching classifier subagents, read
   `.asdl/prompts/subagent-launch.md` before dispatch.

### 2. Fetch stack feedback into payload artifacts

Build an explicit Graphite-neutral stack input from the open PR coverage found
in preflight:

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

Then run the stack prep helper:

```bash
printf '%s' '<stack-json>' \
  | <pr-address-runner> exec stack-feedback-prep \
      --payload-session-id <payload-session-id> \
      --format json
```

Rules:

- Default to unresolved threads only.
- Include resolved threads only for explicit reference/audit mode.
- Preserve `data.stack[]` entries, especially each compact `manifest`, raw
  payload reference, generated classification template, summary references, and
  `discussion_triage`.
- If a PR has no reviews, unresolved review threads, or discussion comments,
  include it in the scan summary but produce no plan items for it.
- Top-level automation/status comments are summarized in `discussion_triage`;
  they still remain in the manifest and must be classified exactly once.

Fallback: if `stack-feedback-prep` is unavailable, use the older per-PR
`get-feedback` + `classification-template` loop, but keep artifacts in the same
payload session and report the missing helper as a push-down gap. Do not create
ad hoc scratch directories in normal operation.

`summarize-feedback` may be used for quick read-only triage when no
classification/execution will follow. Do not use it as the normal source of
truth here: it lacks payload locators and does not support validated
classification/planning.

### 3. Classify each PR

For each `data.stack[]` prep entry with feedback:

1. Read `skills/pr-address/references/feedback-classifier.md`. Use its packet
   schema, completeness invariant, enum values, and classification rules.
2. Start from `classification_template.classification_template` and classify
   every review, unresolved review thread, and discussion comment exactly once.
3. Classify with a payload-aware path:
   - Preferred: launch one focused subagent per PR, with a title like
     `Classify stack feedback for PR <number>`, and include that PR's compact
     manifest, raw payload path, relevant body locators, generated template,
     classifier rules, and exact strict JSON output contract. In Pi, use
     `dispatch_runner_subagent` with the canonical cheap classification model
     named in the shared Pi launch policy for ordinary bounded per-PR stack
     classification.
   - Follow `feedback-classifier.md` for escalation conditions and the shared Pi
     launch policy for any concrete escalation model target.
   - Follow the shared feedback-detail lookup policy.
   - If no subagent/model routing is available, classify directly using the same
     compact manifest, payload locators, generated template, and classifier
     rules.
4. Treat `discussion_triage` as advisory only. It can suggest that Vercel,
   Graphite, roaster summary, or GitHub Actions comments are informational, but
   it does not remove them from classification coverage.

### 4. Validate classifications and merge a stack-wide plan

Run the stack plan helper with the prep data and one classification per PR:

```bash
printf '%s' '{"prep":{...},"classifications":[{"pr_number":1009,"classification":{...}}]}' \
  | <pr-address-runner> exec stack-feedback-plan \
      --payload-session-id <payload-session-id> \
      --format json
```

Rules:

- Apply the shared helper exit-code convention. For validation failures, use
  `data.validation.per_pr[]` counts and errors plus original manifest/template
  evidence to correct classifications before rerunning.
- Do not show or execute a stack plan unless `data.valid` and
  `data.validation.all_valid` are true.
- Use `data.batches` as the merged stack plan. It preserves PR provenance and
  follows `plan-feedback` batch order: `pre_existing`, `local`, `single_file`,
  `cross_cutting`, `complex`.
- Preserve `data.informational` explicitly; never hide unresolved review threads
  inside counts.
- Use `data.automation_discussion_summary` to report automation-only discussion
  comments compactly.
- Use `data.decision_docket` for approval-required work, informational review
  thread decisions, and non-automation discussion comments that may need a
  reply.

Respect plan semantics:

- Auto-proceed only for `pre_existing`, `local`, and `single_file` after local
  code verification.
- Ask before `cross_cutting` and `complex` work.
- Ask for user decisions on informational review threads when
  `user_decision_required` is true (`act`, `dismiss`, or `skip`).
- Ask before replying to top-level human reviews/discussion comments unless the
  user already approved that action in the plan.

Display a compact plan before editing. Include PR number and branch, source
kind, thread/comment/review ID, path/line when available, one-line summary,
action summary, complexity, and approval/user-decision requirement.

Fallback: if `stack-feedback-plan` is unavailable, run
`validate-feedback-classification` and `plan-feedback` per PR and merge the
validated plans manually in the same batch order, preserving the same
provenance. Report the missing helper as a push-down gap.

### 5. Create or reuse the omnibus branch

Select the branch action after the stack plan validates. Preserve the stack
prefix from the stack tip branch when present: if the tip branch has a prefix
before `/`, new branch names use `<stack-prefix>/<branch-slug>`. If the tip has
no prefix, use `<branch-slug>` as the full branch name.

Discover compatible existing omnibus branches before deriving a new slug. A
compatible candidate is one of:

- a verified omnibus branch whose Graphite parent is the current stack tip;
- a same-prefix branch previously used for this stack-wide feedback workflow,
  verified from Graphite topology or commit/branch context.

Rerun/idempotency policy:

- Reuse one verified compatible branch before creating any new branch.
- Prefer a verified current child omnibus branch.
- If multiple compatible candidates remain, ask the user which one to use; in
  non-interactive contexts, stop instead of creating another branch.
- Do not derive a new semantic slug when an existing compatible branch can be
  verified, even if a new derivation would choose a different slug.
- Re-fetch feedback and act only on still-unresolved items.
- Ignore already-resolved threads with existing `pr-address` resolution markers.
- Do not create duplicate branches or duplicate resolution replies.

When no compatible branch exists, choose a new branch slug from the validated
merged stack plan. Derive it from `data.batches`, source paths, action
summaries, and the shared workflow/mechanism represented by the approved work;
do not derive it from the raw user request alone. Use kebab-case, 3-7 specific
words, and prefer a specific action/outcome phrase such as
`fix-payload-session-validation`, `align-resolution-payload-shape`, or
`tighten-stack-feedback-planning`. Avoid generic-only semantic slugs that could
apply to any feedback run. Do not include dates, random IDs, PR numbers, or
opaque hashes. Add a numeric suffix only when needed.

Derive a semantic slug only when the plan has one coherent theme, one approved
batch that clearly names the work, or one shared workflow/mechanism across the
approved work. If batches are unrelated, no shared mechanism is evident, or
sanitization leaves only a generic phrase, ask an interactive user for a branch
slug. In non-interactive contexts, do not pause or guess: stop with an ambiguity
diagnostic.

Show the final branch action immediately before acting: reuse/adopt/create plus
the branch name. Allow an interactive user to redirect or override before a new
branch is created or an existing branch is adopted. In non-interactive contexts,
proceed only with an unambiguous deterministic action.

When creating a new branch, use Graphite from the stack tip:

```bash
gt create <branch-name> -m "Address PR stack feedback"
```

Do not submit or push by default.

### 6. Execute approved batches

Execution is driven by the merged `plan-feedback` output.

For each approved batch:

1. Inspect referenced code, not just comment excerpts.
2. Verify bot comments against local context before editing.
3. Make the smallest coherent fix.
4. For false positives or already-fixed items, do not change code; prepare a
   factual `explained` resolution message.
5. Follow the shared feedback-detail lookup policy when exact original
   bodies/items are needed.
6. Run targeted tests/typechecks for touched packages plus formatter checks.
   Escalate to full `just` when changes cross package/language boundaries or no
   targeted check is obvious.
7. If formatter/linter failures occur, use repo-approved autofixes (`just fix`,
   `just dprint-fix`) rather than hand-formatting. Rerun checks.
8. Commit coherent batches. A stack-wide batch may include multiple PRs only
   when the code change is coherent and resolution payloads can still be built
   per PR/per source batch afterward. Split unrelated work even if it shares a
   complexity bucket.
9. Record which per-PR `plan-feedback` batch IDs/items each commit addressed;
   this evidence is required for resolution payload building.

Commit message format:

```text
Address PR stack feedback (batch N/M)

- <summary 1>
- <summary 2>
```

### 7. Automatically resolve original inline threads

Before any GitHub mutation:

1. Re-fetch feedback for all stack PRs with `get-feedback` using the same
   payload session id or a clearly related verification id.
2. Confirm the unresolved-thread set still matches the planned addressed items.
3. Confirm every thread selected for resolution is backed by a committed
   omnibus batch and successful required checks.
4. Show the omnibus branch name, batch commit SHA(s), affected PR numbers, and
   exact resolution count.
5. Proceed automatically with helper-built inline-thread resolution payloads for
   the matched addressed threads.
6. Remind the user to submit the omnibus PR promptly after resolution.

Automatic resolution is limited to inline review-thread items that were
classified actionable or approved as pre-existing, included in the validated
stack plan, addressed or explained by a committed omnibus batch, and still
unresolved at the pre-mutation re-fetch. Do not automatically resolve
informational threads, skipped/deferred items, or top-level human comments
unless the validated plan and prior user decisions explicitly require that
action.

Important: the merged `stack-feedback-plan` result is not the input to
`build-resolve-thread-batch-payload`. That builder currently accepts only a
per-PR `plan-feedback` result plus one selected per-PR batch. Do not pipe the
stack plan to it. Until a stack-native payload builder exists, derive or reuse
the corresponding per-PR `plan-feedback` data for each PR/batch before building
thread-resolution payloads.

For each PR and selected `plan-feedback` batch represented in an omnibus commit:

1. Build explicit decisions for every review-thread item in that selected batch:
   - `action: "resolve"`, `mode: "fixed"`, and stack-tip omnibus wording for
     code changes.
   - `action: "resolve"`, `mode: "explained"`, and a factual explanation for
     false positives or already-fixed items.
   - `action: "resolve"`, `mode: "pre_existing"` for moved/restructured
     pre-existing bot comments.
   - `action: "skip"` with `skip_reason` for explicitly deferred threads.
2. Include `continue_on_error: true` in the builder input.
3. Build the non-mutating payload:

   ```bash
   printf '%s' '<builder-input-json>' \
     | <pr-address-runner> exec build-resolve-thread-batch-payload --format json
   ```

4. If `data.payload_ready == true`, pipe `data.payload` to the mutating helper:

   ```bash
   printf '%s' '<data.payload-json>' \
     | <pr-address-runner> exec resolve-thread-batch --format json
   ```

5. If `data.payload_ready == false`, do not call `resolve-thread-batch`; report
   warnings/skipped/non-thread items.
6. Apply the shared helper exit-code convention: fix builder decision errors
   before mutating GitHub, and report mutating-helper partial failures with
   failed thread IDs and retry/fallback instructions.

Resolution messages must use canonical `pr-address` helper formatting and
explicit stack-tip omnibus wording, for example:

```text
Fixed in the stack-tip omnibus commit by converting object-shape aliases to interfaces.
```

For PR-level reviews and discussion comments, continue using `reply-to-review`
and `reply-to-discussion` as appropriate. Ask before replying to top-level human
comments unless the user already approved that action in the plan. Read each
helper's CLI reference entry immediately before calling it.

### 8. Verify and hand off

After resolution, re-fetch every stack PR with payload-mode `get-feedback`:

```bash
<pr-address-runner> exec get-feedback <pr_number> \
  --payload-session-id <payload-session-id> \
  --format json
```

Report:

- PRs scanned.
- Feedback counts before/after, especially unresolved review threads.
- Validated per-PR plans produced.
- Actionable items addressed.
- Commits created and commit SHA(s).
- Threads resolved.
- Resolution failures, if any.
- Discussion/review replies posted, if any.
- Top-level human comments skipped or awaiting approval.
- Checks run and results.
- Omnibus branch name.
- Manual next steps:
  1. Review the local omnibus commit(s).
  2. Run `gt submit --no-interactive` when ready.
  3. Wait for CI.
  4. Re-request review if needed.

Never push or submit unless the user explicitly asks for that extra step.

## Rules

- Do not show or execute a stack plan until every PR's classification has passed
  `validate-feedback-classification` and every actionable plan came from
  `plan-feedback`.
- Do not paste full raw payload JSON into the transcript by default.
- Do not use `--payload-mode inline` except for explicit debugging/migration
  fallback.
- Do not hand-roll `resolve-thread-batch` payloads; use
  `build-resolve-thread-batch-payload`.
- Do not call GitHub mutation helpers until after re-fetch validation,
  successful required checks, committed fixes, and helper-built payload
  validation.
- Inline review-thread resolution is automatic for matched addressed threads;
  top-level human replies, skip/defer decisions requiring judgment, and
  submitting/pushing the omnibus branch remain confirmation-gated.
- Do not hide unresolved review threads inside informational counts.
- Treat obvious top-level Vercel, Graphite, roaster summary, and GitHub Actions
  status comments as informational by default; inline review threads remain the
  source of truth for actionable roaster findings.
- Do not show automation discussion bodies in the decision docket unless direct
  request language or uncertainty is detected; summarize counts by reason.
- Do not guess helper field names or enum values; read
  `pr-address/references/cli-reference.md` or run `--json-schema`.
- Do not commit a broken batch.
- Record skipped items in the final summary.

## CLI push-down candidates

Already covered by current `pr-address` helpers:

- Stack-wide payload-backed feedback prep and classification template creation:
  `stack-feedback-prep`.
- Stack-wide validation, deterministic plan merge, decision docket, and
  automation discussion summary: `stack-feedback-plan`.
- Per-PR unresolved-thread completeness:
  `validate-feedback-classification` plus `plan-feedback`.
- Per-PR/per-batch resolution payload assembly:
  `build-resolve-thread-batch-payload`.

Future deterministic helpers to consider:

- stack branch → open PR mapping, behind an explicit Graphite/`gt` command
- rerun/idempotency summaries across stack PRs
