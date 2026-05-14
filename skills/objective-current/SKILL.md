---
name: objective-current
description: "Command: objective-current"
---

# objective-current

Read and summarize the current state of one Objective without mutating files.

For shared vocabulary and system-wide rules, use the `objective` skill when available; this command remains self-contained.

## Required shape

Canonical root: `.asdl/objectives/<slug>/`.

- `objective.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`; `## Closure` when closed.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only.
- `updates/`: Semantic Updates with `# <Update Title>`, `## Summary`, `## Objective Impact`, `## Follow-Ups`.
- `closed.md`: optional Closure Marker; existence means closed.

Objective records are Markdown; read `objective.md`, `roadmap.md`, and `updates/` directly. Use `objective exec` for deterministic mechanics like candidate listing, file inventory, and closed-marker detection.

## Resolve the Objective

1. Use an explicit user-provided slug or path under `.asdl/objectives/<slug>/`.
2. If no slug or path is explicit, run `objective exec list --format md` to enumerate candidates and ask the user to choose.
3. If no candidates exist, say so and suggest `objective-create` when appropriate.

Do not auto-select from candidate count or changed/touched files. Never infer Objective ownership from branch names, PR titles, package names, roadmap keywords, or hidden attachment mechanisms.

## Workflow

1. Run `objective exec read-objective <slug> --format md` to load the record: it emits raw `objective.md`, `roadmap.md`, and `updates/*.md`, reports missing-file notes, and reports closed state.
2. If required files are missing, report that clearly; do not scaffold or repair them.
3. Summarize thesis, scope boundaries, completion criteria, assumptions and risks, open questions, roadmap status, blockers, and recent Semantic Updates.
4. Report whether the Objective is closed based on the `read-objective` closed state; include closure context from `objective.md` when present.
5. Do not edit, create, delete, or reformat any Objective files.

## Stop / ask

- Objective selection is ambiguous or absent.
- The selected path is outside `.asdl/objectives/`.
- The user asks for mutation; redirect to `objective-update`, `objective-create`, or `objective-close`.

## Verify

- Before responding, ensure no files were changed.
- Name the selected slug and state whether the Objective is open or closed.
