# Recreate the SDK framework deletion on current `master`

## Goal and outcome

Reimplement the intent of the obsolete `sdk-framework-deletion` branch on top of the current codebase without rebasing or replaying its conflict-heavy history.

The end state should:

- preserve the current user-visible `ns` command surface, help, completion, schemas, extension loading, and extension lifecycle behavior;
- make the current Clinkr filesystem topology and traversal the sole SDK/host routing mechanism;
- migrate first-party command owners to colocated filesystem command modules;
- remove the superseded SDK registry/descriptor routing framework, its testing adapter, obsolete command wrappers, and tests whose only subject is the deleted architecture;
- update public documentation and domain context to describe the surviving filesystem-first architecture; and
- leave no compatibility bridge, parallel router, or stale legacy terminology behind.

This is a semantic fresh-master reimplementation, not a rebase and not a literal replay. Commit `47d620ea812eeeee5beee29d40ba91fb4f80fcda` (`Delete superseded SDK framework code and tests`) is the deletion manifest and evidence cache. Its three ancestors are implementation evidence only; do not reproduce their commits or blindly transplant their diffs.

## Context and discovered facts

- Planning was performed on clean `master` at `ba9736858`; `origin/master` matched it. Revalidate both at implementation start.
- The old `sdk-framework-deletion` branch is at `47d620ea8`, based on old merge-base `50831c025`, and contains four commits:
  1. `a01d2536c` — Clinkr scope-local topology work (equivalent work has since landed on current `master` as `ba9736858`);
  2. `a4f048d25` — SDK host/filesystem composition and broad caller cutover;
  3. `0f062d710` — temporary filesystem-layout port preserving old files as `.legacy.ts`;
  4. `47d620ea8` — deletion of those superseded files.
- The old branch has roughly 420 net changed files versus current `master`, including unrelated historical drift. It is therefore unsafe as a patch source.
- Of the 61 paths deleted by `47d620ea8`, 43 production paths still exist on current `master`. The absent 18 are temporary `.legacy.ts` files that existed only inside the old stack and must not be recreated.
- Current live legacy SDK owners include:
  - `ts/packages/public/sdk/src/extensions/registry.ts`
  - `ts/packages/public/sdk/src/extensions/command-registry.ts`
  - `ts/packages/public/sdk/src/extensions/descriptor-catalog.ts`
  - `ts/packages/public/sdk/src/extensions/descriptor-traversal.ts`
  - `ts/packages/public/sdk/src/extensions/zod-issue-path.ts`
  - `ts/packages/public/sdk/src/cli/completion.ts`
  - `ts/packages/public/sdk/src/testing/ns-cli-extension-registry.ts`
- `ts/packages/public/sdk/src/cli/index.ts` still imports and exports registry/catalog types and performs host routing through them. `ts/packages/public/sdk/src/testing/index.ts` still exports `createTestNsCliExtensionRegistry`.
- Current tests directly coupled to those owners include SDK registry/loader/completion scenarios and units, the `ns` init/harness command-contract tests, and the Skill Exposure CLI scenario.
- The old cutover demonstrated replacement modules named `source-inventory.ts`, `source-dev-sources.ts`, and `sdk/clinkr-command-adapter.ts`, plus filesystem `src/ns/cli/**/{group,command,metadata}.ts` trees. These names and details are reference evidence, not mandatory architecture; current Clinkr contracts win.
- The active `clinkr-readme-driven-development` Objective directly governs this work. Its `objective.md`, `roadmap.md`, `references/implementation-contract-notes.md`, `references/steelthread-implementation-lessons.md`, and `references/legacy-api-deletion-inventory.md` are authoritative. In particular:
  - one topology/traversal must own execution, help, schema, and completion;
  - source topology must remain recursive until mount rather than being flattened and reconstructed;
  - sources own disjoint subtrees, with canonical-path/two-source diagnostics for every collision, including shared group paths;
  - opening a scope may inspect only immediate children;
  - selected loads are transactional, cached after success, and retryable after failure;
  - external extension modules are decoded once into an exact project-owned union;
  - there must be no SDK pre-dispatch, source precedence router, permissive descriptor detection, or SDK-owned outcome/render synthesis;
  - Objectives is the real-host acceptance consumer; and
  - legacy deletion follows remaining-caller migration.
- The repository is private and unreleased, but this plan explicitly preserves today’s behavior rather than intentionally deleting command capabilities.
- Active repo orientations must remain in force, especially provider-neutrality and fake-driven test boundaries. This work must not add ambient Graphite dependencies or real external I/O to shared-cache tests.

## Files, symbols, tests, and docs

The exact changed-file list must be derived from current imports and behavior, but the expected ownership groups are:

### SDK host and source composition

- `ts/packages/public/sdk/src/cli/index.ts`
  - replace registry-based catalog selection, completion interception, and selected-command dispatch with one contextful `ClinkrApp` composition;
  - retain `runCli` and required host embedding surfaces only in their modern form.
- `ts/packages/public/sdk/src/cli/context.ts` and `src/cli/shell.ts`
  - adapt invocation context and retained shell/raw behavior without a second router.
- `ts/packages/public/sdk/src/extensions/{loader,module-reference,declared-descriptors,user-extension-layer,built-in-extension-commands,help-presentation,point-catalog}.ts`
  - narrow each module to acquisition, exact decoding, topology/source construction, point metadata, or presentation facts; remove registry-shaped responsibilities.
- Add or adapt current-tree equivalents of:
  - a recursive source-inventory owner;
  - source-development filesystem sources; and
  - the minimal SDK-command-to-Clinkr definition adapter, if current command contracts still need one.
- `ts/packages/public/sdk/src/sdk/{command,descriptor,execution,index,result,runtime-exports}.ts`
  - remove descriptor/command fields and exports that existed only for the old registry;
  - retain the smallest public author contract required by filesystem-loaded extensions.
- `ts/packages/public/sdk/package.json` and `tsconfig.json`
  - keep exports/subpackages/internal workspace exports accurate and remove obsolete testing or framework surfaces.

### Product host

- `ts/packages/public/ns/src/cli/index.ts`
- `ts/packages/public/ns/src/init/**`
- `ts/packages/public/ns/src/harness-artifacts/**`
- `ts/packages/public/ns/src/sdk/{cli,sdk}.ts`

Move built-in `init`, `extension`, `skills`, and `update` routes into filesystem command trees while preserving their command paths, built-in help classification, lifecycle behavior, and injected dependencies. Delete `ts/packages/public/ns/src/init/ns/preinstalled-command-catalog.ts` once all routes are sourced directly.

### First-party extension command owners

Expected migration scope, based on the old branch and current legacy paths:

- `ts/packages/incubating/extensions/objectives/src/**`
- `ts/packages/incubating/extensions/branch-context/src/**`
- `ts/packages/incubating/extensions/flow/src/**`
- `ts/packages/incubating/extensions/handoffs/src/**`
- `ts/packages/incubating/extensions/herdr/src/**` (read its nested `AGENTS.md` before editing)
- `ts/packages/incubating/extensions/pr-feedback/src/**`
- `ts/packages/incubating/extensions/reviews/src/**`
- `ts/packages/incubating/extensions/skill-exposure/src/**`
- `ts/packages/incubating/extensions/slots/src/**`

For each owner, colocate cheap `metadata.ts`, selected `command.ts`, and complete `group.ts` modules under its package-owned `src/ns/cli/` hierarchy. Domain logic and gateways remain outside topology directories. Adapt existing command handlers instead of copying business logic. Remove old aggregate `ns-command.ts`, `src/ns/command.ts`, or `src/ns/commands/*.ts` wrappers only when they have no non-CLI owner.

Revalidate the consumer list with bounded searches before editing; add any current package that imports the retiring SDK registry/testing surfaces or still contributes only through a legacy descriptor command catalog.

### Deletion targets after migration

Delete the current-tree semantic equivalents of the final commit’s framework paths when their last production consumers are gone:

- SDK registry/catalog/traversal/Zod-path files listed above;
- SDK completion interception if app-owned completion fully replaces it;
- `src/testing/ns-cli-extension-registry.ts` and its exports;
- old first-party command wrappers listed by `git diff-tree -r --diff-filter=D 47d620ea8`;
- `ts/packages/public/ns/src/init/ns/preinstalled-command-catalog.ts`; and
- obsolete tests centered on registry internals or duplicate host routing.

Do **not** recreate temporary `.legacy.ts` files merely to delete them.

### Tests to preserve or rewrite around behavior

- SDK integration/scenario coverage for top-level and selected help, `--version`, `--runtime`, JSON schema, completion, malformed-neighbor isolation, source collisions, selected-only loading, user/project/source-development extension loading, and extension points.
- Objectives real-host acceptance: recursive hidden `objective exec`, context adaptation, Markdown/JSON behavior, malformed-neighbor isolation, collision diagnostics, and nested import laziness.
- `ns` built-in and lifecycle scenarios for `init`, `extension`, `skills`, and `update`.
- Representative scenarios for Flow, Handoffs, Reviews, PR Feedback, Slots, Branch Context, Herdr, and Skill Exposure.
- Structural tests proving no production import of deleted modules/symbols, no second route-selection pass, no command implementation import from metadata/group modules, and immediate-child-only discovery.
- Packed-package inventory and execution evidence that filesystem command directories and both command-pair files ship intact.

Delete tests only when their subject is the retired architecture. Port observable behavior assertions to the surviving public interface rather than weakening coverage.

### Documentation and domain language

Reconcile after implementation ground truth changes:

- `ts/packages/public/sdk/README.md`
- `ts/packages/public/sdk/docs/sdk-reference.md`
- `ts/packages/public/sdk/docs/writing-an-ns-extension.md`
- `ts/packages/public/sdk/CONTEXT.md`
- relevant package `CONTEXT.md` files where command-loading ownership or paths change
- `CONTEXT-MAP.md` if relationship descriptions become stale
- `ts/packages/public/sdk/package.json` export inventory
- the active Objective roadmap/update evidence

Keep “ns extension API” (`@nseng-ai/sdk`) distinct from extension package APIs. Remove registry, catalog precedence, and descriptor command-entry language only when the implementation no longer exposes those concepts.

## Implementation steps and landing batches

Use the fewest dependency-correct landing batches. Three batches are recommended because deletion cannot safely precede host composition or caller migration.

### 1. Rebuild SDK/host composition and prove Objectives

1. Revalidate current `master`, active orientations, Objective state, and the final-commit deletion manifest. Build a bounded inventory of all imports/exports and tests involving the legacy registry, descriptor command catalog, completion interception, and testing registry.
2. Read current Clinkr app/composition APIs and AST/type shapes before designing adapters. Do not assume the old branch’s source-inventory types still match current Clinkr.
3. Define one exact recursive source contribution model at the SDK boundary. Decode each extension module once; distinguish filesystem directory sources and justified programmatic sources explicitly. Keep source labels and diagnostics attached to recursive topology.
4. Compose built-in host commands and extension sources into one contextful `ClinkrApp`. Use one traversal for execution, help, schema, and completion. Remove SDK preselection and completion interception as soon as equivalent app behavior exists; do not leave a dual route behind within the batch.
5. Preserve source collision behavior as the current Objective specifies: disjoint source-owned subtrees, no priority override, no compatible shared-group merge, canonical conflicting path, and both source labels in diagnostics.
6. Port Objectives to `src/cli/objective/**` or the current canonical equivalent and make it the real-host acceptance consumer. Preserve hidden `exec`, context/gateway adaptation, machine contracts, import laziness, and malformed-neighbor isolation.
7. Rewrite SDK/Objectives tests around the public app/host seam. Add structural guards against flatten/reconstruct routing and eager descendant loading.
8. Update SDK docs/context only for architecture made true by this batch. Record Objective progress with concrete test and deletion evidence.

### 2. Migrate remaining command owners and product built-ins

1. Migrate `ns` product built-ins (`init`, `extension`, `skills`, `update`) and the remaining extension packages in dependency order.
2. For each command family:
   - create the filesystem group/metadata/command layout;
   - keep metadata/group modules cheap and side-effect-light;
   - adapt the existing handler/domain seam at the selected command edge;
   - preserve paths, hidden status, aliases, schemas, output formats, exit semantics, confirmation behavior, and help classification;
   - port scenario tests before deleting the old wrapper; and
   - remove obsolete package dependencies/exports immediately after the last importer moves.
3. Keep each package behaviorally independent. Do not centralize extension-specific policy in SDK or Clinkr to reduce migration work.
4. Verify package-level packed inventory for representative public/incubating packages before proceeding to global deletion.
5. Re-run the production-import inventory. This batch is complete only when no non-test consumer requires the retiring registry/catalog/testing framework.

### 3. Delete the superseded framework and qualify the clean cut

1. Use `47d620ea8` as the semantic deletion checklist, intersected with current files. Delete the legacy SDK owners, testing registry, product preinstalled command catalog, and old package command wrappers whose behavior is now covered through filesystem composition.
2. Remove exports, types, package dependencies, tsconfig references, lockfile residue, and documentation for deleted surfaces.
3. Delete obsolete registry-internal and duplicate-router tests; retain or rewrite every user-visible contract test.
4. Run final bounded stale-reference searches for deleted filenames and symbols, legacy catalog/registry vocabulary, old wrapper imports, and `createTestNsCliExtensionRegistry`.
5. Qualify packed SDK and representative consumer packages, including intact command directories and cold-process execution.
6. Update SDK README/reference/writing guide, SDK `CONTEXT.md`, affected package contexts, `CONTEXT-MAP.md`, and the Objective roadmap/update so docs describe implemented ground truth.
7. Compare the final net effect with `47d620ea8` by intent, not path count. Explain any retained final-commit path (still has a current owner) or additional deletion (newly obsolete current-master residue) in review evidence.

## Refactor execution strategy

This plan contains same-shape edits across far more than five files and mixes TypeScript, tests, package metadata, and prose. Use **`refactor-swarm`** for the package-local caller migrations, with non-overlapping ownership by package and a parent-owned integration sequence. Do not use opaque ad hoc `text.replace()` scripts for semantic command migrations.

For SDK public symbols and imports, first inspect the TypeScript AST and use an existing deterministic AST/codemod tool if the repository provides a suitable one; otherwise make precise reviewed edits. Filesystem command modules are semantic adapters, not a pure syntactic rename, so each package worker must read its handlers/tests rather than mass-generating unchecked code.

The integrating executor owns SDK composition, shared types, package exports, lockfile changes, Objective/docs synchronization, and the final stale-reference scan. Run bounded grep checks after every batch and a final repository-wide stale-symbol/terminology check.

## Validation guidance

Follow current repo policy and changed-file judgment; do not assume plain `just` covers specialized lanes.

At minimum:

- run focused package tests while iterating on SDK, Objectives, `ns`, and each migrated extension;
- run `just ts-deps-check`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just ts-test`;
- run `just ts-test-integration` for real loader/packaging/runtime boundaries;
- run `just ts-test-isolated` only for genuinely ambient tests and `just ts-test-sanity` for sanctioned real-adapter sanity coverage;
- run `just ts-test-typescript-style-guard` because this changes TypeScript architecture and test structure;
- run the Objective-required packed-package and cold-process checks;
- run `just` as the repository validation entrypoint; if dprint fails, use `just dprint-fix`, and use the TypeScript format/lint autofix commands rather than hand-formatting;
- verify CLI `-h`/`--help`, `--version`, and `--runtime` scenarios where those are part of each entrypoint contract; and
- use `git diff --check` plus bounded `rg` checks for deleted modules, symbols, legacy imports, `.legacy.ts`, and stale docs.

Shared-cache tests must remain fake-driven: no real Git/subprocess/network/sleeps, module-cache mutation, fake timers, process cwd/env mutation, global listeners, or singleton lifecycle in default/integration shared-cache lanes.

## Risks, assumptions, and open questions

### Risks

- **Old-branch gravity:** copying `a4f048d25` wholesale can reintroduce stale types, unrelated drift, or architecture superseded by current Clinkr. Mitigation: use it only for behavior/path evidence and implement against current contracts.
- **Accidental behavior loss:** deleting the registry before all sources are mounted can silently remove commands, help rows, completion, or extension lifecycle behavior. Mitigation: dependency-ordered batches and behavior tests before deletion.
- **Parallel routing:** retaining registry preselection beside `ClinkrApp` would defeat the Objective. Mitigation: structural guard plus deletion in the same SDK batch.
- **Eager loading:** recursive descriptor inventory can violate immediate-child laziness. Mitigation: depth-based import-counter tests for help, completion, schema, and execution.
- **Collision semantic drift:** old catalog precedence differs from the current Objective’s disjoint-subtree rule. Mitigation: treat the Objective as authoritative and test all shared-path collision classes.
- **Migration breadth:** many package-local edits increase integration conflict risk. Mitigation: refactor-swarm with package-exclusive ownership and parent-owned shared seams.
- **Documentation inversion:** updating context ahead of code would make prose aspirational. Mitigation: synchronize docs only after the corresponding implementation lands.

### Assumptions

- Current command behavior is preserved; this is not an intentional feature removal.
- `47d620ea8` is authoritative only for what obsolete code was intended to disappear, not for exact replacement implementation.
- Temporary `.legacy.ts` files are unnecessary on a fresh-master implementation.
- No compatibility bridge is required solely to make intermediate branches independently releasable; each landing batch should nevertheless be coherent and validated.
- Current Objective contracts supersede older SDK `CONTEXT.md` registry/catalog descriptions where they conflict, and context is updated with implementation.

### Open questions

No material product decision remains open. During implementation, a current path may prove to have a legitimate non-registry owner; retain it and document the reason rather than forcing exact path parity. Conversely, newly introduced current-master residue may be deleted when it is demonstrably obsolete and covered by surviving behavior tests.

## Review and remediation

Before each batch is accepted, review along both architecture and behavior axes:

1. Confirm one owner for routing, validation, rendering, and completion in the touched path.
2. Confirm no temporary adapter, compatibility descriptor, or duplicate router survives the batch that introduced its replacement.
3. Confirm scope opening touches only immediate children and selected loading remains transactional/retryable.
4. Confirm extension values are decoded once into an honest union and source topology is never flattened then reconstructed.
5. Compare command paths, hidden groups, aliases, help classifications, schemas, machine envelopes, exits, completion, and lifecycle effects against current-master behavior.
6. Confirm tests use public interfaces and preserve real-consumer evidence rather than testing migration internals.
7. Confirm package exports, dependencies, docs, context, and Objective records match code.
8. Inspect the final diff against both current `master` and the semantic deletion manifest from `47d620ea8`; explicitly disposition differences.

If review finds a lost behavior, restore it through the filesystem/App owner rather than reviving the old registry. If it finds a second routing or validation owner, stop and deepen the surviving seam before continuing deletion. Run format/lint autofixers, rerun the failed focused lane, then rerun the complete applicable validation matrix before declaring the plan implemented.
