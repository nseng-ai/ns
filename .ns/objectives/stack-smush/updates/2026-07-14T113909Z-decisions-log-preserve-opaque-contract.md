# Decisions-log preserve-opaque contract completed

## Summary

The **Decisions-log convention** task row is complete. The new convention at
[`references/decisions-log-convention.md`](../references/decisions-log-convention.md)
defines the exact `ns-decisions-log` marker block, canonical-record ownership, pending
and accepted/rejected entry forms, update ordering, and stale-mirror recovery.

The committed decision record on the Decision PR branch remains canonical. The PR-body
block is a subordinate, human-owned mirror outside Flow's generated description region.
Flow's contract is preserve-opaque: description regeneration does not parse, render,
normalize, or delete the block.

The existing Flow regeneration scenario now includes a complete decisions-log block
and verifies that stale generated content is replaced while the block survives
verbatim with exactly one begin marker and one end marker. The focused Vitest scenario
passed.

## Objective Impact

The roadmap row is resolved and linked to its convention artifact. This removes one
prerequisite for **Decide-skill authoring**: that skill can consume a fixed mirror
format and safe update order rather than inventing PR-body structure. The separate
**Smush-time objective binding** row still owns discovery of the Objective where the
canonical Semantic Update belongs.

No Flow production behavior changed; the new scenario specializes and locks in the
existing generic guarantee for human-authored text outside Flow's managed region.
Render-from-record remains Parked behind observed mirror/record drift.

## Follow-Ups

- Use this convention when authoring the post-submit decide skill.
- Complete smush-time Objective binding so the decide workflow can locate the canonical
  update stream without rediscovery.
- Keep render-from-record parked unless real runs show material mirror drift.
