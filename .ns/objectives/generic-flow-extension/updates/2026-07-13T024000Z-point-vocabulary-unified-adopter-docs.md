# Point vocabulary unified to cardinality; adopter docs slice completed

## Summary

A grilling session over the adopter-docs roadmap row reshaped its vocabulary deliverable.
Instead of documenting a `cardinality` ↔ `semantics` mapping, the user chose full
vocabulary unification: the point catalog, `ns extension points` / `ns extension point`
CLI output (human and JSON), and category-derived diagnostics now report descriptor
`cardinality: one|many` directly. The derived `semantics: additive|override` axis,
`PointSemantics` type, and `pointSemanticsValues` export are gone;
`point_override_in_effect` was renamed `point_installation_in_effect` ("Cardinality-one
point X has a repo installation in effect."). Verb-sense uses of "override" — the env-var
override mechanism, `point_prompt_env_override_in_effect`, and prose describing an
installation replacing a default — deliberately survive; only the category vocabulary was
retired. Legacy `ns.points` package.json test fixtures keep the old `semantics` key as
deliberate negative coverage of the retired discovery format.

The docs slice then landed on top: the points guide defines cardinality meaning inline
(`many` adds behavior; a single `one` installation replaces the default), gains a
"For workflow implementers: consuming the catalog" section (internal workspace export
`@nseng-ai/sdk/project-config/points`; `loadPointCatalog` with `preferredDescriptors`,
`loadPointCatalogWithDescriptors`, `hookCommandsForPoint`, `resolvePromptPointSource`,
`resolvePromptPointPath`; Flow submit as the production example), and a worked example
covering both `flow.submit.pre` and this repo's conventional
`.ns/prompts/flow.submit.pre.recovery.md` override. Root `AGENTS.md` gains an
architecture-rules routing bullet to `docs/guides/points.md`. ADR 0031 and
`ts/packages/sdk/CONTEXT.md` received small source-backed vocabulary corrections
(including the stale `--no-hooks` flag example).

## Objective Impact

The **Extension-point docs for adopters** roadmap row is complete, with the mapping
deliverable superseded by the unification. Adopters and workflow implementers now see one
vocabulary end to end: descriptor `cardinality` is what the catalog and CLI report. No
point id, resolution ladder, marker contract, or recovery behavior changed. Work landed
as two stacked local branches (`point-vocab/unify-cardinality`,
`point-vocab/adopter-docs`); full repo validation (`just`), TypeScript checks, targeted
sdk/flow unit, scenario, and integration tests pass on both.

Remaining active work: the four audit-driven genericization clusters and README
promotion. The README draft was checked and uses "override" only in verb sense, so it
needed no change for the unification.

## Follow-Ups

- Implement the four audit resolve clusters (repository identity, Graphite machine
  facts, Pi ownership, point-default fidelity).
- Promote the settled README and re-derive or retire `orientation.md`.
- Optional cleanup: drop the inert legacy `ns.points` package.json fixtures in
  `extension-points-cli.test.ts` / branch-context test support if their negative
  coverage is ever made explicit elsewhere.
