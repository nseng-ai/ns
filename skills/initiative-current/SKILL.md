---
name: initiative-current
description: Read an existing checked-in initiative under docs/initiatives and summarize its current state. Use when the user asks for initiative status, orientation, where things stand, recent progress, blockers, stale areas, or a read-only current-state view.
allowed-tools:
  - "Read"
  - "Bash(find *)"
  - "Bash(rg *)"
  - "Bash(git *)"
  - "Bash(ls *)"
  - "Bash(test *)"
---

# initiative-current

Summarize the current state of an existing checked-in initiative.

Initiatives are durable markdown workstreams under `docs/initiatives/`. This
skill is read-only: it orients the user by reading the initiative files, recent
updates, and lightweight repository state. It does not choose the next piece of
work or mutate initiative documents.

## When To Use

Use this skill when the user asks to:

- show the current state or status of an initiative
- get oriented on an initiative after time away
- summarize recent initiative progress, findings, blockers, or decisions
- check whether initiative docs appear stale
- understand how the current branch relates to an initiative

Do not use this skill to create a new initiative, choose the next work item,
record progress, refresh durable files, close an initiative, or implement source
changes.

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

## Reads

Always read:

- `docs/initiatives/<slug>/initiative.md`
- `docs/initiatives/<slug>/roadmap.md`, if present
- recent files in `docs/initiatives/<slug>/updates/`, if present

Also read when useful:

- current git branch and worktree status
- recent git history for the current branch
- targeted source, docs, or tests only when needed to explain current state

Keep inspection proportional. This skill should answer "where are we now?", not
audit the whole repository.

## Mutation Boundary

This skill is read-only.

Do not:

- edit `initiative.md`
- edit `roadmap.md`
- create or edit files under `updates/`
- create a branch
- commit changes
- implement source, test, or docs changes
- use brmem or hidden agent state

If progress needs to be recorded, recommend `initiative-record-progress`. If
durable initiative files are stale, recommend `initiative-record-progress` so the
stale-state finding can be recorded and durable files can be refreshed. If
durable files are factually current but hard to read, report that as a readability
issue instead of naming a separate workflow. If the user wants a concrete next
work item, recommend `initiative-next`.

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

If `docs/initiatives/` does not exist or no initiatives exist, say so. Suggest
`initiative-create` only when the request appears initiative-sized.

### 2. Load initiative state

Read `initiative.md` and `roadmap.md` if present.

List update files newest-first and read the most recent few:

```bash
find docs/initiatives/<slug>/updates -maxdepth 1 -type f -name '*.md' | sort -r
```

Default to the most recent 3-5 updates. Read more only when the user asks for a
fuller history, recent updates appear to supersede each other, or the durable
files are ambiguous.

### 3. Inspect lightweight branch context

Use repository state to orient the summary when useful:

```bash
git status --short
git branch --show-current
git log --oneline --decorate -5
```

Do not over-read source files. Use targeted source, docs, or tests only when the
initiative files or recent updates point to them and they are needed to avoid a
misleading status summary.

### 4. Build the effective roadmap state

Present the initiative's current state, not just the literal `roadmap.md`
snapshot. Combine roadmap entries with update evidence.

Use the current ontology in the response:

- `Completed`: roadmap areas with durable evidence of completion.
- `In Progress`: partially completed roadmap areas. Omit this section when empty.
- `Remaining`: incomplete roadmap areas, in useful order.
- `Parked`: deferred, blocked, rejected-for-now, canceled, or
  waiting-on-external-facts work.

Backward compatibility:

- If `roadmap.md` uses legacy `Now`, `Next`, and `Later` sections, do not expose
  those headings in the final response.
- Treat unchecked legacy `Now`, `Next`, and `Later` entries as ordered
  `Remaining` candidates, preserving that order.
- Keep legacy `Parked` entries as `Parked`.
- If updates show a legacy entry is complete, present it under `Completed`.
- If updates show a legacy entry is partially complete, present it under
  `In Progress`.

Completion inference:

- A checked roadmap entry may be shown as `Completed`.
- An update may move an item to `Completed` when it records a reviewable artifact,
  validation result, merged PR, checked-in doc, explicit user decision, or other
  durable completion evidence for that roadmap area.
- An update may move an item to `In Progress` when it records partial progress and
  clear remaining work.
- Do not claim completion from vague activity such as "continued work".
- Include brief evidence for inferred completion when it helps explain why the
  effective view differs from `roadmap.md`.

Also extract:

- initiative title and thesis
- scope, non-goals, constraints, and invariants that matter now
- completion criteria and visible progress toward them
- recent progress, findings, decisions, blockers, and follow-ups from updates
- current branch/worktree context, when relevant
- open questions or risks that still affect the initiative

Treat update files as evidence, not canonical truth. If the effective view
substantially differs from `roadmap.md`, report the difference and note that
`initiative-record-progress` can record the stale-state finding and refresh
durable files. Do not rewrite durable state from this skill.

### 5. Stay out of planning mode

This skill may identify the most visible active work or blocker, but it should
not select the next implementation task or produce a full work plan. The
`Remaining` section is a state readout, not a recommendation. If the user asks
what to do next, switch to or recommend `initiative-next`.

## Final Response

Return:

- initiative slug and title
- concise thesis or purpose
- branch/worktree context, if relevant
- effective roadmap state using `Completed`, optional `In Progress`, `Remaining`,
  and `Parked`
- recent updates summary
- blockers, risks, open questions, or stale-state warnings
- completion-state readout, if the files make it clear
- recommended follow-up skill only when useful:
  - `initiative-next` for next-work planning
  - `initiative-record-progress` for saving new progress or refreshing stale
    durable files
- readability or organization concerns, when useful

Keep the response factual and read-only. Do not invent roadmap IDs, frontmatter,
or hidden metadata.
