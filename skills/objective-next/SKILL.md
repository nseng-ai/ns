---
name: objective-next
description: "Command: objective-next"
---

# objective-next

Recommend the next useful work for an active Objective without mutating files.

For shared vocabulary and system-wide rules, use the `objective` skill when available; this command remains self-contained.

## Required shape

Canonical root: `.asdl/objectives/<slug>/`.

- `objective.md`: `# <Title>`, `## Thesis`, `## Scope`, `## Non-Goals`, `## Completion Criteria`, `## Assumptions and Risks`, `## Open Questions`; `## Closure` when closed.
- `roadmap.md`: `# Roadmap`, `## Work`, `## Parked`; statuses `[ ]`, `[~]`, `[x]` only.
- `updates/`: Semantic Updates with `# <Update Title>`, `## Summary`, `## Objective Impact`, `## Follow-Ups`.
- `closed.md`: optional Closure Marker; existence means closed.

Objective records are Markdown; read `objective.md`, `roadmap.md`, and `updates/` directly. Use `objective exec` for deterministic mechanics like candidate listing, file inventory, and closed-marker detection.

The Objective slug directory is durable identity. Command/product/prose renames do not imply an Objective slug rename.

## Resolve the Objective

1. Use an explicit user-provided slug or path under `.asdl/objectives/<slug>/`.
2. If no slug or path is explicit, run `objective list --format md` to enumerate open candidates and ask the user to choose.
3. If no candidates exist, say so and suggest `objective-create` when appropriate.

Do not auto-select from candidate count or changed/touched files. Never infer Objective ownership from branch names, PR titles, package names, roadmap keywords, or hidden attachment mechanisms. Changed-path evidence belongs only to the Tracking Gate after an Objective is selected.

## Tracking Gate

Before recommending work:

1. Inspect uncommitted changes and branch diff when available.
2. Look for material non-Objective changes that plausibly advance the selected Objective.
3. Look for corresponding changes under `.asdl/objectives/<slug>/`.
4. If meaningful progress appears likely but unrecorded, stop and ask the user to run `objective-update`.
5. If evidence is absent, ambiguous, or clearly unrelated, proceed with a concise note.

## Workflow

1. Exclude closed Objectives by default. If `closed.md` exists, stop and say it is closed.
2. Read `objective.md`, `roadmap.md`, and relevant `updates/` files.
3. Apply the Tracking Gate.
4. Recommend the smallest coherent next step grounded in the Objective narrative, roadmap, active assumptions, and open or not-yet-de-risked risks.
5. Explain why this is next, likely files or areas, which assumption or risk it exercises if relevant, and what completion evidence should be recorded afterward.
6. If no active or planned work remains, say the Objective may be ready for `objective-close` instead of inventing work.

## Stop / ask

- Objective selection is ambiguous or absent.
- The selected Objective is closed.
- The Tracking Gate finds likely unrecorded material progress.
- The roadmap and narrative are too stale or incomplete to recommend work safely; ask for `objective-update`.

## Verify

- Ensure no Objective files were changed.
- Name the selected slug and identify the roadmap item or narrative basis for the recommendation.
