# Roadmap

## Work

- [ ] Design the skill disposition and owner ontology. Inventory current first-party canonical skills and every canonical-path consumer; draft a skill-specific ADR defining `public`/`incubating`/`internal`, stable domain/family ownership, families spanning dispositions, nested canonical sources, flat harness overlays, convention-only dependency closure, and the atomic migration boundary.
- [ ] Build the complete first-party skill destination map. Give every skill an explicit disposition, family, and final `skills/<disposition>/<family>/<skill>/` path; incorporate the user-set initial classifications; resolve taxonomy and path-consumer questions; obtain explicit approval of the ADR and map before any move.
- [ ] Execute the atomic first-party skill-tree cutover. Move all canonical sources together; update flat `.agents/skills/` and `.claude/skills/` symlinks, `skills-lock.json`, exposure declarations, scripts, repository guidance, and live path references; do not retain mixed-layout compatibility or alter vendored third-party directories.
- [ ] Land the authoritative `skills/README.md` contract and migration evidence. Document disposition and family semantics plus convention-only closure, verify flat harness discovery and invocation behavior (including internal and command-backed skills), run relevant repository validation, and hand the completed outcome to `professional-repo-curation` for synthesis.

## Parked

- Skill content audits, portability remediation, renames, trigger or exposure-policy redesign, and behavioral improvements surfaced during classification but not required for the structural cutover.
- Mechanical enforcement of skill dependency closure or a general skill-topology parser.
- Promotion of any skill to public without a separate explicit support-warrant verdict.
- Nested harness overlay layouts or changes to harness-visible skill identity.
