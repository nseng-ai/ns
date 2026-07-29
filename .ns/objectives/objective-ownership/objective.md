# Objective Ownership

## Thesis

Prepare the Objectives extension for multi-contributor repositories by making every
Objective carry exactly one immutable **Objective Owner** — an individual contributor
handle, normally the contributor's GitHub login — as part of Objective identity. Canonical
storage becomes owner-nested (`.ns/objectives/<owner>/<slug>/`), the durable identity
becomes the **Objective Locator** `<owner>/<slug>`, and the owner is mirrored in Record
Frontmatter so `ns objective check` can validate path/record agreement. Ownership is
stewardship — responsibility for the record's narrative integrity, roadmap decisions,
coordination, and closure — not access control, assignment, or review authority.

This Objective is README-driven: the canonical design contract is
`references/README-draft.md`, a whole-extension user-facing README seeded from the
current package README with the ownership, locator, and storage sections fully developed.
Decisions settle in the README; the roadmap tracks execution.

## Scope

- The owner model: singular required owner, handle syntax (canonical lowercase,
  GitHub-compatible, stored without `@`), immutability, replacement semantics
  (close-and-recreate for owner or slug changes).
- Owner-nested canonical storage under `.ns/objectives/<owner>/<slug>/` and the
  Objective Locator as durable identity.
- `owner` as a new Record Frontmatter key with `ns objective check` validation:
  frontmatter/path agreement, owner-directory syntax, depth and hygiene rules.
- Objective Edges referencing full locators; owner-local (not global) slug uniqueness.
- Locator-based CLI surfaces: `list` (owner grouping, `--owner` filter, `--names`
  emitting locators), `show`, `check`, and the hidden `exec` helpers.
- Owner resolution at creation: explicit `--owner`, else authenticated GitHub login as
  the proposed default, always user-confirmed; validation stays local and offline.
- Skill-family updates (`objective` umbrella and affected step skills), a new ADR
  superseding the relevant parts of ADR 0025, `docs/objective-system.md` rebaseline, and
  root `CONTEXT.md` vocabulary — updated in the same changes as implementation.
- Hard-cutover migration of this repository's **open** records to
  `.ns/objectives/schrockn/<slug>/`, including edge rewrites to full locators.
- Promotion of the settled README draft to the package README as the durable user-facing
  home.

## Non-Goals

- Teams, organizations, or multi-owner records: an owner is one individual contributor.
- Email in the owner model — if a concrete need emerges it becomes a separate field with
  its own semantics, added later.
- Mutable ownership, transfer workflows, owner aliases, or identity migration beyond
  close-and-replace.
- Row-level owners, contributor lists, due dates, or any task-database drift.
- Access control, merge/review/publication authority, or CODEOWNERS coupling derived
  from the owner field.
- Live GitHub verification in validation paths (`check` stays offline; GitHub is only a
  creation-time default source).
- Migrating this repository's closed/historical records now (deferred to a parked
  follow-up once the feature settles).

## Completion Criteria

- The README draft reads as coherent product documentation for the whole extension, with
  the ownership/locator/storage story fully settled, and is **promoted** to
  `ts/packages/incubating/extensions/objectives/README.md` with the Objective reference
  repointed at the promoted doc. The Objective is not complete while the canonical
  contract lives only under `.ns/objectives/objective-ownership/references/`.
- The owner model is implemented in `@nseng-ai/objectives` and live in this repository:
  open records migrated under `schrockn/`, `owner` frontmatter present and validated,
  edges rewritten to locators, and CLI surfaces operating on locators.
- `ns objective check --all` enforces the owner hygiene rules and passes on this
  repository, while deliberately tolerating still-flat closed records during the interim.
- The new ADR is accepted, and `docs/objective-system.md`, root `CONTEXT.md`, and the
  Objective skill family describe the implemented ownership model with no contradictory
  standing rules left behind.

## Assumptions and Risks

- **Assumption:** this repository's history is effectively single-contributor, so every
  open record migrates to owner `schrockn` mechanically with no per-record judgment. If a
  record turns out to have a different natural steward, that is an explicit per-record
  decision at migration time.
- **Assumption:** conservative GitHub-compatible handle syntax (lowercase ASCII
  alphanumerics and internal hyphens, ≤39 chars, no leading `@` in durable data) is
  sufficient for owner identity; repositories may use handles that are not live GitHub
  accounts.
- **Deliberate shortcut + upgrade:** closed records stay flat at cutover, so readers and
  `check` must tolerate two layouts for closed records. The named upgrade is the parked
  historical-migration row: once the feature settles, migrate closed records and retire
  the dual-layout tolerance. Retire the pair together.
- **Risk:** the locator change ripples through every Objective skill, doc, and machine
  surface (`--names`, edge references, selection rules); a partial update leaves agents
  reading contradictory standing rules mid-flight. Mitigation: doc/skill updates land in
  the same slices as the behavior they describe.
- **Risk:** immutable ownership makes GitHub handle renames expensive
  (close-and-replace). Accepted deliberately for now; aliasing or migration would be a
  separate future decision.
- **Risk:** owner-local slug uniqueness plus short-slug convenience input can be
  ambiguous. Resolution must fail closed to the full locator; durable records always use
  full locators.

## Open Questions

- Short-input ergonomics: how much bare-slug convenience should `show`/`check` accept
  before ambiguity outweighs it?
- Does the cutover need a temporary orienting rule (`orientation.md`) while the two
  layouts coexist, so unrelated agents create records in the right place?
- Exact interim `list --status all` / `check --all` presentation for still-flat closed
  records (silent tolerance vs. labeled legacy layout).
