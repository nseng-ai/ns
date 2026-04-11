---
name: twerk-pr-address
description: "Address PR review comments end-to-end on the current branch's PR. This skill runs only when the user explicitly invokes it via the `/twerk-pr-address` slash command — it is not triggered by natural-language requests. Fetches unresolved review threads and discussion comments via `gh`, classifies them with LLM judgment (actionable vs informational, bot noise, pre-existing issues), plans batched execution, implements code changes, commits in batches, and resolves threads. Never pushes — the user pushes manually after reviewing local commits. Uses `gh` / `gh api` / `gh api graphql` directly — no dependency on `twerk pr-address` CLI operations."
allowed-tools:
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

## Workflow

The skill has four phases. Phase 1 is read-only. Phases 2–4 make changes.

### Phase 1 — Fetch feedback

Resolve the target PR, then fetch reviews, review threads, and discussion
comments. All three fetches can run back-to-back; the classifier in Phase 2
needs all three before it can make decisions.

#### 1a. Resolve the PR

Resolve the PR for the current branch:

```bash
gh pr view --json number,title,url,headRefName,baseRefName
```

If `gh pr view` fails with "no pull requests found" or similar, stop and
report: "No PR found for the current branch. Create one with `gh pr create`
first." Do not continue.

Record `pr_number`, `pr_title`, `pr_url`, and `base_ref` (needed later for
rename detection).

#### 1b. Fetch review threads (inline code comments)

Use the GraphQL query from `references/operations.md` §`get-review-threads`.
Substitute `owner`, `repo`, and `pr_number`:

```bash
gh api graphql -F owner=<owner> -F repo=<repo> -F number=<pr_number> -f query='...'
```

The query returns every review thread with `id`, `isResolved`, `isOutdated`,
`path`, `line`, and each comment's `databaseId`, `body`, `author.login`,
`createdAt`. **Filter out resolved threads unless the user passed `--all`**.

#### 1c. Fetch PR-level reviews

Same `gh api graphql` invocation, using the `get-reviews` query from
`references/operations.md`. Returns PR-level review submissions (APPROVED,
CHANGES_REQUESTED, COMMENTED) with `id`, `author.login`, `body`, `state`,
`submittedAt`. Excludes PENDING and DISMISSED reviews.

#### 1d. Fetch discussion comments

Use the REST endpoint:

```bash
gh api repos/<owner>/<repo>/issues/<pr_number>/comments --paginate
```

PRs and issues share comment endpoints, so `issues/<n>/comments` returns the
PR's top-level (non-inline) conversation. Returns each comment's `id`,
`user.login`, `body`, `html_url`.

#### 1e. Detect restructured files (for pre-existing-issue candidates)

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

#### 1f. Empty-case handling

If the review-thread fetch returns zero unresolved threads AND the
review-submission fetch returns zero actionable reviews AND the
discussion-comment fetch returns zero unaddressed comments, report: "No
unresolved review comments or discussion comments on PR #`<number>`." and
stop. Do not continue to Phase 2.

### Phase 2 — Classify and plan

Open `references/feedback-classifier.md` and apply its rules to the Phase 1
data. This is the heart of the skill: the LLM makes judgment calls about
free-form review feedback rather than relying on brittle rule-based
classification.

The classifier produces:

- **actionable_threads**: inline threads that need code changes, with
  `thread_id`, `path`, `line`, `classification`, `action_summary`,
  `complexity`, and `pre_existing` flag.
- **actionable_reviews**: PR-level reviews that need code changes, with
  `review_id`, `action_summary`, `complexity`.
- **discussion_actions**: discussion comments that need a reply or an
  action, with `comment_id`, `action_summary`, `complexity`.
- **informational**: a count (and an opaque list) of items filtered out as
  informational — approvals, bot noise, acknowledgments.
- **batches**: ordered execution plan grouped by complexity.

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
just resolve each thread with the standard pre-existing comment. See
`references/operations.md` §`resolve-thread` for the mutation invocation.
Resolution comment:

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

For each inline review thread in the batch, use the GraphQL mutations in
`references/operations.md` §`add-review-thread-reply` + §`resolve-thread`.
The reply body should reference the commit and summarize what was done:

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
the PR. Reference the original comment's URL and describe the action taken.
Discussion comments don't have a "resolve" concept.

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

Run Phase 1b + 1c + 1d again against the current PR number. If any
actionable items remain unresolved, list them in the final summary under
"Still unresolved" — don't error out, since the user may have deferred
some items intentionally.

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
  resolving — it leaves the thread open. Always use the
  `addPullRequestReviewThreadReply` mutation together with the
  `resolveReviewThread` mutation (see `references/operations.md`).
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
