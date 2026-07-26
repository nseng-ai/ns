# Roadmap

## Work

- [x] Design the skill disposition and owner ontology. Proposed ADR 0046 defines `public`/`incubating`/`internal`, stable ownership, families spanning dispositions, nested canonical sources with narrow top-level product-skill exceptions, flat harness overlays, convention-only dependency closure, and the atomic migration boundary. `references/skill-tree-design-inventory.md` records the complete 58-skill baseline, current exposure/internal evidence, live canonical-path consumer classes, representative taxonomy clusters, and questions for the destination-map review. No skill moved; ADR approval remains coupled to explicit approval of the complete map in the next row.
- [ ] Build the complete first-party skill destination map. `references/skill-destination-map.md` now proposes all 58 destinations and incorporates the user's first review decisions: `brmem` and `slots` are top-level incubating product skills; handoff skills own a separate `handoff` family; public and incubating PR workflows use the `prs` family, while every internal `code-*` skill uses the `code` family; `code-graphite`, `changelog-update`, and `project-setup` are internal; and `pr-make-accountable` is the first public skill. Public dependency closure requires removing or making optional its current required `ns flow submit` path. Joint explicit approval of the revised ADR and complete map remains required before any move.
- [ ] Execute the atomic first-party skill-tree cutover. Move all canonical sources together; update flat `.agents/skills/` and `.claude/skills/` symlinks, `skills-lock.json`, exposure declarations, scripts, repository guidance, and live path references; do not retain mixed-layout compatibility or alter vendored third-party directories.
- [ ] Land the authoritative `skills/README.md` contract and migration evidence. Document disposition and family semantics plus convention-only closure, verify flat harness discovery and invocation behavior (including internal and command-backed skills), run relevant repository validation, and hand the completed outcome to `professional-repo-curation` for synthesis.

## Parked

- Skill content audits, portability remediation, renames, trigger or exposure-policy redesign, and behavioral improvements surfaced during classification but not required for the structural cutover.
- Mechanical enforcement of skill dependency closure or a general skill-topology parser.
- Promotion of any skill to public without a separate explicit support-warrant verdict.
- Nested harness overlay layouts or changes to harness-visible skill identity.
