# Bulk Toolchain Verdicts

## Summary

The remaining Eve parity gaps are now decision-complete.

Verdicts:

- **Linter: adopt-now via Biome.** `ts/` has no TS linter, so adopting a linter is useful. Choose Biome rather than oxlint or eslint because it gives this internal workspace one stable lint+format surface and avoids copying Eve's Oxc split without Eve's larger published-framework constraints.
- **Formatter: adopt-now via Biome.** Format TypeScript sources in the same rollout as linting. Do not add a pre-commit hook initially; explicit `just`/pnpm commands and CI/review enforcement are enough until the first noisy formatting pass has landed.
- **Dependency governance: partially adopt.** Adopt pnpm `catalog:` plus syncpack enforcement for repeated third-party versions and workspace reference consistency. Defer `minimumReleaseAge` and build-script allowlisting until supply-chain or install-script evidence makes them worth the extra pnpm policy surface.
- **Mechanical invariant guard: defer broad Eve-style guard.** Keep the existing narrow `just ts-guard` pattern, but do not build an Eve-scale `guard-invariants.mjs` analog yet. Add small, high-confidence rules later only after Biome and dependency governance are in place.
- **Compiler and target: split verdict.** Reject `tsgo` / `@typescript/native-preview` for now because this run-from-source workspace does not need preview-native compiler risk. Adopt an ES2024 `target`/`lib` bump because Node 24.12+ is already the runtime floor.
- **Test tiering: reject Eve's split.** Keep one root `vitest.config.ts`; ASDL's package test layout and scenario-test convention already express user-facing scenarios without Eve's source-vs-dist alias hazard.
- **Publish machinery: reject.** Reject rolldown builds, `#compiled/*` vendoring, the `eve-source` condition, Changesets, and Eve's single-runtime-dependency rule while `ts/` remains unpublished and run-from-source.

## Objective Impact

All non-parked roadmap rows are now complete. The one implementation landing spot for adopt-now decisions is `ts-toolchain-governance-rollout`, which should implement Biome lint/format, pnpm catalog + syncpack, `forceConsistentCasingInFileNames: true`, and ES2024 `target`/`lib` in one focused rollout.

This closes the decision Objective. Implementation remains out of scope for this Objective by design; no tooling was installed or configured here.

## Follow-Ups

- Create and execute `ts-toolchain-governance-rollout` for the adopted one-chunk implementation.
- Keep deferred items out of that first rollout: `minimumReleaseAge`, build-script allowlisting, Eve-scale invariant guard, and pre-commit hooks.
- Reopen rejected publish machinery only if `ts/` stops being unpublished/run-from-source.
