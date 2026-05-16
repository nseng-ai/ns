---
name: objective-update
description: "Command: objective-update"
---

# objective-update

Update Objective tracking for exactly one Objective.

For shared vocabulary and system-wide rules, use the `objective` skill when available; this command remains self-contained.

## Required shape

Canonical root: `.asdl/objectives/<slug>/`.

- `objective.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`; `## Closure` when closed.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only.
- Update files: `# <Update Title>`, `## Summary`, `## Objective Impact`, `## Follow-Ups`.
- `closed.md`: optional Closure Marker; existence means closed.

Objective records are Markdown; read and edit Markdown directly. Use `objective exec` for deterministic read mechanics (candidate listing, file inventory, closed-marker detection). Mutation remains direct.

## Resolve exactly one Objective

1. Use an explicit user-provided slug or path under `.asdl/objectives/<slug>/`.
2. If no slug or path is explicit, run `objective list --state open --format md` immediately.
3. Present the open Objective options from that command's output in your reply and ask the user to choose one slug/path. Do not ask a generic "which Objective?" question before showing the enumerated options.
4. If no candidates exist, say so and suggest `objective-create` when appropriate.

Do not write a multi-Objective update. Do not auto-select from candidate count, even if there is only one open Objective, or from changed/touched files. Never infer Objective ownership from branch names, PR titles, package names, roadmap keywords, or hidden attachment mechanisms.

## Workflow

1. Run `objective exec read-objective <slug> --format md` to load the selected record's raw Markdown and closed state.
2. If closed, stop unless the user explicitly asks to amend the closed record; v1 has no reopen workflow.
3. Compare the user's request, repo evidence, and existing Objective files to decide what durable tracking changed.
4. Edit `objective.md` when durable narrative, boundaries, completion criteria, assumptions, risks, open questions, or closure-adjacent context changed.
5. Update `## Assumptions and Risks` when evidence changes risk knowledge:
   - Mark an assumption incorrect, revised, or still active when new evidence bears on it.
   - Mark a risk de-risked, not de-risked, materialized, accepted, or still open with concise evidence or rationale.
   - Add newly discovered assumptions or risks when they affect scope, sequencing, confidence, or completion evidence.
   - Preserve useful history in the prose; do not silently delete disproven assumptions or de-risked risks without explanation.
6. Edit `roadmap.md` when ordered guidance, checkbox state, status notes, completion evidence, or parked work changed.
7. Write a Semantic Update in `updates/YYYY-MM-DDTHHMMSSZ-short-slug.md` for meaningful information: finding, decision, blocker, assumption invalidation, risk de-risking or surfacing, completion evidence, changed plan, or follow-up.
8. Explain why durable files changed, or why they intentionally remained correct after meaningful evidence was considered.
9. For maintenance-only durable edits with no new semantic information, do not create an update file; say that explicitly.

## Stop / ask

- Objective selection is ambiguous or absent after presenting the `objective list --state open --format md` options.
- The request would update more than one Objective.
- The selected Objective is closed and the user has not explicitly asked to amend its closed record.
- The user asks for a ceremonial status ping, branch changelog, registry, YAML/frontmatter, UUID, hidden metadata, or state-machine behavior.
- There is not enough information to write accurate durable narrative, assumptions/risks, or Semantic Update content.

## Verify

- Confirm changed Objective files all live under exactly one `.asdl/objectives/<slug>/` directory.
- If an update file was written, confirm its filename is timestamped, human-readable, and under that Objective's `updates/` directory.
- Confirm required headings remain present in edited durable files, including `## Assumptions and Risks`.
- Summarize durable-file edits and whether a Semantic Update was created.
