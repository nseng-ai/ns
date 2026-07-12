---
name: objective-create-readme-driven-development
disable-model-invocation: true
description: Objective-backed README-driven development — create a fresh ns Objective whose canonical reference is a user-facing README, then run the readme-driven-development loop against it.
---

# objective-create-readme-driven-development

Composes the portable `readme-driven-development` loop with ns Objectives. Read the `readme-driven-development` skill first; this skill adds only the Objective mechanics.

## Objective per pass

Every run creates a new Objective — never reuse or attach to an existing one. Create it through the `objective-create` step skill (grounded by the `objective` umbrella skill), then fill the full bundle under `.ns/objectives/<slug>/`:

- `objective.md` — thesis, scope, non-goals, completion criteria (required headings per the objective skill)
- `roadmap.md` — execution tracking: slices, status, follow-ups
- `references/README-draft.md` — the canonical user-facing README; the readme-driven-development contract
- `references/` — supporting documents (decision log, open questions, research); they support the README and never override it

## README promotion is part of the Objective

`references/README-draft.md` is a working location, not a home: Objective references are effectively lost to users once the Objective closes. Every RDD Objective must therefore plan the README's promotion into a durable production documentation location (a shipped package README, docs tree, or equivalent user-facing home) as part of the Objective itself:

- add a final roadmap row that promotes the settled README to its durable home and repoints the Objective reference at the promoted doc;
- state the promotion in `objective.md` `## Completion Criteria` — the Objective is not complete while the canonical contract lives only under `.ns/objectives/<slug>/references/`.

## Composition bindings

Run the readme-driven-development loop with these bindings:

- **Canonical README** = `references/README-draft.md`. Decisions settle there; roadmap rows point at it, not the reverse.
- **Grilling** uses `grill_ask` when available; otherwise the grilling loop's numbered-prose fallback.
- **Execution state** goes to `roadmap.md`, never into the README.
- **Pass report** additionally names the created Objective slug and the roadmap rows added.
