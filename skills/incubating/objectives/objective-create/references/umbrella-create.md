# Umbrella Objective Creation

Load this reference only when the interview settles on the umbrella pattern: an Objective that coordinates a family of narrower **Subobjectives** and owns the synthesis of their outcomes (recognition: the `objective` skill's patterns catalog). Use it when a thread is too big for one record and children should own their slices.

## Procedure

1. **Scope the parent, not the slices.** Through the interview, pin the overall ambition and how it decomposes: which slices become Subobjectives (each owning its own record) versus ordinary rows the parent executes itself. `## Completion Criteria` must include the synthesis: the parent closes only after children are closed or explicitly parked *and* their outcomes are synthesized into the parent.
2. **Connect existing children with mirrored edges.** For each Subobjective that already exists as a record, declare the parent–child connection as Objective Edges per the umbrella skill's Record Frontmatter mechanics. Umbrella-creation deltas: direction and the parent/child relationship live in each record's own-perspective Edge Annotation prose, never the schema; children not yet created get no edge now — a follow-on `objective-create` session declares the edge at the child's creation.
3. **Track children on the parent roadmap.** Give each Subobjective its own parent row; mark it `[~]` while the child exists and is in progress, closing the row only when the child closes or is explicitly parked. Keep parent-executed rows and child-tracking rows distinct.

## Failure mode

**Fire-and-forget umbrella** — a parent that only spawns children and stops tracking or synthesizing. The umbrella owns integrating child outcomes, not just fan-out; a record whose completion criteria stop at "children created" is not this pattern.

## Layering

Composition facts live in the patterns catalog (`objective` skill, `references/objective-patterns.md`).

## Verification

In addition to objective-create's own Verify:

- completion criteria name the synthesis duty;
- every declared edge has its counterpart mirror and the umbrella skill's Frontmatter Verification passed;
- each known Subobjective has a parent roadmap row.
