---
name: initiative-close
description: "Command: initiative-close"
---

# initiative-close

Close an Initiative without deleting its checked-in history.

## Read first

- Read `CONTEXT.md` for Initiative domain language and anti-precedents.
- Read `docs/initiative-system.md`, especially Initiative Selection, `closed.md`, and the `initiative-close` contract.
- V1 is markdown-only: read and edit Markdown directly; do not add or call Python CLI tooling.

## Resolve the Initiative

1. Use an explicit user-provided slug or path under `.asdl/initiatives/<slug>/`.
2. Otherwise inspect current worktree and branch changes for touched files under `.asdl/initiatives/<slug>/`.
3. If exactly one Initiative slug is touched, use it.
4. If zero or multiple Initiative slugs are touched, ask the user to choose.

Never infer Initiative ownership from branch names, objectives, PR titles, package names, roadmap keywords, or hidden attachment mechanisms.

## Workflow

1. Read `initiative.md`, `roadmap.md`, relevant `updates/`, and whether `closed.md` already exists.
2. If the Initiative is already closed, stop unless the user explicitly asks to amend closure context.
3. Confirm the closure outcome is clear: completed or intentionally abandoned, with concise evidence or rationale.
4. Add or update `## Closure` in `initiative.md` with the closure outcome, key evidence, remaining caveats, and follow-ups if any.
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
