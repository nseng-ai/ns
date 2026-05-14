---
name: initiative-current
description: "Command: initiative-current"
---

# initiative-current

Read and summarize the current state of one Initiative without mutating files.

For shared vocabulary and system-wide rules, use the `initiative` skill when available; this command remains self-contained.

## Required shape

Canonical root: `.asdl/initiatives/<slug>/`.

- `initiative.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`; `## Closure` when closed.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only.
- `updates/`: Semantic Updates with `# <Update Title>`, `## Summary`, `## Initiative Impact`, `## Follow-Ups`.
- `closed.md`: optional Closure Marker; existence means closed.

Initiative records are Markdown; read `initiative.md`, `roadmap.md`, and `updates/` directly. Use `initiative exec` for deterministic mechanics like candidate listing, file inventory, and closed-marker detection.

## Resolve the Initiative

1. Use an explicit user-provided slug or path under `.asdl/initiatives/<slug>/`.
2. If no slug or path is explicit, run `initiative exec list --format md` to enumerate candidates and ask the user to choose.
3. If no candidates exist, say so and suggest `initiative-create` when appropriate.

Do not auto-select from candidate count or changed/touched files. Never infer Initiative ownership from branch names, objectives, PR titles, package names, roadmap keywords, or hidden attachment mechanisms.

## Workflow

1. Run `initiative exec read-initiative <slug> --format md` to load the record: it emits raw `initiative.md`, `roadmap.md`, and `updates/*.md`, reports missing-file notes, and reports closed state.
2. If required files are missing, report that clearly; do not scaffold or repair them.
3. Summarize thesis, scope boundaries, completion criteria, assumptions and risks, open questions, roadmap status, blockers, and recent Semantic Updates.
4. Report whether the Initiative is closed based on the `read-initiative` closed state; include closure context from `initiative.md` when present.
5. Do not edit, create, delete, or reformat any Initiative files.

## Stop / ask

- Initiative selection is ambiguous or absent.
- The selected path is outside `.asdl/initiatives/`.
- The user asks for mutation; redirect to `initiative-update`, `initiative-create`, or `initiative-close`.

## Verify

- Before responding, ensure no files were changed.
- Name the selected slug and state whether the Initiative is open or closed.
