---
name: initiative-current
description: "Command: initiative-current"
---

# initiative-current

Read and summarize the current state of one Initiative without mutating files.

For shared vocabulary and system-wide rules, use the `initiative` skill when available; this command remains self-contained.

## Required shape

Canonical root: `.asdl/initiatives/<slug>/`.

- `initiative.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Open Questions`; `## Closure` when closed.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only.
- `updates/`: Semantic Updates with `# <Update Title>`, `## Summary`, `## Initiative Impact`, `## Follow-Ups`.
- `closed.md`: optional Closure Marker; existence means closed.

V1 is markdown-only: read Markdown directly; do not add or call Python CLI tooling.

## Resolve the Initiative

1. Use an explicit user-provided slug or path under `.asdl/initiatives/<slug>/`.
2. Otherwise inspect current worktree and branch changes for touched files under `.asdl/initiatives/<slug>/`.
3. If exactly one Initiative slug is touched, use it.
4. If zero or multiple Initiative slugs are touched, ask the user to choose.

Never infer Initiative ownership from branch names, objectives, PR titles, package names, roadmap keywords, or hidden attachment mechanisms.

## Workflow

1. Read `initiative.md`, `roadmap.md`, newest relevant files in `updates/`, and whether `closed.md` exists.
2. If required files are missing, report that clearly; do not scaffold or repair them.
3. Summarize thesis, scope boundaries, completion criteria, open questions, roadmap status, blockers, and recent Semantic Updates.
4. Report whether the Initiative is closed based on `closed.md` presence; include closure context from `initiative.md` when present.
5. Do not edit, create, delete, or reformat any Initiative files.

## Stop / ask

- Initiative selection is ambiguous or absent.
- The selected path is outside `.asdl/initiatives/`.
- The user asks for mutation; redirect to `initiative-update`, `initiative-create`, or `initiative-close`.

## Verify

- Before responding, ensure no files were changed.
- Name the selected slug and state whether the Initiative is open or closed.
