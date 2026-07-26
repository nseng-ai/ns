# ADR and Destination Map Approved

## Summary

The user approved ADR 0046 and the complete 58-skill destination map together after the
iterative classification and family review. ADR 0046 is now accepted, and
`references/skill-destination-map.md` is the implementation authority for the atomic
cutover.

The final review placed `readme-driven-development` under internal `agent-engineering`.
Previously recorded decisions remain authoritative: `brmem` and `slots` are top-level
incubating product skills; handoff skills use the `handoff` family; public and incubating PR
workflows use `prs`; all internal `code-*` skills use `code`; `code-graphite`,
`changelog-update`, and `project-setup` are internal; and `pr-make-accountable` is the first
public skill.

## Objective Impact

The ontology-design and destination-map roadmap rows are complete. The approved map covers
58 unique identities and destinations: one public, 23 incubating, and 34 internal. The
approval gate that prohibited canonical moves is satisfied, so the next semantic slice is
the atomic first-party skill-tree cutover.

One implementation requirement remains explicit: `pr-make-accountable` currently requires
`ns flow submit` in part of its workflow. The cutover must remove that required inward
dependency or make it optional before claiming public dependency closure.

## Follow-Ups

- Execute the atomic canonical-source migration and all coordinated path-consumer updates
  without retaining mixed-layout compatibility.
- Preserve globally flat harness identities and leave vendored third-party directories
  untouched.
- Verify the public closure of `pr-make-accountable`, flat discovery and invocation,
  command-backed behavior, lock consistency, provisioning, and publish-extra copying.
- Land `skills/README.md` and migration evidence, then hand the outcome to
  `professional-repo-curation` for synthesis.
