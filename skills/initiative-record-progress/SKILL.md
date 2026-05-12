---
name: initiative-record-progress
description: Record progress, findings, decisions, blockers, or repo drift for an existing checked-in initiative under docs/initiatives by writing one new update file and skeptically refreshing durable initiative state.
allowed-tools:
  - "Read"
  - "Write"
  - "Edit"
  - "Bash(find *)"
  - "Bash(rg *)"
  - "Bash(git *)"
  - "Bash(ls *)"
  - "Bash(test *)"
  - "Bash(date -u *)"
  - "Bash(mkdir -p *)"
---

# initiative-record-progress

Record progress for a checked-in initiative under `docs/initiatives/<slug>/` by
writing one new update file and skeptically refreshing `initiative.md` and
`roadmap.md` from current session, branch, and repo evidence.

Initiatives are durable markdown workstreams stored in the repository. This
skill records evidence from the current session or branch and refreshes durable
initiative state when the evidence shows it is stale.

## When To Use

Use this skill when the user asks to:

- record progress for an initiative
- write, add, log, capture, or save an initiative update
- summarize current session, branch, PR, implementation, investigation, or
  review findings for an initiative
- preserve a decision, blocker, abandoned approach, repo-drift finding, or change
  in understanding
- refresh initiative state after a rebase, restack, trunk update, or other
  checked-out repository change that affects the plan

Do not use this skill to create a new initiative, choose the next work item,
compact initiative docs for readability, close an initiative, or implement
source changes.

Do not write ceremonial updates. If there is no concrete progress, finding,
decision, blocker, repo drift, or follow-up to preserve, ask what should be
recorded instead of creating a vague file.

## Output

Write exactly one new markdown file:

```text
docs/initiatives/<slug>/updates/YYYY-MM-DDTHHMMSSZ-short-description.md
```

Also refresh `initiative.md` and `roadmap.md`. The refresh may make no edits; if
durable files are already current, leave them unchanged and say so.

The update file has no frontmatter. Metadata already exists in the path,
filename, Git history, branch, and PRs. Do not duplicate unstable metadata in the
body unless it is semantically useful.

Treat the body as an initiative-state delta, not a branch changelog. Capture
what should influence future curation of `initiative.md` or `roadmap.md`: status
changes, resolved or newly opened questions, decisions, risks, blockers,
constraints, and next work. Do not reproduce commit-message history, file
inventories, or implementation mechanics unless a specific artifact is necessary
durable context.

## Template Path

Resolve the template relative to this skill directory:

- `skills/initiative-record-progress/templates/progress-record.md`

Use the template as a starting point. Delete placeholder prose and avoid empty
noise.

## Inputs

Accept an optional initiative slug or path from the prompt.

If no initiative is named:

1. Inspect `docs/initiatives/`.
2. If the current branch name exactly matches an initiative slug, use that
   initiative.
3. If exactly one initiative exists, use it.
4. If multiple initiatives are plausible, list the options and ask the user to
   choose.

Never invent an initiative slug. Do not infer hidden state from brmem or other
agent memory. Do not infer a slug from a partial branch-name match.

Use any explicit progress summary, title, PR context, branch context, repo-drift
context, or follow-ups supplied by the user as primary evidence.

## Reads

Always read:

- `docs/initiatives/<slug>/initiative.md`
- `docs/initiatives/<slug>/roadmap.md`, if present
- every markdown file in `docs/initiatives/<slug>/updates/`, if present
- `skills/initiative-record-progress/templates/progress-record.md`

Also inspect current repository state: branch and worktree status, recent git
history, changed-file summaries or targeted diffs, and any source, docs, or
tests needed to describe progress or repo drift accurately.

Read every prior update, but keep source inspection targeted — this is not a
full-codebase audit.

## Mutation Boundary

This skill may:

- create `docs/initiatives/<slug>/updates/` if the initiative exists but the
  directory is missing
- write exactly one new markdown file under that `updates/` directory
- edit `docs/initiatives/<slug>/initiative.md`
- edit `docs/initiatives/<slug>/roadmap.md`

This skill must not:

- edit existing update files, except for an immediate correction during the same
  response before final reporting
- create branches, commit changes, submit PRs, or implement work
- use brmem or any hidden agent state
- add frontmatter or stable roadmap item IDs
- query external systems as a required part of v1 refresh
- perform cosmetic rewrites unrelated to the recorded evidence or current repo
  state

## Workflow

### 1. Resolve the initiative

Find the initiative directory.

Useful commands:

```bash
find docs/initiatives -mindepth 1 -maxdepth 1 -type d | sort
git branch --show-current
```

When a slug or path is supplied, verify that the directory exists and contains
`initiative.md`. If it does not, stop and report the mismatch.

If `docs/initiatives/` does not exist or no initiatives exist, stop and suggest
`initiative-create` only when the work appears initiative-sized.

### 2. Load full initiative state

Read `initiative.md` and `roadmap.md` if present.

List update files oldest-to-newest and read all of them:

```bash
find docs/initiatives/<slug>/updates -maxdepth 1 -type f -name '*.md' | sort
```

If there are many updates, still account for all of them. Summarize older updates
internally instead of copying large content into the response.

### 3. Gather current repo evidence

Use the conversation first. Then inspect lightweight repository evidence:

```bash
git status --short
git branch --show-current
git log --oneline --decorate -10
git diff --stat
git diff --cached --stat
```

Use `git log` to understand recent work, but do not copy raw branch-local commit
hashes into update prose by default; they can change during amend, rebase,
restack, or squash. Treat git evidence as source material, not content: prefer
"this closes or advances roadmap area X and leaves Y" over "files A/B/C changed"
unless those paths are durable artifacts future work needs.

Reach for targeted diffs, git history, or file reads only when needed to avoid a
misleading summary or to refresh durable state accurately.

Repo drift is valid evidence. If a rebase, restack, trunk merge, or other
checked-out change affects initiative assumptions, roadmap ordering, completion
status, or follow-up work, record that as a finding even when no new
implementation commits were authored in the current session.

### 4. Decide whether an update is warranted

Write an update when there is concrete durable context, such as:

- implementation progress or validation completed
- a finding from investigation or review
- a decision or tradeoff
- a blocker, risk, or abandoned approach
- a change in understanding that should influence future work
- follow-up work discovered during the session
- repository drift that invalidates assumptions or changes future work

Ask before writing when the only available content would be generic status such
as "continued work" or when multiple initiatives could plausibly own the same
progress.

### 5. Draft the update

Use the template sections:

```markdown
# Short Update Title

## Summary

## Roadmap Context

## Initiative Impact

## Follow-Ups
```

Guidance:

- Title the update with an outcome or finding, not a timestamp.
- Treat the body as durable initiative evidence, not a raw branch changelog.
  Center roadmap movement, open-question changes, blockers, decisions, repo
  drift, validation, and follow-ups that should influence future state.
- Keep prose useful after branches merge and PRs close.
- Default to concise durable deltas; most sections should be short paragraphs or
  focused bullets, not a transcript of the branch.
- Center initiative text and status: roadmap movement, open-question changes,
  decisions, risks, blockers, constraints, and next work.
- Use durable anchors sparingly: artifact paths, PR numbers/URLs once submitted,
  validation commands, observed outcomes, and user-supplied context. Include
  them only when a future reader needs the specific anchor.
- Avoid raw branch-local commit hashes. Include a SHA only when the user asks,
  when the commit is already merged/released/stable, or when it names an
  external immutable artifact such as a CI run, release, or incident report.
- Example: write `Added docs/example.md` rather than `Added docs/example.md at
  commit abc1234`.
- Name roadmap areas in prose. Do not invent stable IDs such as `R-001`.
- When relevant, state whether the roadmap area is completed, partially
  complete, blocked, newly discovered, or unchanged.
- Distinguish observed facts from assumptions.
- Include validation evidence when it matters.
- Keep follow-ups concrete. Use `- None identified.` only when there truly are
  no follow-ups worth preserving.

Do not claim work is complete solely because files changed. Tie completion
claims to tests, commits, reviewable artifacts, current repository evidence, or
explicit user statements.

### 6. Skeptically refresh durable state

Treat current `initiative.md` and `roadmap.md` as useful durable claims, not as
unquestionable truth.

Refresh from:

- current `initiative.md`
- current `roadmap.md`
- every prior update file
- the drafted new update
- current checked-out repository state and targeted git evidence

Edit `initiative.md` only when durable understanding changed. Appropriate edits
include:

- updating scope or non-goals
- revising constraints, invariants, risks, or open questions
- checking off, adding, removing, or clarifying completion criteria when evidence
  justifies it
- preserving rationale that should survive implementation churn

Do not put progress-log detail in `initiative.md`.

Edit `roadmap.md` as the current ordered work state. Canonical shape:

```markdown
# Roadmap

## Work

- [x] Completed work area.
  - Evidence: Delivered or verified output.

- [~] Partially completed work area.
  - Artifact: Expected reviewable or verifiable output.
  - Status: What is done and what remains.

- [ ] Not-started work area.
  - Artifact: Expected reviewable or verifiable output.

## Parked

- Deferred, blocked, rejected for now, canceled, or waiting work.
```

Roadmap refresh rules:

- Mark items with durable completion evidence as `[x]` in place and add or
  update an `Evidence:` sub-bullet when useful.
- Mark partially completed items as `[~]` and add or update a `Status:`
  sub-bullet describing what is done and what remains.
- Keep not-started work unchecked (`[ ]`) in the ordered `Work` list.
- Park obsolete, canceled, intentionally deferred, blocked, or waiting work under
  `Parked` as plain bullets.
- Keep completed and partially completed items visible in `Work` unless the user
  asks to compact or condense them.
- Reorder work only when evidence invalidates sequencing, while preserving
  user-useful context.
- Normalize legacy `Completed` / `In Progress` / `Remaining` and `Now` / `Next`
  / `Later` roadmaps into `Work` and `Parked` when the roadmap is already being
  edited for substantive refresh. Do not perform a section-only migration when
  no durable state changed.
- Keep entries outcome-oriented and artifact-backed. Preserve useful `Artifact`,
  `Evidence`, `Status`, and `Notes` sub-bullets.
- Do not invent stable numbered IDs.
- Do not perform cosmetic rewrites unrelated to the recorded evidence or current
  repository state.

If the refresh changes sequencing, parks work, or substantially changes durable
understanding, the new update or final response should explain why.

### 7. Choose the filename

Generate the timestamp with:

```bash
date -u +%Y-%m-%dT%H%M%SZ
```

Use the command output verbatim. Do not hand-type the timestamp.

Generate a short description slug from the update title or main outcome:

- lowercase ASCII letters and digits
- single hyphens as separators
- no leading, trailing, or consecutive hyphens
- usually 2-6 words

Example:

```text
2026-05-11T143217Z-create-skill-shape.md
```

Before writing, ensure the file does not already exist:

```bash
test -e docs/initiatives/<slug>/updates/<filename> && echo collision
```

If a collision occurs, rerun `date -u` for a fresh timestamp. Never overwrite an
existing update file.

### 8. Write the update and durable refresh

Create the updates directory only if needed:

```bash
mkdir -p docs/initiatives/<slug>/updates
```

Then write the completed markdown file under that directory and apply any needed
edits to `initiative.md` and `roadmap.md`.

Do not rewrite previous updates for consistency.

## Readability-Only Rewrites

Normal stale-state handling belongs in this skill. Do not defer refresh work when
the current update or repo evidence makes durable files stale; refresh them now.

Do not perform broad readability rewrites, condensed-roadmap passes, or structural
reorganizations that are unrelated to the evidence being recorded. If durable
files are factually current but hard to read, report that separately and say no
standard initiative workflow owns it yet.

## Final Response

After writing the update, return:

- initiative slug and update file path
- which durable files were edited, or that none needed edits
- concise summary of what was captured, including any repo-drift finding or
  recorded follow-ups
- any readability-only rewrite or broad reorganization intentionally left out,
  when relevant
