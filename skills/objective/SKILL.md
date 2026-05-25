---
name: objective
description: "Use for conceptual questions about asdl Objectives and as shared grounding with objective-create, objective-current, objective-next, objective-update, or objective-close. Read-only."
---

# objective

Read-only grounding for Objective skills. Do not mutate files from this skill.

## Concept

An Objective is a checked-in durable narrative roadmap for multi-session, multi-branch, or multi-PR work.

Active root:

```text
.asdl/objectives/<slug>/
  objective.md
  roadmap.md
  updates/
  closed.md  # optional marker
```

Archive root:

```text
.asdl/objective-archive/<slug>/
  objective.md
  roadmap.md
  updates/
  closed.md  # optional marker, preserved when present
```

Do not use `docs/objectives/`.

Archive state is represented by location. `objective archive <slug>` moves the whole record out of active discovery; `objective archive <slug> --unarchive` moves it back. Open and closed Objectives can both be archived. Archive/unarchive preserve the slug and every file in the record directory.

## Slug identity

The `<slug>` directory name is the durable Objective identity. Titles, command names, product names, prose, branches, and implementation packages may be renamed without changing the Objective slug. Do not move, delete, or recreate an Objective under a new slug unless the user explicitly asks for an Objective slug migration. Archive/unarchive is an explicit location move for the same slug identity, not a slug migration.

## Files

`objective.md` contains durable purpose, boundaries, criteria, assumptions, risks, open questions, and closure context. Required headings:

- `# <Title>`
- `## Thesis`
- `## Scope`
- `## Non-Goals`
- `## Completion Criteria`
- `## Assumptions and Risks`
- `## Open Questions`
- `## Closure` only when closed

`## Assumptions and Risks` captures assumptions that might be disproven and risks that need de-risking, mitigation, acceptance, or explicit follow-up. Keep it narrative and evidence-linked; do not turn it into IDs, owners, due dates, or a task database.

`roadmap.md` contains ordered guidance. Required headings:

- `# Roadmap`
- `## Work`
- `## Parked`

Use only `[ ]`, `[~]`, and `[x]` statuses.

`updates/` contains Semantic Updates: meaningful findings, decisions, blockers, assumption changes, risk de-risking or surfacing, completion evidence, plan changes, or follow-ups. No ceremonial pings or branch changelogs. Required headings:

- `# <Update Title>`
- `## Summary`
- `## Objective Impact`
- `## Follow-Ups`

`closed.md` is a minimal Closure Marker. Its existence means closed; closure meaning belongs in `objective.md`.

## Selection

1. Use an explicit user-provided slug or path under `.asdl/objectives/<slug>/`.
2. If no slug or path is explicit, run `objective list --format md` to enumerate active Objectives (`open` plus `in-flight`) and ask the user to choose. Use `objective list --current --format md` to filter to active Objectives associated with the current branch. Use `objective list --names` only for machine-readable active-slug extraction.
3. If no candidates exist, say so and suggest `objective-create` when appropriate.

`objective-update` has one narrow exception: when the user explicitly requests an Objective update, no slug/path is explicit, and exactly one active Objective exists, it may present that Objective as the only candidate. It must ask for confirmation before continuing to repo evidence or mutation. If update intent is ambiguous or multiple active Objectives exist, ask instead.

A picker UI may use deterministic git facts to group changed active Objectives first when direct changes under `.asdl/objectives/<slug>/` are present compared with repository trunk. If exactly one active Objective is the only Objective slug changed, the picker may label it as suggested. If multiple active Objectives changed, the picker may show those changed active Objectives in the first menu and offer a separate option to view the remaining active Objectives. The user must still confirm a changed Objective or choose another Objective. If the diff is unavailable, empty, or contains no changed slugs that are active Objectives, show the normal ordering with no suggestion.

Do not silently auto-select from candidate count or changed/touched files. Never infer from branch name, PR, package, roadmap keyword, or hidden attachment metadata. Changed-path, branch, stack, or PR evidence belongs only to operation-specific checks after an Objective is selected.

## Repository status

Use `objective list` for the default objective-level status inventory, filtered to active Objectives (`○ open` plus `◇ in-flight`). It inventories only `.asdl/objectives/`; archived records under `.asdl/objective-archive/` are physically outside active discovery. `objective list --status all` means all statuses in the active root only, not archived records. Closed Objectives display as `✓ closed` when included with `--status closed` or `--status all`. The list view shows latest work, latest Objective update age, work-branch count, and max slice-commit count. Work branches are counted only when the branch’s local slice, not inherited lower-stack history, touches the active Objective record. Use `objective list --view detail` for the base/current status source plus per-work-branch details. Use `objective list --current` to use the current branch as the status source, and `objective list --names` to emit just active slugs, one per line. It does not parse Markdown, choose a canonical branch, or list branches without Objective records matching the selected status filter.

## Tracking Gate

Before `objective-next` recommends work, check read-only whether material progress appears present in repo changes but absent from the selected Objective. If so, ask whether to run `objective-update` for the same selected Objective before recommending new work. If the user confirms or preauthorized update-and-continue, perform the explicit Objective Update workflow, reread the Objective and repo evidence, and then continue `objective-next`. Changed-path evidence collection and materiality judgment both remain skill/agent responsibilities in v1.

## Non-goals

- Not a task database, workflow controller, or branch attachment system.
- No YAML/frontmatter, UUIDs, registries, hidden state, or state machine.
- V1 keeps Objective _meaning_ in Markdown; CLI tooling (`objective list`, `objective exec read-objective`) owns only deterministic facts (inventory, branch facts, file presence, closed-marker). Do not parse Markdown headings, roadmap checkboxes, or prose meaning in CLI code.
