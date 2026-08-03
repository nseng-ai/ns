# Implement Modern SDK/Clinkr Host Composition and Objectives Acceptance

## Goal and outcome

Implement the `clinkr-readme-driven-development` Objective row **“Rebuild SDK/host composition over the same topology and traversal, then prove Objectives as the real-host consumer.”**

The finished `ns` CLI must construct one contextful modern `ClinkrApp<NsExtensionApi>` and let that app own argv navigation, recursive scope opening, selected-definition loading, help, JSON Schema, completion, structured/raw dispatch, outcome validation, and rendering. The SDK remains the owner of extension descriptor discovery, source identity, source eligibility, execution-context construction, diagnostic presentation, and the `@nseng-ai/sdk` author surface. Objectives becomes the real-host filesystem consumer and must match or exceed the behavior proved by `origin/colocate-objectives-cli-remove-operations` without copying that branch’s rejected pre-routing/flattening architecture.

This is a clean break. Remove, rather than preserve, Catalog precedence, flattened command candidates, SDK route selection, reconstructed mutable groups, permissive command-shape probing, SDK-owned outcome/render adaptation, and completion interception. Do not add a compatibility bridge or a second public command model.

## Settled requirements

- **Landing scope:** modernize SDK host composition and prove Objectives. Change other descriptor contributors only where the public author-contract cut requires it to compile and keep the workspace valid. Broad behavior-driven migration of remaining standalone/Foundation callers remains the later Objective row.
- **Execution interface:** use only `ClinkrApp.run(argv, { context, ... })` and `ClinkrApp.complete(request, { context })`. Do not add route-addressed execution, direct-definition execution, `selectRoute()`, or public topology/loading methods.
- **Public descriptor command shape:** ordinary extensions contribute one absolute `commandDirectory`. Filesystem-first authoring is the sole ordinary public descriptor form. Programmatic composition remains host-internal for SDK-owned built-ins or a demonstrated non-filesystem host requirement; it is not a public legacy peer.
- **Command modules:** filesystem command modules return modern contextful Clinkr structured or raw definitions directly. Metadata/group modules carry topology and presentation metadata separately. The SDK must not probe command objects or adapt a neutral `run(ctx, argv)` object back into Clinkr.
- **Context:** `NsExtensionApi` is the invocation-wide app context. Each extension may adapt it at the selected command seam into an extension-owned context. Objectives keeps `createNsObjectiveContext(...)` at that edge.
- **Source ownership:** every source owns a disjoint subtree. There is no winner, fallback, override, compatible group merge, or source priority for command routes.
- **Collision behavior:** duplicate canonical routes are **scope-local fatal**. The conflicting route/scope is unavailable and its diagnostic names the canonical path and both source labels; unrelated routes remain usable. Known unrelated diagnostics are warnings.
- **Malformed-neighbor behavior:** an invalid source/scope must not brick an unrelated valid command. A selected definition/load failure is fatal; unrelated source failures are warnings. Preserve transactional publication within each source/scope—do not publish a source’s partial malformed scope.
- **Help presentation:** preserve `Extensions:` vs `Built-ins:` ordering and `p`/`l` acquisition-origin markers. Derive a marker only from the single non-conflicting owner; remove winner-derived/mixed-precedence semantics.
- **Completion:** use Clinkr’s app-owned visible `completion <shell>` and hidden resolver over the same topology/traversal. Delete SDK interception and the no-op resolver command.
- **Stack shape:** use three dependency-ordered review batches: foundational source/topology contract, atomic SDK runtime clean cut, then Objectives real-host acceptance and tracking.

## Context and discovered facts

### Objective authority

Read before implementation:

- `.ns/objectives/clinkr-readme-driven-development/objective.md`
- `.ns/objectives/clinkr-readme-driven-development/roadmap.md`
- `.ns/objectives/clinkr-readme-driven-development/references/implementation-contract-notes.md`
- `.ns/objectives/clinkr-readme-driven-development/references/steelthread-implementation-lessons.md`
- `.ns/objectives/clinkr-readme-driven-development/references/steelthread-contract-changes.md`
- `.ns/objectives/clinkr-readme-driven-development/references/legacy-api-deletion-inventory.md`
- Golden behavior only: remote branch `origin/colocate-objectives-cli-remove-operations`, especially commits `f19c64d72`, `f182405e3`, `d7a59c47a`, `027eb8ea4`, `9486b17be`, and `90372e128`.

The golden branch proved filesystem descriptor mounting, recursive hidden `objective exec`, context adaptation, selected-definition laziness, output parity, schema publication, completion, and malformed-neighbor isolation. It is not architecture to cherry-pick wholesale: its flattening, SDK selection pass, reconstructed groups, and repeated traversal are explicitly rejected.

### Current modern Clinkr

- `ts/packages/public/infra/clinkr/src/app/app.ts`
  - `createClinkrApp(...)` builds one private topology.
  - Contextful apps expose `run(argv, { context, ... })` and `complete(request, { context })`.
  - `TopologyClinkrApp.run()` already owns terminal routing, structured parsing, raw dispatch, outcomes, schemas, rendering, and completion routes.
  - There is deliberately no public route/direct-definition execution seam.
- `ts/packages/public/infra/clinkr/src/app/programmatic-source.ts`
  - `ClinkrComposition` supports labeled programmatic sources and filesystem sources.
  - Definition loaders return modern structured/raw definitions lazily.
- `ts/packages/public/infra/clinkr/src/app/topology.ts`
  - The private topology owns source opening, source labels, canonical paths, transactional caching, source ownership, and collision diagnostics.
  - Current collision/source-opening failure behavior throws for the opened scope; it must be deepened to retain healthy unrelated routes while poisoning only conflicting/unavailable routes.
- `ts/packages/public/infra/clinkr/src/app/filesystem-source.ts` and `selected-command.ts`
  - Filesystem discovery already separates cheap metadata/group modules from selected `command()` loading and performs exact decoding.
- `ts/packages/public/infra/foundation/src/cli-runtime/clinkr-app-cli.ts`
  - `defineClinkrAppCli(...)` is the durable modern package lifecycle and should replace the SDK’s legacy `defineCli` construction.

### Current SDK problems to delete

- `ts/packages/public/sdk/src/cli/index.ts`
  - `prepareRun` currently discovers, preselects, classifies, and loads before building a mutable `ClinkrGroup` tree.
  - `requestedCommandKey()`, `requestedGroupSegments()`, `groupForCommand()`, placeholder commands, passthrough commands, `resolveSelectedNsCommand()`, and completion interception are parallel routing/dispatch owners.
  - `buildNsCliContext(...)` already contains the useful invocation-context construction behavior; retain/deepen this, but stop wrapping it in `NsCliContext` solely for legacy Clinkr.
- `ts/packages/public/sdk/src/extensions/registry.ts`
  - Flattens descriptor trees into leaf candidates, orders `built-in < preinstalled < project`, overrides by slash key, reconstructs command/group collisions, and classifies errors by selected pre-route candidate.
- `ts/packages/public/sdk/src/extensions/command-registry.ts`
  - Owns flattened path types, permissive descriptor-command decoding, Zod-like probing, SDK validation of exits, and adaptation through `defineInternalParsedCommand`.
- `ts/packages/public/sdk/src/sdk/command.ts`
  - `defineCommand()` currently builds a temporary legacy `ClinkrGroup` for each selected command, captures its output, revalidates success data, and synthesizes render overrides.
- `ts/packages/public/sdk/src/sdk/descriptor.ts`
  - Public recursive `entries`/`hiddenExecGroup()` and command-loader types conflict with the filesystem-first final contract.
- `ts/packages/public/sdk/src/extensions/descriptor-catalog.ts`
  - Converts recursive descriptors into a flattened preinstalled command catalog.
- `ts/packages/public/sdk/src/cli/completion.ts`
  - Generates scripts targeting the SDK-intercepted resolver instead of letting the app own completion end to end.

### Current Objectives and required end state

Current Objectives still uses recursive descriptor entries and eager command objects under `src/ns/commands/`. The golden branch provides useful file-shape and test evidence, but adapt it to current master (which includes newer commands such as `staleness-check`) rather than copying it literally.

Target shape:

```text
ts/packages/incubating/extensions/objectives/src/
  cli/
    objective/
      group.ts
      check/{metadata.ts,command.ts}
      list/{metadata.ts,command.ts}
      show/{metadata.ts,command.ts}
      exec/
        group.ts
        <each hidden command>/{metadata.ts,command.ts}
  ns/
    extension.ts
    objective-command.ts
    context.ts
```

- `extension.ts` declares `commandDirectory` pointing at the route tree.
- Every command directory has exact `metadata()` plus async `command()` exports.
- `objective-command.ts` returns modern contextful Clinkr definitions and adapts `NsExtensionApi` to `ObjectiveCliContext` at selected load/invocation.
- Preserve specialized context factories for publication/runner commands without broadening `NsExtensionApi` or moving domain policy into SDK.
- Remove obsolete per-command package exports if no external consumer remains; update real importers rather than retaining migration subpaths for convenience.

## Target architecture

### 1. Source inventory, not a command catalog

Replace the flattened `NsCommandCatalog` with an SDK-owned **source inventory**. Each accepted source record should carry only facts the host owns and Clinkr needs:

- stable unique source label suitable for diagnostics;
- acquisition/source kind (`built-in`, distribution/preinstalled package, project npm package, project local path, source-development package as applicable);
- package identity and user-facing built-in/extension classification;
- absolute command directory for ordinary extension sources, or a host-internal programmatic configuration callback for SDK built-ins;
- optional eligibility metadata that can be decided at whole-source registration time;
- discovery diagnostics tied to that source.

Do not enumerate leaf command paths, infer group descriptions, compute selected candidates, or import command modules in this inventory. Extension package presence (`hasExtension`, installed package names) remains a registry/package fact independent of command-route conflict resolution.

The old per-command `requiresExtension` gate has no production callers outside SDK tests/docs. Remove it with recursive entries rather than inventing a filesystem sidecar for it. If a future extension needs conditional commands, require a separate concrete design; do not hide source filtering inside filesystem traversal.

### 2. Filesystem-first descriptor contract

Change `ExtensionDescriptor` so command contribution is optional `commandDirectory: string` plus non-command metadata (`description`, points, activation, bundled artifacts). Validate `commandDirectory` as absolute. Keep commandless descriptors valid for points/artifacts/activation.

`defineExtension()` remains a typed identity helper. Remove public `ExtensionEntry`, `ExtensionCommandEntry`, `ExtensionGroupEntry`, `RawArgvCommandLoad`, `RawArgvCommandModule`, `hiddenExecGroup()`, `group`, and `entries` after all compile-required callers are migrated in the atomic cut.

Recast the SDK command author helpers as modern definitions over `NsExtensionApi`:

- `defineCommand(...)` returns a modern contextful `ClinkrCommandDefinition<NsExtensionApi,...>` and no longer includes route identity (`name`, `summary`, `description`) in the selected definition; those belong in `metadata.ts`/`group.ts`.
- `defineRawCommand(...)` returns a modern contextful raw definition whose runner receives `{ context, argv }` and returns the raw numeric exit status. Ordinary finite commands continue to use structured outcomes.
- Re-export only curated modern Clinkr types/outcomes needed by extension authors. Keep the SDK author interface stable in vocabulary where truthful (`NsCommandSchema`, request inference, `NsExtensionApi`, outcome helpers), but delete legacy neutral-command and render-override contracts.
- Definition decoding remains exact and Clinkr-owned; the SDK does not use `.passthrough()`, symbol bridges, `safeParse` duck typing, or shape guesses.

### 3. Scope-local topology issues in Clinkr

Deepen the private topology rather than exposing it. Introduce an internal structured topology-issue model sufficient to represent:

- source scope open failure (source label, canonical scope path, cause);
- cross-source command/command, command/group, group/group, alias/name, alias/alias, default-command, and reserved-name conflicts;
- the poisoned canonical route or default selection;
- both source labels for collisions.

Opening a scope must collect each source transactionally. A failed source contributes no partial scope for that opening, while healthy sources still merge. When two healthy sources conflict, do not pick either; record an unavailable/poisoned route entry and continue publishing non-conflicting routes. A group/group collision poisons that group path rather than merging descendants.

The navigator/app must consume this issue-bearing opened scope in the same traversal:

- selecting a poisoned route/default emits the deterministic fatal diagnostic and exit 2;
- unrelated valid execution/help/schema/completion continues, with known unrelated issues reported as warnings on stderr;
- root/group help omits unavailable duplicate routes (or marks them unavailable if Clinkr has a clear existing presentation primitive) and reports the warning; it must never display an arbitrary winner;
- an unknown route while one or more source openings failed reports the relevant source failure rather than pretending discovery was complete;
- selected definition import/decoding failure remains fatal;
- completion returns healthy candidates only, preserves candidate-only stdout, and treats unrelated topology issues as diagnostics without loading unrelated definitions.

Keep topology types, issue aggregation, navigator, loaders, and caches private. If app configuration needs a diagnostic presentation callback, keep it narrow and app-level; do not expose source `open()`/`load()` or route selection to SDK. Prefer Clinkr-owned canonical diagnostic text where possible so every host gets the same collision contract.

### 4. One SDK app and one traversal

Rebuild `ts/packages/public/sdk/src/cli/index.ts` on `defineClinkrAppCli(...)`:

1. `prepareRun` loads descriptors/source inventory, computes package-presence facts, and creates the invocation-wide `NsExtensionApi`. It does not inspect argv to select a command or completion route.
2. `buildApp` calls `createClinkrApp<NsExtensionApi>({ name, requiresContext: true, version, runtimeInfo, completion: ... }, composition => ...)` once.
3. Mount every accepted extension descriptor as a separately labeled filesystem source. Register SDK-owned built-ins through host-internal programmatic sources using the same topology, not privileged post-routing handlers.
4. Call only `app.run(args, { context, readStdin, canEmitAnsi })`; direct programmatic completion tests use `app.complete(...)`.
5. Let Clinkr install and route completion scripts/resolution. Delete SDK argument interception, selected-command loaders, group reconstruction, placeholders, passthrough lowering, and legacy output emission.
6. Preserve existing stdout/stderr injection through Foundation’s guarded writer interception; do not introduce another process-global output seam.

`NsExtensionApi.outputFormat` is exceptional streaming context. Derive it without a separate route-selection pass (for example from Clinkr invocation format plumbing or a narrowly supplied invocation fact). Do not let it become a second format parser/dispatcher.

### 5. Help classification and origin labels

Carry SDK source presentation metadata into root command/group metadata without restoring flattening. Implement the smallest Clinkr composition metadata seam needed for a source’s top-level routes to receive:

- `Built-ins:` or `Extensions:` help group;
- deterministic help ordering (extensions first, custom groups if retained, built-ins last; package before local within Extensions);
- `p` for package-sourced project contributions and `l` for repo-local path contributions;
- no marker for distribution-supplied preinstalled entries;
- one marker from the route’s sole owner only.

Do not calculate “highest-precedence winning origin” or merge labels across owners. A cross-source shared top-level group is a collision, including the former built-in/preinstalled `extension` group merge; restructure SDK/distribution sources so one source owns each built-in subtree.

## Files and symbols to change

### Clinkr

- `ts/packages/public/infra/clinkr/src/app/topology.ts` — issue-bearing scope aggregation, poisoned routes/defaults, transactional per-source isolation, deterministic diagnostics.
- `ts/packages/public/infra/clinkr/src/app/navigator.ts` — navigate unavailable routes and carry relevant/unrelated topology issues in one traversal.
- `ts/packages/public/infra/clinkr/src/app/app.ts` — emit fatal vs warning topology diagnostics, keep `run`/`complete` as the only public execution interface.
- `ts/packages/public/infra/clinkr/src/app/completion.ts` — exclude poisoned routes and preserve provider/static fallback semantics.
- `ts/packages/public/infra/clinkr/src/app/programmatic-source.ts` and `filesystem-source.ts` — retain labels/provenance needed for issues and source-level transactional failure.
- `ts/packages/public/infra/clinkr/src/app/command-definition.ts` — only if a narrow source/top-level help presentation fact cannot be expressed by existing metadata.
- Tests: `test/topology.test.ts`, `test/app-composition.test.ts`, `test/app-navigation.test.ts`, `test/app-completion.test.ts`, and real-loader integration tests under `test/integration/`.

### SDK

- `ts/packages/public/sdk/src/sdk/descriptor.ts` and `sdk/index.ts` — filesystem descriptor, modern command exports, deletion of recursive-entry vocabulary.
- `ts/packages/public/sdk/src/sdk/command.ts` and `sdk/result.ts` — modern contextful definitions/outcomes; delete temporary nested Clinkr execution and render overrides.
- `ts/packages/public/sdk/src/extensions/registry.ts` — replace flat catalog/precedence with source inventory and package-presence facts.
- `ts/packages/public/sdk/src/extensions/descriptor-catalog.ts` — replace flat preinstalled entries with preinstalled source registrations, or delete if registration becomes trivial.
- `ts/packages/public/sdk/src/extensions/command-registry.ts`, `descriptor-traversal.ts`, `loader.ts`, and `module-reference.ts` — delete when no longer needed; retain only genuinely source/package-level logic.
- `ts/packages/public/sdk/src/extensions/built-in-extension-commands.ts` — modern definitions mounted through one SDK-owned programmatic subtree.
- `ts/packages/public/sdk/src/cli/index.ts`, `cli/context.ts`, and `cli/completion.ts` — modern Foundation lifecycle, one app, direct context, Clinkr completion.
- `ts/packages/public/sdk/src/testing/ns-cli-extension-registry.ts` and scenario fakes — replace candidate/selected-command fakes with source-inventory and app-boundary fixtures.
- `ts/packages/public/sdk/README.md`, `docs/writing-an-ns-extension.md`, `docs/sdk-reference.md`, and `CONTEXT.md` — remove precedence/override/recursive-entry/neutral-command claims and document filesystem sources, disjoint ownership, diagnostics, and one runtime.

### Distribution registration

- `ts/packages/public/ns/src/cli/preinstalled-command-catalog.ts`, `src/sdk/cli.ts`, and relevant descriptor registration/tests — register source descriptors/directories rather than flattened entries.
- `ts/packages/public/ns/src/init/ns/extension.ts` and `src/harness-artifacts/ns/extension.ts` — move to filesystem descriptor trees as compile-required author-contract consumers.
- `ts/packages/public/ns/test/preinstalled-command-catalog.test.ts` and host integration tests — assert source identities, built-in classification, disjoint ownership, and modern loading.

### Compile-required descriptor contributors

Inventory every `defineExtension()` production caller before editing. Current likely contributors include Flow, Reviews, Branch Context, PR Feedback, Handoffs, Slots, Skill Exposure, Herdr, Objectives, and `@nseng-ai/ns` init/harness-artifacts. Convert only what the removed author contract requires: route-local `metadata.ts`/`group.ts`/`command.ts`, absolute descriptor `commandDirectory`, and modern definitions. Preserve domain behavior and command-visible output; do not opportunistically redesign those extensions.

### Objectives

- `ts/packages/incubating/extensions/objectives/src/ns/extension.ts` — filesystem descriptor.
- `src/ns/objective-command.ts` and context factories — modern `NsExtensionApi` adaptation.
- Move/reshape `src/ns/commands/*` into `src/cli/objective/**`; include every current command, especially current-master additions absent from the old golden commit.
- `package.json` exports — remove obsolete command-module exports after importer inventory; keep `./api` and `./ns-extension` ownership intact.
- Tests under `test/unit`, `test/scenario`, `test/integration`, and `test/type`; add/port the real-host acceptance test under `ts/packages/public/ns/test/integration/objectives-command-host.test.ts`.
- Synchronize `ts/packages/incubating/extensions/objectives/CONTEXT.md` only after implemented ground truth changes.

## Three implementation batches

### Batch 1 — Foundational source/topology contract

1. Add Clinkr’s private structured topology issue/poisoned-route model and source-isolated opening.
2. Prove all collision classes are scope-local, declaration-order independent, and name both sources/path; prove a failed source does not publish partial state or block healthy sources.
3. Extend navigator/app/completion to classify selected issues as fatal and unrelated issues as warnings without exposing selection/topology publicly.
4. Define the SDK’s exact source-inventory types and tests around absolute command directories, stable labels, package-presence facts, built-in classification, and project source origins. This preparatory inventory must not become a second router or compatibility lowering path.
5. Add type/export tests proving no route-addressed/direct-definition execution or topology source API became public.

This batch is a foundational capability, not an independently promoted alternate runtime. Do not route production SDK execution through both old and new systems.

### Batch 2 — Atomic SDK author/runtime clean cut

1. Convert `ExtensionDescriptor` and SDK command helpers to the filesystem/modern-definition contract.
2. Migrate all compile-required descriptor contributors and distribution registrations in the same cut. Keep their domain behavior unchanged.
3. Rebuild `runCli` with `defineClinkrAppCli` and one `ClinkrApp<NsExtensionApi>`; mount labeled sources and SDK built-ins once.
4. Preserve help groups/order/origin markers from single source ownership.
5. Move completion entirely into Clinkr and remove SDK interception/no-op resolver.
6. Delete precedence, overrides, candidate flattening, route preselection, group reconstruction, permissive descriptor probing, nested per-command Clinkr execution, SDK outcome validation/render synthesis, placeholders, and obsolete exports/tests.
7. Update SDK and distribution docs/context to the implemented contract.
8. Run a stale-surface search for `extension_command_override`, `ORDERED_SOURCE_LEVELS`, `requestedCommandKey`, `groupForCommand`, `NsCommandCatalog`, `RawArgvCommand`, `hiddenExecGroup`, `ExtensionEntry`, `nsParsedCommandSpec`, `defineInternalParsedCommand`, legacy completion interception, and old descriptor `entries`.

### Batch 3 — Objectives real-host acceptance and Objective tracking

1. Complete Objectives’ route-local filesystem tree, preserving hidden recursive `objective exec`, all visible commands, command metadata, specialized contexts, renderers, and package behavior.
2. Port behavior—not prototype internals—from `origin/colocate-objectives-cli-remove-operations` and adapt it to current master.
3. Add real-host import-laziness instrumentation proving:
   - `ns --help`, `--version`, and `--runtime` load no Objective command definitions;
   - `ns objective --help` opens only required metadata/groups and hides `exec`;
   - selected help/schema/execution loads exactly the selected command definition;
   - nested `objective exec` definitions remain lazy;
   - route-name completion uses metadata only, while selected option/value completion loads only the selected definition.
4. Prove human/JSON/Markdown (`md`) behavior, framework usage and all outcome statuses, negative stdout/exit behavior, context adaptation, and no SDK render/validation owner.
5. Prove malformed-neighbor isolation and canonical two-source collision diagnostics through the real `ns` host.
6. Prove filesystem inventory/package exports and packed command-directory preservation where this slice changes package publication contents.
7. Write a new immutable Semantic Update under `.ns/objectives/clinkr-readme-driven-development/updates/` and update the roadmap row as landed-state tracking. Record the approved no-precedence/disjoint-source decision, one-app seam, Objectives evidence, and remaining broad-migration/legacy-deletion work. Do not edit existing updates.

## Refactor execution strategy

This plan contains same-shape edits across far more than five TypeScript/docs/test files, so use **`refactor-swarm` for the compile-required descriptor/command migration and the Objectives route-tree migration**. Partition work by owning package or coherent route subtree; do not have multiple workers edit SDK contract/runtime owners concurrently.

Before choosing automation, inspect the TypeScript AST for the actual descriptor and `defineCommand` shapes. If a repo-supported deterministic AST/codemod can safely perform a purely syntactic subset (for example removing route identity fields from uniform definitions), use it and review its diff. Do not use opaque ad hoc `text.replace()` scripts for semantic command/context/rendering changes. Make Clinkr topology, SDK runtime, docs, and Objective tracking edits through direct focused ownership.

After every migration wave, run bounded `rg` checks for old imports/types/descriptor fields and compare route inventories. Finish with a repository-wide stale-contract search before deleting old symbols.

## Validation guidance

Use changed-file judgment during each batch, but the final stack should include at least:

### Focused package checks

```sh
pnpm --dir ts --filter @nseng-ai/clinkr check
pnpm --dir ts --filter @nseng-ai/clinkr test
pnpm --dir ts --filter @nseng-ai/sdk check
pnpm --dir ts --filter @nseng-ai/sdk test
pnpm --dir ts --filter @nseng-ai/objectives check
pnpm --dir ts --filter @nseng-ai/objectives test
pnpm --dir ts --filter @nseng-ai/ns check
pnpm --dir ts --filter @nseng-ai/ns test
```

Also run package checks/tests for every compile-required descriptor contributor changed in Batch 2.

### Repository lanes

```sh
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-isolated
just ts-test-typescript-style-guard
just dprint-check
just ts-deps-check
ns objective check clinkr-readme-driven-development
just
```

Use `just ts-format-fix`, `just ts-lint-fix`, or `just dprint-fix` for formatter/autofix failures, then rerun checks. Keep real loader/import instrumentation in the integration lane and fake-driven topology/context behavior in default tests; do not introduce shared module-cache/process mutation outside the isolated lane.

### Behavioral acceptance matrix

- root/version/runtime do not load extension command definitions;
- help preserves categories/order/origin labels without precedence;
- one owner per subtree; collisions have no winner/fallback;
- unrelated healthy routes survive malformed sources and poisoned routes;
- selected failures are fatal, unrelated known issues warn on stderr;
- help/schema/completion/execution traverse one topology;
- completion stdout contains candidates only;
- structured outcomes/rendering/schema validation occur once in Clinkr;
- raw commands retain argv/bytes/exit ownership;
- `NsExtensionApi` context and extension-owned context adaptation remain truthful;
- packaged command directories are intact.

## Documentation and domain synchronization

Update documentation only with implemented ground truth:

- Rewrite SDK README/reference/author guide sections that currently promise precedence, recursive `entries`, `hiddenExecGroup`, neutral `RawArgvCommand`, Markdown token `markdown`, SDK completion interception, or SDK rendering/validation glue.
- Update `ts/packages/public/sdk/CONTEXT.md`: remove **Catalog precedence** and winner-derived origin language; describe disjoint command-source ownership, source inventory, selected definition loading through Clinkr, and the modern ns extension API.
- Update Objectives `CONTEXT.md` paths/command-face wording after the filesystem move, while preserving the distinction between the CLI surface, hidden `exec`, and extension package API.
- Keep `.ns/objectives/clinkr-readme-driven-development/references/README-draft.md` synchronized only where this implementation supplies or changes evidence; do not promote it to canonical README in this slice.
- ADRs are immutable. If the final implementation makes a hard-to-reverse, surprising trade-off not already covered by current ADRs/Objective records, add a new ADR rather than rewriting an old one; otherwise the Semantic Update is sufficient.

## Risks, assumptions, and open questions

### Risks

- **Scope-local isolation can accidentally weaken transactions.** Preserve all-or-nothing publication per source/scope while allowing other sources to survive.
- **Diagnostic routing can become another selector.** Classify issues inside Clinkr’s single navigator/app traversal; do not recreate SDK `requestedCommandKey()` under a new name.
- **Help metadata can reintroduce merging.** Source-level presentation decoration must not merge shared top-level groups or infer an effective winner.
- **Author-contract blast radius is broad.** Limit non-Objectives changes to mechanical contract compliance and behavior preservation; leave unrelated CLI redesign for later rows.
- **Output format context can duplicate parsing.** Keep `outputFormat` only for exceptional streaming and derive it from the one invocation owner.
- **Golden branch gravity.** Port acceptance scenarios and useful route-local organization, not its flat catalog, preselection, or transitional APIs.
- **Package exports can conceal real consumers.** Inventory package and repo importers before deleting Objective command subpaths or SDK symbols.

### Assumptions

- Breaking SDK author changes are allowed because ns is private/unreleased and this Objective explicitly requires a clean cut.
- No production command currently depends on per-command `requiresExtension`; repository search found only SDK docs/tests.
- `NsExtensionApi` remains homogeneous across the `ns` app; per-command extension contexts are adapters inside selected definitions.
- Programmatic composition is sufficient for the small SDK-owned built-in subtree; ordinary extension authors do not need a second descriptor form.
- No route/direct-definition execution seam is required; Objectives’ real-host acceptance is the deciding evidence.

### Open questions for implementation evidence, not preconditions

- Whether topology warnings should be rendered entirely by Clinkr or passed through one narrow app-level diagnostic presenter. Choose the smaller interface that preserves canonical path/source evidence and candidate-only completion stdout.
- Whether unavailable routes should be omitted or visibly marked in help. Default to omission plus warning unless an existing Clinkr presentation primitive supports an unambiguous unavailable row without widening metadata.
- Whether the old Objective per-command package exports have external consumers. Inventory first; remove if workspace/package evidence shows none, otherwise migrate the concrete consumer and document why any surviving export remains.

## Review and remediation

Before considering the plan implemented:

1. Review the final diff against the Objective prohibitions, not merely test parity. Explicitly search for a second selector, flattened leaf catalog, source precedence, group reconstruction, render/validation duplication, completion interception, permissive descriptor detection, or a compatibility bridge.
2. Compare the real-host Objectives acceptance matrix with `origin/colocate-objectives-cli-remove-operations`; explain any intentionally omitted golden behavior and ensure no accepted behavior regressed.
3. Review Clinkr interface depth: callers should learn one app constructor, `run`, and `complete`; source/topology complexity must remain private.
4. Review diagnostics with adversarial cases: collision declaration order reversed, malformed source before/after healthy source, failed source plus unknown route, nested group collision, alias collision, completion with failed provider/source, and retry after transient source failure.
5. Review every changed descriptor contributor for accidental domain/output changes. Remediate by restoring behavior in the owning package rather than broadening SDK/Clinkr contracts.
6. Review docs/context against exports and executable behavior. Remove stale promises rather than describing transitional compatibility.
7. Run the full validation set and retain exact failure evidence. If broad validation exposes unrelated failures, distinguish and report them; do not weaken this contract or add compatibility code to make unrelated stale tests pass.
8. Record meaningful Objective tracking only after implementation evidence exists. Leave the Objective open: remaining caller migration, legacy deletion/root cutover, packed qualification, README promotion, and parent gate feedback are separate roadmap work.
