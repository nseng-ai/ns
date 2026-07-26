# Skill Ontology Design Packet Complete

## Summary

The first roadmap slice produced a reviewable design packet without moving any skill.
Proposed ADR 0046 adapts the package ontology's two-axis structure to skills while keeping
support disposition, family ownership, flat skill identity, Skill Exposure Policy, and
internal metadata distinct. It defines the nested canonical shape, flat harness-overlay
boundary, convention-only dependency closure, explicit ADR-plus-map approval gate, and
atomic migration requirement.

`references/skill-tree-design-inventory.md` records the complete 58-skill baseline and the
known classes of live flat-canonical-path consumers. The inventory covers harness symlinks,
lock and exposure surfaces, provisioning and publish extras, runtime lookup, validation and
tests, instructions and prompts, mutable documentation, and historical records that must
not receive blind path rewrites. It also identifies representative family clusters and the
questions the destination-map slice must resolve.

No canonical skill, harness overlay, lock entry, exposure declaration, runtime consumer, or
vendored third-party directory changed in this slice.

## Objective Impact

The ontology-design roadmap row is complete. The path-ripple risk is now concrete: nested
sources affect substantially more than symlink targets, while flat harness identities and
command-backed keys must remain unchanged. Classification ambiguity also remains explicit:
current exposure and `metadata.internal` evidence do not mechanically determine support
disposition, and the Objective's user-set internal classifications demonstrate that those
signals are incomplete.

ADR 0046 remains proposed. Its approval is intentionally coupled to the complete
first-party destination map, so this design completion does not authorize migration or
public support commitments.

## Follow-Ups

- Build a complete 58-row destination map with a disposition rationale, stable family,
  final canonical path, dependency-closure concerns, and exceptional migration notes for
  every first-party skill.
- Resolve the taxonomy and runtime-lookup questions in the design inventory.
- Revalidate the skill and path-consumer inventories immediately before approval and again
  before the atomic cutover.
- Obtain explicit user approval of proposed ADR 0046 and the complete destination map
  together before moving any skill.
