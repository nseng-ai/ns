# Roadmap

## Work

- [x] Decide the bundle strategy: single bundled artifact (esbuild/tsup) vs publishing the
      workspace graph as real npm packages vs a hybrid. Record the decision; it gates the loader
      and private-dep work.
  - Decision: copy Pi's distribution shape — publish a real npm CLI package with a `bin`
    pointing at prebuilt `dist` JS, keep first-party runtime packages as versioned npm packages
    where feasible, and use bundle-inline only for dependency-closure exceptions found during
    triage. Do not make a single opaque bundle the primary design.
  - Consequence: core capability loading should resolve installed package JS, not checkout
    source paths; jiti may remain a dev/package-extension convenience but not the runtime path
    for bundled first-party capabilities.
- [~] Triage every runtime workspace dependency of `@ji/kernel` (transitively): per package,
  decide publish vs bundle-inline vs exclude. Record the table. `@ji/kernel` itself must
  stop being `private` (or be superseded by a published wrapper).
  - Progress: distribution-first package consolidation has shrunk the closure — the workspace
    is now 21 packages with 7 private (`@ji/kernel`, `@ji/capability-kit`, `@ji/ccc`,
    `@ji/flow`, `@ji/pi`, `jicc`, `@internal/pi-tools`), versus the ~29-of-45 recorded when
    this Objective was created. `@sdl/time`, `@sdl/exec`, and `@sdl/git` were retired as
    standalone packages in favor of `@ji/core/time`, `@ji/core/exec`, and
    `@ji/capability-kit/git` subpaths.
  - Remaining evidence: a recorded per-package decision table covering the 7 private packages
    (loader-referenced: `@ji/kernel`, `@ji/capability-kit`, `@ji/ccc`, `@ji/flow`; hosts/local:
    `@ji/pi`, `jicc`, `@internal/pi-tools`).
- [ ] Replace the source-path module loader
      (`ts/packages/kernel/src/runtime/module-loader.ts`) so `@ji/objective` + its hidden
      `exec` surface resolve from the bundle/published package, not absolute on-disk `.ts`
      paths. Reconcile the checked-in `.ji/extensions/*` re-export manifests and keep the
      parity test green.
  - Evidence: `ji objective exec …` commands run from the built artifact with no workspace
    source tree present.
- [ ] Introduce the build/bundle step and produce a checkout-free artifact (no
      run-from-source dependency on `ts/node_modules`, no hard-coded checkout `NODE_PATH`).
  - Evidence: the artifact runs `ji objective list` on a machine with no repo checkout.
- [ ] Replace the checkout-dependent shims (pnpm `.bin/ji` `NODE_PATH`; installer template
      `ts/scripts/source-cli-shim-template` `run_checkout` requiring `ts/node_modules`) for
      the published package.
- [ ] Publish a versioned package to npm under the `@ji` scope and confirm a global/`npx`
      install runs `ji objective …` against a foreign repo.
  - Evidence: the `ship-objectives-to-customers` end-to-end verification can install `ji`
    from npm.

## Parked

- [ ] Release automation / CI for the published package (manual first publish is enough).
- [ ] Publishing capability surfaces beyond what objective onboarding needs.
