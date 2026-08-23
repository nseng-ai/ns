# Vercel CLI startup lessons for Clinkr

**Researched:** 2026-07-26\
**Vercel source inspected:** `/Users/schrockn/code/vercel/vercel` at `6aa29e5714e17d19ba10dd15c6d464cf152e49a5` (read-only)\
**Clinkr source inspected:** the current worktree, including the provisional clean-cut implementation at `53616fe84050a5e288c8c5894ac51d283364f4e3`

## Executive conclusion

Vercel's experience supports Clinkr's settled two-file command seam, but it also puts a precise boundary around the promise. Clinkr can ensure that its runtime does not import an unselected `command.ts`; it cannot ensure that a downstream application's bundler preserves that module as a separately loadable artifact. Source-level lazy selection and artifact-level code splitting are separate contracts.

Clinkr is ahead of Vercel's earlier architecture in several important ways: the common authoring model makes cheap discovery metadata explicit, command implementation is selected-only, one loader serves execution/help/schema/completion, optional display code has a guarded subpath, and the filesystem adapter lowers into one app/runtime rather than introducing a second dispatcher. The pending clean cut should preserve those decisions.

The material gap is at the executable and publication boundary. `@nseng-ai/clinkr` is currently source-published (`package.json` exports `./src/*.ts` and `files: ["src"]`), while a final CLI chooses its launcher and build topology. A source-level test can prove that siblings are not evaluated under a TypeScript-aware runtime; it cannot prove that a bundled executable starts from a small artifact, ships all dynamically referenced modules/assets, or resolves them correctly after chunk relocation. Clinkr should document this boundary, provide testable architecture hooks and package-inspection utilities, and require representative built-artifact evidence at graduation. It should not claim to enforce downstream splitting.

## Verified Vercel evidence

### 1. Dynamic imports did not imply split distribution artifacts

Immediately before Vercel commit `625568e659fbcf8cf6870a5defdf63653a0031f7`, `packages/cli/src/index.ts` selected commands with `await import('./commands/...')`. That commit changed the branches to synchronous `require(...).default` for `ts-eager` compatibility. This verifies that source-level lazy syntax existed years before the modern split design.

The build history explains why that is not evidence of physical splitting:

- `1a5bd6c5b9f579bb339264fc411a2a7cb2c5fcb1` moved `packages/cli/scripts/build.mjs` to esbuild with one bundled entry while externalizing declared dependencies.
- `c98073c7bdc0e2a0a8f19e6ae725de0bce34903b` removed that dependency externalization and produced the fully bundled shape later diagnosed as one roughly 9 MB JavaScript file.
- `e959b591ba52a271338b9d70d5d14c8f37702831` changed the package/build to ESM, establishing the output mode used by esbuild splitting.
- `e27b9e61c70d4972392d3cd5a51ca0563301ac17`, followed by the consolidated `3311a80576a939c63b31c07d7d5cd5b186a1a5fe`, added multiple command entry points, `splitting: true`, hashed shared chunks, priority-command imports, and a lazy bulk-command module.

The decisive unit was therefore the **emitted module graph**, not whether the TypeScript source contained `import()`.

The benchmark claims in `3311a8057` are primary-source but author/environment-specific: `vercel --version` 267 ms to 21 ms, root help 224 ms to 23 ms, `deploy --help` 263 ms to 177 ms, and smaller gains for other commands. The same commit says total JavaScript changed only from approximately 8.9 MB to 8.8 MB. Its causal claim is credible and matches the implementation: less code entered the invocation's initial load graph even though total shipped bytes barely changed.

**Current confirmation:** at Vercel HEAD, `packages/cli/scripts/build.mjs` still defines `index.ts`, `help.ts`, `commands-bulk.ts`, and six priority command entries (`deploy`, `env`, `list`, `link`, `build`, `dev`), with ESM output, `splitting: true`, and `chunks/[name]-[hash]`. `packages/cli/src/index.ts` dynamically imports those priority outputs and `commands-bulk.js`. The checkout has no `packages/cli/dist`, so this research verified the current build recipe and dispatch graph, not the bytes of a prebuilt current artifact. The current build also externalizes declared dependencies via `getDependencies()`; splitting governs the bundled application graph while external dependencies retain Node's package/module boundaries.

### 2. A launcher can bypass the framework/bootstrap graph

`b5355c53249c2cd0d79b1706fdc86430476fea76` added exact-argv fast paths to `packages/cli/src/vc.js`. At current HEAD that launcher still:

1. enables Node's compile cache when available;
2. optionally checks for and dispatches to a native binary;
3. handles exactly `--version`/`-v` by importing only `dist/version.mjs`;
4. handles exactly root `--help`/`-h` by importing `version.mjs` and `help.js`;
5. imports `dist/index.js` only for normal execution.

The build generates `version.mjs`; `packages/cli/src/help.ts` is deliberately standalone. This is not a command-framework optimization. It is final-executable launcher architecture above the framework.

Vercel also demonstrates that a fast launcher must keep its own dependencies small. `6e297457aaf615cf98ef19bd522e19230dc28d37` added a Zod-free `@vercel/cli-config/paths` subpath for the native-binary opt-in check. Its commit message reports roughly 40 ms avoided versus loading schemas and about 7 ms for the lightweight read when a native package is present. Current `packages/cli/src/vc.js` retains that comment and import.

### 3. Optional/error-only facilities must be absent from the common load graph

The history verifies increasingly narrow loading boundaries:

- `5f6d4dc7906b36d1c10212312becfdbcf953ca87` removed unconditional proxy support loading and loaded it only when proxy environment variables required it. At current HEAD, `packages/cli/src/index.ts` dynamically imports `./util/fetch-proxy` only for that branch.
- `1b7b2d99a71654dee44d2a92ceadabe2de8eabda` deferred Sentry initialization; `fbffcb3a5d71787fe83d3f463ad2bc192c319903` converted the path to ESM dynamic imports so the split build could keep Sentry out of the startup chunk. Current `packages/cli/src/util/get-sentry.ts` imports `@sentry/node`, constants, and package metadata only on first error reporting.
- `fbffcb3a5...` also moved extension execution behind the unknown-command fallback. Current `packages/cli/src/index.ts` imports `./util/extension/exec` only after native dispatch does not resolve the command.
- `78c127c573662f358c5a1080d46db5a66641142e` moved Node/Python/Go entrypoint detector imports behind framework classification. Current `packages/cli/src/util/projects/detect-entrypoint.ts` imports only the selected runtime package.
- `1cf8b2267f896c6b7df0126f2c630048aeb62c26` isolated inferred OpenAPI commands in a lazy bundle and added a build guard against putting that optional path back into `index.ts`.

The durable lesson is not “make every dependency optional.” Vercel's separate attempt to move builders to optional peer dependencies (`fa4e1cdf12812e18177e89e9c5a48261e94a5e1a`, `127547dd35edf718e2e05f933e40ccfd0505de11`) was reversed by `2ae2d06060f55e62d08ae47c24cfdbd437e44ea3`. Package-install strategy and invocation-time module loading are different decisions.

### 4. Deterministic hot-path work can move to build time

`b789421290de86ba5ae046e6748295dd516e9b04` moved Ajv compilation of the `vercel.json` schema from command execution into `packages/cli/scripts/precompile-config-validator.mjs`. The build plugin generates `dist/chunks/config-validator.mjs`, verifies that production resolution used it, and the runtime imports the generated validator. The commit reports approximately 167 ms removed in platform traces and about 40 ms locally.

This is a third lever alongside lazy loading and splitting: precompute deterministic work once. It also demonstrates the required guardrail—generation alone is insufficient; the build asserts that the generated validator was actually wired into the output.

### 5. Split output changes resource locality and packaging obligations

`3311a8057` was reverted by `322ae8d9b0a8f1f01f4b61c32cdc74aa8cda8c52` after an E2E failure. `packages/cli/src/util/projects/link.ts` resolved `VERCEL_DIR_README.txt` relative to `__dirname`; after splitting, the module ran from `dist/chunks` and looked for `dist/chunks/VERCEL_DIR_README.txt`. `a04d34dccb8516027eceb58657e3874284a85507` re-applied splitting and inlined that one asset.

Current `packages/cli/scripts/build.mjs` records the generalized fix pattern:

- it cleans `dist` before emitting hashed chunks, preventing stale files in package/binary artifacts;
- it relocates priority entries and rewrites their shared-chunk paths;
- it copies `builder-worker.cjs` and a preload next to the split `dev` entry because those consumers use `__dirname`;
- it copies other workers at the distribution root where their consumers expect them.

A split build therefore needs tests against the **built and packed artifact**, not just source tests. Runtime-relative assets, workers, native add-ons, package `files`, export maps, and stale chunks all become part of correctness.

### 6. Guardrails are useful but should target the real boundary

Vercel's current `packages/cli/scripts/build.mjs` rejects direct `require('./commands/...')` in `src/index.ts`, comments that priority commands must remain a short benchmarked list, verifies precompiled-validator substitution, and cleans stale outputs. These controls preserve architectural intent, although the direct-require regex is deliberately narrow and cannot prove every import-graph property.

The stronger pattern is layered:

- source convention checks prevent obvious eager edges;
- build metadata/output checks prove artifact topology;
- built E2E/smoke tests prove relocated modules and assets execute;
- benchmarks detect regressions in user-visible paths.

## What Clinkr already gets right

These are current/provisional facts, not proposals to reopen settled decisions.

1. **A deliberate discovery/implementation seam.** The settled contract requires cheap `metadata.ts` for commands, cheap complete `group.ts` for groups, and selected-only `command.ts`. Current `ts/packages/public/infra/clinkr/src/filesystem.ts` imports command definitions through `import(pathToFileURL(file).href)` only from the selected route loader. `test/filesystem.test.ts` verifies that root help and command-name completion do not evaluate sibling command modules, while command help/schema selection does.

2. **Ordinary imports are allowed inside a selected command.** This is the right authoring rule. Requiring every command author to sprinkle private dynamic imports would reproduce Vercel's source-syntax confusion. The architectural boundary is the selected-only command module; whether its dependency graph becomes a separate artifact belongs to the application build.

3. **One runtime and one loader contract.** `addClinkrCommandStructure()` lowers filesystem discovery into `ClinkrAppBuilder`/`ClinkrGroupBuilder`; execution, help, schema discovery, and completion do not gain a second dispatcher. The Objective explicitly rejects manifests, production codegen, compatibility runtimes, and manual argv pre-routing. Vercel's experience favors keeping one selection model rather than accumulating parallel “fast” and “normal” command registries.

4. **Transactional lazy loading and bounded lifetime.** The settled design and tests preserve in-flight sharing, successful per-app caching, retry after load failure, and fresh Foundation apps. That prevents repeated selected-module construction without introducing process-global mutable caches.

5. **Subpath isolation already has a structural guard.** `test/integration/core-import-isolation.test.ts` walks literal static imports, re-exports, side-effect imports, and dynamic imports to keep `log-update` under `@nseng-ai/clinkr/stream` and out of core/non-display graphs. This is a useful model for future import-boundary guards, with the caveat that a source scanner still does not prove bundled chunk topology.

6. **Filesystem packaging risk is already explicit.** `references/README-draft.md`, `references/decision-record.md`, and the Objective all say command/group files must ship intact and that bundlers/single-file environments may require the programmatic builder escape hatch or a future adapter. This is the correct boundary and should remain explicit.

7. **Source publication currently preserves Clinkr's own module layout.** `ts/packages/public/infra/clinkr/package.json` exports source TypeScript entrypoints and publishes `src`. The canonical `ns-dev prepare-source-publish-package` path copies listed files into `dist/publish` (`ts/packages/internal/dev/ns-dev/src/public-packages/package-set.ts`). That preserves Clinkr's package files, but it says nothing about a downstream executable's compilation or bundling.

## Concrete risks and gaps

### Framework risks

1. **“Fast by default” can be read as an artifact claim.** The draft correctly describes runtime imports, but a cold reader may infer that a bundled application necessarily loads fewer bytes. The README should explicitly say that Clinkr preserves a runtime lazy boundary in source/module execution; physical chunks depend on the final application's loader and build.

2. **Discovery breadth needs a measured contract.** Current `filesystem.ts` eagerly reads immediate route directories and imports metadata/group modules needed to construct a scope. Its inclusion inspection can recursively traverse metadata under a group. This may be acceptable for correctness and cheap metadata, but “fast” should be backed by tests/measurements for wide and deep trees rather than inferred from selected-only command loading.

3. **Cheap metadata is presently a convention, not a complete enforceable property.** Type-only imports and review guidance help, but arbitrary top-level work in `metadata.ts`/`group.ts` remains possible. Clinkr can guard obvious forbidden package edges or provide an import scanner; it cannot generally prove a module is cheap.

4. **Package tests mostly exercise source modules.** They prove evaluation semantics under the repo's TypeScript test runtime, not npm-pack contents, plain Node behavior against a compiled consumer, or a downstream bundled executable.

### Final-application risks (outside Clinkr's direct enforcement)

1. A bundler may inline every `command.ts` into one initial file even though Clinkr calls `import()` at runtime.
2. A build may rename, flatten, or omit the filesystem command hierarchy that `commandDirectory` expects.
3. `import.meta.dirname` may refer to a source directory in development but a different or nonexistent layout in a packaged executable.
4. Chunk relocation can break workers, templates, native binaries, schemas, or files resolved relative to module location.
5. A final launcher that imports the application/framework before handling `--version` or root help forfeits the largest trivial-path win.
6. Generated chunks can be missing from `files`/packaging rules or stale chunks can survive incremental builds.

Clinkr should teach and test ways to detect these failures, but must not promise to prevent them for arbitrary bundlers.

## Prioritized recommendations

### P0 — preserve in the pending clean-cut implementation

1. **Do not collapse `metadata.ts` and `command.ts`.** Keep command implementation selected-only for execution, command help, schema introspection, and option-value completion; keep top/group help and command-name completion on metadata/group definitions. Do not reintroduce an eager aggregate command barrel.

2. **Keep one filesystem adapter over one immutable app/builder runtime.** Do not add a generated manifest or a second dispatch path in response to bundler concerns. The settled builder escape hatch is the correct answer for environments that cannot preserve runtime filesystem discovery.

3. **Keep optional facilities behind explicit subpaths or selected branches.** Preserve core/stream isolation and scrutinize future completion, interaction, diagnostics, telemetry, schema, and host-integration dependencies for accidental root-entry imports. Prefer capability-specific subpaths when a facility is not needed by ordinary dispatch.

4. **Avoid hidden top-level work.** `metadata.ts`, `group.ts`, Clinkr root entrypoints, and app bootstrap should not read config, discover repositories, initialize telemetry/error reporting, construct clients, or load display packages. Those operations belong after route selection or in explicit application preparation.

5. **Treat module-relative resources as a first-class review item.** During the migration, inventory `import.meta.dirname`, `import.meta.url`, worker paths, file reads, templates, native modules, and spawned scripts in representative CLIs. This is not a request to change the settled filesystem model; it is a packaging correctness audit prompted by Vercel's concrete rollback.

### P1 — add architecture guardrails and measurement before graduation

6. **Clarify the public performance claim.** Amend “Fast by default” to distinguish:
   - Clinkr guarantee: unselected command modules are not imported/evaluated by its runtime;
   - application responsibility: preserve modules/files or configure real code splitting;
   - launcher responsibility: bypass normal bootstrap for any desired exact fast paths;
   - packaging responsibility: ship all command files/chunks/assets.

7. **Add a representative compiled-and-packed consumer smoke.** The graduation evidence should install the packed `@nseng-ai/clinkr` into a small Node 24 ESM fixture, compile/package a filesystem CLI, and verify at minimum:
   - root help and command-name completion do not evaluate command implementation;
   - selected command help/schema imports only that command definition;
   - execution works from the installed/compiled location, not the source checkout;
   - required nested command files and any fixture asset are present;
   - all five public Clinkr entrypoints resolve from the tarball.

   If the chosen fixture intentionally does not bundle, say so. Add a separate bundler fixture only when ns selects a supported executable build architecture.

8. **Measure representative paths with a reproducible harness.** Record distributions (not one timing) for cold/warm exact root help, version when configured, shallow command help, deep command help, command-name completion, option completion, and execution across a wide/deep synthetic tree. Measure module-evaluation markers and loaded-file/artifact bytes where practical, not only wall-clock time. Establish baselines before setting budgets.

9. **Add import-graph guards at the seam.** Extend the existing scanner pattern to reject obvious static imports of command implementation from metadata/group/app-bootstrap files and eager aggregate barrels. Keep the rule narrow and explain that it guards source architecture only.

10. **Inspect publish output deterministically.** `pack:local`/`publish:dry-run` already prepare a clean `dist/publish`; graduation should inspect the produced tarball for exports, command hierarchy, and unexpected omissions. If future executable builds use hashed chunks, clean output before build and validate that only current referenced chunks are packed, following Vercel's `rmSync(dist)` guard.

### P2 — application guidance, after the framework contract lands

11. **Publish a final-executable architecture note.** Show two supported patterns without pretending they are equivalent:

- preserved ESM/file hierarchy: Clinkr runtime imports selected files directly;
- bundled executable: application configures multiple entries/chunks or uses programmatic builders when filesystem discovery cannot survive.

12. **Recommend launcher fast paths only where semantics are truly independent.** A tiny executable shim may handle exact `--version` and root `--help` before importing an application, but this belongs to an application template/build package, not core Clinkr routing. The launcher must keep its own imports schema/config/theme-free and must have parity tests against normal app metadata.

13. **Move deterministic expensive preparation to an application build only with wiring checks.** If future Clinkr consumers precompile large schemas, completion data, or templates, require the build to assert the generated artifact is actually used. Do not add production codegen to Clinkr's settled filesystem contract merely because Vercel benefited from precompiled Ajv.

14. **Choose split priority from evidence, not one chunk per command.** Vercel found that splitting every command reduced benefits for important paths. If an ns executable bundles, use telemetry/benchmarks and unique heavy dependency graphs to choose entries; Clinkr should expose clean boundaries, not prescribe a universal chunk count.

## Recommended graduation gate additions

The Clinkr Objective should not graduate on source tests and prose alone. Add the following evidence to the existing reconciliation and promotion gate:

1. **Runtime laziness evidence:** focused tests prove eager metadata/group behavior and selected-only command behavior recursively, including deep groups, help, JSON Schema, and both completion modes.
2. **Boundary-guard evidence:** root/non-display import guards pass; command metadata/group/app-bootstrap do not statically reach selected implementation or known heavy optional subpaths.
3. **Packed-package evidence:** `pack:local` or equivalent clean publish-root preparation is inspected, and a fresh consumer runs against the packed tarball.
4. **Filesystem integrity evidence:** nested command pairs/group files survive compilation/packing at the expected runtime location; an incomplete or relocated structure fails with actionable diagnostics.
5. **Resource-locality evidence:** representative worker/file/template/module-relative paths are exercised from built output where Clinkr's migration touches them.
6. **Measurement evidence:** a checked-in or reproducibly described harness records baseline distributions for root and selected paths. Graduation need not invent a universal millisecond SLA, but it must avoid an unevidenced “fast” claim.
7. **Documentation boundary:** the promoted README states that Clinkr controls runtime selection, while the final application controls bundling, launcher fast paths, chunk/asset publication, and executable startup budgets.
8. **No architectural backslide:** no compatibility dispatcher, generated manifest fallback, production filesystem codegen, or eager command barrel is introduced to satisfy packaging tests.

## Decision summary

Vercel's main lesson is not “use dynamic imports everywhere.” It is to design and verify the entire chain:

```text
launcher decision
  → framework/bootstrap import graph
  → command selection boundary
  → emitted entry/chunk topology
  → packaged modules and resources
  → built-artifact tests and measurements
```

Clinkr should own the middle of that chain exceptionally well: explicit cheap discovery modules, selected-only definitions, one immutable runtime, capability subpaths, and testable import boundaries. Application build/launcher packages should own the outer layers. Getting ahead architecturally means making that division explicit now and graduating only with source, packed-package, and representative executable evidence—not claiming that a framework-level `import()` can dictate an arbitrary downstream bundler's output.

## Primary source index

### Vercel

- `packages/cli/src/vc.js` — current launcher and exact fast paths
- `packages/cli/scripts/build.mjs` — current entries, splitting, cleanup, relocation, resource placement, and source guard
- `packages/cli/src/index.ts` — current priority/bulk/optional-path imports
- `packages/cli/src/util/get-sentry.ts` — error-only Sentry imports
- `packages/cli/src/util/projects/detect-entrypoint.ts` — runtime-family imports
- `packages/cli/scripts/precompile-config-validator.mjs` — build-time Ajv compilation and wiring assertion
- `utils/build.mjs` — `getDependencies()` and esbuild defaults
- Commits: `625568e659fbcf8cf6870a5defdf63653a0031f7`, `1a5bd6c5b9f579bb339264fc411a2a7cb2c5fcb1`, `c98073c7bdc0e2a0a8f19e6ae725de0bce34903b`, `e959b591ba52a271338b9d70d5d14c8f37702831`, `3311a80576a939c63b31c07d7d5cd5b186a1a5fe`, `5f6d4dc7906b36d1c10212312becfdbcf953ca87`, `322ae8d9b0a8f1f01f4b61c32cdc74aa8cda8c52`, `a04d34dccb8516027eceb58657e3874284a85507`, `78c127c573662f358c5a1080d46db5a66641142e`, `fbffcb3a5d71787fe83d3f463ad2bc192c319903`, `1cf8b2267f896c6b7df0126f2c630048aeb62c26`, `b789421290de86ba5ae046e6748295dd516e9b04`, `6e297457aaf615cf98ef19bd522e19230dc28d37`

### Clinkr/ns

- `.ns/objectives/clinkr-readme-driven-development/objective.md`
- `.ns/objectives/clinkr-readme-driven-development/roadmap.md`
- `.ns/objectives/clinkr-readme-driven-development/references/README-draft.md`
- `.ns/objectives/clinkr-readme-driven-development/references/decision-record.md`
- `.ns/objectives/clinkr-readme-driven-development/references/contract-audit.md`
- `ts/packages/public/infra/clinkr/src/filesystem.ts`
- `ts/packages/public/infra/clinkr/src/runtime.ts`
- `ts/packages/public/infra/clinkr/src/index.ts`
- `ts/packages/public/infra/clinkr/test/filesystem.test.ts`
- `ts/packages/public/infra/clinkr/test/integration/core-import-isolation.test.ts`
- `ts/packages/public/infra/clinkr/package.json`
- `ts/packages/internal/dev/ns-dev/src/public-packages/package-set.ts`
- `ts/packages/README.md`
