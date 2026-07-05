---
edges:
  - objective: ship-objectives-to-customers
    annotation: Split out of that Objective (2026-07-01); it consumes checkout-free `ns` distribution as a hard dependency and is its first external consumer.
  - objective: rename-ji-to-ns
    annotation: Owns the publish name this Objective ships under — the external package target is @nseng-ai/ns, superseding @nseng-ai/ji; its core cutover must land before the first publish.
---

# Checkout-Free `ns` Distribution

## Thesis

`ns` originated as a run-from-source-only CLI, and that model still governs dev/source
use. `ts/` is a pnpm workspace (25 packages) whose `@nseng-ai/kernel` `ns` source bin
points at raw `./src/cli/index.ts`, executed directly by Node ≥24 (native type
stripping); source/dev runs resolve capability packages off `ts/node_modules` through
checked-in checkout shims. There is still no `publishConfig` and no checked-in `dist`;
most non-private packages declare `files: ["src"]`, a source-shipping posture (the
`@nseng-ai/ns` host is the deliberate exception — it now ships a prebuilt `bin/`).

This Objective makes `ns` installable and runnable **without a checkout** — a versioned
npm package a customer installs (global or `npx`) that runs `ns objective …` (and every
other bundled capability) against their own repo, with no `ts/node_modules` precondition.

It was split out of `ship-objectives-to-customers` (decided 2026-07-01) because
checkout-free distribution is the biggest, riskiest chunk of that thread **and** benefits
every capability, not just objectives. `ship-objectives-to-customers` consumes this as a
hard dependency.

Progress at a glance (trunk, 2026-07-05): the runtime pieces have started landing. The
kernel source-path capability alias loader was removed (`module-loader.ts` now only binds
the `@nseng-ai/kernel/sdk` virtual module plus a jiti loader for user/repo-local
extensions), and `ns objective …` routes now load through an injected preinstalled command
catalog (`listObjectivePreinstalledNsCommandCatalogEntries` from `@nseng-ai/objectives/ns/ln-ln`,
wired by the `@nseng-ai/ns` host) rather than checkout source aliases. An esbuild bundle,
a local `@nseng-ai/ns` tarball, a checkout-free smoke, and a passing `npm publish --dry-run`
all exist. What remains is the first real npm publish and generalizing bundled/preinstalled
resolution beyond the Objective catalog.

Naming note: the ADR 0024 `sdl` → `ji` rename landed and has since been superseded by
the `rename-ji-to-ns` cutover. The workspace package names now use the external
`@nseng-ai/*` scope directly, the CLI bin is `ns`, and checked-in extension manifests live
under `.ns/extensions`. This Objective's slug keeps the historical `sdl` name as its
durable identity, and older `updates/` prose may retain historical `ji`/`@ns` names where
it describes the pre-work state.

## Scope

- **Introduce a real build/bundle step.** The source-shipping posture had none (no
  esbuild/tsup/rollup, no `build` scripts, no `dist` directories). This has landed for the
  `@nseng-ai/ns` host: an esbuild bundle (`scripts/build-bundle.mjs`) that inlines
  first-party workspace code into `bin/ns.js`, plus `pack:local` and `publish:dry-run`
  assembly of a generated publish root under `dist/publish`. The artifact must keep running
  on stock Node ≥24 without run-from-source resolution and without `ts/node_modules`.
- **Replace the source-path module loader.** `ts/packages/kernel/src/runtime/module-loader.ts`
  formerly resolved capability packages (and the hidden `exec` surface) to absolute source
  `.ts` paths relative to the kernel's on-disk location. Those aliases have been removed;
  Objective commands now load through the preinstalled command catalog. Remaining scope:
  generalize bundled/package-specifier resolution beyond the Objective catalog to the other
  first-party capabilities, and keep the checked-in `.ns/extensions/*` re-export manifests
  and their parity test
  (`ts/packages/kernel/test/integration/repo-local-extension-manifest-parity.test.ts`)
  reconciled and green.
- **Resolve `private` / workspace-dep publishability.** `@nseng-ai/kernel` is
  `private: true` permanently — decided: its runtime surface ships only folded inside the
  published `@nseng-ai/ns` bundle (esbuild inlines kernel source at bundle time); no
  standalone kernel publish path exists. 9 of 25 workspace packages are private
  (`@nseng-ai/kernel`, `@nseng-ai/capability-kit`, `@nseng-ai/ccc`, `@nseng-ai/flow`,
  `@nseng-ai/pi`, `@nseng-ai/pi-command-surfaces`, `nscc`, `@internal/pi-tools`,
  `@internal/typescript-style-guard`); the runtime/loader-relevant private set is
  `@nseng-ai/kernel`, `@nseng-ai/capability-kit`, `@nseng-ai/flow`, and `@nseng-ai/ccc`,
  with the remaining privates excluded host/tooling packages. Decide per remaining runtime
  package: un-private + publish, bundle-inline, or exclude. `@nseng-ai/objectives` and the
  other capability packages are already non-private. The kernel also depends on external
  published npm packages (`@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`).
- **Publish a versioned package to npm** as `@nseng-ai/ns` (per the `rename-ji-to-ns`
  edge, superseding the ADR 0024 `@ji` scope), with the `ns` bin working checkout-free.
  Standalone-published first-party runtime packages use the same external `@nseng-ai/*`
  workspace/package naming line rather than a pack-time `@ns/*` rewrite scheme.
- **Replace the checkout-dependent shims.** The pnpm `.bin/ns` shim hard-codes this
  checkout's `NODE_PATH`; the installer shim template
  (`ts/scripts/source-cli-shim-template`) `run_checkout` refuses to run without
  `ts/node_modules`. The published-package boundary must not depend on either — it points
  at prebuilt `bin/ns.js`; those source shims remain dev-only.

## Non-Goals

- Not a standalone `objective` binary; the surface stays the `ns` CLI.
- No contributor/dev-environment onboarding (`just`, pnpm, direnv, `slot`, source shims);
  those keep the run-from-source model.
- No release automation / CI for the published package in v1 (parked); a first manual
  publish is enough to unblock consumers.
- Not re-homing or renaming capability packages beyond what publishability requires
  (distribution-motivated package consolidation into `@nseng-ai/*` subpaths is in scope
  only as triage outcomes, not as a general re-homing program).
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

- **The long pole, not fully retired.** Every prior capability accepted the
  run-from-source shim and deferred publishing. The loader alias removal and the local
  bundle/dry-run have de-risked the mechanism, but the first real npm publish and the
  private-dep publishability treatment remain unproven. Package consolidation has already
  shrunk the private closure from the originally recorded ~29 of 45 packages to 9 of 25.
- Removing the jiti source-path aliases risks breaking first-party extension discovery and
  the `.ns/extensions/*` re-export parity test
  (`ts/packages/kernel/test/integration/repo-local-extension-manifest-parity.test.ts`);
  keep it green as bundled resolution generalizes.
- Bundling is an explicit non-default (`.ns/extensions/AGENTS.md`: checked-in bundled
  command artifacts are "a liability"); this Objective must keep the sanctioned bundled
  path deliberate rather than the default authoring model.
- Residual pre-ADR-0026 naming in old updates and reference material is historical; active
  publish decisions use `ns` / `@nseng-ai/ns`.

## Open Questions

- ~~Bundle strategy~~ — resolved 2026-07-01 (see
  `updates/20260701T190744Z-pi-style-distribution-strategy.md`): Pi-style — publish a real
  npm CLI package with a `bin` pointing at prebuilt bundle JS, first-party runtime
  packages as versioned npm packages where feasible, bundle-inline only for
  dependency-closure exceptions.
- ~~jiti vs prebuilt JS~~ — resolved at strategy level: prebuilt/bundled JS is the runtime
  path for first-party capabilities. Residual: how much jiti (if any) ships in the
  published package for user/repo-local extensions.
- ~~Package name/scope and workspace-to-published mapping~~ — resolved. Workspace manifests
  now use the external `@nseng-ai/*` names directly, including `@nseng-ai/ns` as the `ns`
  CLI package source owner and `@nseng-ai/kernel`, `@nseng-ai/capability-kit`,
  `@nseng-ai/flow`, `@nseng-ai/objectives`, and sibling capability packages. This resolves
  the prior `@ns/*` vs generated publish-root rewrite question; publish metadata/private
  flips for private runtime packages remain implementation work.
- ~~Which of the remaining private packages get un-privated vs bundle-inlined vs folded
  into existing published packages~~ — resolved by the triage table
  (`updates/20260704T235456Z-runtime-dependency-triage-decisions.md`) plus the 2026-07-05
  decision that many packages publish standalone, `@nseng-ai/capability-kit` and
  `@nseng-ai/flow` at minimum
  (`updates/20260705T123551Z-standalone-package-publishing-decision.md`).
  `@nseng-ai/kernel` specifically remains `private: true` permanently, folded into the
  published `@nseng-ai/ns` bundle rather than published standalone.
- The exact first npm publish authorization and release mechanics remain open; release
  automation/CI is parked, so the first publish can be manual once the local package
  artifact and private-runtime publishability are ready.
