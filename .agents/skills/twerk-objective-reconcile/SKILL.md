---
name: twerk-objective-reconcile
description: "Reconcile an objective after landing a PR. Auto-detects the PR from the current branch and the objective from Objective: #N trailers in commit messages — zero arguments needed in the common case. Reads the merged PR, updates the objective issue body to reflect current state, and posts a reconciliation comment as a log entry. Use after merging a PR — 'reconcile', 'reconcile objective', 'reconcile PR #M', 'update objective after merge'. The body is the state snapshot; the comments are the history."
allowed-tools:
  - "Bash(gh pr view *)"
  - "Bash(gh pr diff *)"
  - "Bash(gh issue view *)"
  - "Bash(gh issue edit *)"
  - "Bash(gh issue comment *)"
  - "Bash(gh issue close *)"
  - "Bash(mktemp)"
---

# twerk-objective-reconcile

Update an objective issue after a PR has been merged.

## Goal

Read a merged PR's metadata and diff, then update the objective issue to
reflect what was accomplished. Two outputs:

1. **Rewritten issue body** — the body is always the current-state snapshot
2. **Reconciliation comment** — the log entry for this specific PR

The body is the state. The comments are the history.

## Inputs

Both inputs are auto-detectable — the common case requires zero arguments:

- **PR number** — auto-detected from current branch, or provided explicitly
- **Objective issue number** — auto-detected from `Objective: #N` trailer in
  the PR's commit messages, or provided explicitly

## Workflow

### 1. Resolve inputs

**PR**: If no PR number was provided, detect from the current branch:

```bash
gh pr view --json number,state --jq '{number: .number, state: .state}'
```

**Objective**: If no objective number was provided, read the PR's commit
messages and look for an `Objective: #N` trailer:

```bash
gh pr view <pr> --json commits --jq '.commits[].messageBody'
```

Parse `Objective: #<number>` from the commit message bodies. If commits
reference multiple different objective numbers, ask the user to disambiguate.
If no `Objective:` trailer is found, ask the user for the objective number.

### 2. Read the merged PR

```bash
gh pr view <pr> --json title,body,mergedAt,additions,deletions,changedFiles,commits,url,headRefName,state
```

Confirm the PR is merged. If it's not merged, tell the user and stop — this
skill is for post-merge reconciliation only.

### 3. Read the PR diff summary

```bash
gh pr diff <pr> --stat
```

This gives a quick overview of what files changed and the scope of the work.

### 4. Read the objective

```bash
gh issue view <objective> --json title,body,state,comments
```

Parse the issue body to extract:

- Completion criteria
- Roadmap items
- Assumptions & risks
- Context anchor
- Prior reconciliation comments (to understand what's already been done)

### 5. Assess

Determine:

- Which roadmap item(s) this PR addressed
- Which completion criteria are now met / partially met / not yet
- Any assumptions confirmed or invalidated by the changes
- What the next roadmap item or piece of work is

### 6. Rewrite the issue body

Take the existing issue body and update it in place to reflect current reality:

- **Roadmap**: mark completed items with ~~strikethrough~~ and a checkmark,
  link the PR
- **Completion Criteria**: annotate met criteria with status and evidence
- **Assumptions & Risks**: strike invalidated assumptions, add newly
  discovered risks
- **Context Anchor**: update if pointers have changed (new files, renamed
  modules, etc.)

Preserve the overall structure and template shape — don't reorganize, just
update. The body should always read as an accurate snapshot of where the
objective stands right now.

```bash
gh issue edit <objective> --body-file <temp-file>
```

### 7. Post reconciliation comment

Write a structured comment as the log entry for this PR:

```markdown
## Progress Update

**Phase/Step**: [roadmap item addressed]
**PR**: [link to merged PR]

### What Changed

- [derived from PR title/body/diff]
- [another change]

### Artifacts

- [PR URL]

### New Findings

- [assumptions confirmed or invalidated]
- [risks discovered]

### Next Steps

- [next roadmap item, or what remains]
- [blockers or decisions needed]

### Completion Criteria Status

| Criterion | Status |
|-----------|--------|
| [criterion from objective] | met / partially met / not yet |

---
*Updated by twerk-objective-reconcile*
```

Post via:

```bash
gh issue comment <objective> --body-file <temp-file>
```

### 8. If all criteria are met — offer to close

When every completion criterion is met, tell the user the objective appears
complete and ask if they want to close it. If they confirm:

1. Write a closure comment:

```markdown
## Objective Closed

### Delivered
- [What was accomplished, with artifact links]

### Completion Criteria
| Criterion | Status | Evidence |
|-----------|--------|----------|
| [criterion] | met / deferred | [link or explanation] |

### Deferred Items
- [Items explicitly deferred, with rationale]
- [Omit if none]

### Follow-Up
- [New objectives or issues created for remaining work]
- [Omit if none]

---
*Closed by twerk-objective-reconcile*
```

2. Close the issue:

```bash
gh issue comment <objective> --body-file <temp-file>
gh issue close <objective>
```

If the user declines to close, or if some criteria are unmet, skip this step.

### 9. Report

Summarize to the user:

- What was updated in the issue body
- What was posted as a reconciliation comment
- Completion criteria evaluation (which are met, which remain)
- Suggested next steps for a future session

## Rules

- Only run on merged PRs. If the PR is not merged, stop and tell the user.
- Always update both the issue body and post a comment. The body is the
  snapshot; the comment is the log.
- Preserve the issue body's template structure when rewriting — update in
  place, don't reorganize.
- If the PR doesn't clearly map to a roadmap item, ask the user rather than
  guessing.
