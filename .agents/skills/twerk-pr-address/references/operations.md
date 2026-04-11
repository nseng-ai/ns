# twerk-pr-address operations reference

Every `gh`, `git`, and GraphQL invocation that the `twerk-pr-address` skill
makes. This file has two jobs:

1. Give the skill copy-pasteable commands and queries (progressive
   disclosure: the skill only loads this file when it's about to run one of
   the commands).
2. Serve as the **push-down inventory**: a checklist of everything that
   should eventually migrate into typed `twerk pr-address` clinkr
   operations backed by `twerk_core.gh.IssueGateway`. See the "Push-down
   targets" table at the bottom.

---

## get-pr-for-branch

**Purpose:** Resolve the current branch's PR number, title, URL, and base
ref.

**Command:**

```bash
gh pr view --json number,title,url,headRefName,baseRefName
```

**Notes:**

- Add `<pr-number>` as the first positional arg if the user passed
  `--pr N`.
- Fails with non-zero exit if there is no PR for the branch. Catch the
  error and stop the skill with a clear message — do not fall back to
  GraphQL.

---

## get-owner-repo

**Purpose:** The GraphQL queries need `owner` and `repo` as separate
variables. Derive them once and reuse.

**Command:**

```bash
gh repo view --json owner,name --jq '{owner: .owner.login, name: .name}'
```

Or, if already inside a checkout, parse from `git remote get-url origin`.
Both are fine.

---

## get-review-threads

**Purpose:** Fetch every inline review thread on the PR with comments,
resolution state, and outdated state.

**Migrated:** to `twerk pr-address get-review-comments`, backed by
`RealIssueGateway.get_review_threads` at
`packages/twerk-core/src/twerk_core/gh/real_issue_gateway.py`.

**Command:**

```bash
twerk pr-address get-review-comments "$PR_NUMBER"
# include resolved threads (Phase 0 contested-thread detection):
twerk pr-address get-review-comments "$PR_NUMBER" --include-resolved
```

**Filter:** The operation defaults to unresolved-only and already drops
null-id threads (GraphQL occasionally returns null ids for deleted files).
Pass `--include-resolved` to return the full set (Phase 0 needs this;
Phase 1 does not).

**Output shape:**

```json
{
  "count": 2,
  "threads": [
    {
      "id": "PRRT_abc",
      "path": "src/foo.py",
      "line": 42,
      "is_resolved": false,
      "is_outdated": false,
      "comments": [
        {
          "id": 1234567890,
          "body": "nit: rename",
          "author": "reviewer",
          "path": "src/foo.py",
          "line": 42,
          "created_at": "2026-04-10T12:00:00Z"
        }
      ]
    }
  ]
}
```

Deleted reviewer accounts come back as `"author": ""`.

#### Previously (raw GraphQL)

Before the migration the skill shelled out to `gh api graphql` directly.
Kept here as a worked example for the next push-down:

```bash
gh api graphql \
  -F owner="$OWNER" \
  -F repo="$REPO" \
  -F number="$PR_NUMBER" \
  -f query='
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first: 20) {
            nodes {
              databaseId
              body
              author { login }
              path
              line: originalLine
              createdAt
            }
          }
        }
      }
    }
  }
}'
```

Field-name mapping from this raw shape to the `twerk pr-address
get-review-comments` output: `isResolved` → `is_resolved`, `isOutdated` →
`is_outdated`, `comments.nodes[i].databaseId` → `comments[i].id`,
`author.login` → `author` (flat string, `""` for deleted accounts),
`createdAt` → `created_at`. The clinkr-op output has already dropped the
`data.repository.pullRequest.reviewThreads.nodes` nesting in favor of a
flat `{count, threads}` envelope.

---

## reopen-contested-threads

**Purpose:** Detect review threads that `twerk-pr-address` previously
resolved, but which later received additional reviewer replies. These must
be reopened before classification or the next run will miss them.

**Detection algorithm:**

1. Fetch all review threads, including resolved ones, via
   `twerk pr-address get-review-comments <pr_number> --include-resolved`.
   See §`get-review-threads` for the full output shape.
2. For each resolved thread, scan comments in order.
3. Find the last comment whose body contains
   `<!-- twerk:pr-address-resolved -->`.
4. If there is no marker comment, ignore the thread — it was resolved
   manually or by some other process.
5. If there is any later comment after the last marker comment, the thread
   is contested.
6. Reopen each contested thread with §`unresolve-thread`.

**Report:** If any were reopened, print:

```text
Reopened <N> contested threads — these will be included in classification below.
```

Failures reopening individual threads should be warnings, not fatal errors.

---

## get-reviews

**Purpose:** Fetch PR-level review submissions (the "Changes requested",
"Approved", "Commented" items, not inline threads).

**Command:**

```bash
gh api graphql \
  -F owner="$OWNER" \
  -F repo="$REPO" \
  -F number="$PR_NUMBER" \
  -f query='
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviews(first: 100, states: [CHANGES_REQUESTED, APPROVED, COMMENTED]) {
        nodes {
          id
          author { login }
          body
          state
          submittedAt
        }
      }
    }
  }
}'
```

**Filter:** The `states` argument excludes PENDING (draft) and DISMISSED
(superseded). The classifier will further drop APPROVED reviews and
COMMENTED reviews with empty bodies.

---

## get-discussion-comments

**Purpose:** Fetch PR top-level conversation comments (not inline review
threads).

**Command:**

```bash
gh api "repos/$OWNER/$REPO/issues/$PR_NUMBER/comments" --paginate
```

**Notes:**

- Uses the `issues` endpoint because GitHub treats PR discussion comments
  as issue comments at the REST level. This is why the unified
  `IssueGateway` in `twerk_core.gh` can serve both.
- `--paginate` follows `Link` headers automatically.

**Output shape each comment:** `{id, user: {login}, body, html_url,
created_at, updated_at}`

---

## get-restructured-files

**Purpose:** Detect files renamed or copied since the PR's base ref. Used
to flag bot comments on moved files as `pre_existing` candidates.

**Command:**

```bash
git diff --name-status -M -C "origin/$BASE_REF"...HEAD
```

**Parse:** Lines starting with `R` (rename) or `C` (copy) have three
tab-separated columns: `status`, `old_path`, `new_path`. Collect every
`new_path`. Other statuses (`M`, `A`, `D`) are ignored.

**Errors:** If the diff fails (detached HEAD, missing `origin/<base>`,
shallow clone), return an empty set and keep going. Pre-existing detection
is optional.

---

## resolve-thread

**Purpose:** Mark a review thread as resolved.

**Command:**

```bash
gh api graphql \
  -F threadId="$THREAD_ID" \
  -f query='
mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread {
      id
      isResolved
    }
  }
}'
```

**Check:** Response should contain `data.resolveReviewThread.thread.isResolved:
true`. If false or missing, log a warning and continue — don't abort the
batch, but surface the failed thread in the final summary.

---

## unresolve-thread

**Purpose:** Reopen a previously-resolved thread. Used during Phase 0's
contested-thread detection.

**Command:**

```bash
gh api graphql \
  -F threadId="$THREAD_ID" \
  -f query='
mutation($threadId: ID!) {
  unresolveReviewThread(input: {threadId: $threadId}) {
    thread {
      id
      isResolved
    }
  }
}'
```

---

## add-review-thread-reply

**Purpose:** Post a reply comment inside a review thread. Used in
combination with `resolve-thread` — reply first, then resolve.

**Command:**

```bash
gh api graphql \
  -F threadId="$THREAD_ID" \
  -F body="$REPLY_BODY" \
  -f query='
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $threadId, body: $body}) {
    comment {
      id
      body
    }
  }
}'
```

**Body format:** The skill builds the body from a template:

```
Fixed in commit <short-sha>: <one-line summary>

_Addressed via twerk-pr-address at <ISO timestamp>_
<!-- twerk:pr-address-resolved -->
```

The `<!-- twerk:pr-address-resolved -->` marker is how the skill identifies
threads it previously resolved (e.g., for a future "reopen contested
threads" detector).

---

## add-issue-comment

**Purpose:** Post a top-level comment on the PR's discussion. Used to reply
to discussion comments and to respond to PR-level reviews (which have no
"resolve" mutation).

**Command:**

```bash
gh api \
  --method POST \
  "repos/$OWNER/$REPO/issues/$PR_NUMBER/comments" \
  -f body="$REPLY_BODY"
```

**Body format for discussion replies:** Quote the original comment with
author attribution, include a substantive action summary, and add the
timestamp footer:

```
> **@<author>** [commented](<original comment URL>):
> <original comment body, quoted line-by-line>
> ...

<summary of action taken>

---
<sub>Addressed via `twerk-pr-address` at <ISO timestamp></sub>
```

If the original comment is very long, quote only the first ~10 lines and end
with `> ...`.

---

## add-reaction

**Purpose:** Add a `+1` reaction to the original discussion comment after
posting a substantive reply.

**Command:**

```bash
gh api \
  --method POST \
  "repos/$OWNER/$REPO/issues/comments/$COMMENT_ID/reactions" \
  -H "Accept: application/vnd.github+json" \
  -f content="+1"
```

Valid reactions: `+1`, `-1`, `laugh`, `confused`, `heart`, `hooray`,
`rocket`, `eyes`.

**Failure handling:** A reaction failure is non-fatal if the reply comment
was posted successfully. Warn and continue.

---

## plan-display

**Purpose:** Not an invocation — a format reference for how the skill
should render the batched execution plan to the user in Phase 2.

**Format:**

```
## Execution plan — PR #<N> <title>

### Batch 0: Pre-Existing Auto-Resolve (<count> threads) — auto-proceed
| # | Location | Summary |
|---|----------|---------|
| 1 | src/old.py → src/new.py:42 | Bot: add type annotation (file moved) |

### Batch 1: Local Fixes (<count> items) — auto-proceed
| # | Location | Summary |
|---|----------|---------|
| 2 | src/foo.py:42 | Use LBYL pattern |

### Batch 3: Cross-Cutting (<count> items) — needs approval
| # | Location | Summary |
|---|----------|---------|
| 5 | multiple files | Update all callers of `foo()` |

### Informational Review Threads (<count>) — will prompt per item
- src/foo.py:88 — reviewer asked whether this helper belongs in a gateway
- src/legacy.py:12 — bot nit looks optional; user decides
```

For `auto-proceed` batches, proceed immediately. For `needs approval`
batches, wait for explicit user confirmation. For the Informational
section, prompt the user per-item with act / dismiss / skip choices.

---

## git-push (explicitly out of scope)

The skill does **not** push. There is no `git push` command in the skill's
workflow and no `Bash(git push*)` entry in the skill's allowed-tools. After
Phase 4's final summary, the user reviews the local commits and pushes
manually:

```bash
# User runs, not the skill:
git log "origin/$BASE_REF..HEAD"
git push
```

This rule is intentional:

- Automatic pushes are hard to undo.
- The skill may interrupt mid-batch; a local-only state is always
  recoverable with `git reset`.
- Users on stacked-diff workflows (Graphite, etc.) have their own push
  tooling that shouldn't be shadowed.

If a future user or operator wants an "auto-push" variant, it belongs in a
separate skill that wraps `twerk-pr-address`, not inside this one.

---

## Push-down targets

Each row below is a candidate for replacement by a typed `twerk pr-address`
clinkr operation backed by `twerk_core.gh.IssueGateway`. Order is not
prescriptive — drive push-down by skill pain.

| Operation                    | Status on `IssueGateway`                               | Existing clinkr op?              | Push-down notes                                                                                           |
| ---------------------------- | ------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `get-pr-for-branch`          | `get_number_for_branch` (`NotImplementedError` stub)   | no                               | Small — wrap `gh pr view`.                                                                                |
| `get-review-threads`         | `get_review_threads` (**real**)                        | `get-review-comments` (**done**) | **Migrated** — skill uses `twerk pr-address get-review-comments` (with `--include-resolved` in Phase 0). |
| `get-reviews`                | `get_reviews` (stub)                                   | no                               | Add alongside threads — they're fetched together in classification.                                      |
| `get-discussion-comments`    | `get_discussion_comments` (stub)                       | `get-discussion-comments` (done) | Operation exists; needs real-gateway backing.                                                             |
| `get-restructured-files`     | N/A (git, not `gh`)                                    | no                               | Could live on a `GitGateway` or as a pure helper next to the classifier.                                  |
| `resolve-thread`              | `resolve_review_thread` (stub)                         | no (was `resolve-threads`)       | Batch wrapper `resolve-threads` was planned; consumes a list. Needs real-gateway backing.                 |
| `unresolve-thread`            | `unresolve_review_thread` (stub)                       | no (was `reopen-contested`)      | Used by Phase 0 contested-thread reopening driven by the `<!-- twerk:pr-address-resolved -->` marker.            |
| `add-review-thread-reply`    | `add_review_thread_reply` (stub)                       | no (was `reply-to-comment`)      | Formatter helpers: `format_resolution_comment`, `has_address_marker`.                                     |
| `add-issue-comment`          | `add_comment` (stub)                                   | no                               | Used for both discussion-comment replies and PR-review responses.                                         |
| `add-reaction`               | `add_reaction` (stub)                                  | no                               | Required for richer discussion-comment replies.                                                           |
| `plan-display`               | N/A                                                    | no                               | Stays in the skill — it's rendering, not I/O.                                                             |
| `git-push`                   | **out of scope**                                       | n/a                              | The skill deliberately never pushes. Not a push-down target.                                              |

When a row gets pushed down:

1. Implement the real `RealIssueGateway` method (replacing the
   `NotImplementedError` stub).
2. Add a CLI-fallback regression test: monkeypatch `subprocess.run` and
   walk the no-injection fallback through the new gateway method.
3. Wire the corresponding clinkr operation (new or existing) to consume
   the gateway method.
4. Update this skill: replace the `gh api` invocation section with a
   `twerk pr-address <op>` invocation, note the migration in the
   push-down table, and link the PR that landed it.

Until a row is pushed down, the skill keeps using the `gh` invocation
above.
