---
name: twerk-objective-progress
description: "Progress an objective by reading its GitHub issue, assessing the codebase, and implementing the next piece of work. Use when the user wants to make progress on an existing twerk objective, pick up where they left off, or continue a multi-session workstream. Trigger on phrases like 'progress the objective', 'work on objective #N', 'continue the objective', or 'pick up objective #N'."
allowed-tools:
  - "Bash(gh issue view *)"
  - "Bash(gh issue list *)"
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
just says "progress the objective" (in which case, find it).

## Workflow

### 1. Resolve the objective

If the user provided an issue number or URL, fetch it:

```bash
gh issue view <number> --json title,body,state,labels,comments
```

If no reference was provided, find open objectives:

```bash
gh issue list --label twerk-objective --state open --json number,title
```

If there's exactly one open objective, use it. If there are multiple, ask the
user which one. If there are none, tell the user and stop.

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

After completing work, write a structured comment to the objective's GitHub
issue. This is the durable record that future sessions will read.

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
- If you hit a significant design decision or ambiguity, ask the user rather
  than guessing.
