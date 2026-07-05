# Kernel Subpaths Folded Into @nseng-ai/ns

## Summary

PR #2981 prepares the checkout-free `@nseng-ai/ns` package to be the public home for kernel subpath imports while keeping the standalone workspace `@nseng-ai/kernel` package private.

Branch evidence on `add-kernel-subpath-exports` relative to Graphite parent `verify-registry-publish`:

- `ts/packages/hosts/ns-cli/package.json` now declares `@nseng-ai/ns` exports for `./kernel/cli`, `./kernel/command-io`, `./kernel/context`, `./kernel/pi-text-generation`, and `./kernel/sdk`, and includes `kernel` in package files.
- `ts/packages/hosts/ns-cli/src/kernel/*.ts` provides thin source facades over the private `@nseng-ai/kernel/*` surfaces.
- `scripts/build-bundle.mjs` builds bundled kernel subpath artifacts alongside the CLI bundle.
- `scripts/prepare-local-package.mjs` copies bundled kernel artifacts into `dist/publish/kernel/*.js` and emits publish manifest exports pointing at those files.
- `scripts/smoke-checkout-free.mjs` verifies that an installed local tarball can import `@nseng-ai/ns/kernel/sdk` from a foreign repo.
- `ts/packages/hosts/ns-cli/README.md` documents that `@nseng-ai/kernel` remains private and is folded into `@nseng-ai/ns` subpaths.

Validation reported for the branch included `pnpm --dir ts --filter @nseng-ai/ns run pack:local`, `pnpm --dir ts --filter @nseng-ai/ns run smoke:checkout-free`, package test/check, `just ts-check`, `just ts-format-check`, `just ts-lint`, `just dprint-check`, and `just ts-deps-check`. A `publish:dry-run` reached npm package validation but failed because `@nseng-ai/ns@0.1.0` is already published; a future real publish requires a version bump.

## Objective Impact

This records the concrete packaging treatment for `@nseng-ai/kernel`: it is not published as `@nseng-ai/kernel`; instead, its public checkout-free surfaces are folded into `@nseng-ai/ns/kernel/*`. That matches the Objective's private-runtime-dependency decision and gives downstream packages a public import target that does not require a checkout or a standalone kernel package.

The core checkout-free distribution criteria remain satisfied by the already-published `@nseng-ai/ns@0.1.0` for Objective usage. The kernel subpath work is additional package-surface preparation for the next publish of `@nseng-ai/ns`, not evidence that a new registry version has been published.

## Follow-Ups

- Bump `@nseng-ai/ns` before any registry publish that includes the new `@nseng-ai/ns/kernel/*` exports.
- Continue package-readiness work for remaining standalone-published runtime packages, especially `@nseng-ai/capability-kit` and `@nseng-ai/flow`.
- Keep `@nseng-ai/kernel` private unless a later Objective records a different package-boundary decision.
