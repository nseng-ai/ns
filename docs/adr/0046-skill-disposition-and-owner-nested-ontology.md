# ADR 0046: Skill disposition and owner-nested canonical ontology

## Status

Proposed under the `skill-disposition-and-owner-ontology` Objective. This draft and the
complete first-party destination map require explicit user approval together before any
skill moves. Drafting this ADR does not authorize migration, publication, or a support
commitment for any skill.

This ADR adapts the release-disposition and owner-nesting pattern accepted for TypeScript
packages in ADR 0045, but it does not derive a skill's disposition from a package, move
package boundaries, or apply package publication mechanics to skills.

## Context

The repository currently keeps 58 first-party canonical skills as direct children of
`skills/`. That flat tree preserves globally unique skill names but communicates neither
support intent nor stable domain ownership. Public-looking location is especially
ambiguous: a portable or generally useful skill can still depend on private repository
commands, conventions, or harness integrations and therefore carry no public support
warrant.

Several independent concerns are currently easy to conflate:

- support disposition: whether the repository warrants, intends, or rejects external
  support for a skill;
- domain/family ownership: which durable product or workflow area owns the skill;
- skill identity: the globally flat name by which a harness or user invokes the skill;
- Skill Exposure Policy: whether model invocation is `normal`, `invoke-only`, or
  `command-backed`; and
- the existing `metadata.internal: true` marker, which is visibility evidence rather than
  a complete support or exposure decision.

The canonical tree and the harness trees also serve different consumers. First-party
sources live under `skills/`, while `.agents/skills/<skill>` and
`.claude/skills/<skill>` are flat harness-facing overlays. Real directories under
`.agents/skills/` are vendored third-party content with upstream ownership and must not be
mistaken for first-party canonical sources.

Flat canonical paths are encoded beyond symlinks. The current acquisition procedures,
lockfile, Skill Exposure resolver, first-party provisioning catalog, package publish
extras, runtime lookup helpers, validation recipes, tests, prompts, agent instructions,
and mutable documentation all contain `skills/<skill>` or one-level `skills/*`
assumptions. The source-backed inventory is
[`skill-tree-design-inventory.md`](../../.ns/objectives/skill-disposition-and-owner-ontology/references/skill-tree-design-inventory.md).
A partial migration could preserve apparent harness discovery while silently breaking
management, provisioning, publication, or validation behavior.

The complete proposed classification will be recorded separately in a destination map.
Acceptance requires approving this ADR and that complete map together.

## Decision

### 1. The first canonical path segment is support disposition

Every first-party canonical skill belongs to exactly one of three mutually exclusive
support dispositions:

- **`public`**: the skill is warranted for external use and ongoing support. Public is a
  support commitment, not merely evidence that the skill is portable, useful outside ns,
  or currently exposed to a harness.
- **`incubating`**: the skill has genuine external support intent, but its contract,
  dependencies, portability, or evidence are not ready for the public commitment.
- **`internal`**: the skill exists to operate this repository or its private workflows and
  has no current external support intent. Internal is not a waiting room for publication.

The roots are `skills/public/`, `skills/incubating/`, and `skills/internal/`. Public may be
empty after the initial classification. Every disposition is decided skill by skill;
owning-package disposition, portability, broad usefulness, current exposure, and
`metadata.internal` are evidence rather than inherited verdicts.

Promotion or demotion is a deliberate support-intent decision and canonical path move. It
does not by itself rename the skill, change exposure policy, publish content, or alter an
owning package.

### 2. Stable domain/family ownership is nested beneath disposition

Every canonical source lives at:

```text
skills/<disposition>/<family>/<skill>/
```

The family answers “which durable domain or workflow family owns this skill?” It is a
navigation and maintenance boundary, not a visibility container, package projection, or
invocation namespace.

A family may appear under more than one disposition. Moving one skill between dispositions
does not force its siblings to move or change family. Families should be durable enough to
survive individual workflow additions and removals, specific enough to identify a real
owner, and broad enough to avoid generic catch-alls or one-skill folders without a genuine
long-lived domain.

The complete destination map will settle the initial family vocabulary. The draft design
inventory records representative clusters and unresolved boundaries without prematurely
classifying every skill.

### 3. The leaf is the globally flat skill identity

The `<skill>` leaf exactly equals the skill's existing harness-visible identity and the
`name` in its `SKILL.md` frontmatter. Skill leaves are globally unique across all three
disposition trees; family and disposition do not become part of invocation names.

The structural migration does not rename skills, rewrite triggers, change command names,
or create old-path compatibility aliases. Any later skill rename remains a separate,
explicit identity change.

### 4. Canonical sources are nested while harness overlays remain flat

First-party canonical sources move to the nested tree. Harness-facing overlays remain:

```text
.agents/skills/<skill>
.claude/skills/<skill>
```

Each first-party `.agents/skills/<skill>` remains a symlink, retargeted to the approved
nested canonical source. Each first-party `.claude/skills/<skill>` remains a symlink through
the flat `.agents` overlay. Harness discovery, explicit invocation, Skill Exposure registry
keys, Pi exclusion keys such as `-skills/<skill>`, and command-backed replacement names
remain globally flat.

Real vendored directories under `.agents/skills/` remain flat and untouched. Their
upstream-owned content does not enter the first-party disposition map.

### 5. Support disposition, exposure, and internal metadata are orthogonal

Skill Exposure Policy continues to describe invocation behavior only:

- `normal` controls ambient model routing;
- `invoke-only` preserves explicit native invocation; and
- `command-backed` replaces native invocation with a verified namespaced command.

The migration preserves each skill's existing exposure policy unless a path correction is
strictly necessary to reapply that same policy. Exposure policy cannot be used as a
shortcut for support disposition.

Likewise, `metadata.internal: true` remains evidence about repository-private visibility.
It strongly informs an internal verdict but is neither a substitute for the destination
map nor an exposure setting. Resolving any inconsistent marker discovered during
classification belongs in the approved migration or a separately recorded follow-up; it
does not authorize content redesign in this structural slice.

### 6. Dependency closure is a review convention

Required operational dependencies obey this support matrix:

| Consumer skill disposition | Allowed required dependency dispositions |
| -------------------------- | ---------------------------------------- |
| `public`                   | `public`                                 |
| `incubating`               | `public`, `incubating`                   |
| `internal`                 | `public`, `incubating`, `internal`       |

A required operational dependency includes a command, package, skill, checked-in prompt,
repository convention, or harness capability without which the documented workflow cannot
perform its promised behavior. An optional example, non-normative documentation link, or
clearly optional integration does not automatically create such a dependency.

This closure rule is convention-only for the initial cutover. The Objective does not add a
skill dependency parser, graph registry, topology guard, or manifest field. Reviewers use
the destination map and source inspection to reject unexplained inward dependencies.

### 7. Classification and migration have separate approval boundaries

The complete destination map must enumerate every first-party canonical skill with:

- current identity;
- explicit disposition verdict and rationale;
- stable family owner;
- final canonical path;
- required dependency concerns relevant to closure; and
- path-consumer or migration notes when exceptional.

No skill moves until the user explicitly approves both this ADR and that complete map.
Approval authorizes implementation planning, not external publication or unrelated content
work.

### 8. The cutover is atomic

The approved migration moves all first-party canonical sources together and updates every
live canonical-path consumer in the same coordinated boundary. The cutover includes flat
symlink retargeting, `skills-lock.json`, Skill Exposure path handling and declarations,
first-party provisioning and publish-extra source paths, runtime lookup behavior, scripts,
validation, tests, prompts, repository instructions, and mutable documentation.

The destination state has no first-party skill directly under `skills/`, no mixed-layout
compatibility, and no fallback alias for an old canonical path. Flat harness overlays and
vendored third-party directories are the deliberate exceptions because they are different
surfaces, not compatibility copies of the canonical tree.

`skills/README.md` becomes the authoritative mutable contract for support dispositions,
family ownership, canonical paths, flat overlays, identity, and convention-only closure.
Historical ADRs and immutable Objective updates retain their time-in-place paths and prose.

## Consequences

- Listing `skills/` communicates support intent first, while the family level communicates
  ownership and the leaf preserves invocation identity.
- A skill can move between support dispositions without changing family or harness-visible
  name.
- Public is intentionally demanding and may initially be empty; this avoids accidental
  support promises based on portability or popularity.
- Flat overlay consumers continue to work, but canonical-source tooling must become
  destination-aware rather than assuming `skills/<skill>`.
- Skill acquisition, exposure, provisioning, publishing, and runtime lookup must preserve
  the distinction between nested canonical source paths and flat harness target paths.
- Reviewers must judge dependency closure manually until a separately justified mechanism
  exists.
- The atomic migration has a broad path ripple, but it avoids a long-lived dual layout and
  prevents flat-path assumptions from silently surviving behind working symlinks.

## Approval gate

This ADR remains proposed. The next Objective slice must produce the complete first-party
destination map, resolve the family vocabulary and classification ambiguities recorded in
the design inventory, and obtain explicit approval of both artifacts before moving any
skill.
