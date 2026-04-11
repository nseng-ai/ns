---
name: twerk-pr-address
description: "Address PR review comments end-to-end on the current branch's PR. This skill runs only when the user explicitly invokes it via the `/twerk-pr-address` slash command — it is not triggered by natural-language requests. Fetches unresolved review threads and discussion comments, classifies them with LLM judgment (actionable vs informational, bot noise, pre-existing issues), plans batched execution, implements code changes, commits in batches, and resolves threads. Never pushes — the user pushes manually after reviewing local commits. Uses `twerk pr-address get-review-comments` / `resolve-thread` / `unresolve-thread` / `add-review-thread-reply` for typed PR operations, and raw `gh` / `gh api` for the remainder."
allowed-tools:
  - "Bash(twerk *)"
  - "Bash(gh pr view *)"
  - "Bash(gh pr list *)"
  - "Bash(gh api *)"
  - "Bash(gh api graphql *)"
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
  - "Bash(command -v twerk)"
  - "Read"
  - "Edit"
  - "Write"
  - "Grep"
  - "Glob"
---

# twerk-pr-address

Address review comments on the current branch's PR, end-to-end, using `gh`
directly. Fetch unresolved feedback, classify it with LLM judgment, plan
batched execution, implement changes, commit, and resolve threads. The
skill never pushes — the user pushes manually after reviewing the local
commits.

## When to use

This skill runs **only when the user explicitly invokes it** via the
`/twerk-pr-address` slash command. It is a formal, multi-phase process
that makes local commits and resolves review threads on GitHub, so it
should never fire implicitly from natural-language requests like "fix
review feedback" or "look at the review".

If the user just asks to **read** review comments without addressing
them, run Phase 1 only and stop after displaying the plan — don't
continue into edit/commit/resolve.

## Guarantees and non-goals

**Guarantees:**

- Only touches the current branch's PR.
- Every batch produces a single `git commit` and resolves every thread it
  claims to address.
- **Never pushes.** All work stays local after commit; the user pushes
  explicitly when they're ready. The skill does not include `git push` in
  its allowed-tools.
- All `gh` invocations and GraphQL queries the skill issues are enumerated
  in `references/operations.md` — the push-down inventory for future CLI
  migration.
- Classification (bot detection, informational filtering, pre-existing-issue
  identification, review-state handling) lives in the LLM prompt at
  `references/feedback-classifier.md`, not in hard-coded rules.

**Non-goals:**

- No pushing (`git push`, `gt submit`) — the user does that explicitly
  after reviewing the local commits.
- No new inline review comments (the skill responds to comments; it doesn't
  post them).

## Prerequisites

1. You're on a branch that has an open PR.
2. `gh auth status` is healthy. If it isn't, stop and tell the user to fix
   auth before continuing.
3. The working tree is clean. If there are uncommitted changes, stop and
   tell the user — batch commits need a clean base.
4. The `twerk` binary is on `PATH`. The skill shells out to
   `twerk pr-address get-review-comments` to fetch review threads. Run
   `command -v twerk` as a preflight; if it isn't found, stop and tell the
   user: "`twerk` not on PATH — run this skill from inside a `uv sync`'d
   twerk workspace."

## Workflow

The skill has five phases. Phase 0 may mutate GitHub by reopening contested
threads. Phase 1 is read-only. Phases 2–4 make changes.

### Phase 0 — Reopen contested threads

Before normal fetch/classify, reopen any resolved review thread that
`twerk-pr-address` previously resolved and that has since received additional
reviewer replies. This prevents the next run from silently missing reviewer
pushback inside an already-resolved thread.

#### 0a. Resolve the PR

Resolve the PR for the current branch:

```bash
gh pr view --json number,title,url,headRefName,baseRefName
```

If `gh pr view` fails with "no pull requests found" or similar, stop and
report: "No PR found for the current branch. Create one with `gh pr create`
first." Do not continue.

Record `pr_number`, `pr_title`, `pr_url`, and `base_ref` (needed later for
rename detection).

#### 0b. Fetch all review threads

Phase 0 needs the full thread set so it can inspect already-resolved
threads for new replies:

```bash
twerk pr-address get-review-comments <pr_number> --include-resolved
```

See `references/operations.md` §`get-review-threads`.

#### 0c. Detect contested threads

A thread is **contested** if all three are true:

- `is_resolved == true`
- at least one comment body contains `<!-- twerk:pr-address-resolved -->`
- there is at least one later comment after the last marker comment

If a resolved thread has no marker, treat it as manually resolved and leave
it alone. Only reopen threads that this skill previously resolved.

#### 0d. Reopen contested threads

For each contested thread, run `twerk pr-address unresolve-thread
"$THREAD_ID"`. See `references/operations.md` §`unresolve-thread`.

If reopening one thread fails, warn and continue. This phase is a quality
improvement, not a reason to abort the whole run.

#### 0e. Report and continue

If any contested threads were reopened, report:
"Reopened `<N>` contested threads — these will be included in classification
below."

Then continue into Phase 1.

### Phase 1 — Fetch feedback

Using the PR resolved in Phase 0, fetch reviews, review threads, and
discussion comments. All three fetches can run back-to-back; the classifier
in Phase 2 needs all three before it can make decisions.

#### 1a. Fetch review threads (inline code comments)

```bash
twerk pr-address get-review-comments <pr_number>
```

Add `--include-resolved` if the user passed `--all`. See
`references/operations.md` §`get-review-threads`.

#### 1b. Fetch PR-level reviews

Shell out to `gh api graphql` using the `get-reviews` query from
`references/operations.md` (this operation is not yet pushed down into the
clinkr CLI). Returns PR-level review submissions (APPROVED,
CHANGES_REQUESTED, COMMENTED) with `id`, `author.login`, `body`, `state`,
`submittedAt`. Excludes PENDING and DISMISSED reviews.

#### 1c. Fetch discussion comments

Use the REST endpoint:

```bash
gh api repos/<owner>/<repo>/issues/<pr_number>/comments --paginate
```

PRs and issues share comment endpoints, so `issues/<n>/comments` returns the
PR's top-level (non-inline) conversation. Returns each comment's `id`,
`user.login`, `body`, `html_url`.

#### 1d. Detect restructured files (for pre-existing-issue candidates)

Bot comments on files that were renamed or moved in this PR are almost
always pre-existing issues flagged by a linter that doesn't know the file
moved. Detect renames/copies against the PR's base branch:

```bash
git diff --name-status -M -C origin/<base_ref>...HEAD
```

Collect the `new_path` of every `R*` and `C*` entry — these are the
"restructured paths". The classifier in Phase 2 uses this set to flag
pre-existing candidates.

If the git diff fails (detached HEAD, missing origin, etc.), proceed with an
empty set. Pre-existing detection is a quality optimization, not a
correctness requirement.

#### 1e. Empty-case handling

If the review-thread fetch returns `count: 0` AND the review-submission
fetch returns zero actionable reviews AND the discussion-comment fetch
returns zero unaddressed comments, report: "No unresolved review comments
or discussion comments on PR #`<number>`." and stop. Do not continue to
Phase 2.

### Phase 2 — Classify and plan

Open `references/feedback-classifier.md` and apply its rules to the Phase 1
data. This is the heart of the skill: the LLM makes judgment calls about
free-form review feedback rather than relying on brittle rule-based
classification.

The classifier produces:

- **review_threads**: every unresolved inline review thread from Phase 1a,
  with `thread_id`, `path`, `line`, `classification`, `action_summary`,
  and `pre_existing` flag. Threads with `classification:
  "informational"` are still represented explicitly; they are not allowed
  to disappear into a count bucket.
- **actionable_reviews**: PR-level reviews that need code changes, with
  `review_id`, `action_summary`, `complexity`.
- **discussion_actions**: discussion comments that need a reply or an
  action, with `comment_id`, `action_summary`, `complexity`.
- **informational_count**: a count (and optional opaque list) of non-thread
  items filtered out as informational — approvals, bot noise,
  acknowledgments.
- **batches**: ordered execution plan grouped by complexity.

Before displaying the plan, enforce the review-thread completeness
invariant:

- every unresolved review thread fetched in Phase 1a must appear exactly
  once in `review_threads`
- resolved threads included via `--all` are reference-only and do not count
  toward this invariant

If the classifier cannot account for every unresolved review thread, stop and
re-classify. Do not proceed with a partial plan.

**Batch ordering** (simplest → most complex):

| # | Complexity    | Auto-proceed | Description                                     |
| - | ------------- | ------------ | ----------------------------------------------- |
| 0 | pre_existing  | yes          | Bot comments on moved/restructured code         |
| 1 | local         | yes          | One file, one location per comment              |
| 2 | single_file   | yes          | One file, multiple locations                    |
| 3 | cross_cutting | **no**       | Multiple files affected                         |
| 4 | complex       | **no**       | Related comments that inform a unified change   |
| 5 | informational | **no**       | User decides: act, dismiss, or skip             |

Display the plan to the user as a compact markdown table per batch (see
`references/operations.md` §`plan-display` for the exact format). For
batches with `auto_proceed: true`, proceed without confirmation. For
`auto_proceed: false` batches, **wait for user approval** before executing.

If plan mode is active, display the plan and call `ExitPlanMode`. Do not
execute Phases 3–4 while plan mode is on.

### Phase 3 — Execute by batch

For each batch in order:

#### 3a. Pre-existing batch (special case)

If the batch's complexity is `pre_existing`, skip code changes entirely —
just resolve each thread with the standard pre-existing comment via
`twerk pr-address add-review-thread-reply` followed by
`twerk pr-address resolve-thread`. See `references/operations.md` for the
command shapes. Resolution comment:

> Pre-existing issue — this code was moved/restructured, not newly
> introduced.

Then move to the next batch. No commit for this batch.

#### 3b. Address each item in the batch

For each actionable item:

**Inline review threads with `line` set:** Read the file around that line,
understand context, make the fix.

**Inline review threads with `line: null` (outdated):** The code has changed
since the comment was made. Read the file without a line anchor, search for
the relevant code referenced in the comment, check if the issue is already
fixed. If fixed, skip the edit and go straight to resolution in 3e. If not
fixed, apply the fix.

**PR-level reviews:** Treat the review body as a spec for changes across the
PR. The review might reference multiple files; investigate each reference
before editing.

**Discussion comments:** Determine whether it's a request (take action), a
question (answer + possibly edit), architectural feedback (investigate +
possibly edit), or acknowledgment (reply and mark resolved). Before replying
to architectural feedback, investigate the codebase so the reply is
substantive, not generic.

**Informational items the user chose to act on:** Same as actionable.

**False positives from automated reviewers:** If a bot flagged something
that is not actually wrong (e.g., the suggested pattern already exists
nearby), do NOT change the code. Reply to the thread explaining why it's a
false positive, reference the specific line where the correct pattern
exists, and resolve the thread. See `references/feedback-classifier.md`
§`false-positives` for detail.

#### 3c. Run tests

After making all edits in the batch, run the project's test command. For
twerk that's `just` (which runs lint, format, typecheck, tests). If `just`
fails, **stop and fix the failures before committing**. Do NOT commit a
broken batch.

If a fix reveals that the reviewer's suggestion was wrong or would break
something, stop and ask the user — don't silently skip the comment.

#### 3d. Commit

Create one commit for the batch. The commit message format:

```
Address PR review comments (batch N/M)

- <summary of comment 1>
- <summary of comment 2>
- ...
```

Stage only the files changed for this batch — not untracked files the user
may be working on separately:

```bash
git add <specific files>
git commit -m "..."
```

#### 3e. Resolve threads in the batch

For each inline review thread in the batch, run `twerk pr-address
add-review-thread-reply "$THREAD_ID" "$REPLY_BODY"` followed by `twerk
pr-address resolve-thread "$THREAD_ID"`. The reply body should reference
the commit and summarize what was done:

```
Fixed in commit <short-sha>: <one-line summary>

_Addressed via twerk-pr-address at <ISO timestamp>_
<!-- twerk:pr-address-resolved -->
```

The `<!-- twerk:pr-address-resolved -->` marker lets the "contested threads"
detector in Phase 4 tell the difference between a thread the user manually
reopened and one they never touched.

For PR-level reviews: there's no way to "resolve" a review submission via
API. Instead, post a reply comment on the PR discussion (see
§`add-issue-comment`) that quotes the review's action items and describes
what was addressed. The user can dismiss the review manually if needed.

For discussion comments: use the REST endpoint to post a reply comment on
the PR. Quote the original comment with author attribution, describe the
action taken, then add a `+1` reaction to the original comment. If the
reaction fails, warn but do not fail the batch. Discussion comments don't
have a "resolve" concept.

#### 3f. Report progress

After each batch, print a one-block summary:

```
## Batch N/M complete

Addressed:
- foo.py:42 — used LBYL
- bar.py:15 — added type annotation

Committed: <short-sha> "Address PR review comments (batch N/M)"

Resolved threads: 2
Remaining batches: M-N
```

Then continue to the next batch.

### Phase 4 — Verify and hand off

**The skill never pushes.** It commits locally, resolves threads via
GraphQL, then hands the branch back to the user to push explicitly. This
is deliberate: automatic pushes are hard to undo, can race with work from
another machine, and can publish half-addressed batches if the user
interrupts the skill mid-run.

#### 4a. Re-fetch unresolved threads

Re-run Phase 1a + 1b + 1c against the current PR number. If any actionable
items remain unresolved, list them in the final summary under "Still
unresolved" — don't error out, since the user may have deferred some items
intentionally.

#### 4b. Final summary

```
## PR comments addressed (locally)

PR: #<number> <title>
Total actionable items: <N>
Pre-existing auto-resolved: <P>
Batches: <M>
Commits: <C>

Review threads resolved: <resolved>/<total>
Discussion comments replied: <replied>/<total>
Discussion comment reactions: <reacted>/<replied>

Still unresolved (if any):
- <thread or comment, with reason>

Skipped by user (if any):
- <item, with reason>

Next steps (run manually):
1. Review the local commits with `git log origin/<base>..HEAD`
2. Push with `git push` when ready
3. Wait for CI
4. Re-request review if the PR was CHANGES_REQUESTED
```

Do not run `git push`. Do not run `gt submit`. The user pushes.

## Rules

- Work on the current branch. Never create a branch or a new PR inside this
  skill.
- **Never push.** Commits stay local. The user pushes when they're ready.
  Not `git push`, not `gt submit`, not anything that sends commits
  upstream. This is enforced by the allowed-tools list (no `git push*`).
- Never use raw `gh api .../comments/{id}/replies` to "reply" without
  resolving — it leaves the thread open. Always use `twerk pr-address
  add-review-thread-reply` together with `twerk pr-address resolve-thread`
  (see `references/operations.md`).
- Every unresolved review thread must be represented explicitly during
  classification. Never count-collapse or silently drop a live review
  thread.
- Classification lives in the LLM, not in Python. If you find yourself
  wanting to add a hard-coded rule for a specific bot or reviewer, **update
  `references/feedback-classifier.md` instead**.
- Every mechanical `gh` invocation the skill makes is a push-down
  candidate. Keep `references/operations.md` in sync when the set changes
  — that file is the contract with the future CLI push-down work.
- If a batch's tests fail, fix them before committing. Never commit a
  broken batch to get past a failure.
- If the user explicitly skips a comment, record it in the final summary's
  "Skipped" section — don't silently drop it.

## Anti-patterns

- Running the classifier as a Python script. It's an LLM prompt. See
  `references/feedback-classifier.md`.
- Using `gh pr comment` or `gh api .../reviews/{id}/comments/{id}/replies`
  as a shortcut — neither resolves the thread.
- Skipping Phase 4a because "the batches all succeeded". Re-fetching is
  cheap and catches bugs in the classifier's batch assignment.
- Committing unrelated files with a batch. Stage only what the batch
  changed.
- Treating outdated threads (`line: null`) as "already done, skip" — they
  still need to be resolved, even if no code change is required.

## References

- `references/operations.md` — every `gh` invocation and GraphQL query the
  skill issues, with inline query text ready to paste into `gh api graphql`.
  This is the push-down inventory.
- `references/feedback-classifier.md` — LLM-facing classification rules:
  bot detection, informational filtering, pre-existing-issue heuristics,
  review-state handling, false positives. Update this when the LLM
  mis-classifies something.
