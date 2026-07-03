# GitHub gateway family relocated

Completed the atomic GitHub-family relocation slice for neutral-infra consolidation.

## What changed

- Added `@sdl/github` under `ts/packages/infra/github` with `sdl.tier: "capability-gateway-backend"`.
- Moved the former `@sdl/core` GitHub family into `@sdl/github`:
  - `github-cli` -> `@sdl/github/cli`
  - `github-identity` -> `@sdl/github/identity`
  - `github-pr-status` -> `@sdl/github/pr-status`
  - `github-graphql-json` and `github-pr-feedback/*` -> `@sdl/github` internals / `@sdl/github/pr-feedback`
- Moved the GitHub CLI/status/PR-feedback tests from `@sdl/core` to the new backend package.
- Repointed consumers off `@sdl/core/github-*` and added direct `@sdl/github` dependencies where needed.
- Deleted the old `@sdl/core` package exports for `./github-cli`, `./github-identity`, `./github-pr-feedback`, and `./github-pr-status`; no compatibility shims remain.
- Updated `@sdl/address/api` comments so Address remains the PR-feedback capability-facing seam while reusable GitHub backend mechanics/types live in `@sdl/github`.
- Updated package-tier guard metadata for `@sdl/github` as a neutral peer backend. Minimal implementation-time adaptation: local Pi tools can depend on capability-gateway-backend packages, because `@local-pi-tools/pr-feedback-watch` legitimately consumes GitHub identity helpers after the core door deletion.

No `@sdl/capability-kit/github` subpath was added in this slice: no existing consumer needed a separate light seam/fake beyond the Address seam and the standalone backend package.

## Evidence

Source-search invariants:

- `rg -n '@sdl/core/(github-cli|github-identity|github-pr-feedback|github-pr-status)' ts/packages ts/scripts -S --glob '*.ts'` returned no matches.
- `rg -n '"\\./github-(cli|identity|pr-feedback|pr-status)"' ts/packages/infra/core/package.json` returned no matches.
- `rg -n 'sdl.tier.*capability-gateway-backend|"tier": "capability-gateway-backend"' ts/packages/infra/github/package.json` found the backend tier declaration.
- `rg -n '@sdl/capability-kit' ts/packages/infra/github -S` returned no matches.

Validation passed:

- `pnpm --dir ts --filter @sdl/github run check`
- `pnpm --dir ts --filter @sdl/github run test`
- `just ts-deps-check`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`
- `just ts-test`
- `just ts-test-integration`
