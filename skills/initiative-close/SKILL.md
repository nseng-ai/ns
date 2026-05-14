---
name: initiative-close
description: "Command: initiative-close"
---

# initiative-close

Close an Initiative without deleting its checked-in history.

For shared vocabulary and system-wide rules, use the `initiative` skill when available; this command remains self-contained.

## Required shape

Canonical root: `.asdl/initiatives/<slug>/`.

- `initiative.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`; add `## Closure` when closing.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only.
- `updates/`: Semantic Updates with `# <Update Title>`, `## Summary`, `## Initiative Impact`, `## Follow-Ups`.
- `closed.md`: minimal Closure Marker; existence means closed.

V1 is markdown-only: read and edit Markdown directly; do not add or call Python CLI tooling.

## Resolve the Initiative

1. Use an explicit user-provided slug or path under `.asdl/initiatives/<slug>/`.
2. If no slug or path is explicit, list candidate Initiative directories under `.asdl/initiatives/` and ask the user to choose.
3. If no candidates exist, say so and suggest `initiative-create` when appropriate.

Do not auto-select from candidate count or changed/touched files. Never infer Initiative ownership from branch names, objectives, PR titles, package names, roadmap keywords, or hidden attachment mechanisms.

## Workflow

1. Read `initiative.md`, `roadmap.md`, relevant `updates/`, and whether `closed.md` already exists.
2. If already closed, stop unless the user explicitly asks to amend closure context.
3. Confirm the closure outcome is clear: completed or intentionally abandoned, with concise evidence or rationale.
4. Add or update `## Closure` in `initiative.md` with outcome, key evidence, remaining assumptions or risks, caveats, and follow-ups if any.
5. Write `closed.md` as a minimal Closure Marker. Put closure meaning in `initiative.md`, not in `closed.md`.
6. Leave `.asdl/initiatives/<slug>/` in place. Do not archive, delete, move, or implement a reopen workflow.

## Stop / ask

- Initiative selection is ambiguous or absent.
- Required Initiative files are missing.
- The closure outcome or rationale is unclear.
- The Initiative is already closed and the user did not ask to amend closure context.
- The user asks to delete, archive, move, or reopen the Initiative.

## Verify

- Confirm `initiative.md` contains `## Closure`.
- Confirm `closed.md` exists under the selected Initiative directory.
- Confirm the Initiative directory remains under `.asdl/initiatives/<slug>/`.
- Summarize the closure outcome and note that closed Initiatives are no longer eligible for `initiative-next` by default.
