# planned-branch TS CLI

## Thesis

The planned-branch workflow — `write-plan` → `create` → `impl` — currently lives only inside the Pi extension layer (`pi-extensions/src/planned-branch/*`) and cannot be driven ergonomically from Claude Code. Extract its deterministic core into a new published, user-facing TypeScript package `@asdl/planned-branch` (bin `planned-branch`) so that a single tested core backs three surfaces: the `planned-branch` bin (hidden `exec` primitives), the Pi extension (which imports the core), and three public Claude Code skills (which shell out to the bin). The result makes the workflow first-class in Claude Code while keeping one source of truth and full Pi↔Claude storage interop. This is also the repo's first non-private TS package and the template for the eventual "all of asdl in TS" migration.

## Scope

- Create a new published workspace package `@asdl/planned-branch` at `ts/packages/planned-branch`, exposing the bin `planned-branch` (the repo's first non-private TS package).
- Extract the Pi-independent core out of `pi-extensions/src/planned-branch/*`, replacing the `pi.exec` coupling with an `Exec` gateway (real adapter + in-memory fake, per `typescript-fake-driven-testing`).
- Keep the bin model-free: the harness always supplies `--slug`; no text-generation dependency lives in the package.
- Implement the hidden `exec` operations: `write-plan-file`, `resolve-plan`, `create`, `load-plan`.
- Have the bin own the local plan store and the attach/load/list policy, while deferring storage I/O to the `brmem` CLI (shell out) and branch operations to `git`/`gt`.
- Refactor the Pi extension to import the core (keeping Pi-only behavior — session-history "latest plan" resolution and tiny-model slug derivation — in the extension layer), and namespace its commands as `/planned-branch:write-plan`, `/planned-branch:create`, `/planned-branch:impl`.
- Author three public Claude Code skills — `planned-branch-write-plan`, `planned-branch-create`, `planned-branch-impl` — that shell out to the bin and describe CLI operations only (no internal references), with `skills/<name>` symlinks for discoverability.
- Rename storage to the single `planned-branch` token: brmem namespace `brmem-plans` → `planned-branch`, and the local plan store `~/.asdl/plans/<repo>/<encoded-source-branch>/<slug>.md` → `~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<slug>.md`.
- Update workflow documentation (`docs/pi/planned-branch-workflow.md` and related) and migrate the extension tests to the new package, namespace, and command surface.

## Non-Goals

- No generalized "branch artifacts" framework or unifying CLI above brmem; brmem stays the generic substrate and planned-branch is one workflow, sibling to handoff.
- No model/text-generation dependency inside the bin; slug derivation stays in the harness (Claude derives inline; Pi keeps its tiny-model call in the extension layer).
- No reimplementation of brmem's ref storage in TS; the package shells out to the `brmem` CLI and will swap to a TS-core import when brmem itself ports to TS.
- No delivery of the thin human surface (`planned-branch list` / `show`); it is parked.
- No `asdl` TS umbrella or TS plugin-discovery mechanism; this is a standalone feature CLI now, designed to mount into an umbrella later.
- No backwards-compatibility shim or data migration for the renamed namespace/store path; the repo is unreleased/private and accepts the break.

## Completion Criteria

- All three verbs work end-to-end from Claude Code (public skill → `planned-branch exec ...` → core) and from Pi (`/planned-branch:*` → imported core), against the same `planned-branch` brmem namespace and `~/.asdl/planned-branch/plans/...` store — a plan written from one harness can be branched and implemented from the other.
- `@asdl/planned-branch` is the single source of truth: `pi-extensions` contains no duplicated planned-branch logic and instead imports the extracted core.
- The bin's `exec` operations are model-free and shell out to `brmem`/`git`/`gt` as designed; the core is exercised through the `Exec` gateway with an in-memory fake.
- The namespace rename (`brmem-plans` → `planned-branch`) and store-path rebrand are complete across code, docs, and tests; Pi commands are namespaced and Pi's session-history "latest plan" feature still works.
- Evidence: `just ts-check` and `just ts-test` pass; CLI scenario tests over the bin cover the `exec` operations, help, and version; `docs/pi/planned-branch-workflow.md` reflects the new package, namespace, path, and command surface.

## Assumptions and Risks

Assumptions:

- The only Pi coupling in `pi-extensions/src/planned-branch/*` is `pi.exec` (plus the slug model call and session-history scanning), so swapping in an `Exec` gateway cleanly separates the deterministic core; if deeper coupling surfaces, the extraction is larger than scoped.
- The `brmem` CLI's `put`/`get`/`list --namespace` contract is stable enough to shell out to from both the bin and the skills.
- Claude can derive an acceptable kebab-case slug inline from plan content, so no CLI-side model call is needed for the Claude flow.
- A standalone `ts/packages/planned-branch` feature CLI (not an `asdl` umbrella) is the right first home, consistent with the composability principle and the Python dual-entry-point precedent.

Risks:

- Renaming the brmem namespace `brmem-plans` → `planned-branch` orphans any plans already attached under the old namespace; with no migration shim, in-flight branches carrying old-namespace plans will not be found. De-risk by confirming no active branch depends on `brmem-plans` before landing, or explicitly accept the break.
- The published package's runtime dependency on the (Python) `brmem` CLI dents standalone-adoptability; accepted for now, and expected to improve when brmem ports to TS.
- As the first non-private TS package it requires net-new npm publish/packaging setup (the TS analog of `setup-pypi-publish`), which may surface packaging issues; mitigated by keeping actual publication parked.
- Pi's session-history "latest plan" resolution must survive the extraction (it stays in the extension over the imported core); risk of regression during the refactor, covered by migrating the existing extension tests.

## Open Questions

- What should the parked human surface (`planned-branch list` / `show`) read — attached plans on the current branch, the local plan store, or both?
- What is the exact npm publish setup for the first non-private TS package (publish config, versioning, and whether it is actually published versus only publish-ready)?
