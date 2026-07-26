---
edges:
  - objective: professional-repo-curation
    annotation: Completed Parallel Subobjective whose skill-tree outcome is synthesized by the parent while ADR 0046 and skills/README.md preserve the durable support-disposition and ownership contract.
---

# Skill Disposition and Owner Ontology

## Thesis

Reorganize every first-party canonical skill source so its path communicates support disposition and stable ownership. The normal shape is `skills/<disposition>/<family>/<skill>/`, where disposition is exactly `public`, `incubating`, or `internal`, and a family may span multiple dispositions. A durable product skill may instead live at `skills/<disposition>/<skill>/` when its identity is itself the owner boundary; the approved initial exceptions are `brmem` and `slots`.

This is a parallel Subobjective of `professional-repo-curation`. It adopts the package tree's three disposition meanings but makes explicit skill-by-skill verdicts rather than inheriting package disposition. Public support requires an explicit warrant rather than portability or general usefulness; `pr-make-accountable` is the approved first public skill.

Canonical sources become nested while harness-facing overlays remain globally flat. `.agents/skills/<skill>` and `.claude/skills/<skill>` preserve skill names and invocation behavior through updated symlinks. The cutover is structural: it preserves content and behavior except where a path correction is required for the move.

## Scope

- Write and explicitly approve a skill-specific ADR defining the three dispositions, domain/family ownership, skill identity, and the nested-canonical/flat-overlay boundary.
- Produce and explicitly approve a complete destination map for every first-party skill before moving any skill.
- Classify each skill independently. An owning package's disposition is evidence, not an inherited verdict.
- Permit one family to appear under multiple dispositions; disposition belongs to the individual skill, while the middle folder expresses stable domain/family ownership only. Permit explicit top-level product-skill exceptions when the skill identity is itself the stable owner boundary.
- Record the user-set classifications: `pr-make-accountable` is public; the Flow skill family is incubating; `brmem` and `slots` are top-level incubating product skills; and `code-graphite`, `changelog-update`, `project-setup`, `cli-push-down`, `reinvented-abstractions-tripwire`, `plan-stack-from-findings`, `readme-driven-development`, `typescript-fake-driven-testing`, and `typescript-style` are internal.
- Document dependency closure as a review convention: public skills require only public supported surfaces; incubating skills may require public or incubating surfaces; internal skills may require anything. Documentation links and optional examples do not automatically constitute required operational dependencies.
- Atomically move all first-party canonical skill sources to their approved family-nested or top-level product paths after design approval.
- Update flat `.agents/skills/<skill>` and `.claude/skills/<skill>` overlays, `skills-lock.json`, Skill Exposure Policy declarations, scripts, repository guidance, and live path references needed for the new canonical paths.
- Write `skills/README.md` as the authoritative skill-tree contract.
- Leave vendored third-party real directories under `.agents/skills/` untouched.

## Non-Goals

- Publishing or promising any additional public skill merely because it is portable or broadly useful.
- Automatically inheriting disposition from an owning TypeScript package.
- Mechanically enforcing skill dependency closure with a parser, topology guard, or other formal tooling.
- Nesting harness overlay directories or changing harness-visible skill names and invocation paths.
- Auditing or improving skill content, portability, trigger quality, exposure policy, naming, or behavior except where a correction is strictly required to preserve the structural move.
- Reorganizing TypeScript workspace packages or modifying the package disposition Objective.
- Migrating vendored third-party skill content.
- Supporting old and new canonical first-party skill layouts concurrently.

## Completion Criteria

- A skill-specific ADR and complete first-party destination map have been explicitly approved before migration.
- Every first-party canonical skill lives at exactly one approved path under `skills/{public,incubating,internal}/`; no first-party skill remains directly under `skills/`.
- Every destination has an explicit skill-level disposition verdict and a stable owner, including the approved `brmem` and `slots` top-level product exceptions and other user-set classifications.
- Families may span dispositions without changing skill identity, and the authoritative `skills/README.md` documents that contract, the narrow product-skill exception, and the convention-only dependency closure matrix.
- `.agents/skills/<skill>` and `.claude/skills/<skill>` remain flat, resolve to the nested canonical source, and preserve existing harness-visible names and invocation behavior.
- `skills-lock.json`, exposure declarations, scripts, repository instructions, and live references use the final canonical paths; no mixed-layout compatibility remains.
- Vendored third-party directories are unchanged, and relevant skill listing, exposure, and repository validation checks pass.
- The parent Objective synthesizes this Subobjective's outcome as part of professional repository curation.

## Assumptions and Risks

Assumptions:

- A three-disposition model usefully communicates skill support intent, including the explicit first public support warrant for `pr-make-accountable`.
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

- None at closure. The cutover updated the additional live consumers it uncovered, and repository, specialized-lane, exposure, and structural checks provide the required verification.

## Closure

Outcome: **completed**.

The approved ontology and destination map are fully implemented: all 58 first-party canonical skill leaves match their approved paths (`public` 1, `incubating` 23, `internal` 34), no first-party skill remains directly under `skills/`, leaf identities match frontmatter, and `skills/README.md` now owns the authoritative tree and convention-only dependency-closure contract. The 58 flat first-party `.agents` symlinks resolve to those nested sources, `.claude` remains flat through `.agents`, all 16 real vendored `.agents` directories are unchanged, and `skills-lock.json` contains exactly the 58 local source-path changes with hashes and vendored entries unchanged.

Exposure behavior is unchanged: live first-party output remains 14 normal, 35 command-backed, and 9 invoke-only. The earlier 14/34/10 aggregate was stale; the migration did not change exposure sidecars, and the four Flow edits only removed contradictory `metadata.internal`. Dependency review confirmed that public `pr-make-accountable` requires only Git and authenticated `gh`, with `ns flow submit` clearly optional. Independent review also led to remediation of an incubating `objective-next` mandatory internal `code-graphite` dependency and two skill-management procedure/safety defects.

Validation passed with `just` (including style guard 170, default Vitest 555 files/5771 tests, and the Objective check sweep), `just ts-test-integration` (48 files/194 tests), `just ts-test-isolated` (5 files/16 tests), `just skill-exposure-check`, the structural checks above, and earlier focused package suites. `INSTALL_INTERNAL_SKILLS=1 npx skills check` is not passing evidence: it attempted an external vendored refresh, failed for two skills, and mutated vendored files; all accidental effects were restored. This is accepted tooling behavior rather than a cutover failure. The runtime `.agents` descriptor's legacy `sourceType: vendored` label for first-party symlinks remains a nomenclature-only follow-up, not a behavioral or closure blocker.

No live Blocked Sentence exists to clear. The mirrored edge to `professional-repo-curation` remains in place for parent synthesis; its counterpart is not blocked on this Objective. The durable ontology is graduated to ADR 0046 and `skills/README.md`, so this closed record is not its sole home.
