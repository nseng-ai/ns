# Point System

## Thesis

ns extensibility and configuration surfaces converge on one model: extensions **define
points** (typed places in the workflows they own), consumers **install hooks** (scripts)
and **prompts** (pure LM content) at them through repo config, and a kernel-owned shared
loader plus **point catalog** make the whole configuration introspectable. The full
decided design is in this record's `brief.md`; this objective tracks implementing it and
retiring the fragmented predecessors (four ad-hoc `ns.toml` parsers, three prompt
resolution ladders, the provisional `[flow.hooks]` key).

## Scope

- Kernel shared `ns.toml` loader: single parse, Zod-validated `[points]` table and
  manifest-declared settings schemas, diagnostics.
- `ns.points` extension-manifest discovery and point catalog computation (definitions
  joined with installations).
- Migrations onto the point system: `flow.submit.pre` (hooks), `flow.submit.pr-description`
  and branch-context `plans-write` (override prompt points), roaster/areg/ns-init settings.
- CLI introspection under the `ns extension` group: `points` and `point <id>`.
- Graduating `brief.md` into an ADR plus CONTEXT.md vocabulary at the end.

## Non-Goals

- `ns extension install` / `update` UX (extension distribution is its own effort).
- A global (XDG) installation tier; v1 resolution is project-only.
- Executing prompts or a first-class agent-task `accepts` kind; the platform only
  resolves prompt content.
- Reified lifecycle, SDLC views (`ns lifecycle`), or modeling "nouns".
- Pi/skills/harness-artifact management (owned by skill-management-subsystem).

## Completion Criteria

- Exactly one `ns.toml` parse path exists (the kernel loader); the four ad-hoc smol-toml
  parsers are gone.
- The point catalog is computed from extension manifests plus consumer config, with
  diagnostics for installed-but-undefined (error), override-in-effect, and
  defined-but-uninstalled.
- `flow.submit.pre`, `flow.submit.pr-description`, and `plans-write` are declared points;
  `[flow.hooks]` no longer exists; prompt files use id-based names.
- roaster, areg, and ns-init harnesses settings are manifest-declared and loader-validated.
- `ns extension points` and `ns extension point <id>` ship with scenario coverage.
- The ADR and CONTEXT.md vocabulary (point, hook, prompt, install, define, point catalog)
  are landed and `brief.md`'s role is superseded.

## Definition of Progress

Progress is keepable when:

- A roadmap slice lands as compiling, tested TypeScript with full `just` passing.
- A migration slice fully replaces its old surface within the slice — no dual code paths
  or compatibility shims (ns is unreleased; breaking changes are allowed).
- Catalog/diagnostic behavior is covered by fake-driven unit or scenario tests.

Do not keep changes that:

- Alter the decided model in `brief.md` (vocabulary, manifest or `[points]` shapes,
  resolution ladder, typing axes) without an explicit user decision recorded first.
- Leave a config surface half-migrated across slices (old parser and new loader both live
  for the same key).

Useful evidence includes: targeted Vitest runs, full `just`, and `ns extension points`
output against this repo's own configuration (self-hosting is the first consumer).

## Runner Policy

This Objective is execution-friendly for `objective-next` under the boundaries below.

- Direct execution is allowed when: implementing roadmap slices whose contracts
  `brief.md` already pins — the kernel loader, `ns.points` discovery, point catalog, the
  named migrations, and the `ns extension` catalog CLI — as TypeScript code plus tests,
  with Objective tracking updates routed through `objective-update`.
- Steer or ask first when: a slice would change the decided model in `brief.md`, expand
  the kernel SDK public surface beyond it, add dependencies beyond `smol-toml` and
  existing catalog tooling, restructure packages/subpackages (ADR 0022/0023 territory),
  or touch anything listed under Non-Goals.
- How work may change files and be left: edits under `ts/packages/*`, `.ns/extensions/*`
  manifests, repo-root `ns.toml`, `.ns/prompts/*`, and this record; work is left committed
  on feature branches (never trunk), uncommitted only within an active session.
- Validation before keeping work: full `just` passes; formatting through autofixers.
- What will not happen unless explicitly requested: PR submission or push, publishing,
  external-system writes, edits to Pi/skills surfaces, ADR/CONTEXT.md edits before the
  graduation slice.

## Assumptions and Risks

Assumptions:

- Static manifest declaration (pure JSON `ns.points`) is expressive enough for all v1
  points, including override defaults via package-relative markdown files — mirrors how
  `ns.commands` already works. Disproven if a point needs computed metadata.
- Project-only resolution is sufficient for v1; no cross-repo installation need appears
  before closure.
- The `.ns/extensions/<group>/package.json` manifests are the right declaration home for
  first-party points even though the consuming runtime code lives in `ts/packages/*`
  capabilities (the group name is the join; the kernel loader serves both).
- `smol-toml` remains the TOML parser and is acceptable as a kernel dependency.

Risks:

- Kernel placement of the loader/catalog is de-risked for the initial slice: the shared
  loader lives in `@nseng-ai/kernel` as a kernel-owned internal workspace surface, with
  `ns.points` manifest schema/types exposed from the SDK manifest metadata. Future slices
  should keep capability consumption through this kernel surface and avoid new packages or
  capability-kit/foundation relocation unless a fresh layering problem appears.
- Renaming `.ns/prompts/` files to id-based names touches content live workflows read
  (pr-description generation, plan saves); each rename must cut over reader and file in
  one slice.
- Generalizing the `NS_DEV_PR_DESCRIPTION_PROMPT` env override could silently break a dev
  workflow; the catalog reporting active env overrides is the mitigation.
- Conceptual overlap with skill-management-subsystem's catalog machinery could produce
  duplicated infrastructure or colliding vocabulary; keep "point catalog" scoped to
  config, coordinate if the two want shared code.

## Open Questions

- How capability runtime code consumes resolved installations: direct kernel API or a
  narrow gateway interface for testability (fake-driven testing conventions favor the
  latter).
- Naming scheme for generalized prompt dev-override env vars.
