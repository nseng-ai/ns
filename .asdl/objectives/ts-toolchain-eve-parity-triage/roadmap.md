# Roadmap

## Work

- [ ] Triage **TS linter** adoption — oxlint vs biome vs eslint vs none.
      Recommend adopt (oxlint or biome); `ts/` currently has zero TS lint.
      Decide whether this folds into the formatter decision via biome.
- [ ] Triage **TS formatter** adoption — oxfmt vs biome vs prettier vs none,
      plus whether to add a pre-commit format hook. Recommend adopt; weigh the
      one-time noisy reformat diff across `ts/packages/*`.
- [ ] Triage **`tsconfig` strictness delta** — verdict on each Eve-only flag
      (`moduleDetection: force`, `noImplicitOverride`, `noUnusedLocals`,
      `noUnusedParameters`, `noFallthroughCasesInSwitch`,
      `useUnknownInCatchVariables`, `noUncheckedSideEffectImports`,
      `forceConsistentCasingInFileNames`, `resolveJsonModule`). Recommend adopt
      the safe subset; the `noUnused*` pair may produce real cleanup work.
- [ ] Triage **dependency governance** — pnpm `catalog:` + syncpack +
      `minimumReleaseAge` + `allowBuilds`. Recommend adopt catalog + syncpack;
      lean defer on release-age aging for an internal workspace.
- [ ] Triage **mechanical invariant guard** for asdl TS conventions (Eve's
      `guard-invariants.mjs` analog). Recommend defer/spike — depends on the
      open question of whether prose + review already suffice.
- [ ] Triage **compiler & target** — `tsgo` native-preview vs stock `tsc`;
      ES2022 vs ES2024. Recommend reject `tsgo` for now (preview/risk), and
      evaluate bumping the target to ES2024.
- [ ] Triage **test-tiering model** — single `vitest.config.ts` vs Eve's
      multi-tier configs. Recommend keep single-tier and document the existing
      scenario-test convention rather than splitting configs.
- [ ] Triage **presumptively-rejected publish machinery** — rolldown build,
      `#compiled/*` vendoring, `eve-source` source/dist condition, Changesets,
      and Eve's single-runtime-dep rule. Record the rejection once with
      rationale: `ts/` is unpublished and run-from-source.

## Parked
