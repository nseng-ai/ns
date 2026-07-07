---
name: objective-create-standing
disable-model-invocation: true
description: Create a standing ns Objective — a horizon with no natural goal-met finish line, whose completion criteria are retirement criteria.
---

# objective-create-standing

Create one ns Objective whose horizon has no natural goal-met finish line: a direction maintained until it should stop existing, not a goal worked to completion. This facade owns the standing creation procedure and composes:

- `objective` (umbrella) and `objective-create` (step) own record mechanics: shared vocabulary, slug confirmation and root checks, required headings, Record Frontmatter, the interview, and Verify. Load both first.
- The `objective` skill's `references/standing-objectives.md` remains the deep standing reference — record shape, roadmap, and Semantic Update guidance. Read it before writing files; do not restate it here.

## Procedure

1. **Confirm the horizon is truly standing.** Horizon (bounded ↔ standing) and Drive (human ↔ autonomous) are orthogonal axes: standing describes the Objective's horizon, not its runner. Standing does not imply autonomous, and autonomous does not imply standing. If the work has a natural goal-met finish line, use a bounded pattern instead.
2. **Write retirement criteria.** `## Completion Criteria` describes when the Objective should stop existing — retired, superseded, obsolete, no longer worth maintaining, or intentionally abandoned — never goal-met criteria. Standing is a horizon, not a status: `active`/`closed` remains enough; add no lifecycle state, type field, or marker.
3. **Draft against the deep reference.** Apply `references/standing-objectives.md` while drafting: roadmap rows are operating guidance, not a hidden runner queue (a standing row may remain `[~]` while the direction is active); `## Assumptions and Risks` holds load-bearing assumptions; updates record kept progress and learnings, never run logs.
4. **Verify and stop.** Run objective-create's Verify, plus: the record's prose says it is standing, `## Completion Criteria` reads as retirement criteria, and no standing-specific state was invented.

## Layering

Standing composes with **orienting** and **autoobjective** — a standing autoobjective pairs the standing horizon with autonomous drive; the axes stay separate. **Never composes with steelthread**: a steelthread is bounded by definition.
