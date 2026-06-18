# Roadmap

## Work

- [x] Triage **TS linter** adoption — adopt oxlint for the `ts/` subtree rather
      than Biome or eslint. This matches the aggressive best-of-breed/Oxc posture
      used by Eve while keeping config thin. Landing spot:
      `ts-toolchain-governance-rollout`.
- [x] Triage **TS formatter** adoption — adopt oxfmt for TypeScript sources in
      the same rollout as oxlint. Do not add a pre-commit hook in the first pass;
      wire explicit `just`/pnpm commands and let CI/review drive adoption before
      adding commit-time mutation. Landing spot: `ts-toolchain-governance-rollout`.
- [x] Triage **`tsconfig` strictness delta** — decision-complete. Adopt the
      already-landed explicit flags (`moduleDetection: force`,
      `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`,
      `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`) with their
      current `ts/tsconfig.json` settings. Adopt `useUnknownInCatchVariables`
      and `resolveJsonModule` through TypeScript's current `strict`/NodeNext
      defaults rather than adding duplicate explicit lines. Adopt
      `forceConsistentCasingInFileNames` explicitly, but land that config change
      outside this decision-only Objective.
- [x] Triage **dependency governance** — adopt pnpm `catalog:` plus syncpack
      enforcement for shared third-party versions and workspace references.
      Defer `minimumReleaseAge` and build-script allowlisting until a supply-chain
      or install-script need is concrete, because `ts/` is internal and pnpm
      supply-chain policy churn would distract from the immediate duplicate-version problem.
      Landing spot: `ts-toolchain-governance-rollout`.
- [x] Triage **mechanical invariant guard** for asdl TS conventions (Eve's
      `guard-invariants.mjs` analog) — defer the Eve-scale bespoke guard. Keep
      the existing narrow `just ts-guard` pattern, and only grow it with small,
      high-confidence rules after oxlint/oxfmt and dependency governance are in place.
- [x] Triage **compiler & target** — adopt `tsgo` / `@typescript/native-preview`
      as the primary typecheck command while keeping stock `tsc` as an explicit
      legacy fallback. Adopt an ES2024 `target`/`lib` bump for Node 24 parity
      with the runtime floor. Landing spot: `ts-toolchain-governance-rollout`.
- [x] Triage **test-tiering model** — reject Eve's multi-tier Vitest config split
      for now. Keep the single root `vitest.config.ts`; ASDL already separates
      user-facing scenario tests by package/test layout and does not have Eve's
      build-before-scenario alias hazard.
- [x] Triage **presumptively-rejected publish machinery** — reject rolldown build,
      `#compiled/*` vendoring, `eve-source` source/dist condition, Changesets,
      and Eve's single-runtime-dep rule. Rationale: `ts/` is unpublished and
      run-from-source, so publish-time JS byte ownership and package surface
      machinery would add ceremony without serving the current product model.

## Parked

- [x] Implementation follow-up: execute `ts-toolchain-governance-rollout` in this
      branch as one aggressive toolchain chunk: oxlint/oxfmt for `ts/`, pnpm
      catalog + syncpack enforcement, `@typescript/native-preview`/`tsgo`, stock
      `tsc` fallback, `forceConsistentCasingInFileNames: true`, and ES2024
      `target`/`lib`. Deferred items stay out of this rollout: `minimumReleaseAge`,
      build-script allowlisting, Eve-scale invariant guard, pre-commit hooks,
      test-tier split, and publish machinery.
