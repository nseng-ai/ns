---
name: initiative-update
description: "Command: initiative-update"
---

# initiative-update

Update Initiative tracking for exactly one Initiative.

## Read first

- Read `CONTEXT.md` for Initiative domain language and anti-precedents.
- Read `docs/initiative-system.md`, especially Documentation Surfaces, Initiative Selection, Semantic Updates, and the `initiative-update` contract.
- V1 is markdown-only: read and edit Markdown directly; do not add or call Python CLI tooling.

## Resolve exactly one Initiative

1. Use an explicit user-provided slug or path under `.asdl/initiatives/<slug>/`.
2. Otherwise inspect current worktree and branch changes for touched files under `.asdl/initiatives/<slug>/`.
3. If exactly one Initiative slug is touched, use it.
4. If zero or multiple Initiative slugs are touched, ask the user to choose.

Do not write a multi-Initiative update. Never infer Initiative ownership from branch names, objectives, PR titles, package names, roadmap keywords, or hidden attachment mechanisms.

## Workflow

1. Read the selected `initiative.md`, `roadmap.md`, relevant `updates/`, and `closed.md` presence.
2. If the Initiative is closed, stop unless the user explicitly asks to amend the closed record; v1 has no reopen workflow.
3. Compare the user's request, current repo evidence, and existing Initiative files to decide what durable tracking changed.
4. Edit `initiative.md` when the durable narrative, boundaries, completion criteria, open questions, or closure-adjacent context changed.
5. Edit `roadmap.md` when ordered guidance, checkbox state, status notes, completion evidence, or parked work changed. Use only `[ ]`, `[~]`, and `[x]`.
6. Write a Semantic Update in `updates/YYYY-MM-DDTHHMMSSZ-short-slug.md` when there is meaningful information: a finding, decision, blocker, completion evidence, changed plan, or follow-up.
7. Use the update headings from `docs/initiative-system.md`. Explain why durable files changed, or why they intentionally remained correct after meaningful evidence was considered.
8. For maintenance-only durable edits with no new semantic information, do not create an update file; say that explicitly in the final summary.

## Stop / ask

- Initiative selection is ambiguous or absent.
- The request would update more than one Initiative.
- The selected Initiative is closed and the user has not explicitly asked to amend its closed record.
- The user asks for a ceremonial status ping, branch changelog, registry, YAML frontmatter, UUID, hidden metadata, or state-machine behavior.
- There is not enough information to write accurate durable narrative or Semantic Update content.

## Verify

- Confirm changed Initiative files all live under exactly one `.asdl/initiatives/<slug>/` directory.
- If an update file was written, confirm its filename is timestamped, human-readable, and under that Initiative's `updates/` directory.
- Confirm required headings remain present in edited durable files.
- Summarize durable-file edits and whether a Semantic Update was created.
