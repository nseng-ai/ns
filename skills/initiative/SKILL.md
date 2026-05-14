---
name: initiative
description: "Use for conceptual questions about asdl Initiatives and as shared grounding with initiative-create, initiative-current, initiative-next, initiative-update, or initiative-close. Read-only."
---

# initiative

Read-only grounding for Initiative skills. Do not mutate files from this skill.

## Concept

An Initiative is a checked-in durable narrative roadmap for multi-session, multi-branch, or multi-PR work.

Canonical root only:

```text
.asdl/initiatives/<slug>/
  initiative.md
  roadmap.md
  updates/
  closed.md  # optional marker
```

Do not use `docs/initiatives/`.

## Files

`initiative.md` contains durable purpose, boundaries, criteria, assumptions, risks, open questions, and closure context. Required headings:

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
- `## Initiative Impact`
- `## Follow-Ups`

`closed.md` is a minimal Closure Marker. Its existence means closed; closure meaning belongs in `initiative.md`.

## Selection

1. Use an explicit user-provided slug or path under `.asdl/initiatives/<slug>/`.
2. If no slug or path is explicit, run `initiative exec list --format md` to enumerate candidate Initiative directories under `.asdl/initiatives/` and ask the user to choose.
3. If no candidates exist, say so and suggest `initiative-create` when appropriate.

Do not auto-select from candidate count or changed/touched files. Never infer from branch name, objective, PR, package, roadmap keyword, or hidden attachment metadata. Changed-path evidence belongs only to operation-specific checks after an Initiative is selected.

## Tracking Gate

Before `initiative-next` recommends work, check read-only whether material progress appears present in repo changes but absent from the selected Initiative. If so, ask for `initiative-update` before recommending new work. `initiative-next` collects the changed-path facts via `initiative exec tracking-gate-facts <slug-or-path> --base-ref <ref> --format md`; materiality remains an LM judgment.

## Non-goals

- Not an objective, task database, workflow controller, or branch attachment system.
- No YAML/frontmatter, UUIDs, registries, hidden state, or state machine.
- V1 keeps Initiative _meaning_ in Markdown; CLI tooling (`initiative exec list`, `initiative exec read-initiative`, `initiative exec tracking-gate-facts`) owns only deterministic facts (inventory, file presence, closed-marker, changed paths). Do not parse Markdown headings, roadmap checkboxes, or prose meaning in CLI code.
