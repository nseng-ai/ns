---
edges:
  - objective: professional-repo-curation
    annotation: Parent umbrella whose package-curation direction this Subobjective replaces with a three-disposition package ontology and an atomic repository reorganization.
---

# Package Disposition and Host Ontology

## Thesis

Reorganize the complete TypeScript package inventory so paths communicate two facts without conflating them: release disposition and architectural ownership. Every package belongs to exactly one mutually exclusive top-level disposition—`public`, `incubating`, or `internal`—then follows an owner-appropriate nested ontology. `public` packages are warranted for external release and support; `incubating` packages have real release intent but are not ready; `internal` packages exist for this repository with no current release intent.

The package tree will make ns and host integration boundaries explicit. Harness-independent ns extensions live under `extensions/` and contain no Pi code. All Pi-specific code lives under `hosts/pi/`, whose nested structure may include runtime, extensions, tools, or other Pi-appropriate categories. A Pi integration over an ns extension is a separate package named `pi-ns-<domain>` that consumes the ns extension's curated package API. Other hosts may define different nested structures appropriate to their integration models.

Repository hierarchy and package identity have distinct jobs: parent folders express ontology, while every package leaf directory exactly matches the unscoped part of its package name. Public and incubating packages use `@nseng-ai/<leaf>`; internal packages use `@internal/<leaf>` and remain private. A superseding ADR and complete package-by-package destination map will settle the design first. After explicit user approval, all path moves, identity changes, Pi extractions, dependency rewiring, and final guards will land as one coordinated atomic implementation boundary with no mixed legacy state.

This is a Subobjective of `professional-repo-curation`. It owns the package ontology and reorganization; the parent retains repository presentation, transfer, and synthesis.

## Scope

- Classify every TypeScript workspace package as `public`, `incubating`, or `internal`, with no package belonging to more than one disposition.
- Define and document the nested package ontology, including `extensions/` for harness-independent ns extensions and `hosts/<host>/` for all code specific to an external assistant harness.
- Reserve `hosts/pi/extensions/pi-ns-<domain>/` and `@nseng-ai/pi-ns-<domain>` for Pi extensions that adapt corresponding ns extensions; Pi-native extensions use natural Pi-facing identities instead.
- Separate all current Pi code from ns extension packages into one Pi package per integrated ns extension, consuming only the ns extension's curated package API.
- Move the checkout-free `@nseng-ai/ns` product distribution to `public/ns/` and rename the current shared Pi package to incubating `@nseng-ai/pi-runtime` at `incubating/hosts/pi/runtime/pi-runtime/`, as settled by the approved destination map.
- Place project-only Pi packages under the `internal/hosts/pi/` ontology, with categories such as tools and subagents chosen according to their role.
- Require each package leaf directory to equal the unscoped package identity and prohibit duplicate leaf identities.
- Enforce npm scope by disposition: `public` and `incubating` use `@nseng-ai/*`; `internal` uses `@internal/*` and remains private.
- Enforce release closure: public packages depend only on public packages; incubating packages may depend on public or incubating packages; internal packages may depend on any disposition.
- Write a new ADR superseding ADR 0044, an authoritative `ts/packages/README.md`, and focused host-level documentation where an owner-specific ontology needs additional rules.
- Reconcile `professional-repo-curation` with the approved ontology so active parent guidance no longer describes the flat `incubator/` layout as the destination.
- Execute the complete code and path migration as one coordinated PR/stack landing, then remove all legacy paths and transitional compatibility.

## Non-Goals

- Publishing packages to npm or performing other registry mutations. Local builds, packs, and checkout-free smokes are completion evidence only.
- Preserving compatibility aliases or forwarding packages for renamed package identities; this private, unreleased repository takes a clean identity cutover.
- Forcing every host to mirror Pi's nested ontology. Each host defines the structure appropriate to its integration model.
- Encoding the full repository hierarchy into npm names. Only the package leaf determines the unscoped identity.
- Treating `incubating` as project-only code or `internal` as a waiting room for publication. Moving between them is a deliberate change in release intent.
- Landing a mixed old/new package tree or temporary path compatibility on trunk.
- Rewriting ADR 0044; the new architecture is recorded in a superseding ADR.

## Completion Criteria

- A reviewed superseding ADR and a complete destination map classify every TypeScript package by disposition, final path, package identity, split/merge action, and dependency consequences; the user explicitly approves both before implementation begins.
- The checked-in package tree has exactly three disposition roots—`public`, `incubating`, and `internal`—and no legacy `ts/packages/incubator/`, flat host, or other superseded package paths remain.
- Every workspace package leaf matches its unscoped package identity; public/incubating packages use `@nseng-ai/*`, internal packages use `@internal/*`, and mechanical checks enforce these rules.
- No ns extension contains Pi imports, Pi registration, a Pi host-surface subpackage, or Pi extension entrypoints. Each retained ns-backed Pi integration is a separate `pi-ns-<domain>` package under the appropriate `hosts/pi/extensions/` path and consumes the ns extension through its package API.
- Mechanical checks enforce disposition dependency closure and the ns-extension/Pi boundary with no compatibility exceptions left behind.
- `ts/packages/README.md` is the authoritative package-tree contract, with focused nested READMEs only where owner-specific rules warrant them.
- Workspace configuration, imports, scripts, tests, context files, package READMEs, AGENTS guidance, and active Objective guidance all reference the final paths and terminology.
- The complete migration lands as one coordinated implementation boundary and relevant repository validation, package builds/packs, and checkout-free smokes pass without publishing to a registry.
- `professional-repo-curation` reflects this Subobjective's settled result and no longer directs agents toward the superseded flat-incubator model.

## Assumptions and Risks

Assumptions:

- Release disposition is stable and important enough to be the first package-path segment for every TypeScript workspace package.
- `public`, `incubating`, and `internal` are exhaustive and mutually exclusive: public means release-warranted, incubating means intended for release but not ready, and internal means no current release plan or desire.
- Parent folders should optimize repository comprehension, while a leaf/package-name invariant supplies a simple, mechanically checkable identity rule.
- ns extensions can expose all behavior needed by Pi consumers through curated harness-independent package APIs.
- A coordinated stack can provide reviewable commits while preserving an atomic landing boundary.

Risks:

- **Release-intent misclassification.** The complete destination map and explicit user approval settled the initial classifications: all ns extensions and extracted `pi-ns-*` adapters remain incubating for the organizational cutover, while Pi Editor Mods is internal. Future promotions remain deliberate disposition changes; implementation must not silently reclassify packages.
- **Hidden Pi coupling.** Existing ns extension `pi` subpackages may reach private domain or command internals that are not available through package APIs. Extraction may expose API design work and must not be bypassed with private imports.
- **Large atomic conflict surface.** Moving and renaming the entire package inventory at once can produce difficult review and merge conflicts. The ADR and destination map land first, and the implementation may use multiple reviewable branches/commits while remaining one coordinated landing boundary.
- **Identity ripple.** Renaming `@nseng-ai/pi` and creating multiple Pi extension packages affects imports, exports, lockfiles, scripts, fixtures, documentation, and package preparation. The destination map must enumerate consumers before cutover.
- **Guard blind spots.** Path checks alone may miss runtime imports, generated metadata, or subpath exports. Completion requires both topology/dependency enforcement and focused structural checks for forbidden Pi surfaces in ns extensions.
- **Terminology ambiguity.** `public` describes release warrant, not TypeScript visibility or proof of current npm publication. The package contract must state this explicitly.
- **Parent-guidance contradiction.** De-risked 2026-07-26: `professional-repo-curation`'s objective, roadmap, and always-loaded orientation were reconciled to the approved disposition ontology through that record's own tracking workflow, so active parent guidance no longer directs agents toward the flat-incubator destination. Historical ADR 0044 and immutable updates remain unchanged as time-in-place records.

## Open Questions

- ~~During implementation-stack design, what exact boundary changes remove or fold public `@nseng-ai/ns` runtime dependencies on incubating Branch Context and Harness Artifacts?~~ Resolved by the implementation-stack design (`references/implementation-stack.md`): there are three edges and three fixes, each verified against source. (a) `@nseng-ai/ns-init` folds into `@nseng-ai/ns` (stack order 10a; destination-map row 25). (b) `@nseng-ai/harness-artifacts` folds into `@nseng-ai/ns`, which gains an `./api` export; `.ns/extensions/skill-exposure` repoints its three `@nseng-ai/harness-artifacts/api` imports to `@nseng-ai/ns/api`, and an incubating package depending on a public one is legal under disposition closure (settled decision 1; stack order 10b). This is a deliberate, approved amendment to destination-map row 9, which had Harness Artifacts *moving* to `incubating/extensions/harness-artifacts/`: the fold removes the package entirely, so the approved 34-package target becomes 33. It is an amendment, not a discrepancy. (c) Branch Context is **not** a runtime edge at all. Its sole consumer is `ts/packages/hosts/ns/scripts/build-bundle.mjs:6,77`, which imports `@nseng-ai/branch-context/api/prompt-assets` and copies `branch-context-impl.md` into the bundle, and `scripts/prepare-local-package.mjs:35,40-41` copies it onward into the publish directory. Nothing reads the asset at runtime — verified dead. Stack order 10c deletes the pipeline and the dependency goes with it.
- ~~Which focused host-level READMEs, beyond the authoritative package-tree contract and the approved Internal Pi Tools inventory, are necessary?~~ Resolved: none. `ts/packages/README.md` plus the already-approved `@internal/pi-tools` inventory README are the whole documentation set for this cutover. The stack itself is the evidence: no branch in it produces a host-level README, and the one candidate host-level rule — whether `@nseng-ai/extension-kit/pi-types` is sanctioned neutral host-shape vocabulary for extension `/api` signatures — is explicitly routed to `ts/packages/README.md` instead of a Pi-host document. The destination map left `ts/packages/{public,incubating,internal}/hosts/pi/README.md` as "only as needed"; this is the "as needed" determination, and it is *not yet needed*. It is revisitable — ADR 0045 §8 anticipates a focused Pi-host README, and the case for one arises when the deferred `pi-ns-*` extraction actually creates the `hosts/pi/extensions/` population it would describe.
- ~~What exact Graphite stack shape best preserves an atomic landing while keeping mechanical moves, integration extraction, and guard changes reviewable?~~ Resolved: a two-phase shape, recorded in full in `references/implementation-stack.md`. Phase one is ordinary trunk PRs that never touch a package path or npm identity — CI trunk filter, depth-agnostic workspace discovery, the `ns-init` and Harness Artifacts folds, and dead-code sweeps. Phase two is a single Graphite stack on one base cut from `master`, submitted as roughly 19 PRs and reviewed branch by branch, then landed by retargeting the **top** branch's PR base to `master` and squash-merging, so exactly one commit reaches trunk. `ns flow land` is **prohibited** for this boundary: it squash-merges each PR bottom-up (`flow/src/land/stack/land-context-adapter.ts:146,543`), parking intermediate commits — including states where both `public/` and `hosts/` exist — on trunk, which is the mixed old/new tree ADR 0045 §8 forbids. Trunk is frozen against new packages under old role directories for the review window.
