# Plan: Consolidate Phase 1 fetches in pr-address skill

## Context

When running `/pr-address`, the skill currently issues three separate
`pr-address exec` CLI calls in Phase 1 to gather PR feedback:

- `get-review-comments <pr>` — inline review threads
- `get-reviews <pr>` — PR-level review submissions
- `get-discussion-comments <pr>` — PR discussion comments

The user observed this triple round-trip and asked whether the calls
should be combined. They already are — on the Python side. The repo
ships a `get-feedback` operation
(`packages/twerk-pr-address/src/twerk_pr_address/cli/pr_address/get_feedback.py`)
whose `GetFeedbackResult` returns `reviews`, `review_threads`, and
`discussion_comments` in a single response. The SKILL.md prose simply
never switched over to it.

The fix is a documentation-only change: point Phase 1 (and the Phase 4
re-fetch) at `get-feedback`, keeping the three single-domain commands
available for Phase 0's targeted `--include-resolved` thread fetch and
for callers that only want one slice.

## Scope

**In scope:**
- Edit `skills/pr-address/SKILL.md` to replace Phase 1a/1b/1c with a
  single `get-feedback` call.
- Update Phase 1e empty-case wording to inspect the three fields of the
  combined response.
- Update Phase 4a to re-run `get-feedback` instead of "Phase 1a + 1b + 1c".

**Out of scope:**
- Phase 0b continues to call `get-review-comments --include-resolved`.
  Phase 0 runs *before* reopening contested threads; its data would be
  stale for Phase 1 anyway, and it doesn't need reviews/discussion
  comments. Keeping it single-purpose avoids wasted API traffic.
- No changes to the Python CLI package — `get-feedback` already exists
  with the right shape. The three single-domain commands stay; Phase 0
  and any external callers still use them.

## Files to modify

- `skills/pr-address/SKILL.md` — Phase 1 section (lines ~146–202) and
  Phase 4a (line ~451).

## Proposed edits

### 1. Replace Phase 1 fetch block (sections 1a–1c)

Replace the three numbered subsections with a single section:

```markdown
#### 1a. Fetch reviews, review threads, and discussion comments

```bash
pr-address exec get-feedback <pr_number>
```

Add `--include-resolved` if the user passed `--all`.

Returns a single JSON object with three fields:

- `reviews` — PR-level review submissions (APPROVED, CHANGES_REQUESTED,
  COMMENTED) with `id`, `author`, `body`, `state`, `submitted_at`.
  Excludes PENDING and DISMISSED.
- `review_threads` — unresolved inline review threads (or all threads if
  `--include-resolved`), each with `thread_id`, `path`, `line`, and
  comments.
- `discussion_comments` — PR discussion comments with `id`, `body`,
  `author`, `url`.
```

Renumber the current 1d (restructured-files detection) to `1b` and the
current 1e (empty-case handling) to `1c`. Update 1c to read:

> If all three fields (`reviews`, `review_threads`, `discussion_comments`)
> of the `get-feedback` response are empty, report: "No unresolved
> review comments or discussion comments on PR #`<number>`." and stop.

### 2. Phase 2 classifier references

The classifier instructions reference "Phase 1a", "Phase 1b",
"Phase 1c". After renumbering, adjust the single reference in Phase 2's
"review-thread completeness invariant" bullet from "every unresolved
review thread fetched in Phase 1a" to "every unresolved review thread
returned by `get-feedback`". This decouples the invariant from the
section number.

### 3. Phase 4a re-fetch

Replace:

> Re-run Phase 1a + 1b + 1c against the current PR number.

With:

> Re-run `pr-address exec get-feedback <pr_number>` against the current PR.

### 4. Leave Phase 0 alone

Phase 0b's `get-review-comments <pr> --include-resolved` stays — it only
needs threads, and it runs before reopening, so its data isn't reusable
by Phase 1 anyway.

## Verification

1. `grep -n "get-review-comments\|get-reviews\|get-discussion-comments" skills/pr-address/SKILL.md`
   should show only the Phase 0b hit (plus the allowed-tools wildcard
   `Bash(pr-address *)` which covers everything).
2. Run the skill end-to-end on an open PR with at least one review,
   one inline thread, and one discussion comment. Confirm Phase 1
   makes exactly one `pr-address exec` call for the feedback fetch and
   the classifier still produces a complete plan.
3. Confirm the empty-case path still triggers on a PR with no feedback
   (`get-feedback` returns empty `reviews`, `review_threads`,
   `discussion_comments`).
