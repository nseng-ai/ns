---
name: initiative-record-progress
description: Record progress, findings, decisions, or blockers for an existing checked-in initiative under docs/initiatives by writing exactly one new update file. Use when the user asks to log, capture, save, or write an initiative update for the current session, branch, PR, or workstream.
allowed-tools:
  - "Read"
  - "Write"
  - "Bash(find *)"
  - "Bash(rg *)"
  - "Bash(git *)"
  - "Bash(ls *)"
  - "Bash(test *)"
  - "Bash(date -u *)"
  - "Bash(mkdir -p *)"
---

# initiative-record-progress

Record progress for an existing checked-in initiative by writing one new update
file under `docs/initiatives/<slug>/updates/`.

Initiatives are durable markdown workstreams stored in the repository. This
skill records evidence from the current session or branch; it does not curate
or rewrite durable initiative state.

## When To Use

Use this skill when the user asks to:

- record progress for an initiative
- write, add, log, capture, or save an initiative update
- summarize current session, branch, PR, implementation, investigation, or
  review findings for an initiative
- preserve a decision, blocker, abandoned approach, or change in understanding

Do not use this skill to create a new initiative, choose the next work item,
curate stale durable files, close an initiative, or implement source changes.

Do not write ceremonial updates. If there is no concrete progress, finding,
decision, blocker, or follow-up to preserve, ask what should be recorded instead
of creating a vague file.

## Output

Write exactly one new markdown file:

```text
docs/initiatives/<slug>/updates/YYYY-MM-DDTHHMMSSZ-short-description.md
```

The update file has no frontmatter. Metadata already exists in the path,
filename, Git history, branch, commits, and PRs.

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

Also use any explicit progress summary, title, PR context, branch context, or
follow-ups supplied by the user as primary evidence.

## Reads

Always read:

- `docs/initiatives/<slug>/initiative.md`
- `docs/initiatives/<slug>/roadmap.md`, if present
- recent files in `docs/initiatives/<slug>/updates/`, if present
- `skills/initiative-record-progress/templates/progress-record.md`

Also inspect when useful:

- current git branch and worktree status
- recent commits on the current branch
- `git diff --stat` or targeted diffs for changed files
- relevant source, docs, or tests needed to describe the progress accurately

Keep inspection proportional. This skill records progress; it should not audit
the whole repository or perform curation.

## Mutation Boundary

This skill may:

- create `docs/initiatives/<slug>/updates/` if the initiative exists but the
  directory is missing
- write exactly one new markdown file under that `updates/` directory

This skill must not:

- edit `initiative.md`
- edit `roadmap.md`
- edit existing update files, except for an immediate correction during the same
  response before final reporting
- create branches, commit changes, submit PRs, or implement work
- use brmem or any hidden agent state
- add frontmatter or stable roadmap item IDs

If the update reveals that `initiative.md` or `roadmap.md` is stale, mention the
staleness in the new update when relevant and recommend `initiative-curate` in
the final response. Do not perform curation from this skill.

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

### 2. Load initiative state

Read `initiative.md` and `roadmap.md` if present.

List update files newest-first and read the most recent few:

```bash
find docs/initiatives/<slug>/updates -maxdepth 1 -type f -name '*.md' | sort -r
```

Default to the most recent 3-5 updates. Read more only when recent progress is
ambiguous or the user asks for a fuller history.

### 3. Gather progress evidence

Use the conversation first. Then inspect lightweight repository evidence as
needed:

```bash
git status --short
git branch --show-current
git log --oneline --decorate -5
git diff --stat
git diff --cached --stat
```

Use targeted diffs or file reads only when they are needed to avoid a misleading
summary. If worktree changes are large or mixed, summarize only what can be
confidently tied to the initiative and mark uncertainty honestly.

### 4. Decide whether an update is warranted

Write an update when there is concrete durable context, such as:

- implementation progress or validation completed
- a finding from investigation or review
- a decision or tradeoff
- a blocker, risk, or abandoned approach
- a change in understanding that should influence future work
- follow-up work discovered during the session

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
- Keep prose useful after branches merge and PRs close.
- Name roadmap areas in prose. Do not invent stable IDs such as `R-001`.
- Distinguish observed facts from assumptions.
- Include validation evidence when it matters.
- Mention durable-file staleness only when the update makes it apparent.
- Keep follow-ups concrete. Use `- None identified.` only when there truly are
  no follow-ups worth preserving.

Do not claim work is complete solely because files changed. Tie completion
claims to tests, commits, reviewable artifacts, or explicit user statements.

### 6. Choose the filename

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

### 7. Write exactly one update file

Create the updates directory only if needed:

```bash
mkdir -p docs/initiatives/<slug>/updates
```

Then write the completed markdown file under that directory.

Do not edit any other initiative file. Do not rewrite previous updates for
consistency.

## Staleness Handling

Recommend `initiative-curate` after recording progress when:

- recent updates contradict `initiative.md` or `roadmap.md`
- completed work remains listed as active roadmap work
- roadmap areas are too vague to connect progress to future action
- completion criteria or constraints no longer match the initiative direction
- accumulated updates are becoming difficult to reconstruct into current state

Curation is separate from progress recording. This skill may mention the need
but must not perform it.

## Final Response

After writing the update, return:

- initiative slug and title
- update file path
- concise summary of what was captured
- follow-ups recorded, if any
- whether `initiative-curate` is recommended
