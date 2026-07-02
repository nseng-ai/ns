# Roadmap

## Work

- [ ] Decide the bundle strategy: single bundled artifact (esbuild/tsup) vs publishing the
  workspace graph as real npm packages vs a hybrid. Record the decision; it gates the loader
  and private-dep work.
  - Notes: no build tooling exists today; this is a greenfield choice.
- [ ] Triage every runtime workspace dependency of `@sdl/kernel` (transitively): per package,
  decide publish vs bundle-inline vs exclude. Record the table. `@sdl/kernel` itself must
  stop being `private` (or be superseded by a published wrapper).
  - Evidence: a recorded per-package decision for all ~29 private packages in the runtime
    closure.
- [ ] Replace the source-path module loader (`ts/packages/kernel/src/sdk/module-loader.ts`)
  so `@sdl/objective` + its hidden `exec` surface resolve from the bundle/published package,
  not absolute on-disk `.ts` paths. Reconcile the checked-in `.sdl/extensions/*` re-export
  manifests and keep the parity test green.
  - Evidence: `sdl objective exec-*` commands run from the built artifact with no workspace
    source tree present.
- [ ] Introduce the build/bundle step and produce a checkout-free artifact (no jiti-from-
  source dependency on `ts/node_modules`, no hard-coded checkout `NODE_PATH`).
  - Evidence: the artifact runs `sdl objective list` on a machine with no SDL checkout.
- [ ] Replace the checkout-dependent shims (pnpm `.bin/sdl` `NODE_PATH`; installer template
  `run_checkout` requiring `ts/node_modules`) for the published package.
- [ ] Publish a versioned package to npm and confirm a global/`npx` install runs
  `sdl objective …` against a foreign repo.
  - Evidence: the `ship-objectives-to-customers` end-to-end verification can install `sdl`
    from npm.

## Parked

- [ ] Release automation / CI for the published package (manual first publish is enough).
- [ ] Publishing capability surfaces beyond what objective onboarding needs.
