# ADR 0030: Rename Synthesis Objective to Umbrella Objective

## Status

Accepted; supersedes the naming (not the substance) of ADR 0001

## Context

ADR 0001 coined **Synthesis Objective** to contrast an active coordinating parent with
the older fire-and-forget umbrella convention (a parent that only spawns children and
stops tracking). In practice the repo's own records and conversation reach for
"umbrella" for the active shape anyway — `ship-objectives-to-customers` describes itself
as "the parent/umbrella Objective" — so the canonical name and natural usage had
diverged. The rename surfaced during the 2026-07-05 objective-patterns taxonomy work.

## Decision

Rename the pattern to **Umbrella Objective**. The definition is unchanged: a prose-only
Objective pattern that coordinates a family of narrower child Objectives while remaining
the durable place for cross-child lessons, migration guides, and synthesized closure
evidence. The synthesis duty is part of the pattern, not optional.

**Fire-and-forget umbrella** remains the named anti-pattern on the Avoid list: a parent
that only creates children and stops tracking is not an Umbrella Objective. "Synthesis
Objective" moves to the Avoid list as the retired name.

Everything else in ADR 0001 stands: prose-only, no CLI feature, no status model, no
registry, children are ordinary Objectives.

## Why

Names that fight natural usage lose silently — records were already drifting to
"umbrella" while the glossary said Synthesis. Keeping the friendlier name and pinning
the synthesis duty inside its definition preserves ADR 0001's real content (the duty)
while retiring only its label. The anti-pattern keeps its own name so the distinction
ADR 0001 drew stays expressible.
