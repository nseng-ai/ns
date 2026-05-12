---
name: initiative-next
description: "Command: initiative-next"
---

# initiative-next

Recommend the next useful work for an active Initiative without mutating files.

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

## Tracking Gate

Before recommending work:

1. Inspect uncommitted changes and branch diff when available.
2. Look for material non-Initiative changes that plausibly advance the selected Initiative.
3. Look for corresponding changes under `.asdl/initiatives/<slug>/`.
4. If meaningful progress appears likely but unrecorded, stop and ask the user to run `initiative-update`.
5. If evidence is absent, ambiguous, or clearly unrelated, proceed with a concise note.

## Workflow

1. Exclude closed Initiatives by default. If `closed.md` exists, stop and say it is closed.
2. Read `initiative.md`, `roadmap.md`, and relevant `updates/` files.
3. Apply the Tracking Gate.
4. Recommend the smallest coherent next step grounded in the Initiative narrative and roadmap.
5. Explain why this is next, likely files or areas, and what completion evidence should be recorded afterward.
6. If no active or planned work remains, say the Initiative may be ready for `initiative-close` instead of inventing work.

## Stop / ask

- Initiative selection is ambiguous or absent.
- The selected Initiative is closed.
- The Tracking Gate finds likely unrecorded material progress.
- The roadmap and narrative are too stale or incomplete to recommend work safely; ask for `initiative-update`.

## Verify

- Ensure no Initiative files were changed.
- Name the selected slug and identify the roadmap item or narrative basis for the recommendation.
