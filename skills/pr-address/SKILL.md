---
name: pr-address
description: "Address PR review comments end-to-end on the current branch's PR. Use only when the user explicitly invokes `pr-address` by name in their current harness; do not trigger from generic natural-language requests. Fetches unresolved review threads and discussion comments, classifies them with LLM judgment (actionable vs informational, bot noise, pre-existing issues), plans batched execution, implements changes, commits in batches, and resolves threads. Never pushes - the user pushes manually after reviewing local commits."
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

<!-- PUBLIC SKILL: Do not reference twerk-internal module paths or class names in this file. Describe CLI operations, not implementation. See AGENTS.md section "Public Skill Authoring". -->

# pr-address

Address review comments on the current branch's PR, end-to-end. The skill
prepares one normalized feedback snapshot, classifies it with LLM judgment,
executes approved batches, commits locally, and resolves or replies to the
matching GitHub feedback. It never pushes.

## When to use

Run this skill only when the user explicitly invokes `pr-address` by name in
their current harness. Do not trigger it from natural-language requests like
"fix review feedback".

If the user wants a read-only pass, stop after the execution plan. Do not
edit code, commit, or mutate GitHub.

## Guarantees

- Works only on the current branch's PR.
- Never pushes. The user pushes manually after reviewing local commits.
- Every unresolved inline review thread must be classified explicitly.
- `cross_cutting`, `complex`, and informational items require user input
  before execution.
- GitHub mutations go through `pr-address exec` operations, not raw `gh api`
  calls.

## How `pr-address` is invoked

This skill bundles a wrapper at
`scripts/pr-address-run` that dispatches to either `uv run pr-address`
(when the current working directory is inside a twerk checkout) or
`uvx --from git+https://github.com/dagster-io/twerk pr-address`
(otherwise), so the skill works without a local clone.

Resolve the wrapper from this skill's own directory, not from a
harness-specific path. For the rest of this document,
`<pr-address-runner>` means the executable at `<skill-dir>/scripts/pr-address-run`,
where `<skill-dir>` is the directory containing this `SKILL.md`.

Common locations are:

- `skills/pr-address/scripts/pr-address-run` in a twerk checkout
- `.agents/skills/pr-address/scripts/pr-address-run` in an installed skill mirror

Wherever this skill or `references/cli-reference.md` shows `pr-address ...`,
substitute `<pr-address-runner>`. For example:

```bash
echo '{}' | <pr-address-runner> exec json prepare-run
```

`TWERK_PR_ADDRESS_MODE=local|prod` overrides the auto-detection if needed.

## Prerequisites

1. `git status --porcelain` is empty.
2. `test -x <pr-address-runner>` succeeds.
3. `gh auth status` is healthy.
4. The current branch has an open PR.

Stop on the first failed prerequisite and report the problem clearly.

## Workflow

### 1. Preflight

Run the prerequisite checks above before fetching any feedback.

If the surrounding harness is in a planning-only mode, stop after printing
the execution plan. Do not edit files, commit, or call GitHub mutation
commands.

### 2. Prepare the run

Use the composite helper:

- `<pr-address-runner> exec json prepare-run`

Pass `{"include_all_threads": true}` only when the user explicitly wants
resolved threads included for reference. Otherwise let it default to `false`.

`prepare-run` is the source of truth for the mechanical setup. It:

- resolves the current branch and its PR
- fetches one feedback snapshot with resolved threads included
- reopens contested threads previously resolved by `pr-address`
- returns normalized `reviews`, `review_threads`, and `discussion_comments`
- returns `restructured_files` for moved/copied paths
- returns any warnings that should be shown to the user before continuing

If the result has `found: false`, stop and report that there is no PR for the
current branch.

If `reviews`, `review_threads`, and `discussion_comments` are all empty,
report that there is no outstanding feedback and stop.

### 3. Classify and plan

Classify the normalized payload from `prepare-run`.

This is judgment work. Keep it in the model. Do not turn these rules into a
Python classifier.

`prepare-run` provides four inputs:

- `reviews` - PR-level review submissions
- `review_threads` - normalized inline review threads
- `discussion_comments` - top-level PR discussion comments
- `restructured_files` - moved/copied paths detected from git diff

`review_threads` is already normalized:

- contested threads previously resolved by `pr-address` may already be
  reopened and marked unresolved
- if the user asked for all threads, resolved reference threads may still be
  present

Required classifier outputs:

- one explicit record for every unresolved inline review thread
- `actionable_reviews` for PR-level reviews that need action
- `discussion_actions` for discussion comments that need action or a reply
- `informational_count` for non-thread items dropped as noise or acknowledgments
- each explicit actionable record includes:
  - id (`thread_id`, `review_id`, or `comment_id`)
  - `action_summary`
  - `complexity`
  - `pre_existing` when relevant

Before showing the plan, verify the completeness invariant:

- every unresolved thread from `prepare-run.review_threads` appears exactly once
- resolved threads present only because of `include_all_threads=true` are
  reference-only and may be omitted
- unresolved review threads must never disappear into `informational_count`

If you cannot account for every unresolved review thread, stop and
re-classify. A partial thread list is a bug.

Evaluate classification rules in order. First match wins.

PR-level reviews:

1. `APPROVED` -> drop silently.
2. `CHANGES_REQUESTED` with a body -> actionable. Usually `cross_cutting` or
   `complex`.
3. `CHANGES_REQUESTED` with no body -> actionable with summary "Reviewer
   requested changes; inspect inline threads for specifics".
4. `COMMENTED` with no body -> drop silently.
5. `COMMENTED` with a body:
   - actionable if it asks for a change or answer
   - drop if it is praise, acknowledgment, or a non-actionable observation

Inline review threads:

1. Resolved reference-only threads -> ignore unless the user explicitly wants
   to act on them.
2. Thread on a moved/copied `new_path` where the first commenter is a bot ->
   actionable, `pre_existing=true`, `complexity=pre_existing`.
3. Outdated thread (`line: null` or `is_outdated=true`) -> actionable. Mark
   the summary so execution knows to verify whether the issue is already fixed.
4. Bot nit or likely false positive -> actionable, but execution must verify
   the code before changing anything.
5. Normal request or suggestion -> actionable.
6. Question-only or approval-only thread -> informational.

Discussion comments:

1. Obvious CI/status/stack automation with no request -> drop silently.
2. Request for change, clarification, or reply -> actionable.
3. Human acknowledgment, thanks, or FYI -> informational.
4. Comment that only summarizes prior work -> drop silently.

Treat a comment as bot-generated when the evidence is strong:

- author login ends with `[bot]`
- body is obviously auto-generated boilerplate
- the same style appears across many comments like a linter pass

When in doubt, treat the author as human. False negatives are safer than
silently dropping real review feedback.

Assign `complexity` only to actionable items:

- `pre_existing` - moved/restructured bot comment; no code change expected
- `local` - one file, one location, a small edit
- `single_file` - one file, multiple locations
- `cross_cutting` - multiple files affected
- `complex` - architectural or multi-comment coordinated change

If uncertain, choose the higher complexity. It is better to pause for user
approval than to auto-execute something surprising.

Use this batch order:

1. `pre_existing`
2. `local`
3. `single_file`
4. `cross_cutting`
5. `complex`
6. informational review threads

Execution rules:

- auto-proceed: `pre_existing`, `local`, `single_file`
- ask first: `cross_cutting`, `complex`
- prompt per item: informational review threads (`act`, `dismiss`, or `skip`)

Display a compact plan grouped by batch with item location and a one-line
summary.

### 4. Execute approved batches

For each approved batch, do the real engineering work:

- inspect the referenced code
- decide whether the feedback needs a code change, a reply, or both
- make the edit
- run appropriate tests for the affected project
- fix any failures before committing
- stage only the files changed for that batch
- create exactly one commit for the batch

All `pr-address exec json` helpers accept input as JSON on stdin. See
`references/cli-reference.md` for required fields and invocation examples.
Substitute the wrapper path documented above for every literal
`pr-address` shown in that reference.

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
- informational items the user chose to act on: treat them like actionable
  items for that batch

Before execution changes code for a bot comment, verify the local context:

1. read the nearby code, not just the flagged line
2. check whether the requested pattern already exists
3. check whether the bot rule is wrong for this context

If the bot is wrong:

- do not change the code
- resolve the thread with an explanatory reply
- keep the explanation factual and brief

Use the composite helpers for GitHub mutations (see
`references/cli-reference.md` for required fields and invocation shape):

- `resolve-thread-with-reply` — reply to and resolve a thread
- `reply-to-review` — post a formatted reply to a PR-level review
- `reply-to-discussion` — reply to a discussion comment with reaction

Do not hand-roll reply bodies. The helper commands own the marker, timestamp,
and standard formatting.

### 5. Verify and hand off

After the last batch, re-fetch current feedback with:

- `<pr-address-runner> exec get-feedback <pr_number>`

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
- Do not use raw GitHub review-thread reply endpoints. Use the helper
  commands above.
- Do not drop unresolved review threads during classification.
- Do not commit a broken batch.
- Record skipped items in the final summary.
