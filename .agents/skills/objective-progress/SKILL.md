---
name: objective-progress
description: "Progress an objective by reading its GitHub issue, assessing the codebase, and implementing the next piece of work. Use when the user wants to make progress on an existing twerk objective, pick up where they left off, or continue a multi-session workstream. Trigger on phrases like 'progress the objective', 'work on objective #N', 'continue the objective', or 'pick up objective #N'."
allowed-tools:
  - "Bash(gh issue view *)"
  - "Bash(gh issue list *)"
---

# objective-progress

Read an objective issue, figure out what to do next, and do it.

## Goal

Make meaningful progress on an objective by:

1. Understanding the objective and what's been done
2. Assessing the current state of the codebase
3. Determining the next useful piece of work
4. Implementing it

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

Comments may contain progress logs, lessons learned, or direction changes from
prior sessions. Read them.

### 3. Assess the codebase

Based on what the objective describes, explore the relevant parts of the
codebase. Focus on what's needed to understand the starting point for the next
piece of work:

- What exists already?
- What patterns should be followed from prior work on this objective?
- What's the right place to make changes?

Don't do a broad survey. Be targeted.

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

### 6. Evaluate done-when conditions

The objective should have a "Done When" section with concrete, verifiable
conditions. After implementing, evaluate each condition against the current
state of the codebase:

- **Met**: The condition is satisfied by what exists in the codebase now.
- **Not yet**: The condition is not yet satisfied. Note what's missing.
- **Partially met**: Some aspects are satisfied. Note what remains.

If all conditions are met, tell the user the objective appears complete.

If the objective has no done-when conditions, skip this step.

### 7. Report

When done, summarize:

- What was implemented
- What tests were added or updated
- Done-when evaluation (which conditions are met, which remain)
- Suggested next steps for a future session

## Rules

- Work on the current branch. Do not create branches or PRs.
- Do not update the objective issue (no comments, no body edits). That is
  handled by a separate process.
- Follow the project's existing patterns and conventions.
- Run tests before declaring work complete.
- If you hit a significant design decision or ambiguity, ask the user rather
  than guessing.
