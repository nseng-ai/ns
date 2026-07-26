# Roadmap

## Work

- [x] Design and approve the skill disposition and owner ontology. Accepted ADR 0046 defines `public`/`incubating`/`internal`, stable ownership, families spanning dispositions, nested canonical sources with narrow top-level product-skill exceptions, flat harness overlays, convention-only dependency closure, and the atomic migration boundary. `references/skill-tree-design-inventory.md` preserves the complete 58-skill baseline and path-consumer inventory that informed the decision.
- [x] Build and approve the complete first-party skill destination map. `references/skill-destination-map.md` is the implementation authority for all 58 destinations: `brmem` and `slots` are top-level incubating product skills; handoff skills own a separate `handoff` family; public and incubating PR workflows use the `prs` family; every internal `code-*` skill uses the `code` family; `readme-driven-development` belongs to `agent-engineering`; `code-graphite`, `changelog-update`, and `project-setup` are internal; and `pr-make-accountable` is the first public skill. The user approved ADR 0046 and the map together on 2026-07-26. Public dependency closure requires removing or making optional `pr-make-accountable`'s current required `ns flow submit` path during cutover.
- [x] Execute the atomic first-party skill-tree cutover. All 58 canonical leaves match the approved destination map (`public` 1, `incubating` 23, `internal` 34), with no direct first-party child under `skills/`; 58 flat first-party `.agents` symlinks resolve to the nested sources, `.claude` remains flat through `.agents`, and all 16 vendored `.agents` directories remain unchanged. `skills-lock.json` changed exactly the 58 local source paths without changing hashes or vendored entries.
- [x] Land the authoritative `skills/README.md` contract and migration evidence. The README documents disposition, ownership, flat overlays, and convention-only dependency closure; `pr-make-accountable` now requires only Git and authenticated `gh`, with `ns flow submit` optional. Repository, specialized-lane, exposure, and structural validation passed, and this closed record supplies the outcome for `professional-repo-curation` synthesis.

## Parked

- Skill content audits, portability remediation, renames, trigger or exposure-policy redesign, and behavioral improvements surfaced during classification but not required for the structural cutover.
- Mechanical enforcement of skill dependency closure or a general skill-topology parser.
- Promotion of any skill to public without a separate explicit support-warrant verdict.
- Nested harness overlay layouts or changes to harness-visible skill identity.
