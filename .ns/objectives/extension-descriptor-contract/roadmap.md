# Roadmap

## Work

- [x] Settle the extension-author README as the canonical descriptor contract.
  - Settled at creation (2026-07-07) via structured grilling, then revised the same day by a
    second structured grilling session; all decisions folded into `references/README-draft.md`
    (see its "Settled contract decisions" section). Final contract: neutral kernel command
    interface with mandatory machine envelope (clinkr convenient, not required —
    `defineCommand(clinkrSpec)` adapts to the neutral object at authoring time; low-level helper
    for direct construction; legacy `NsResult` deleted); recursive `entries` array (command |
    group discriminated union; hidden subgroups replace the `exec: true` field); module-owned
    `summary` with eager group-help loads; thunk-only `load` (strings rejected twice); point
    definitions use `id` + `cardinality` (supersedes JSON field parity); `bundledArtifacts`
    field name; flat quick-start layout (`src/extension.ts` + `src/commands/`; export map is the
    only contract).
- [ ] Kernel SDK: descriptor types, define helpers, neutral command contract, and validation.
  - Guidance: new module under `ts/packages/kernel/src/sdk/` per the settled README. Define the
    neutral kernel command interface (name, summary, description, run → machine envelope +
    result schema) and move/define envelope schemas at that neutral layer; the neutral
    `run(ctx, invocation)` receives the raw post-route argv tail (`invocation.argv`) so
    bring-your-own-parser passthrough commands are possible; `defineCommand`
    adapts a clinkr spec into it at authoring time (kernel loader stays clinkr-agnostic) by
    consuming `invocation.argv` with the Zod schema; add the public `defineRawCommand` constructor
    for direct neutral-object authoring (documented contract surface per the README's low-level
    section, with a passthrough-wrapper test); delete the legacy `NsResult` union. Doc comments
    on the descriptor `load` field / entry types explain lexical bundler discovery (thunks with
    literal `import("...")` specifiers are found at parse time even inside callbacks; computed
    specifiers are opaque and break bundled first-party descriptors). `defineExtension` types the recursive `entries` union (command entries `{ name,
    load }`, group entries `{ group, description, hidden?, entries }`), thunk-only `load`,
    `points` (`id`, `accepts`, `cardinality`, `description`, `default?`), and
    `bundledArtifacts`. Zod-validate descriptor objects at load boundaries; load-time
    name-match diagnostics. Unit tests cover valid descriptors, malformed field diagnostics,
    nested group entries, and thunk typing.
- [ ] Kernel discovery/registry: load descriptors for ns.toml-declared package directories.
  - Guidance: for each `extensions = [...]` local package dir, read package.json (standard fields
    only), resolve `exports["./ns-extension"]`, jiti-import it (`loadNsUserModuleDefault`),
    validate, and mint candidates via `loadedModuleReference` with per-extension error
    diagnostics that do not block other extensions. Mount recursive group entries (including
    hidden subgroups — the exec convention) onto clinkr's nested-group machinery; group help
    loads the group's command modules eagerly to render module-owned summaries, while command
    invocation loads only the selected thunk. Selected-load keeps validating the loaded
    command against the descriptor entry. Fake/fixture-driven tests in
    `ts/packages/kernel/test/unit/` plus a scenario test proving `ns <group> <cmd>` routes through
    a descriptor fixture.
- [ ] Points migration: point catalog reads descriptors.
  - Guidance: `loadPointCatalog` (`ts/packages/kernel/src/project-config/points.ts`) sources point
    definitions from descriptor `points` instead of package.json `ns.points`, adopting the
    modernized shape: `id: "submit.pre"` dotted strings (adapter may split internally where the
    old path segments are needed) and `cardinality: "many" | "one"` replacing
    `semantics: "additive" | "override"`; `ns extension point(s)` built-ins keep their envelope
    structure with renamed fields as needed. Update `extension-points-cli` scenario fixtures to
    descriptor form.
- [ ] Bundled-artifacts migration: module artifact discovery reads descriptors.
  - Guidance: `parseModuleArtifactDeclaration` /
    `discoverExtensionModuleHarnessArtifacts` consume the descriptor `bundledArtifacts` field
    (`{ kind: "skill", name, path, description? }` entries; author-facing field rename only —
    the harness-artifacts subsystem keeps its internal name) from acquired module roots and
    declared dirs, executing descriptors via the kernel loader; per-module failure isolation
    preserved. Update reconcile tests.
- [ ] Convert every first-party package to a descriptor; unify catalogs.
  - Guidance: add `src/ns/extension.ts` + `exports["./ns-extension"]` to address/pr-feedback,
    branch-context, flow, handoffs, objectives, retros, reviews, harness-artifacts, ns-init;
    delete each `repo-local-ns-extension.ts` and `preinstalled-catalog.ts`; migrate any
    commands still returning the legacy `NsResult` shape to machine-envelope exits; first-party
    bundled descriptors use thunk `load` (esbuild-followed); add one kernel
    adapter descriptor → preinstalled catalog entries; rewire
    `ts/packages/hosts/ns-cli/src/cli.ts` to import bundled descriptors; source-dev workspace
    discovery reads descriptors. Self-hosting invariant: every previously available command group
    still works in this checkout after this row.
- [ ] Deletion slice: remove the legacy declaration surfaces.
  - Guidance: delete `.ns/extensions/*` command dirs in this repo, `discoverExtensionsInRoot` and
    the project/global root-scan paths, the JSON manifest schemas and readers
    (`nsExtensionManifestSchema` command/point reads, `ns.commands`/`ns.points`/
    `ns.harnessArtifacts` consumers), and sweep the repo (tests, skills, docs, CONTEXT files) for
    references to the deleted surfaces.
  - Evidence: full `just` green; before/after `ns --help`, `ns <group> --help` (eager
    module-load path for module-owned summaries), and completion-resolve latency in this
    checkout recorded in a Semantic Update (escalation-trigger evidence for the cheapness
    policy and the eager-help decision).
- [ ] Record the trust-posture Semantic Update in remote-artifact-module-acquisition.
  - Guidance: new update under
    `.ns/objectives/remote-artifact-module-acquisition/updates/` noting that catalog build now
    executes descriptor code under the standing trusted-repo posture, superseding the
    "static manifests = no execution" separation; reference this objective. The one sanctioned
    cross-objective edit.
- [ ] `ns install <local-package-dir>`: managed install plus ns.toml source-spec recording.
  - Guidance: kernel built-in Clinkr command per ns-cli-design (schema-first, `resultSchema`,
    `renderHuman`, kebab-case `errorType` values). Validate the source dir (package.json
    name/version + `./ns-extension` export); install into
    `.ns/managed-extensions/npm/node_modules/<name>` via the managed npm project with
    `npm install --no-save --package-lock=false --ignore-scripts --legacy-peer-deps <dir>`
    (verified: symlinks, tolerates `workspace:*`); record the user-given source spec in
    `extensions = [...]` (create/append, idempotent, no broad TOML reformat); acquisition
    (`acquisition.ts`) resolves installed local specs to managed roots, uninstalled specs stay
    direct paths (explicit installed-vs-direct distinction). Usage/failure cases: missing source,
    `npm:`/`git:` source forms rejected this slice, missing package.json, install failure
    envelope.
  - Evidence: kernel scenario tests (happy path `--format json`, idempotent re-run, failure
    envelopes) plus scratch-project transcript outside this repo: install `@nseng-ai/ns` from
    `dist/publish`, `npx ns install <ns-worktree>/ts/packages/capabilities/objectives`,
    `npx ns objective list` returns real records. Closing end-to-end evidence for the Objective.
- [ ] Promote the settled README to its durable user-facing home.
  - Guidance: once the contract has shipped, move/adapt `references/README-draft.md` to the real
    documentation location (candidate: a kernel-owned extension-authoring doc or
    `ts/packages/hosts/ns-cli/README.md` section); the objective reference then points at the
    promoted doc.

## Parked

- Direct-entry sugar (single-file project commands) and a user-global extension mechanism over
  the new core.
- `.tgz` and bare npm-package-name `ns install` UX.
- ns-dev `install-local-ns-extension` delegation rewrite (explicitly dropped from this
  Objective; the WIP prototype on `project-local-ns-dev-cli` is superseded).
