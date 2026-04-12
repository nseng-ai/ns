---
name: objective-progress
description: "Progress an objective by reading its GitHub issue, assessing the codebase, and implementing the next piece of work. Use when the user wants to make progress on an existing twerk objective, pick up where they left off, or continue a multi-session workstream. When the user says only 'progress the objective', first infer the objective from `Objective: #N` trailers on commits reachable from `HEAD` but not from trunk/default branch; this handles the common case of a Graphite stack. Ask the user only if those in-flight commits do not identify a single objective. Trigger on phrases like 'progress the objective', 'work on objective #N', 'continue the objective', or 'pick up objective #N'."
allowed-tools:
  - "Bash(git symbolic-ref *)"
  - "Bash(git merge-base *)"
  - "Bash(git log *)"
  - "Bash(gh issue view *)"
  - "Bash(gh issue list *)"
  - "Bash(gh issue edit *)"
  - "Bash(gh issue comment *)"
  - "Bash(gh issue close *)"
---

# twerk-objective-progress

Read an objective issue, figure out what to do next, do it, and record what
happened.

## Goal

Make meaningful progress on an objective by:

1. Understanding the objective and what's been done
2. Assessing the current state of the codebase
3. Determining the next useful piece of work
4. Implementing it
5. Recording progress back to the GitHub issue

## Inputs

The user provides an objective reference: an issue number, a GitHub URL, or
just says "progress the objective" (in which case, infer it from the current
branch's in-flight commits first, then fall back to discovery).

## Workflow

### 1. Resolve the objective

Use this precedence order. Prefer the strongest signal from the current branch
before asking the user.

#### 1a. Explicit user input wins

If the user provided an issue number or URL, fetch it:

```bash
gh issue view <number> --json title,body,state,labels,comments
```

#### 1b. If no objective was provided, infer it from commits on the current branch that are not on trunk

Continuing an objective usually happens on a branch or Graphite stack that is
already in flight. Infer the objective from commit trailers on commits that are
reachable from `HEAD` but not from the repo's trunk/default branch.

Resolve the trunk/default branch, compute the merge-base with `HEAD`, then
inspect commit bodies in that range:

```bash
git symbolic-ref --short refs/remotes/origin/HEAD | sed 's#^origin/##'
git merge-base HEAD origin/<trunk>
git log --first-parent --format=%B <merge-base>..HEAD
```

Parse `Objective: #<number>` trailers from those commit bodies.

Decision rules:

- If there are no commits in `<merge-base>..HEAD`, or no `Objective:` trailers
  are present, continue to fallback discovery.
- If exactly one unique objective number appears, use it automatically.
- If multiple trailers appear but they all reference the same objective number,
  use it automatically.
- If multiple different objective numbers appear, ask the user to
  disambiguate. This can happen when a branch or stack mixes work from
  different objectives.

Using `--first-parent` keeps the scan focused on the branch's mainline history.
This works well for the common Graphite case where a stack is linear and all
in-flight commits belong to the same objective.

When you auto-detect the objective, tell the user which one you inferred and
why. Example: "I inferred objective #24 from `Objective: #24` trailers on
commits in the current branch that are not on trunk."

#### 1c. Fall back to open-objective discovery

If in-flight branch commits did not identify a single objective, list open
objectives:

```bash
gh issue list --label twerk-objective --state open --json number,title
```

- If there's exactly one open objective, use it.
- If there are multiple, ask the user which one to progress.
- If there are none, tell the user and stop.

### 2. Read and understand

Read the full objective body and comments. Understand:

- What is the goal?
- What work has already been done?
- What remains?
- What constraints or design decisions apply?
- What assumptions or risks have been identified?

Comments may contain progress logs, lessons learned, or direction changes from
prior sessions. Read them — they are the running record of this objective.

### 3. Assess the codebase

Based on what the objective describes, explore the relevant parts of the
codebase. Focus on what's needed to understand the starting point for the next
piece of work:

- What exists already?
- What patterns should be followed from prior work on this objective?
- What's the right place to make changes?

Don't do a broad survey. Be targeted.

### 3b. Review assumptions and risks

If the objective has an "Assumptions & Risks" section (in the body or in prior
reconciliation comments), review each entry against what you observe in the
codebase:

- Confirm assumptions that are still valid
- Flag assumptions that are now invalid — these may change the plan
- Note new risks or open questions discovered during assessment

Carry this forward into the reconciliation comment (step 7).

### 4. Determine what to do next

Based on the objective and codebase state, decide what the next meaningful
piece of work is.

The objective itself may specify granularity: phases, nodes, milestones,
ordered bullet points, or just prose. Follow whatever structure it provides.
If the objective is freeform, use judgment.

Guidelines:

- Pick work that's achievable in this session
- Prefer work that unblocks future progress
- If the objective has a roadmap or ordered plan, follow it
- If freeform, pick the most impactful next step

**Tell the user what you plan to work on and why before starting
implementation.** Wait for confirmation if the choice is non-obvious.

### 5. Implement

Do the work on the current branch:

- Write code, write tests, run tests, fix issues
- Follow the project's development rules and conventions
- If the scope grows beyond what's reasonable for one session, stop at a
  coherent boundary and note what remains
- **Every commit must include an `Objective: #<number>` trailer** in the
  commit message. This links commits to the objective so that
  `twerk-objective-reconcile` can auto-detect the association from a PR's commits
  without requiring human input. Format:

  ```
  Add GitHub gateway types and ABC

  Objective: #23
  Co-Authored-By: ...
  ```

### 6. Evaluate completion criteria

The objective should have a "Completion Criteria" section with concrete,
verifiable conditions. After implementing, evaluate each condition against the
current state of the codebase:

- **Met**: The condition is satisfied by what exists in the codebase now.
- **Not yet**: The condition is not yet satisfied. Note what's missing.
- **Partially met**: Some aspects are satisfied. Note what remains.

If the objective has no completion criteria, skip this step.

### 6b. If all criteria are met — offer to close

When every completion criterion is met, tell the user the objective appears
complete and ask if they want to close it. If they confirm:

1. Verify that reconciliation comments link artifacts for completed work.
   Flag any significant work with no linked artifacts.
2. Check for unfinished plan items, open questions, or unresolved risks.
   Each must be either:
   - **Deferred**: explicitly noted as out of scope
   - **Moved**: captured in a new objective or issue
3. Write a closure comment to the issue:

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
*Closed by twerk-objective-progress*
```

4. Close the issue:

```bash
gh issue comment <number> --body-file <temp-file>
gh issue close <number>
```

If the user declines to close, or if some criteria are unmet, continue to
step 7 as normal.

### 7. Reconcile — update the GitHub issue

After completing work, update both the issue body and post a reconciliation
comment. The body is the current-state snapshot; the comments are the history.

#### 7a. Rewrite the issue body

Take the existing issue body and update it in place to reflect current reality:

- **Roadmap**: mark completed items with ~~strikethrough~~ and a ✅, link the PR or branch
- **Completion Criteria**: annotate met criteria with status and evidence
- **Assumptions & Risks**: strike invalidated assumptions, add newly discovered risks
- **Context Anchor**: update if pointers have changed (new files, renamed modules, etc.)

Preserve the overall structure and template shape — don't reorganize, just
update. The body should always read as an accurate snapshot of where the
objective stands right now.

```bash
gh issue edit <number> --body-file <temp-file>
```

#### 7b. Post reconciliation comment

Use `references/reconciliation-comment-template.md` as the comment shape.
The comment must include:

- **What was worked on**: phase/step reference and branch name
- **What changed**: concrete list of changes made
- **Artifacts**: links to PRs, commit SHAs, or other outputs
- **New findings**: assumptions confirmed or invalidated, risks discovered,
  lessons learned — anything that affects the objective going forward
- **Next steps**: what should be picked up next
- **Completion criteria status**: a table evaluating each criterion

Write the comment using:

```bash
gh issue comment <number> --body-file <temp-file>
```

This comment is the handoff to the next session. Make it specific enough that
a fresh session can pick up without re-deriving context.

### 8. Report to the user

When done, summarize:

- What was implemented
- What tests were added or updated
- Completion criteria evaluation (which conditions are met, which remain)
- Suggested next steps for a future session
- Confirmation that the reconciliation comment was posted

## Rules

- Work on the current branch. Do not create branches or PRs.
- Always post a reconciliation comment to the issue after completing work.
  This is how progress is preserved across sessions.
- Follow the project's existing patterns and conventions.
- Run tests before declaring work complete.
- When inferring an objective implicitly, only use commits in the current
  branch that are not also on trunk; do not scan arbitrary recent repo history.
- If you hit a significant design decision or ambiguity, ask the user rather
  than guessing.
