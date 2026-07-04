# Internal-packages rename, canonical-term, and third-rung taxonomy change

## Summary

The internal-packages stack renames the consumer-side tested-tooling role directory and its surrounding vocabulary, and adds a middle rung to the platform-and-consumer taxonomy. Reporting the inventory-affecting changes here per the repo-ontology drift rule (report decision-bearing changes; do not silently fix). Landed in this stack so far:

- Role-directory rename `ts/packages/local/` → `ts/packages/internal/`: the reserved package scope is `@internal/*` and the tested repo-internal tooling that operates this repo now lives under `internal/`. The directory-role slot in the taxonomy is unchanged in intent; only its name moved.
- Canonical term change "Local space" → "Internal space": the term was updated in `CONTEXT.md`, and the retired "Local space" was moved to that term's *Avoid* list rather than deleted.
- Tier id rename `local-pi-tool` → `internal-pi-tool`: the tier identifier tracks the space rename.
- Taxonomy change: `docs/conventions/platform-and-consumer.md` now has a **third rung**. The prior two-sided taxonomy (platform capability in tested `ts/packages/*` vs. consumer instance as a `.ns/*` artifact) gains **consumer-side tested tooling in `packages/internal/*`** between them — package-grade code that operates this repo but is not platform surface, with promotion paths in (from `.ns/*`) and out (to platform), bounded by no outside runtime dependents (enforced by `NS_TS_INTERNAL_SPACE_ADMISSION`) and never-published.

## Objective Impact

The repo-ontology inventory baseline that keys off the `local/` role directory, the "Local space" canonical term, and the two-rung platform-and-consumer framing is now stale against HEAD and should be rebaselined to the `internal/` name, the "Internal space" term (old term on *Avoid*), and the three-rung taxonomy. No package count has changed yet: the rename is a directory-role move, not an inventory add or delete, and `@internal/pi-tools` remains the sole resident (still consumed as a root `devDependency`, the sanctioned carve-out). The taxonomy change is decision-bearing at the ontology level — it introduces a distinct role between platform and consumer — and is surfaced here rather than absorbed silently.

## Follow-Ups

- Upcoming inventory change (not yet landed): a later PR in this same stack adds the first new resident package `@internal/typescript-style-guard` under `ts/packages/internal/`, extracted from the subpackage conformance machinery. That will change the workspace package count and the `internal/` roster — flag it as upcoming and rebaseline the count when it lands rather than now.
- Rebaseline the repo-ontology record's directory-role name, canonical term, and platform-and-consumer rung count against HEAD in a confirmed session.
