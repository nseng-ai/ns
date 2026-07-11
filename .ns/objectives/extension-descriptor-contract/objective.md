---
edges:
  - objective: ship-objectives-to-customers
    annotation: Consumed upstream; its customer extension-acquisition surface (`ns extension install`/`uninstall`/`update`, designed 2026-07-09) extends the descriptor contract and managed `ns install`/acquisition machinery this record landed.
---

# Extension Descriptor Contract

## Thesis

ns extensions should declare themselves through exactly one typed artifact: a cheap descriptor
module exposed at the standard package export `exports["./ns-extension"]`, carrying all extension
metadata (commands, points, harness artifacts) as data plus lazy load thunks. Today the same
information is hand-maintained in four drift-prone surfaces — package.json `ns.commands`/
`ns.points`/`ns.harnessArtifacts` JSON manifests, `.ns/extensions/*` shim directories, per-package
`repo-local-ns-extension.ts` descriptors, and per-package `preinstalled-catalog.ts` modules — and
none of them are typechecked. The original justification for JSON (build the command catalog
without executing extension code) is already abandoned in practice: preinstalled catalog entries
carry `load: () => import(...)` thunks, `loadListingCommandInfos` imports modules lacking static
info, and the remote-artifact-module-acquisition trust decision permits loading executable
extensions from fetched modules. This Objective replaces all four surfaces with the descriptor,
deletes the JSON readers and scan roots, and then delivers the consumer workflow the contract
exists for: `npx ns install <local-package-dir>` in a generated project followed by working
extension commands (`npx ns objective list`).

## Scope

**The descriptor contract (decided in structured grilling, 2026-07-07):**

- **Full metadata replacement.** The descriptor carries commands, points, and harnessArtifacts.
  package.json `ns` *extension* metadata is eliminated. The repo-convention `ns.tier` /
  `ns.subpackages` fields (subpackage conventions, ADR 0022/0023) are untouched — they are build
  conventions, not extension metadata.
- **Location convention.** A package advertises its descriptor via the standard
  `exports["./ns-extension"]` subpath (e.g. mapping to `./src/ns/extension.ts`). No ns-specific
  JSON key survives. The `prepare-source-publish-package.mjs` pipeline copies `exports` verbatim
  and packages publish `files: ["src"]`, so descriptors ship in publish-shaped output unchanged.
- **Descriptor shape (revised in second grilling session, 2026-07-07).** The descriptor helper
  is `defineExtension`. Its `entries` field is one recursive array holding a discriminated union
  of command entries (`{ name, load }`) and group entries
  (`{ group, description, hidden?, entries }`). There is no `exec` field: the
  `ns <group> exec <name>` convention is expressed as an ordinary hidden subgroup, mapping onto
  clinkr's existing nested `subgroups`/`isHidden` machinery. Descriptor entries carry no
  summary — `summary` lives on the command module (module-owned; group help loads the group's
  command modules eagerly to render one-line summaries, while command invocation stays lazy). A
  descriptor-entry/loaded-command name mismatch is a load-time diagnostic.
- **Lazy loading.** Command entries reference implementations exclusively with typed load thunks
  (`load: () => import("./commands/list.ts")`) — string paths were considered twice and rejected
  (settled in second grilling session). Thunks are bundler-visible (the ns-cli host bundles with
  esbuild), typechecked, legible at the call site, and map onto the existing
  `loadedModuleReference` machinery in `ts/packages/kernel/src/extensions/module-reference.ts`.
- **Neutral command contract; clinkr convenient, not required (settled in second grilling
  session, 2026-07-07).** The kernel's command contract is a neutral interface — name, help
  metadata (module-owned `summary`, `description`), and a run function returning the standard ns
  machine envelope (ok/negative/failure/usage-error plus result schema). The machine envelope is
  a product invariant and mandatory for every command however built. `defineCommand(clinkrSpec)`
  adapts a clinkr command spec into the neutral object at authoring time, so the kernel
  loader/registry stays clinkr-agnostic; the low-level `defineRawCommand` helper constructs the
  neutral object directly and is documented contract surface (README "The command contract
  (low-level)" section). The neutral `invocation` carries the raw post-route argv tail — the
  enabler for bring-your-own-parser adoption (wrapping an existing CLI as a passthrough
  command); `defineCommand` consumes that argv with the Zod schema. The legacy message-only
  `NsResult` union is deleted from the SDK; stragglers migrate during the first-party
  conversion row.
- **Extension point and artifact field modernization (supersedes strict JSON field parity).**
  Point definitions use `id: "submit.pre"` (dotted string, matching `ns extension point <id>`
  and ns.toml references) instead of the `path: [...]` array, and
  `cardinality: "many" | "one"` instead of `semantics: "additive" | "override"`; cardinality is
  deliberately the only per-point constraint (a generalized constraint model is parked). The
  harness-artifact field is `bundledArtifacts` (author-facing rename; the harness-artifacts
  subsystem keeps its internal name).
- **Cheapness policy.** Descriptor modules stay import-light — metadata plus thunks, importing
  only `@nseng-ai/kernel/sdk` (type-only imports excepted) — enforced by documented convention and
  review discipline only. Stricter fallback if needed (recorded here deliberately): (1) an
  `NS_TS_BAN_*`-style guard test restricting first-party `ns-extension` module imports; (2) a
  kernel per-descriptor load-time diagnostic warning past a budget (~10ms). Escalation trigger:
  measured help/completion latency regression, or a descriptor caught importing implementation
  code in review.
- **Big-bang migration.** One stack lands descriptor loading, converts all first-party capability
  packages, and deletes the JSON readers. No dual-contract window survives in trunk after the
  stack lands.
- **Root scanning dies.** `.ns/extensions/` project-root support and the global XDG extensions
  root (`~/.local/share/ns/extensions`) are deleted with `discoverExtensionsInRoot`. Command
  sources become exactly: built-ins + preinstalled + ns.toml-declared (`extensions = [...]`)
  descriptors. Direct-entry sugar (single-file project commands) may return later as a layer over
  the new core.
- **Catalog unification.** Per-package `repo-local-ns-extension.ts` and `preinstalled-catalog.ts`
  modules are deleted. The ns-cli host (`ts/packages/hosts/ns-cli/src/cli.ts`) statically imports
  each bundled package's `./ns-extension` descriptor through one kernel adapter
  (descriptor → preinstalled catalog entries); source-dev workspace discovery jiti-imports the
  same descriptors.

**The install workflow (carried from the earlier ns-install grilling; ns-dev is out of scope):**

- A kernel built-in `ns install <local-package-dir>` command: validates the source directory
  (package.json with name/version and an `./ns-extension` export), installs it into managed
  storage at `.ns/managed-extensions/npm/node_modules/<package-name>` via the managed npm project
  (`npm install --no-save --package-lock=false --ignore-scripts --legacy-peer-deps <dir>`), and
  records the **source spec** (the path the user gave) in the target repo's `ns.toml`
  `extensions = [...]` — created if absent, appended idempotently if present, without broad TOML
  reformatting.
- Acquisition (`ts/packages/kernel/src/extensions/acquisition.ts`) resolves an installed local
  source spec to its managed root; uninstalled local specs keep direct-path resolution
  (installed-vs-direct distinction is explicit).
- Empirically verified 2026-07-07: `npm install <dir>` in the managed project creates a
  **symlink** and tolerates `workspace:*` dependencies in the linked package's manifest, so ns
  worktree packages install as-is and stay fresh; Node resolves realpaths, avoiding
  `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.

**Consumers that must migrate:** kernel command registry/discovery/loader
(`ts/packages/kernel/src/extensions/{registry,discovery,loader,command-registry}.ts`), point
catalog (`ts/packages/kernel/src/project-config/points.ts`), harness-artifacts module discovery
(`ts/packages/capabilities/harness-artifacts/src/module-artifact-declaration.ts` and reconcile),
the ns-cli host, and every first-party package that today ships commands via `.ns/extensions`
shims or preinstalled catalogs (address/pr-feedback, branch-context, flow, handoffs, objectives,
retros, reviews, harness-artifacts, ns-init).

## Non-Goals

- `.tgz` or bare npm-package-name UX for `ns install` (only local package directories this slice;
  `npm:` specs in ns.toml remain lower-level config behavior).
- ns-dev changes (`install-local-ns-extension` delegation, `create-local-ns-project`): explicitly
  dropped from this Objective; the end-to-end evidence uses `npx ns install` directly. The
  uncommitted ns-dev prototype on `project-local-ns-dev-cli` is superseded, not built upon — all
  work here starts fresh from trunk.
- Direct-entry sugar (single `.ts` file project commands) and any user-global extension
  mechanism: deferred, to be rebuilt later over the new core if wanted.
- A trust/consent gate for extension code: the standing trusted-repo posture continues; this
  Objective only records that catalog build now executes descriptor code.
- Pi-side or docs-site work beyond what failing tests force (cross-harness-parity: shared CLI is
  canonical; Pi is additive).
- ns self-update mechanics (owned by remote-artifact-module-acquisition).

## Completion Criteria

- The descriptor module is the only extension declaration mechanism: `nsExtensionManifestSchema`
  JSON readers for commands/points/harnessArtifacts, `discoverExtensionsInRoot`, the
  `.ns/extensions` and global-root scan paths, and all `repo-local-ns-extension.ts` /
  `preinstalled-catalog.ts` modules are deleted from trunk.
- This repo self-hosts on descriptors: all previously available `ns` commands (objective, flow,
  handoff, branch-context, address, retro, reviews groups plus built-ins) work in this checkout,
  with `.ns/extensions/*` command dirs removed.
- `ns --help`, shell completion, and command routing work with descriptors; before/after latency
  measurements for `ns --help` and completion-resolve in this repo are recorded in a Semantic
  Update (evidence for the cheapness escalation decision, not a pass/fail gate).
- A trust-posture Semantic Update is recorded against remote-artifact-module-acquisition noting
  that catalog build executes descriptor code under the trusted-repo posture, superseding the
  "static manifests = no execution" separation.
- End-to-end proof in a scratch project outside this repo: install `@nseng-ai/ns` from
  `dist/publish`, run `npx ns install <ns-worktree>/ts/packages/capabilities/objectives`, and
  `npx ns objective list` returns real records; `ns.toml` contains the source spec; the managed
  root exists; re-running `ns install` is idempotent.
- The settled README is promoted out of this Objective's `references/` into a durable
  production documentation home (extension-authoring doc shipped with the repo/package), so the
  canonical contract is not lost when this Objective closes; the objective reference then points
  at the promoted doc.
- Full `just` green.

## Definition of Progress

Progress is keepable when:

- a slice lands one roadmap row (or a coherent part of one) as a compiling, tested state with the
  full `just` suite green;
- new kernel/capability behavior arrives with fake-driven default tests (no real network; real
  subprocess/fs only in the explicit integration lane per `ts/TESTING.md`);
- deletions land together with the migration that replaces them, never as orphan removals that
  leave commands undiscoverable in this repo;
- descriptor modules added to packages follow the cheapness convention (metadata + thunks,
  `@nseng-ai/kernel/sdk` imports only).

Do not keep changes that:

- leave trunk with a command group missing in this checkout (self-hosting must not regress
  mid-stack);
- reintroduce JSON extension metadata, `.ns/extensions` entries, or preinstalled-catalog modules;
- silently change the descriptor contract's public shape after row 1 settles it;
- commit broken intermediate states to make progress visible.

Useful evidence includes: passing targeted Vitest suites for touched packages, `just` output,
`ns <group> <command> --format json` envelopes from this checkout, scratch-project transcripts for
the install workflow, and recorded latency numbers.

## Runner Policy

This Objective is execution-friendly for `objective-next` and designed for repeated Objective
Runner steps under the boundaries below.

- Direct execution is allowed when: the row is an implementation row (rows 2–9) and the
  descriptor field-level shape (row 1) has been settled and recorded; the step implements the row
  as specified in its guidance without new product/UX decisions.
- Steer or ask first when: settling or later changing the descriptor contract's public shape
  (field names, export subpath, helper API); anything touching trust posture beyond the recorded
  note; introducing new commands, flags, or UX beyond what the roadmap rows specify (error
  wording and internal naming are fine); any temptation to keep dual JSON/descriptor support
  beyond the stack.
- How work may change files and be left: local-only edits on the working branch; each runner step
  stages and commits one slice; the worktree is left clean after a step; no changes outside this
  repo except explicitly scripted scratch-project evidence runs under a temp/scratch directory.
- Validation before keeping work: targeted package tests plus `just` for the repo gates; use
  autofixers (`just ts-format-fix`, `just ts-lint-fix`, `just dprint-fix`) rather than hand-editing
  formatter output.
- What will not happen unless explicitly requested: no push, submit, publish, merge, land, PR
  creation/update, `gt submit`, `ns flow submit`, or any write-capable external action; no
  Branch Memory mutation; no edits to other Objectives except the row-8 Semantic Update recorded
  in remote-artifact-module-acquisition's `updates/`.

## Assumptions and Risks

**Assumptions (each disprovable; mark incorrect via objective-update if evidence contradicts):**

- jiti transpile caching (`fsCache`) keeps per-invocation descriptor execution cheap after first
  run; `createNsJiti`'s `moduleCache: false` disables instance caching, not transpile caching.
  Row 7's latency evidence tests this directly.
- Dynamic-import load thunks inside jiti-loaded descriptor modules resolve correctly in both
  source-dev (jiti) and bundled ns-cli (esbuild-followed) contexts, as the existing preinstalled
  `load` thunks already do.
- `npm install <local-dir>` symlink semantics (verified 2026-07-07 on npm bundled with Node 24)
  remain stable; if npm changes to copy-by-default, managed installs still work but staleness
  semantics change (reinstall intent = rerun `ns install`).
- Recording absolute local paths as ns.toml source specs is acceptable for dev workflows
  (deliberate earlier decision preserving update/reinstall intent).
- The convention-only cheapness policy holds while contributors are just us; the recorded
  escalation path exists because this assumption is expected to weaken as authorship widens.

**Risks:**

- Big-bang breadth: one stack touches kernel, harness-artifacts, the host, and every capability
  package. Mitigated by the row ordering (additive rows land before the deletion row) and the
  Definition of Progress self-hosting invariant; residual risk accepted deliberately over a
  dual-contract window.
- Help/completion latency regression from executing descriptors per invocation, and group-help
  latency from eager command-module loads (module-owned summaries mean `ns <group> --help`
  imports every command module in the group). Mitigated by measurement evidence in row 7 and
  the recorded stricter-policy escalation; eager help loads are the accepted trade for zero
  summary duplication.
- Metadata drift inside TS: the descriptor entry's `name` duplicates the loaded command's
  `name` (summary duplication was eliminated — summary is module-owned and descriptor entries
  carry none); the kernel validates the name match at selected-load time so drift surfaces as a
  diagnostic, not silent divergence.
- Trust-posture creep: catalog build executing extension code forecloses the execution-free
  discovery separation. Accepted under the standing trusted-repo contract; row 8 records it where
  the original decision lives.
- Hidden consumers of the deleted surfaces (tests, skills, docs referencing `.ns/extensions` or
  JSON manifests) may lag; the deletion row's guidance requires a repo-wide sweep for references.

## Open Questions

This Objective was readme-driven: the canonical, user-facing contract has been promoted to
`ts/packages/kernel/docs/writing-an-ns-extension.md` ("Writing an ns extension"), and
`references/README-draft.md` remains as a historical pointer. The field-level contract was
settled 2026-07-07 across two structured grilling sessions (the second revised the first:
neutral command contract, recursive `entries`, module-owned summary, thunk-only `load`,
`bundledArtifacts`, point `id`/`cardinality`) and was reconciled with the shipped SDK during
promotion.

- Validation diagnostics UX detail for malformed descriptors (the README states the posture —
  per-extension degradation, field-naming diagnostics; exact codes/wording settle during rows
  2–3 implementation).
- Exact home and field list of the neutral kernel command interface (kernel `sdk/` module
  boundary vs a lower layer) — row-2 implementation detail within the settled shape; the
  envelope schemas move out of clinkr-coupled code to the neutral layer. Settled within that
  shape: `run(ctx, invocation)` receives the raw post-route argv tail (`invocation.argv`), and
  `defineRawCommand` is public, documented contract surface (BYO-parser path), not an internal
  helper.
- Generalized extension-point constraints beyond `cardinality` — parked deliberately.
- `ns update --extensions` per-spec targeting semantics for descriptor-declared local specs once
  installed specs resolve to managed roots (declared-only targeting today).
- Whether the `ns extension point`/`points` built-ins need surface changes when points move into
  descriptors (likely rendering-only).
- Where Pi-side consumption (e.g. `@nseng-ai/objectives/pi`) should eventually read descriptor
  metadata for parity tables — deferred to cross-harness-parity unless a test forces it.
