---
name: objective
description: "Use for conceptual questions about asdl Objectives and as shared grounding with objective-create, objective-current, objective-next, objective-update, or objective-close. Read-only."
---

# objective

Read-only grounding for Objective skills. Do not mutate files from this skill.

## Concept

An Objective is a checked-in durable narrative roadmap for multi-session, multi-branch, or multi-PR work.

Canonical root only:

```text
.asdl/objectives/<slug>/
  objective.md
  roadmap.md
  updates/
  closed.md  # optional marker
```

Do not use `docs/objectives/`.

## Slug identity

The `<slug>` directory name is the durable Objective identity. Titles, command names, product names, prose, branches, and implementation packages may be renamed without changing the Objective slug. Do not move, delete, or recreate `.asdl/objectives/<slug>/` under a new slug unless the user explicitly asks for an Objective slug migration.

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
2. If no slug or path is explicit, run `objective list --status open --format md` to enumerate candidate open Objectives across local branch tips and ask the user to choose. Use `objective list --current --status open --format md` to filter to open Objectives associated with the current branch. Use `objective list --status open --names` only for machine-readable open-slug extraction.
3. If no candidates exist, say so and suggest `objective-create` when appropriate.

`objective-update` has one narrow exception: when the user explicitly requests an Objective update, no slug/path is explicit, and exactly one open Objective exists, it may present that Objective as the only candidate. It must ask for confirmation before continuing to repo evidence or mutation. If update intent is ambiguous or multiple open Objectives exist, ask instead.

A picker UI may use deterministic git facts to group changed open Objectives first when direct changes under `.asdl/objectives/<slug>/` are present compared with repository trunk. If exactly one open Objective is the only Objective slug changed, the picker may label it as suggested. If multiple open Objectives changed, the picker may show those changed open Objectives in the first menu and offer a separate option to view the remaining open Objectives. The user must still confirm a changed Objective or choose another Objective. If the diff is unavailable, empty, or contains no changed slugs that are open Objectives, show the normal ordering with no suggestion.

Do not silently auto-select from candidate count or changed/touched files. Never infer from branch name, PR, package, roadmap keyword, or hidden attachment metadata. Changed-path, branch, stack, or PR evidence belongs only to operation-specific checks after an Objective is selected.

## Repository status

Use `objective list` for the default objective-level status inventory across local branch tips, filtered to open Objectives; rendered tables use `status` with `○ open` and `✓ closed`. Use `objective list --status all` to include closed records. Use `objective list --view detail` for the per-branch detail view with branch, `status`, tip age, and ahead-of-trunk count. Use `objective list --current` to filter to open Objectives associated with the current branch, and `objective list --names` to emit just open slugs, one per line. It does not parse Markdown, choose a canonical branch, or list branches without Objective records matching the selected status filter.

## Tracking Gate

Before `objective-next` recommends work, check read-only whether material progress appears present in repo changes but absent from the selected Objective. If so, ask whether to run `objective-update` for the same selected Objective before recommending new work. If the user confirms or preauthorized update-and-continue, perform the explicit Objective Update workflow, reread the Objective and repo evidence, and then continue `objective-next`. Changed-path evidence collection and materiality judgment both remain skill/agent responsibilities in v1.

## Non-goals

- Not a task database, workflow controller, or branch attachment system.
- No YAML/frontmatter, UUIDs, registries, hidden state, or state machine.
- V1 keeps Objective _meaning_ in Markdown; CLI tooling (`objective list`, `objective exec read-objective`) owns only deterministic facts (inventory, branch facts, file presence, closed-marker). Do not parse Markdown headings, roadmap checkboxes, or prose meaning in CLI code.
