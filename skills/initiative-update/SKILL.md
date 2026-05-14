---
name: initiative-update
description: "Command: initiative-update"
---

# initiative-update

Update Initiative tracking for exactly one Initiative.

For shared vocabulary and system-wide rules, use the `initiative` skill when available; this command remains self-contained.

## Required shape

Canonical root: `.asdl/initiatives/<slug>/`.

- `initiative.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`; `## Closure` when closed.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only.
- Update files: `# <Update Title>`, `## Summary`, `## Initiative Impact`, `## Follow-Ups`.
- `closed.md`: optional Closure Marker; existence means closed.

Initiative records are Markdown; read and edit Markdown directly. Use `initiative exec` for deterministic read mechanics (candidate listing, file inventory, closed-marker detection). Mutation remains direct.

## Resolve exactly one Initiative

1. Use an explicit user-provided slug or path under `.asdl/initiatives/<slug>/`.
2. If no slug or path is explicit, run `initiative exec list --format md` to enumerate candidates and ask the user to choose.
3. If no candidates exist, say so and suggest `initiative-create` when appropriate.

Do not write a multi-Initiative update. Do not auto-select from candidate count or changed/touched files. Never infer Initiative ownership from branch names, objectives, PR titles, package names, roadmap keywords, or hidden attachment mechanisms.

## Workflow

1. Run `initiative exec read-initiative <slug> --format md` to load the selected record's raw Markdown and closed state.
2. If closed, stop unless the user explicitly asks to amend the closed record; v1 has no reopen workflow.
3. Compare the user's request, repo evidence, and existing Initiative files to decide what durable tracking changed.
4. Edit `initiative.md` when durable narrative, boundaries, completion criteria, assumptions, risks, open questions, or closure-adjacent context changed.
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

- Initiative selection is ambiguous or absent.
- The request would update more than one Initiative.
- The selected Initiative is closed and the user has not explicitly asked to amend its closed record.
- The user asks for a ceremonial status ping, branch changelog, registry, YAML/frontmatter, UUID, hidden metadata, or state-machine behavior.
- There is not enough information to write accurate durable narrative, assumptions/risks, or Semantic Update content.

## Verify

- Confirm changed Initiative files all live under exactly one `.asdl/initiatives/<slug>/` directory.
- If an update file was written, confirm its filename is timestamped, human-readable, and under that Initiative's `updates/` directory.
- Confirm required headings remain present in edited durable files, including `## Assumptions and Risks`.
- Summarize durable-file edits and whether a Semantic Update was created.
