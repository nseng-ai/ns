# Point Catalog Computation

## Summary

Local branch `point-system-catalog-slice` commit `1e99c38a0` added kernel point definition discovery from manifest `ns.points` metadata plus `loadPointCatalog` / `computePointCatalog` in the kernel project-config/points surface. The catalog joins manifest-declared definitions with repo installations from `ns.toml` and conventional `.ns/prompts/<point-id>.md` prompt files.

The slice includes structured diagnostics for installed-but-undefined points, override installations in effect, defined-but-uninstalled points, malformed manifests, duplicate definitions, and failed conventional prompt probes.

## Objective Impact

This completes the roadmap row for `ns.points` manifest discovery and point catalog computation. The next implementation slice can start migrating real consumers, with `flow.submit.pre` as the first hook point migration.

Validation evidence from the runner step: targeted kernel project-config unit tests passed, `just ts-format-check`, `just ts-lint`, `just ts-check`, full kernel tests, and `git diff --check` passed. Full `just` still reaches the known unrelated `@nseng-ai/objectives` topology-circle style-guard failure already recorded in the prior update.

## Follow-Ups

- Migrate `flow.submit.pre`: declare the hook point in the flow extension manifest, replace `[flow.hooks].pre_submit` with `[points]."flow.submit.pre"` in this repo's `ns.toml`, and update submit hook runtime/scenario tests.
- Wire catalog reporting into `ns extension points` / `ns extension point <id>` in the later CLI slice.
