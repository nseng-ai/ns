---
edges:
  - objective: professional-repo-curation
    annotation: Parallel Subobjective that curates the first-party skill tree by release disposition and domain/family ownership while preserving flat harness-facing skill identities.
---

# Skill Disposition and Owner Ontology

## Thesis

Reorganize every first-party canonical skill source so its path communicates two independent facts: support disposition and domain/family ownership. Every skill will live at `skills/<disposition>/<family>/<skill>/`, where disposition is exactly `public`, `incubating`, or `internal`, and a family may span multiple dispositions.

This is a parallel Subobjective of `professional-repo-curation`. It adopts the package tree's three disposition meanings but makes explicit skill-by-skill verdicts rather than inheriting package disposition. Public may initially be empty: portability or general usefulness alone does not constitute a public support warrant.

Canonical sources become nested while harness-facing overlays remain globally flat. `.agents/skills/<skill>` and `.claude/skills/<skill>` preserve skill names and invocation behavior through updated symlinks. The cutover is structural: it preserves content and behavior except where a path correction is required for the move.

## Scope

- Write and explicitly approve a skill-specific ADR defining the three dispositions, domain/family ownership, skill identity, and the nested-canonical/flat-overlay boundary.
- Produce and explicitly approve a complete destination map for every first-party skill before moving any skill.
- Classify each skill independently. An owning package's disposition is evidence, not an inherited verdict.
- Permit one family to appear under multiple dispositions; disposition belongs to the individual skill, while the middle folder expresses stable domain/family ownership only.
- Record the initial user-set constraints: `public/` may be empty; the Flow skill family is incubating; and `cli-push-down`, `reinvented-abstractions-tripwire`, `plan-stack-from-findings`, `readme-driven-development`, `typescript-fake-driven-testing`, and `typescript-style` are internal.
- Document dependency closure as a review convention: public skills require only public supported surfaces; incubating skills may require public or incubating surfaces; internal skills may require anything. Documentation links and optional examples do not automatically constitute required operational dependencies.
- Atomically move all first-party canonical skill sources to `skills/<disposition>/<family>/<skill>/` after design approval.
- Update flat `.agents/skills/<skill>` and `.claude/skills/<skill>` overlays, `skills-lock.json`, Skill Exposure Policy declarations, scripts, repository guidance, and live path references needed for the new canonical paths.
- Write `skills/README.md` as the authoritative skill-tree contract.
- Leave vendored third-party real directories under `.agents/skills/` untouched.

## Non-Goals

- Publishing or promising any public skill merely because it is portable or broadly useful.
- Automatically inheriting disposition from an owning TypeScript package.
- Mechanically enforcing skill dependency closure with a parser, topology guard, or other formal tooling.
- Nesting harness overlay directories or changing harness-visible skill names and invocation paths.
- Auditing or improving skill content, portability, trigger quality, exposure policy, naming, or behavior except where a correction is strictly required to preserve the structural move.
- Reorganizing TypeScript workspace packages or modifying the package disposition Objective.
- Migrating vendored third-party skill content.
- Supporting old and new canonical first-party skill layouts concurrently.

## Completion Criteria

- A skill-specific ADR and complete first-party destination map have been explicitly approved before migration.
- Every first-party canonical skill lives at exactly one `skills/{public,incubating,internal}/<family>/<skill>/` path; no first-party skill remains directly under `skills/`.
- Every destination has an explicit skill-level disposition verdict and a domain/family owner, including the user-set initial classifications.
- Families may span dispositions without changing skill identity, and the authoritative `skills/README.md` documents that contract and the convention-only dependency closure matrix.
- `.agents/skills/<skill>` and `.claude/skills/<skill>` remain flat, resolve to the nested canonical source, and preserve existing harness-visible names and invocation behavior.
- `skills-lock.json`, exposure declarations, scripts, repository instructions, and live references use the final canonical paths; no mixed-layout compatibility remains.
- Vendored third-party directories are unchanged, and relevant skill listing, exposure, and repository validation checks pass.
- The parent Objective synthesizes this Subobjective's outcome as part of professional repository curation.

## Assumptions and Risks

Assumptions:

- A three-disposition model usefully communicates skill support intent even when `public/` is initially empty.
- Stable domain/family folders improve navigation without becoming visibility containers; allowing families to span dispositions avoids conflating ownership with support warrant.
- Flat harness overlays can preserve discovery and invocation while canonical source paths become nested.
- Existing skill acquisition and exposure surfaces can accept explicit nested canonical paths after their references and symlinks are updated.

Risks:

- **Classification ambiguity.** Metadata such as `internal: true`, portability, current use, or package ownership does not alone settle disposition. The complete destination map and explicit approval gate mitigate accidental support promises.
- **Family-taxonomy churn.** Overly broad disciplines or overly narrow one-skill families could make the tree less legible. The ADR must define stable ownership semantics before the map is approved.
- **Path ripple.** Canonical `skills/<name>` assumptions exist in symlinks, lock data, docs, scripts, exposure commands, and agent instructions. An incomplete atomic move could silently break discovery or management workflows.
- **False closure confidence.** Dependency closure is convention-only, so review must inspect required commands, packages, and skills rather than claiming mechanical enforcement.
- **Scope creep.** Classification may expose content or portability defects. Unless a defect blocks structural correctness, record it as follow-up rather than rewriting skills during the move.
- **Parallel-work conflicts.** Other work may edit skills while the destination map and migration are in flight. The implementation must revalidate inventory and coordinate the atomic cutover without making this Objective globally orienting.

## Open Questions

- What exact domain/family vocabulary gives every current first-party skill one stable owner while avoiding generic catch-all or one-skill folders?
- What is the complete approved destination path for each first-party skill?
- Which existing path consumers require coordinated updates for nested canonical sources beyond symlinks, `skills-lock.json`, Skill Exposure Policy, scripts, and documented procedures?
- What focused verification demonstrates unchanged discovery, explicit invocation, command-backed replacement behavior, and internal-skill handling after the move?
