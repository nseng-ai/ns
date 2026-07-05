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
- [x] Triage every runtime workspace dependency of `@nseng-ai/kernel` (transitively): per
      package, decide publish vs bundle-inline vs exclude. Record the table.
      `@nseng-ai/kernel` remains `private: true` permanently: its runtime surface ships
      only folded inside the published `@nseng-ai/ns` bundle (esbuild inlines kernel
      source at bundle time); no standalone kernel publish path exists.
  - Decision table recorded in
    `updates/20260704T235456Z-runtime-dependency-triage-decisions.md`; current package
    names have since moved to the external `@nseng-ai/*` workspace scope.
  - Current private inventory is runtime/loader-referenced (`@nseng-ai/kernel`,
    `@nseng-ai/capability-kit`, `@nseng-ai/flow`, `@nseng-ai/ccc`), excluded
    host/internal packages (`@nseng-ai/pi`, `nscc`, `@internal/pi-tools`,
    `@nseng-ai/pi-command-surfaces`), and non-runtime internal tooling
    (`@internal/typescript-style-guard`).
- [~] Replace the source-path module loader
  (`ts/packages/kernel/src/runtime/module-loader.ts`) so `@nseng-ai/objectives` + its hidden
  `exec` surface resolve from the bundle/published package, not absolute on-disk `.ts`
  paths. Reconcile the checked-in `.ns/extensions/*` re-export manifests and keep the
  parity test green.
  - Evidence: `ns objective exec …` commands run from the built artifact with no workspace
    source tree present.
  - Current `ns` evidence: preinstalled Objective catalog entries now carry in-process loader
    thunks for bundled Objective command modules, while specifier-based loading and
    project/global extension override precedence remain covered by tests.
- [x] Introduce the build/bundle step and produce a checkout-free artifact (no
      run-from-source dependency on `ts/node_modules`, no hard-coded checkout `NODE_PATH`).
  - Evidence: the artifact runs `ns objective list` on a machine with no repo checkout.
  - Current evidence: `@nseng-ai/ns` builds a local esbuild bundle and `pack:local`
    assembles an `@nseng-ai/ns` tarball whose `ns` bin runs `ns objective list` from a
    foreign temp repo after `npm install <tarball>`; `publish:dry-run` now verifies the
    same generated package root with `npm publish --dry-run`.
- [x] Replace or retire the checkout-dependent shims for the published package boundary
      (legacy source shim paths such as pnpm `.bin` `NODE_PATH` assumptions and
      `ts/scripts/source-cli-shim-template` `run_checkout` requiring `ts/node_modules`).
  - Evidence: the published-package boundary points at prebuilt `bin/ns.js`, and the
    checkout-free smoke verifies the installed `.bin/ns` resolves to that packaged JS
    without source-shim markers. Source-checkout shims remain dev-only.
- [x] Decide the published npm name for every standalone-published package and the
      workspace-to-published name mapping strategy.
  - Decision: workspace manifests now use the external `@nseng-ai/*` scope directly; do
    not build a per-package `@ns/*` to `@nseng-ai/*` dependency-name rewrite layer.
    Runtime packages already carry names such as `@nseng-ai/ns`, `@nseng-ai/kernel`,
    `@nseng-ai/capability-kit`, `@nseng-ai/flow`, and `@nseng-ai/objectives`.
  - Remaining implementation work: private runtime packages still need publish metadata,
    private flips or wrapper decisions, build outputs, and install verification.
- [x] Publish a versioned `@nseng-ai/ns` package to npm and confirm a global/`npx`
      install runs `ns objective …` against a foreign repo.
  - Evidence: `@nseng-ai/ns@0.1.0` exists on npm, and a registry-backed `npx`
    install from a throwaway foreign git repo ran `ns objective list` plus the hidden
    `ns objective exec tracking-gate` surface without an ns checkout.
  - This is first-publish evidence, not the Objective's final closure state.
- [ ] Publish and verify every workspace package intended to be public/standalone.
  - Evidence: the final intended-public package set is recorded, each package in that set
    exists on the npm registry under `@nseng-ai/*` with expected version/bin/exports where
    applicable, install or `npm view` evidence is recorded, and private/internal/excluded
    packages are deliberately not treated as missing work.
- [ ] Add release automation / CI for the intended public package set.
  - Evidence: checked-in automation can build/package and dry-run or otherwise qualify the
    public package set before publication, the release lane is documented, and it covers
    the multi-package public set rather than only the first `@nseng-ai/ns` publish.

## Parked

