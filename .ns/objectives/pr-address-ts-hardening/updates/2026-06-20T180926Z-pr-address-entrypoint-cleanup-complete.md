# pr-address Entrypoint Cleanup Complete

## Summary

The remaining in-scope `pr-address/src` re-export cleanup is implemented on the current branch. The branch removes the package-root `@asdl/pr-address` entrypoint by deleting `ts/packages/pr-address/src/index.ts` and removing the root `exports` entry from `ts/packages/pr-address/package.json`; it also removes the gateway type re-export block from `src/gateways.ts` while keeping `RealPrAddressGitGateway` as the real adapter implementation.

Package-local gateway type consumers now import from the canonical owner, `src/core/gateways.ts`. The `pr-address` bin entry remains intact.

Evidence considered: Graphite parent `update-objective-refresh-workflow`; local branch diff `update-objective-refresh-workflow...HEAD`; PR #1920 (`Remove the @asdl/pr-address package entrypoint`); focused package validation passed with `pnpm --dir ts --filter @asdl/pr-address run check` and `pnpm --dir ts --filter @asdl/pr-address run test`; stale-surface searches found no package-root `@asdl/pr-address` TypeScript import consumers, no package `exports` key, and no remaining in-scope re-export barrel.

## Objective Impact

The sole active non-parked roadmap item is now complete. The Objective's in-package `ts/packages/pr-address/src` hardening scope has no remaining semantic work after this cleanup.

The Objective remains open because the relocated `gh api -F`/`@` cursor file-read finding is still a parked ownership decision outside this Objective's current package boundary. Closure should wait until that finding is explicitly tracked under `pr-address-github-primitives`, re-scoped here, or accepted/dropped as low-risk.

## Follow-Ups

- Decide ownership/disposition for the relocated `gh api -F`/`@` cursor finding in `asdl-core/github-pr-feedback/args.ts`.
- After that ownership decision is recorded, rerun `objective-update pr-address-ts-hardening`; the Objective should then be closure-ready if no new active package-boundary work appears.
