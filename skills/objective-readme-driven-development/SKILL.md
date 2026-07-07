---
name: objective-readme-driven-development
description: Objective-backed README-driven development — create a fresh ns Objective whose canonical reference is a user-facing README, then run the readme-driven-development loop against it.
disable-model-invocation: true
---

# objective-readme-driven-development

Composes the portable `readme-driven-development` loop with ns Objectives, the way `pi-grill-ui` composes `grilling`. Read the `readme-driven-development` skill first; this skill adds only the Objective mechanics.

## Objective per pass

Every run creates a new Objective — never reuse or attach to an existing one. Create it through the `objective-create` step skill (grounded by the `objective` umbrella skill), then fill the full bundle under `.ns/objectives/<slug>/`:

- `objective.md` — thesis, scope, non-goals, completion criteria (required headings per the objective skill)
- `roadmap.md` — execution tracking: slices, status, follow-ups
- `references/README-draft.md` — the canonical user-facing README; the readme-driven-development contract
- `references/` — supporting documents (decision log, open questions, research); they support the README and never override it

## Composition bindings

Run the readme-driven-development loop with these bindings:

- **Canonical README** = `references/README-draft.md`. Decisions settle there; roadmap rows point at it, not the reverse.
- **Grilling** uses `grill_ask` when available (one question per call, recommendation, `estimatedRemaining`); otherwise the numbered-prose fallback from the grilling loop.
- **Execution state** goes to `roadmap.md`, never into the README.
- **Pass report** additionally names the created Objective slug and the roadmap rows added.
