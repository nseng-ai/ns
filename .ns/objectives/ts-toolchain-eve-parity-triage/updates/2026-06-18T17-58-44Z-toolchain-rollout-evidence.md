# Semantic Update: Toolchain rollout implementation evidence

The aggressive follow-up rollout landed in this branch:

- pnpm baseline is now `pnpm@11.8.0` with `engines.pnpm >=11.8.0`.
- pnpm catalog and Syncpack are configured for shared third-party dependencies and local `workspace:*` references.
- oxlint is configured and the current `ts/` tree lints with zero warnings.
- oxfmt is configured and the one-time TypeScript formatting rewrite was applied.
- `@typescript/native-preview` / `tsgo` is the primary `check` script, with stock `tsc` retained as `check:legacy`.
- `ts/tsconfig.json` now targets ES2024, uses `lib: ["ES2024"]`, and explicitly enables `forceConsistentCasingInFileNames`.
- Repo-level `just` recipes now include `ts-deps-check`, `ts-format-check`, `ts-format-fix`, `ts-lint`, `ts-lint-fix`, `ts-check`, `ts-check-legacy`, `ts-test`, and the existing `ts-guard`; TS recipes explicitly invoke `corepack pnpm@11.8.0` so they do not depend on a stale global pnpm.
- GitHub CI TypeScript jobs now use pnpm 11 and run the full dependency, format, lint, tsgo, legacy `tsc`, guard, and test gates through `just`; TS-workspace roaster jobs also install with pnpm 11.
- The project TypeScript skill was updated so future agents see pnpm 11, oxlint, oxfmt, tsgo primary, stock `tsc` fallback, ES2024, and the casing guard as the live contract.

Validation evidence from this implementation session:

- `pnpm --version` => `11.8.0`.
- `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --dir ts run deps:check` passed.
- `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --dir ts run fmt:check` passed.
- `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --dir ts run lint` passed with no output/warnings.
- `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --dir ts run check` (`tsgo`) passed.
- `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --dir ts run check:legacy` (`tsc`) passed.
- `just ts-guard` passed.
- `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --dir ts run test` passed: 265 files / 2717 tests.
- The pinned `just` routes passed directly: `just ts-deps-check`, `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-check-legacy`, `just ts-test`, and `just ts-guard`.

Implementation adaptations:

- The plan's observed latest `@typescript/native-preview@7.0.0-dev.20260618.1` was rejected by the active pnpm minimum-release-age verification because it was published the same day. The rollout uses `7.0.0-dev.20260617.2`, the newest available build older than that cutoff, preserving tsgo primary adoption without adding minimum-release-age policy.
- Bare pnpm 11 install/run commands in this noninteractive environment fail on ignored build scripts for `@google/genai` and `protobufjs` unless `strictDepBuilds` or dependency preflight behavior is relaxed. Because `minimumReleaseAge` and build-script allowlisting remain explicitly deferred, this update records the blocker instead of adding `allowBuilds`/approval policy.

The Objective remains closed. Deferred items remain deferred: minimum-release-age policy, build-script allowlisting, pre-commit hooks, Eve-scale bespoke invariant guard, Vitest tier split, and publish-only machinery.
