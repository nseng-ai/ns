# @nseng-ai/objectives

<!-- Canonical README draft for the objective-ownership Objective (readme-driven
development). This document is the whole-extension user-facing contract, seeded from
ts/packages/incubating/extensions/objectives/README.md. Sections marked STUB are
outline placeholders carrying current behavior; the ownership, locator, storage, and
CLI sections are the fully developed design payload. On promotion this file replaces
the package README. -->

ns Objectives, packaged as an installable ns extension.

An **Objective** is a durable, checked-in planning record for work that outlives a single
agent session — multi-session, multi-branch, or multi-PR work. Your coding agent reads and
maintains the record; you review it in ordinary diffs. Objectives live as Markdown under
`.ns/objectives/` in your repository, organized by owner, and every Objective has exactly
one owner.

This package is an ns extension: it is installed on top of the bare-core
[`@nseng-ai/ns`](../../../public/ns/README.md) CLI, not bundled with it.

The package is harness-independent and has no Pi host surface. The separate incubating
`@nseng-ai/pi-ns-objectives` adapter preserves the `/ns:objective:*` Pi command family by
consuming this package's curated `@nseng-ai/objectives/api` surface.

## Install

<!-- STUB: carried from the current package README; revisit wording in a later pass. -->

Requires `@nseng-ai/ns` installed and a repository already activated with `ns init`:

```bash
npm install -g @nseng-ai/ns
ns init --harness claude-code                  # once per repository
ns extension install npm:@nseng-ai/objectives
```

Installing the extension records it in `ns.toml`, adds the `ns objective` command
surface, adds an Objectives instruction block to `AGENTS.md`, and provisions the nine
Objective skills into your harness's skill root. `ns extension install` writes files but
never commits — review and commit them yourself.

## Lifecycle

<!-- STUB: carried from the current package README; add owner resolution to the Create
row's story in a later pass. -->

Drive an Objective through **create → next → update → close** by asking your agent in
natural language; each step maps to a skill (`objective-create`, `objective-next`,
`objective-update`, `objective-close`). Because the record is checked in, a fresh agent
session starts with the full history of intent instead of an empty context window.

## Record anatomy

<!-- STUB: outline placeholder. Describe objective.md required headings, roadmap.md,
updates/ immutability, orientation.md, closed.md, and Record Frontmatter (owner, blocked,
edges) in a later pass. -->

## Owners

Every Objective has exactly one **owner**: the individual contributor responsible for the
record's narrative integrity, roadmap decisions, coordination, and closure.

- An owner is a **handle**, normally the contributor's GitHub login: lowercase ASCII
  letters, digits, and internal hyphens, at most 39 characters, stored without a leading
  `@`. Human-facing output may render it as `@schrockn`; paths, frontmatter, CLI
  arguments, and machine output always use the bare canonical form.
- Ownership is required — there are no unowned Objectives — and **immutable** for the
  Objective's lifetime.
- Ownership is stewardship, not access control: anyone may contribute to, implement, or
  edit an Objective. Owning a record grants no merge, review, or publication authority.
- Owners are currently individuals. Teams and organizations are not owners.

Ownership is part of Objective **identity**. The durable identity of an Objective is its
**Objective Locator**:

```text
<owner>/<slug>
```

for example `schrockn/objective-ownership`. Slugs are unique per owner, not globally:
`alice/repo-cleanup` and `bob/repo-cleanup` are different Objectives.

### Storage layout

Canonical records live under an owner directory:

```text
.ns/objectives/
  schrockn/
    objective-ownership/
      objective.md
      roadmap.md
      updates/
  alice/
    repo-cleanup/
      objective.md
      roadmap.md
      updates/
```

Owner directories exist only when that owner has at least one Objective. Nothing deeper
than `<owner>/<slug>/` is a record, and nothing directly under `.ns/objectives/` is one.

Each record's `objective.md` repeats its owner in frontmatter so a record is
self-identifying and moves are caught mechanically:

```yaml
---
owner: schrockn
---
```

`ns objective check` fails when the frontmatter owner and the owner path segment
disagree.

### Choosing the owner at creation

Creation resolves the owner in this order:

1. An explicit `--owner <handle>` argument.
2. Your authenticated GitHub login, proposed as the default.
3. Otherwise, you are asked.

The resolved owner is always shown for confirmation before the record is written.
Validation is purely syntactic and offline: the extension never requires a live GitHub
lookup to create, list, or check Objectives, so repositories may use handles that are not
GitHub accounts.

### Changing an owner or slug

Neither is renamed in place — both are identity. To change either, **replace** the
Objective:

1. Close the existing record.
2. Create a new Objective under the desired locator.
3. State the replacement in both records: the old record's closure prose names the new
   locator, and the new record names what it replaces.
4. Leave the old record's historical updates untouched; carry remaining scope forward as
   newly authored guidance.

### Relating Objectives across owners

Objective Edges reference full locators, so relationships work across owner boundaries:

```yaml
---
owner: alice
edges:
  - objective: bob/checkout-free-distribution
    annotation: Consumes its published package surface.
---
```

## CLI

The extension adds a deterministic, read-only `ns objective` surface. Commands address
records by full locator:

```bash
ns objective list                                # open Objectives, grouped by owner
ns objective list --owner schrockn               # one owner's records
ns objective show schrockn/objective-ownership   # inspect one record
ns objective check schrockn/objective-ownership  # validate one record
ns objective check --all                         # repo-wide structural sweep
```

`ns objective list` groups records under owner headings:

```text
@schrockn
  OBJECTIVE                STATUS      LATEST UPDATE
  objective-ownership      open        today

@alice
  OBJECTIVE                STATUS      LATEST UPDATE
  repo-cleanup             blocked     2 days ago
```

Machine-readable output always uses full locators; `ns objective list --names` emits one
locator per line:

```text
schrockn/objective-ownership
alice/repo-cleanup
```

A bare slug may be accepted as convenience input when it resolves to exactly one record;
any ambiguity fails with the matching full locators. Durable references — edges, records,
scripts — always use full locators.

### What `check` enforces

`ns objective check` and `check --all` validate structure, never prose:

- frontmatter `owner` present and equal to the owner path segment;
- owner directories use canonical handle syntax;
- no record directly under `.ns/objectives/`, no empty owner directories, nothing deeper
  than `<owner>/<slug>/`;
- edges reference existing full locators with mirrored entries on both sides;
- the existing frontmatter rules for `blocked` and `edges`.

## Skills

<!-- STUB: outline placeholder. Enumerate the nine provisioned skills and when each
triggers in a later pass. -->

## Open questions

- How much bare-slug convenience input should commands accept before ambiguity makes it
  more confusing than helpful?
- How should repositories with records predating ownership present them during
  migration (labeled legacy layout vs. silent tolerance)?
