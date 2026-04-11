# Parallel (fan-out) roadmap

## What it is

Items are **independent work on different parts of a surface** and can be done
in any order. Each item targets a different piece; none of them depend on each
other. The roadmap is really a checklist — the ordering exists only to track
progress, not to enforce sequence.

## When to use it

- Migrations across many similar pieces: moving N modules to a new pattern,
  updating M files to a new format, adding a common check to K endpoints.
- Broad surface changes where each piece is unrelated to the others.
- Cleanup passes where you want visibility into "how many are left".

## When NOT to use it

- Items have dependencies on each other — use `layered.md` or
  `incremental-refactor.md`.
- The work is a single cohesive feature rather than a fan-out — use
  `steelthread.md`.
- There are only 2-3 items. Parallel shines when the count is high enough that
  "track progress across many pieces" is the actual value.

## Item 1 guidance

There is no special item 1. Pick any item to start. Do call out one item as a
**pathfinder**: the first one you attempt, used to validate that the migration
approach itself works before you fan out to the rest. If the pathfinder
surfaces problems, adjust the plan before touching the other items.

## Example

Objective: "Migrate all twelve skill files from the old `allowed-tools` YAML
list format to the new string-array format."

1. (pathfinder) Migrate `skills/twerk-objective-create/SKILL.md`. Validate
   the migration works end-to-end, adjust approach if needed.
2. Migrate `skills/twerk-objective-progress/SKILL.md`.
3. Migrate `skills/twerk-objective-reconcile/SKILL.md`.
4. ...remaining nine skills, one per item.
