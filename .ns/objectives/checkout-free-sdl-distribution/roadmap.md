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
- [x] Triage every runtime workspace dependency of `@ns/kernel` (transitively): per package,
      decide publish vs bundle-inline vs exclude. Record the table. `@ns/kernel` itself must
      stop being `private` (or be superseded by a published wrapper).
  - Decision table recorded in
    `updates/20260704T235456Z-runtime-dependency-triage-decisions.md`.
  - Current private inventory is 8 packages: runtime/loader-referenced
    (`@ns/kernel`, `@ns/capability-kit`, `@ns/flow`, `@ns/ccc`), excluded host/internal
    packages (`@ns/pi`, `nscc`, `@internal/pi-tools`), and non-runtime internal tooling
    (`@internal/typescript-style-guard`).
- [~] Replace the source-path module loader
  (`ts/packages/kernel/src/runtime/module-loader.ts`) so `@ns/objective` + its hidden
  `exec` surface resolve from the bundle/published package, not absolute on-disk `.ts`
  paths. Reconcile the checked-in `.ns/extensions/*` re-export manifests and keep the
  parity test green.
  - Evidence: `ns objective exec …` commands run from the built artifact with no workspace
    source tree present.
  - Current `ns` evidence: preinstalled Objective catalog entries now carry in-process loader
    thunks for bundled Objective command modules, while specifier-based loading and
    project/global extension override precedence remain covered by tests.
- [~] Introduce the build/bundle step and produce a checkout-free artifact (no
  run-from-source dependency on `ts/node_modules`, no hard-coded checkout `NODE_PATH`).
  - Evidence: the artifact runs `ns objective list` on a machine with no repo checkout.
  - Current `ns` evidence: `@ns/cli` builds a local esbuild bundle and `pack:local` assembles an
    `@nseng-ai/ns` tarball whose `ns` bin runs `ns objective list` from a foreign temp repo
    after `npm install <tarball>`.
- [ ] Replace the checkout-dependent shims (pnpm `.bin/ns` `NODE_PATH`; installer template
      `ts/scripts/source-cli-shim-template` `run_checkout` requiring `ts/node_modules`) for
      the published package.
- [ ] Decide the published npm name for every standalone-published package
      (`@ns/capability-kit` and `@ns/flow` at minimum, plus `@ns/kernel` or its wrapper and
      the already-public capability packages) and the workspace-to-published name mapping
      strategy — rename workspace packages to their published names vs per-package
      publish-root generation with dependency-name rewriting. The single-manifest
      `@ns/cli` → `@nseng-ai/ns` rename works only because the CLI bundle inlines its
      workspace dependencies; it does not extend to a published dependency graph.
      (Decision recorded 2026-07-05: standalone publishing is committed, see
      `updates/20260705T123551Z-standalone-package-publishing-decision.md`.)
- [ ] Publish a versioned `@nseng-ai/ns` package to npm and confirm a global/`npx`
      install runs `ns objective …` against a foreign repo.
  - Evidence: the `ship-objectives-to-customers` end-to-end verification can install `ns`
    from npm.

## Parked

- [ ] Release automation / CI for the published package (manual first publish is enough).
- [ ] Publishing capability surfaces beyond what objective onboarding needs.
