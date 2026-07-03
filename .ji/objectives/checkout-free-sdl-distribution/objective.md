---
edges:
  - objective: ship-objectives-to-customers
    annotation: Split out of that Objective (2026-07-01); it consumes checkout-free `sdl` as a hard dependency and is its first external consumer.
---

# Checkout-Free `ji` Distribution

## Thesis

Today the `ji` CLI is only runnable from a full repo checkout. `ts/` is a pure
run-from-source pnpm workspace (21 packages): the `@ji/kernel` `ji` bin points at raw
`./src/cli/index.ts` executed directly by Node ≥24 (native type stripping), there is no
build/bundle/dist step or `publishConfig` anywhere, and the kernel reaches its capability
packages (`@ji/objective` and siblings) through a **source-path jiti alias loader**
(`ts/packages/kernel/src/runtime/module-loader.ts`) that maps `@ji/...` specifiers to
absolute on-disk `.ts` paths derived from workspace `package.json` exports (plus a virtual
`@ji/kernel/sdk` module), backed by checked-in `.ji/extensions/*` manifests that re-export
workspace source. Everything runs off `ts/node_modules` via hard-coded `NODE_PATH` shims.

This Objective makes `ji` installable and runnable **without a checkout** — a versioned
npm package a customer installs (global or `npx`) that runs `ji objective …` (and every
other bundled capability) against their own repo, with no `ts/node_modules` precondition.

It was split out of `ship-objectives-to-customers` (decided 2026-07-01) because
checkout-free distribution is the biggest, riskiest chunk of that thread **and** benefits
every capability, not just objectives. `ship-objectives-to-customers` consumes this as a
hard dependency.

Naming note: the ADR 0024 `sdl` → `ji` rename has landed in the workspace (`@ji/*`
packages, `ji` bin, `.ji/extensions`); this Objective's slug keeps the historical `sdl`
name as its durable identity.

## Scope

- **Introduce a real build/bundle step.** There is none today (no esbuild/tsup/rollup, no
  `build` scripts, no `dist` directories; non-private packages declare only
  `files: ["src"]`, a source-shipping posture). Produce a distributable artifact for
  `@ji/kernel` + its runtime capability packages that runs on stock Node ≥24 without
  run-from-source resolution and without `ts/node_modules`.
- **Replace the source-path module loader.** `ts/packages/kernel/src/runtime/module-loader.ts`
  resolves capability packages (and the hidden `exec` surface) to absolute source `.ts`
  paths relative to the kernel's on-disk location. Bundled/published resolution must
  replace this so `@ji/objective` and its `exec-*` commands load from installed packages,
  not a checkout. Reconcile the checked-in `.ji/extensions/*` re-export manifests (which
  assume the workspace tree on disk).
- **Resolve `private` / workspace-dep publishability.** `@ji/kernel` is `private: true`;
  7 of 21 workspace packages are private (`@ji/kernel`, `@ji/capability-kit`, `@ji/ccc`,
  `@ji/flow`, `@ji/pi`, `jicc`, `@internal/pi-tools`), and the loader aliases modules from
  private `@ji/capability-kit`, `@ji/ccc`, and `@ji/flow`. Decide per package: un-private +
  publish, bundle-inline, or exclude. `@ji/objective` and the other capability packages are
  already non-private. The kernel also depends on external published npm packages
  (`@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`).
- **Publish a versioned package to npm** under the `@ji` scope (ADR 0024), with the `ji`
  bin working checkout-free.
- **Replace the checkout-dependent shims.** The pnpm `.bin/ji` shim hard-codes this
  checkout's `NODE_PATH`; the installer shim template
  (`ts/scripts/source-cli-shim-template`) `run_checkout` refuses to run without
  `ts/node_modules`. The published package must not depend on either.

## Non-Goals

- Not a standalone `objective` binary; the surface stays the `ji` CLI.
- No contributor/dev-environment onboarding (`just`, pnpm, direnv, `slot`, source shims);
  those keep the run-from-source model.
- No release automation / CI for the published package in v1 (parked); a first manual
  publish is enough to unblock consumers.
- Not re-homing or renaming capability packages beyond what publishability requires
  (distribution-motivated package consolidation into `@ji/core`/`@ji/capability-kit`
  subpaths is in scope only as triage outcomes, not as a general re-homing program).
- No decision here on which skills bundle where — that is `skill-management-subsystem`.

## Completion Criteria

- A global or `npx` install of `ji` on a machine with **no repo checkout** runs
  `ji objective list` (and `ji objective …`) against a foreign repo.
- The published package includes `@ji/objective` and its hidden `exec` surface, loaded
  without a source-path checkout assumption.
- No runtime dependency on `ts/node_modules` or a hard-coded checkout `NODE_PATH`.
- A recorded per-package decision for every private runtime dependency (publish vs
  bundle-inline vs exclude).
- The build/bundle step is reproducible from a clean clone and documented.

## Assumptions and Risks

Assumptions:

- npm is the customer install vector. (Inherited, user-confirmed.)
- Node ≥24 on the customer machine (workspace `engines` requires `>=24.12.0`).

Risks:

- **The long pole, not de-risked.** Every prior capability accepted the run-from-source
  shim and deferred publishing; the loader rewrite + private-dep triage may be larger than
  it looks (though package consolidation has already shrunk the private closure from the
  originally recorded ~29 of 45 packages to 7 of 21).
- Replacing the jiti source-path loader risks breaking first-party extension discovery and
  the `.ji/extensions/*` re-export parity test
  (`ts/packages/kernel/test/integration/repo-local-extension-manifest-parity.test.ts`).
- Bundling is currently an explicit non-default (`.ji/extensions/AGENTS.md`: checked-in
  bundled artifacts are "a liability"); this Objective must define the sanctioned bundled
  path deliberately.
- The `rename-sdl-to-ji` Objective is still open; residual `sdl` vocabulary (including
  this record's edge annotations) may churn under published naming decisions.

## Open Questions

- ~~Bundle strategy~~ — resolved 2026-07-01 (see
  `updates/20260701T190744Z-pi-style-distribution-strategy.md`): Pi-style — publish a real
  npm CLI package with a `bin` pointing at prebuilt `dist` JS, first-party runtime
  packages as versioned npm packages where feasible, bundle-inline only for
  dependency-closure exceptions.
- ~~jiti vs prebuilt JS~~ — resolved at strategy level: prebuilt JS is the runtime path
  for first-party capabilities. Residual: how much jiti (if any) ships in the published
  package for user/repo-local extensions.
- ~~Package name/scope for the published CLI~~ — resolved by the `rename-sdl-to-ji`
  objective (ADR 0024, `docs/adr/0024-rename-sdl-to-ji.md`): publish under the `@ji`
  scope with the CLI bin installing as `ji`. The published CLI's inner package name (for
  example `@ji/cli`) remains this objective's call.
- Which of the 7 remaining private packages get un-privated vs bundle-inlined vs folded
  into existing published packages (continuing the consolidation direction that retired
  `@sdl/time`, `@sdl/exec`, and `@sdl/git` as standalone packages)?
