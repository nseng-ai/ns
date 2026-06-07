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
- Creates or reuses a child branch at the stack tip named
  `<stack-prefix>/address-stack-feedback` by default.
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
- Requires explicit final confirmation before resolving GitHub threads, because
  the omnibus branch may still be local-only.
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
6. Choose one stack-wide payload session id for this invocation, matching
   `^[a-z0-9][a-z0-9._-]{0,127}$`, for example
   `pr-stack-address-20260604t120000z-a1`. Pass it to every default payload
   feedback command with `--payload-session-id <payload-session-id>` or set
   `ASDL_PAYLOAD_SESSION_ID` for all such commands.
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
- Stop or report clearly if the helper returns `exit_code: 2`.
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
   - Preferred: launch a focused subagent with the compact manifest, raw payload
     path, relevant body locators, generated template, classifier rules, and
     strict output contract. In Pi, use `dispatch_runner_subagent` with a
     cheap/fast configured model for ordinary bounded classification.
   - Use the default/strong model for ambiguous feedback, validation failure,
     omitted items, or complex cross-file reasoning.
   - Do not paste the full `.raw.json` payload artifact into the transcript.
   - If no subagent/model routing is available, classify directly using
     `read-feedback-details` for batched selected body/item lookup and
     `read-feedback-detail` only for exact one-off lookup/debugging.
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

- If `stack-feedback-plan` exits `1`, use `data.validation.per_pr[]` counts and
  errors plus original manifest/template evidence to correct classifications,
  then rerun. If it still fails, stop and report diagnostics.
- If it exits `2`, treat it as malformed workflow input and stop.
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

Default branch name: `<stack-prefix>/address-stack-feedback`, where
`<stack-prefix>` is the prefix before `/` from the stack's top branch when
present. Add a numeric suffix only when needed.

Rerun/idempotency policy:

- If the omnibus branch already exists, reuse it when it is the child of the
  current stack tip or clearly belongs to this stack.
- Re-fetch feedback and act only on still-unresolved items.
- Ignore already-resolved threads with existing `pr-address` resolution markers.
- Do not create duplicate branches or duplicate resolution replies.

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
5. Use `read-feedback-details` when multiple exact original bodies/items are
   needed. Use `read-feedback-detail` only for exact one-off lookup/debugging.
   Do not switch to full inline payloads by default.
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

### 7. Resolve original inline threads

Before any GitHub mutation:

1. Re-fetch feedback for all stack PRs with `get-feedback` using the same
   payload session id or a clearly related verification id.
2. Confirm the unresolved-thread set still matches the planned addressed items.
3. Show the omnibus branch name, batch commit SHA(s), affected PR numbers, and
   exact resolution count.
4. Ask the user for explicit confirmation because the omnibus branch may still
   be local-only.
5. Remind the user to submit the omnibus PR promptly after resolution.

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
6. If the builder exits `1`, fix structured decision errors before mutating
   GitHub.
7. If `resolve-thread-batch` exits `1`, report partial result data, including
   failed thread IDs and retry/fallback instructions. Do not roll back
   successful resolutions.

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
- Do not call GitHub mutation helpers before explicit final confirmation.
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
