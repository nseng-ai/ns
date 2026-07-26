# ADR 0046: Skill disposition and owner-nested canonical ontology

## Status

Accepted. Decided 2026-07-26 under the `skill-disposition-and-owner-ontology` Objective
together with the complete first-party destination map. Acceptance authorizes the atomic
structural migration but does not itself publish skills or move canonical sources.

This ADR adapts release-disposition and owner-nesting pattern accepted for TypeScript
packages in ADR 0045. It does not derive skill disposition from package, move package
boundaries, or apply package publication mechanics to skills.

## Context

Repository currently keeps 58 first-party canonical skills as direct children of `skills/`.
Flat tree preserves globally unique skill names but communicates neither support intent nor
stable domain ownership. Public-looking location remains ambiguous: portable or generally
useful skill can depend on private repository commands, conventions, or harness
integrations, carrying no public support warrant.

Several independent concerns remain easy to conflate:

- support disposition: whether repository warrants, intends, or rejects external support
  for skill;
- domain/family ownership: which durable product or workflow area owns skill;
- skill identity: globally flat name used by harness or user to invoke skill;
- Skill Exposure Policy: whether model invocation is `normal`, `invoke-only`, or
  `command-backed`; and
- existing `metadata.internal: true` marker: visibility evidence, not complete support or
  exposure decision.

Canonical and harness trees serve different consumers. First-party sources live under
`skills/`; `.agents/skills/<skill>` and `.claude/skills/<skill>` are flat harness-facing
overlays. Real directories under `.agents/skills/` contain vendored third-party content
with upstream ownership, not first-party canonical sources.

Flat canonical paths exist beyond symlinks. Current acquisition procedures, lockfile, Skill
Exposure resolver, first-party provisioning catalog, package publish extras, runtime lookup
helpers, validation recipes, tests, prompts, agent instructions, and mutable documentation
all contain `skills/<skill>` or one-level `skills/*` assumptions. Source-backed inventory:
[`skill-tree-design-inventory.md`](../../.ns/objectives/skill-disposition-and-owner-ontology/references/skill-tree-design-inventory.md).
Partial migration could preserve apparent harness discovery while silently breaking
management, provisioning, publication, or validation behavior.

The approved destination map records the complete classification and is the implementation
authority for the atomic cutover.

## Decision

### 1. The first canonical path segment is support disposition

Every first-party canonical skill belongs to exactly one of three mutually exclusive
support dispositions:

- **`public`**: skill warranted for external use and ongoing support. Public means support
  commitment, not merely evidence of portability, usefulness outside ns, or current harness
  exposure.
- **`incubating`**: skill has genuine external support intent, but contract, dependencies,
  portability, or evidence are not ready for public commitment.
- **`internal`**: skill operates this repository or its private workflows and has no current
  external support intent. Internal is not waiting room for publication.

Roots: `skills/public/`, `skills/incubating/`, and `skills/internal/`. The initial map has
one public skill, `pr-make-accountable`. Each disposition is decided skill by skill. Owning-package
disposition, portability, broad usefulness, current exposure, and `metadata.internal` are
evidence, not inherited verdicts.

Promotion or demotion requires deliberate support-intent decision and canonical path move.
Alone, it does not rename skill, change exposure policy, publish content, or alter owning
package.

### 2. Stable domain/family ownership is normally nested beneath disposition

The normal canonical shape is:

```text
skills/<disposition>/<family>/<skill>/
```

Family answers “which durable domain or workflow family owns this skill?” It is navigation
and maintenance boundary, not visibility container, package projection, or invocation
namespace.

Family may appear under multiple dispositions. Moving one skill between dispositions does
not force siblings to move or change family. Families should survive individual workflow
additions and removals, identify real owner, and avoid generic catch-alls or one-skill
folders without genuine long-lived domain.

A durable product skill may live directly beneath its disposition when its globally unique
skill identity is itself the stable owner boundary and a repeated one-skill family folder
would add no information:

```text
skills/<disposition>/<skill>/
```

This is an explicit map-level exception, not a general flat-layout fallback. The initial
exceptions are `skills/incubating/brmem/` and `skills/incubating/slots/`. All other initial
skills use family nesting.

The approved destination map settles the initial family vocabulary and product-skill
exceptions. The design inventory preserves the source-backed baseline and review questions
that informed those decisions.

### 3. The leaf is the globally flat skill identity

`<skill>` leaf exactly equals skill's existing harness-visible identity and `name` in its
`SKILL.md` frontmatter. Skill leaves remain globally unique across all three disposition
trees. Family and disposition do not enter invocation names.

Structural migration does not rename skills, rewrite triggers, change command names, or
create old-path compatibility aliases. Any later skill rename remains separate, explicit
identity change.

### 4. Canonical sources are nested while harness overlays remain flat

First-party canonical sources move to nested tree. Harness-facing overlays remain:

```text
.agents/skills/<skill>
.claude/skills/<skill>
```

Each first-party `.agents/skills/<skill>` remains symlink retargeted to approved nested
canonical source. Each first-party `.claude/skills/<skill>` remains symlink through flat
`.agents` overlay. Harness discovery, explicit invocation, Skill Exposure registry keys, Pi
exclusion keys such as `-skills/<skill>`, and command-backed replacement names remain
globally flat.

Real vendored directories under `.agents/skills/` remain flat and untouched. Their
upstream-owned content does not enter first-party disposition map.

### 5. Support disposition, exposure, and internal metadata are orthogonal

Skill Exposure Policy continues to describe invocation behavior only:

- `normal` controls ambient model routing;
- `invoke-only` preserves explicit native invocation; and
- `command-backed` replaces native invocation with verified namespaced command.

Migration preserves each skill's existing exposure policy unless path correction is
strictly necessary to reapply same policy. Exposure policy cannot substitute for support
disposition.

Likewise, `metadata.internal: true` remains evidence about repository-private visibility.
It strongly informs internal verdict but substitutes for neither destination map nor
exposure setting. Resolving inconsistent marker found during classification belongs in
approved migration or separately recorded follow-up. It does not authorize content
redesign in this structural slice.

### 6. Dependency closure is a review convention

Required operational dependencies obey this support matrix:

| Consumer skill disposition | Allowed required dependency dispositions |
| -------------------------- | ---------------------------------------- |
| `public`                   | `public`                                 |
| `incubating`               | `public`, `incubating`                   |
| `internal`                 | `public`, `incubating`, `internal`       |

Required operational dependency includes command, package, skill, checked-in prompt,
repository convention, or harness capability needed for documented workflow to perform its
promised behavior. Optional example, non-normative documentation link, or clearly optional
integration does not automatically create such dependency.

For initial cutover, closure rule is convention-only. Objective adds no skill dependency
parser, graph registry, topology guard, or manifest field. Reviewers use destination map
and source inspection to reject unexplained inward dependencies.

### 7. Classification and migration have separate approval boundaries

The approved complete destination map enumerates every first-party canonical skill with:

- current identity;
- explicit disposition verdict and rationale;
- stable family owner;
- final canonical path;
- required dependency concerns relevant to closure; and
- path-consumer or migration notes when exceptional.

The user explicitly approved this ADR and the complete map together on 2026-07-26.
Acceptance authorizes the atomic structural implementation, not external publication or
unrelated content work.

### 8. The cutover is atomic

Approved migration moves all first-party canonical sources together and updates every live
canonical-path consumer within same coordinated boundary. Cutover includes flat symlink
retargeting, `skills-lock.json`, Skill Exposure path handling and declarations, first-party
provisioning and publish-extra source paths, runtime lookup behavior, scripts, validation,
tests, prompts, repository instructions, and mutable documentation.

Destination state has no first-party skill directly under `skills/`, mixed-layout
compatibility, or fallback alias for old canonical path. Flat harness overlays and vendored
third-party directories remain deliberate exceptions: different surfaces, not compatibility
copies of canonical tree.

`skills/README.md` becomes authoritative mutable contract for support dispositions, family
ownership, canonical paths, flat overlays, identity, and convention-only closure.
Historical ADRs and immutable Objective updates retain time-in-place paths and prose.

## Consequences

- Listing `skills/` communicates support intent first; family level normally communicates
  ownership, while approved top-level product skills carry ownership in their identity;
  the leaf preserves invocation identity.
- Skill can move between support dispositions without changing family or harness-visible
  name.
- Public remains intentionally demanding; `pr-make-accountable` is the initial explicit
  support warrant rather than a promotion based on portability or popularity.
- Flat overlay consumers continue working, but canonical-source tooling must become
  destination-aware instead of assuming `skills/<skill>`.
- Skill acquisition, exposure, provisioning, publishing, and runtime lookup must preserve
  distinction between nested canonical source paths and flat harness target paths.
- Reviewers must judge dependency closure manually until separately justified mechanism
  exists.
- Atomic migration has broad path ripple but avoids long-lived dual layout and prevents
  flat-path assumptions from silently surviving behind working symlinks.

## Approval

Approved together with
[`skill-destination-map.md`](../../.ns/objectives/skill-disposition-and-owner-ontology/references/skill-destination-map.md)
on 2026-07-26. The map resolves all 58 initial destinations, including the `brmem` and
`slots` top-level product exceptions, the cross-disposition `prs` family, the internal
`code` family, and the first public support warrant for `pr-make-accountable`.
