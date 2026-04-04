---
name: initiative
description: Plan and manage long-running, multi-session initiatives with a living markdown source-of-truth document. Use for bigger refactors, multi-phase projects, building a whole app/feature/system, or any initiative too large for one session or one pull request. Also use when asked to create, refresh, or execute the next step of an existing initiative file.
tags: [initiative, long-term-objectives, roadmap, multi-session]
---

> **Note**: This document is a reference only, not an active skill. It captures the design of Lee Byron's "initiative" skill for study and inspiration.

# Initiative

## Overview

Use this skill to create and maintain initiative documents for major workstreams that span multiple sessions. Keep one markdown file as the durable plan, progress log, and decision record.
When a user asks to continue an existing initiative, explicitly use this skill workflow and resume from the existing initiative file.

## When Not To Use This Skill

- Single-session, single-PR tasks with clear scope.
- Small bug fixes or narrowly scoped tweaks.
- Work with no meaningful sequencing or cross-task dependencies.
- Short exploratory spikes where you only need quick findings.
- One-off operational asks (for example rerunning CI or updating one config value).

## Directory Convention

- Store initiative docs in `<subrepo>/.codex/initiatives/`.
- Keep initiative docs as a flat list of markdown files directly under `.codex/initiatives/`.
- Do not create nested initiative subdirectories.
- Name files `<initiative-slug>.md`. Add a date prefix only when needed to avoid collisions.

## Core Rules

1. Treat the initiative markdown file as the source of truth for scope, plan, and decisions.
2. Map each task to a concrete artifact (PR, merged commit, design doc, migration, dashboard, test plan, or validated report).
3. Each initiative file must start with frontmatter containing only:
   - `owner`: email address from `git config user.email` at initiative creation time.
   - `created`: creation timestamp with date and time.
   - `updated`: last-refresh timestamp with date and time.
4. Do not include initiative metadata fields like initiative ID, status, or related repos in the initiative file header block.
5. Any owner reference anywhere in the initiative file must use a user git email address (for example `git config user.email`), never a display name and never `Codex`.
6. Assume the initiative file is stale after every completed task and refresh `updated` before ending the session.
7. Preserve rationale and invariants even when implementation details change.
8. Re-plan proactively when new facts invalidate assumptions, sequencing, or scope.
9. Initiative files should be highly readable to users, but do not assume users have read them; be ready to report current status, next steps, risks, and decisions directly in the conversation.

## Initiative Lifecycle

### 1) Start an Initiative

1. Confirm this should be an initiative:
   - Use this path when the problem cannot reasonably finish in one session or one PR.
   - Use this path when a staged rollout, migration, or broad refactor is required.
2. Perform substantial discovery before writing tasks:
   - Inspect architecture docs, relevant AGENTS/standards, and adjacent systems.
   - Read likely code paths and identify dependencies, ownership, and risk boundaries.
   - Capture unknowns and validation checkpoints.
3. Check for existing initiatives in `.codex/initiatives/*.md` and look for close matches.
   - Prefer continuing an existing close-match initiative over creating a duplicate.
   - Create a new initiative only when no close match exists or when explicitly directed.
4. Create a markdown file in `.codex/initiatives/<initiative-slug>.md` using `references/initiative-template.md`.
5. Initialize frontmatter:
   - Set `owner` to `git config user.email`.
   - Set `created` and `updated` to the current date-time.
6. Fill in rationale first:
   - State why the work matters and what must remain true even if implementation changes.
7. Build the work hierarchy:
   - Small effort: flat task list.
   - Medium effort: phases with tasks.
   - Very large effort: phases with sub-phases and tasks.
8. Attach an artifact expectation to each task.
9. Mark confidence, assumptions, and open questions explicitly.

### 2) Execute the Next Task

1. Re-open the initiative file first and read assumptions and next tasks.
2. Choose the highest-priority unblocked task with a clear artifact target.
3. Implement and validate the task artifact.
4. Update the initiative immediately after completing task work:
   - Mark task state.
   - Record what changed and what was learned.
   - Link artifacts and evidence.
   - Update frontmatter `updated` to the current date-time.

### 3) Refresh the Initiative After Every Task

Run the checklist in `references/initiative-refresh-checklist.md` every time a task completes. At minimum:

- Update frontmatter `updated`.
- Mark completed tasks and adjust remaining sequencing.
- Add net-new findings to assumptions, risks, and notes.
- Remove invalidated assumptions.
- Record codebase or dependency drift that affects future tasks.

### 4) Maintain Planning Quality

- Keep task items outcome-oriented and artifact-backed.
- Split tasks that are too large to validate in one session.
- Collapse or delete tasks made obsolete by new learning.
- Introduce sub-phases when a phase becomes too broad to track clearly.

### 5) Close the Initiative

Close only when:

- All must-have outcomes are complete.
- Final artifacts are linked and verified.
- Remaining items are either explicitly deferred or moved to a new initiative.
- The summary explains delivered impact and follow-up recommendations.

When the final task is complete and closure conditions are met, remove the initiative markdown file from `.codex/initiatives/` to indicate no remaining work.

## Reference Files

- `references/initiative-template.md`: Canonical structure for new initiative documents.
- `references/initiative-refresh-checklist.md`: Session-end refresh steps to keep initiative files current.

Load and follow both references when creating or updating an initiative.

## Example Triggers

- "Plan this migration that will take multiple weeks."
- "Create an initiative for rolling out this architecture change."
- "Break this bigger refactor into phases and track it as an initiative."
- "Plan and execute a multi-phase project across multiple PRs."
- "Create an initiative to build this whole app/feature end to end."
- "Take the next task in this initiative file and update it afterward."
- "Refresh this initiative doc based on what we learned in the last PR."
- "Continue the existing initiative for this project."
