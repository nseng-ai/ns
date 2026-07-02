# Checkout-Free `sdl` Distribution

## Thesis

Today the `sdl` CLI is only runnable from a full repo checkout. `ts/` is a pure
run-from-source pnpm monorepo: the `sdl` bin points at raw `./src/cli.ts` executed through
jiti, there is no build/bundle/dist step or publish config anywhere, and the kernel reaches
its capability packages (`@sdl/objective` and siblings) through a **source-path jiti alias
loader** (`ts/packages/kernel/src/sdk/module-loader.ts`) that resolves `@sdl/...` to
absolute on-disk `.ts` paths, backed by checked-in `.sdl/extensions/*` manifests that
re-export workspace source. Everything runs off `ts/node_modules` via a hard-coded
`NODE_PATH`.

This Objective makes `sdl` installable and runnable **without a checkout** — a versioned
npm package a customer installs (global or `npx`) that runs `sdl objective …` (and every
other bundled capability) against their own repo, with no `ts/node_modules` precondition.

It was split out of `ship-objectives-to-customers` (decided 2026-07-01) because
checkout-free `sdl` is the biggest, riskiest chunk of that thread **and** benefits every
capability, not just objectives. `ship-objectives-to-customers` consumes this as a hard
dependency.

## Scope

- **Introduce a real build/bundle step.** There is none today (no esbuild/tsup/rollup, no
  `build` script, no `dist`). Produce a distributable artifact for `@sdl/kernel` + its
  runtime capability packages that runs on stock Node ≥24 without jiti-from-source and
  without `ts/node_modules`.
- **Replace the source-path module loader.** `module-loader.ts` resolves capability packages
  (and the hidden `exec` surface) to absolute source `.ts` paths relative to the kernel's
  on-disk location. Bundled/published resolution must replace this so `@sdl/objective` and
  its `exec-*` commands load from the package, not a checkout. Reconcile the checked-in
  `.sdl/extensions/*` re-export manifests (which assume the workspace tree on disk).
- **Resolve `private` / workspace-dep publishability.** `@sdl/kernel` is `private: true`;
  ~29 of 45 workspace packages are private, including runtime transitive deps
  (`@sdl/exec`, `@sdl/git`, …). Decide per package: un-private + publish, bundle-inline, or
  exclude. `@sdl/objective` and several capability packages are already non-private.
- **Publish a versioned package to npm** under the customer install name, with the `sdl`
  bin working checkout-free.
- **Replace the checkout-dependent shims.** The pnpm `.bin/sdl` shim hard-codes this
  checkout's `NODE_PATH`; the installer shim template's `run_checkout` refuses to run
  without `ts/node_modules`. The published package must not depend on either.

## Non-Goals

- Not a standalone `objective` binary; the surface stays the `sdl` CLI.
- No contributor/dev-environment onboarding (`just`, pnpm, direnv, `slot`, source shims);
  those keep the run-from-source model.
- No release automation / CI for the published package in v1 (parked); a first manual
  publish is enough to unblock consumers.
- Not re-homing or renaming capability packages beyond what publishability requires.
- No decision here on which skills bundle where — that is `skill-management-subsystem`.

## Completion Criteria

- A global or `npx` install of `sdl` on a machine with **no SDL checkout** runs
  `sdl objective list` (and `sdl objective …`) against a foreign repo.
- The published package includes `@sdl/objective` and its hidden `exec` surface, loaded
  without a source-path checkout assumption.
- No runtime dependency on `ts/node_modules` or a hard-coded checkout `NODE_PATH`.
- A recorded per-package decision for every private runtime dependency (publish vs
  bundle-inline vs exclude).
- The build/bundle step is reproducible from a clean clone and documented.

## Assumptions and Risks

Assumptions:

- npm is the customer install vector. (Inherited, user-confirmed.)
- Node ≥24 on the customer machine (matches the workspace `engines`).

Risks:

- **The long pole, not de-risked.** Every prior capability accepted the run-from-source
  shim and deferred publishing; the loader rewrite + private-dep triage may be larger than
  it looks.
- Replacing the jiti source-path loader risks breaking first-party extension discovery and
  the `.sdl/extensions/*` re-export parity test
  (`ts/packages/kernel/test/integration/repo-local-extension-manifest-parity.test.ts`).
- Bundling is currently an explicit non-default (`.sdl/extensions/AGENTS.md`: checked-in
  bundled artifacts are "a liability"); this Objective must define the sanctioned bundled
  path deliberately.

## Open Questions

- Bundle strategy: single bundled artifact (esbuild/tsup) vs publish the workspace graph as
  real npm packages vs a hybrid (bundle the kernel + capabilities, keep a few real deps)?
- Does the loader keep jiti (shipping `.ts` + jiti in the package) or move to prebuilt JS?
- Package name/scope for the published `sdl` (public `@sdl/*` scope vs an unscoped `sdl`).
- Which private runtime deps get un-privated vs bundle-inlined?
