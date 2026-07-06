# Full Public Qualification Preflight

## Summary

The release qualification lane was extended from the first batch toward the complete intended public package set without performing registry writes.

Implemented local changes:

- `@nseng-ai/ccc` is now treated as public/standalone: its manifest no longer carries `private: true`, has `files: ["src"]`, and declares `publishConfig.access = public`.
- `ts/scripts/qualify-public-package-set.mjs` now includes `@nseng-ai/ccc` in the intended public package set.
- Generated publish roots rewrite folded kernel imports from `@nseng-ai/kernel/*` to the public `@nseng-ai/ns/kernel/*` subpaths, and package manifests rewrite the former kernel workspace dependency to `@nseng-ai/ns` at the local package version.
- `@nseng-ai/ns` is qualified through its existing generated publish-root path (`publish:dry-run`, or `pack:local` when `--skip-dry-run` is used) rather than by copying source files like ordinary source-shipping packages.
- The unused `@nseng-ai/pi-command-surfaces` dependency was removed from `@nseng-ai/command-backed-skill-registry` so that package no longer leaks an explicitly excluded private package.
- `ts/packages/README.md` now documents `release:qualify-public -- --all` as the complete public-set qualification path and notes the folded kernel import rewrite.

Validation/evidence gathered:

- `pnpm --dir ts run release:qualify-public -- --skip-checks` passed for the default first batch (`@nseng-ai/capability-kit`, `@nseng-ai/flow`) and ran `npm publish --dry-run` for both generated publish roots without registry writes.
- `pnpm --dir ts run release:qualify-public -- --all --skip-checks --skip-dry-run` advanced through generated publish-root preparation and `@nseng-ai/ns` `pack:local`, then stopped at a real remaining blocker: `@nseng-ai/areg` has a runtime dependency on excluded private package `@nseng-ai/pi`.

No `npm publish` or registry write occurred.

## Objective Impact

This advances the release automation row: the full-set lane now has package-set mechanics for `@nseng-ai/ccc`, folded kernel public subpaths, and the special `@nseng-ai/ns` generated artifact path. It also updates the durable Objective framing: the kernel is not a standalone public package, public consumers use `@nseng-ai/ns/kernel/*`, and `@nseng-ai/ccc` belongs in the public/standalone set.

The Objective remains open. The complete `--all` qualification has not yet passed because `@nseng-ai/areg` still depends on private `@nseng-ai/pi` at runtime. That is a product/package-boundary decision, not a dry-run mechanics bug.

## Follow-Ups

- Resolve the `@nseng-ai/areg` -> `@nseng-ai/pi` runtime dependency before treating the complete intended public package set as qualified. Plausible options are: make the needed Pi skill-lookup surface public in a standalone/public package, move the skill-lookup primitive to an already public lower package, or change the intended public set if `areg` should not publish standalone yet.
- After that boundary decision lands, rerun `pnpm --dir ts run release:qualify-public -- --all` without `--skip-checks` or `--skip-dry-run` and record the complete evidence.
- Keep registry publishing separate; this slice intentionally performed dry-run/local package qualification only.
