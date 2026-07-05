---
edges:
  - objective: ship-objectives-to-customers
    annotation: Split out of that Objective (2026-07-01); it consumes checkout-free `ns` distribution as a hard dependency and is its first external consumer.
  - objective: rename-ji-to-ns
    annotation: Owns the publish name this Objective ships under — the external package target is @nseng-ai/ns, superseding @nseng-ai/ji; its core cutover must land before the first publish.
---

# Checkout-Free `ns` Distribution

## Thesis

Today the `ns` CLI is only runnable from a full repo checkout. `ts/` is a pure
run-from-source pnpm workspace (21 packages): the `@ns/kernel` `ns` bin points at raw
`./src/cli/index.ts` executed directly by Node ≥24 (native type stripping), there is no
build/bundle/dist step or `publishConfig` anywhere, and the kernel reaches its capability
packages (`@ns/objective` and siblings) through a **source-path jiti alias loader**
(`ts/packages/kernel/src/runtime/module-loader.ts`) that maps `@ns/...` specifiers to
absolute on-disk `.ts` paths derived from workspace `package.json` exports (plus a virtual
`@ns/kernel/sdk` module), backed by checked-in `.ns/extensions/*` manifests that re-export
workspace source. Everything runs off `ts/node_modules` via hard-coded `NODE_PATH` shims.

This Objective makes `ns` installable and runnable **without a checkout** — a versioned
npm package a customer installs (global or `npx`) that runs `ns objective …` (and every
other bundled capability) against their own repo, with no `ts/node_modules` precondition.

It was split out of `ship-objectives-to-customers` (decided 2026-07-01) because
checkout-free distribution is the biggest, riskiest chunk of that thread **and** benefits
every capability, not just objectives. `ship-objectives-to-customers` consumes this as a
hard dependency.

Naming note: the ADR 0024 `sdl` → `ji` rename landed and has since been superseded by
the `rename-ji-to-ns` cutover. The workspace package names now use the external
`@nseng-ai/*` scope, the CLI bin is `ns`, and checked-in extension manifests live under
`.ns/extensions`. This Objective's slug keeps the historical `sdl` name as its durable
identity, and older prose below may retain historical `ji` names where it describes the
pre-work state.

## Scope

- **Introduce a real build/bundle step.** There is none today (no esbuild/tsup/rollup, no
  `build` scripts, no `dist` directories; non-private packages declare only
  `files: ["src"]`, a source-shipping posture). Produce a distributable artifact for
  `@ns/kernel` + its runtime capability packages that runs on stock Node ≥24 without
  run-from-source resolution and without `ts/node_modules`.
- **Replace the source-path module loader.** `ts/packages/kernel/src/runtime/module-loader.ts`
  resolves capability packages (and the hidden `exec` surface) to absolute source `.ts`
  paths relative to the kernel's on-disk location. Bundled/published resolution must
  replace this so `@ns/objective` and its `exec-*` commands load from installed packages,
  not a checkout. Reconcile the checked-in `.ns/extensions/*` re-export manifests (which
  assume the workspace tree on disk).
- **Resolve `private` / workspace-dep publishability.** `@ns/kernel` (published as
  `@nseng-ai/kernel`) is `private: true` permanently — decided: its runtime surface ships
  only folded inside the published `@nseng-ai/ns` bundle (esbuild inlines kernel source at
  bundle time); no standalone kernel publish path exists. 7 of 21 workspace packages are
  private (`@ns/kernel`, `@ns/capability-kit`, `@ns/ccc`, `@ns/flow`, `@ns/pi`, `nscc`,
  `@internal/pi-tools`), and the loader aliases modules from private
  `@ns/capability-kit`, `@ns/ccc`, and `@ns/flow`. Decide per remaining package:
  un-private + publish, bundle-inline, or exclude. `@ns/objective` and the other
  capability packages are already non-private. The kernel also depends on external
  published npm packages (`@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`).
- **Publish a versioned package to npm** as `@nseng-ai/ns` (per the `rename-ji-to-ns`
  edge, superseding the ADR 0024 `@ji` scope), with the `ns` bin working checkout-free.
  Standalone-published first-party runtime packages use the same external `@nseng-ai/*`
  workspace/package naming line rather than a pack-time `@ns/*` rewrite scheme.
- **Replace the checkout-dependent shims.** The pnpm `.bin/ns` shim hard-codes this
  checkout's `NODE_PATH`; the installer shim template
  (`ts/scripts/source-cli-shim-template`) `run_checkout` refuses to run without
  `ts/node_modules`. The published package must not depend on either.

## Non-Goals

- Not a standalone `objective` binary; the surface stays the `ns` CLI.
- No contributor/dev-environment onboarding (`just`, pnpm, direnv, `slot`, source shims);
  those keep the run-from-source model.
- No release automation / CI for the published package in v1 (parked); a first manual
  publish is enough to unblock consumers.
- Not re-homing or renaming capability packages beyond what publishability requires
  (distribution-motivated package consolidation into `@ns/core`/`@ns/capability-kit`
  subpaths is in scope only as triage outcomes, not as a general re-homing program).
- No decision here on which skills bundle where — that is `skill-management-subsystem`.

## Completion Criteria

- A global or `npx` install of `@nseng-ai/ns` on a machine with **no repo checkout** runs
  `ns objective list` (and `ns objective …`) against a foreign repo.
- The published package includes `@nseng-ai/objectives` and its hidden `exec` surface,
  loaded without a source-path checkout assumption.
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
  the `.ns/extensions/*` re-export parity test
  (`ts/packages/kernel/test/integration/repo-local-extension-manifest-parity.test.ts`).
- Bundling is currently an explicit non-default (`.ns/extensions/AGENTS.md`: checked-in
  bundled artifacts are "a liability"); this Objective must define the sanctioned bundled
  path deliberately.
- Residual pre-ADR-0026 naming in old updates and reference material is historical; active publish decisions use `ns` / `@nseng-ai/ns`.

## Open Questions

- ~~Bundle strategy~~ — resolved 2026-07-01 (see
  `updates/20260701T190744Z-pi-style-distribution-strategy.md`): Pi-style — publish a real
  npm CLI package with a `bin` pointing at prebuilt `dist` JS, first-party runtime
  packages as versioned npm packages where feasible, bundle-inline only for
  dependency-closure exceptions.
- ~~jiti vs prebuilt JS~~ — resolved at strategy level: prebuilt JS is the runtime path
  for first-party capabilities. Residual: how much jiti (if any) ships in the published
  package for user/repo-local extensions.
- ~~Package name/scope and workspace-to-published mapping~~ — first resolved for the CLI
  by `rename-sdl-to-ji` (ADR 0024) as the `@ji` scope, then superseded by the
  `rename-ji-to-ns` edge. Current workspace manifests now use the external `@nseng-ai/*`
  names directly, including `@nseng-ai/ns` as the `ns` CLI package source owner and
  `@nseng-ai/kernel`, `@nseng-ai/capability-kit`, `@nseng-ai/flow`,
  `@nseng-ai/objectives`, and sibling capability packages. This resolves the prior
  `@ns/*` vs generated publish-root rewrite question; publish metadata/private flips for
  private runtime packages remain implementation work.
- ~~Which of the remaining private packages get un-privated vs bundle-inlined vs folded
  into existing published packages~~ — resolved by the triage table
  (`updates/20260704T235456Z-runtime-dependency-triage-decisions.md`) plus the 2026-07-05
  decision that many packages publish standalone, `@ns/capability-kit` and `@ns/flow` at
  minimum (`updates/20260705T123551Z-standalone-package-publishing-decision.md`).
  `@nseng-ai/kernel` specifically remains `private: true` permanently, folded into the
  published `@nseng-ai/ns` bundle rather than published standalone.
- The exact first npm publish authorization and release mechanics remain open; release
  automation/CI is parked, so the first publish can be manual once the local package
  artifact and private-runtime publishability are ready.
