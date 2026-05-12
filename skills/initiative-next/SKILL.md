---
name: initiative-next
description: "Command: initiative-next"
---

# initiative-next

Recommend the next useful work for an active Initiative without mutating files.

## Read first

- Read `CONTEXT.md` for Initiative domain language and anti-precedents.
- Read `docs/initiative-system.md`, especially Initiative Selection, `initiative-next`, and Tracking Gate.
- V1 is markdown-only: read Markdown directly; do not add or call Python CLI tooling.

## Resolve the Initiative

1. Use an explicit user-provided slug or path under `.asdl/initiatives/<slug>/`.
2. Otherwise inspect current worktree and branch changes for touched files under `.asdl/initiatives/<slug>/`.
3. If exactly one Initiative slug is touched, use it.
4. If zero or multiple Initiative slugs are touched, ask the user to choose.

Never infer Initiative ownership from branch names, objectives, PR titles, package names, roadmap keywords, or hidden attachment mechanisms.

## Workflow

1. Exclude closed Initiatives by default. If the selected Initiative has `closed.md`, stop and say it is closed rather than recommending new work.
2. Read `initiative.md`, `roadmap.md`, and relevant `updates/` files.
3. Apply the read-only Tracking Gate before recommending work:
   - Inspect uncommitted changes and branch diff when available.
   - Look for material non-Initiative changes that plausibly advance the selected Initiative.
   - Look for corresponding changes under `.asdl/initiatives/<slug>/`.
   - If meaningful progress appears likely but unrecorded, stop and ask the user to run `initiative-update`.
   - If evidence is absent, ambiguous, or clearly unrelated, proceed with a concise note.
4. Recommend the smallest coherent next step grounded in the Initiative narrative and roadmap.
5. Explain why this is next, what files or areas are likely involved, and what completion evidence should be recorded afterward.
6. If no active or planned work remains, say the Initiative may be ready for `initiative-close` instead of inventing work.

## Stop / ask

- Initiative selection is ambiguous or absent.
- The selected Initiative is closed.
- The Tracking Gate finds likely unrecorded material progress.
- The roadmap and narrative are too stale or incomplete to recommend work safely; ask for `initiative-update`.

## Verify

- Ensure no Initiative files were changed.
- Name the selected slug and identify the roadmap item or narrative basis for the recommendation.
