# Clinkr Steelthread Implementation Lessons

**Evidence window:** `e0b2d4b08` (`clinkr-immutable-app-builder-runtime`) through `2830c0e4f` (`colocate-objectives-cli-remove-operations`), compared with the contract base `b1d3c9a74`.

## Purpose

The steelthread proved that the filesystem-oriented authoring result is worth keeping. It also accumulated transitional machinery across Clinkr, Foundation, the SDK, and consumers. This document records implementation lessons for a clean rebuild so that the prototype's accidental architecture is not reproduced.

These are rebuild constraints, not requirements to preserve prototype code. The durable assets are the current README contract candidate, the detailed implementation notes, behavior evidence, consumer scenarios, and failure cases. Reuse implementation only when it directly fits the rebuilt module.

## What the steelthread proved

### The filesystem interface has leverage

The Objectives and Brmem migrations showed that a direct `src/cli/` tree makes command ownership and nesting easy to inspect. Command identity comes from paths, cheap metadata is separate from selected implementation, and domain operations can remain outside framework topology. Real-host Objectives coverage demonstrated hidden `exec` groups, Markdown output, schema introspection, completion, and selected-only command loading. Brmem demonstrated a standalone binary, a hidden command group, fake-driven scenarios, and package inventory checks.

### Outcome schemas expose caller mistakes early

The four-status schema model caught real Flow mismatches rather than merely satisfying types. It forced commands to say whether negative, failure, and usage outcomes are bodyless or data-bearing. Preserving those violations as programmer errors produced actionable repairs and improved the command contract.

### Selected-load caching semantics are valuable

The lazy-node prototype established useful semantics: concurrent loads share in-flight work, successful loads cache for the app lifetime, failed loads clear and remain retryable, and ownership/provenance mistakes fail loudly. Preserve these observable properties, although not necessarily the prototype classes that implemented them.

### Real-host and consumer tests find contract gaps unit fixtures miss

The most useful discoveries came from Flow, Brmem, and Objectives integration rather than isolated Clinkr fixtures: escaped string output, incomplete status schemas, framework usage-error alternatives, packaging requirements, host context adaptation, and selected-route behavior. The rebuild should reach one standalone consumer and one SDK-mounted consumer before broad migration.

## Failures and root causes

### 1. The prototype layered a new model over the old runtime

The immutable app and builders ultimately materialized a `LegacyClinkrGroup` for every run. The package exported the old mutable group as `ClinkrGroup`, exported the new immutable group under another name, and exposed `importLegacyClinkrGroupForMigration`. This created two public models and made the new runtime an orchestration layer over the old dispatcher rather than a replacement.

The migration bridge also leaked semantics: mounting any legacy group disabled root outcome validation, so an unrelated shell or completion group could weaken native command validation.

**Root cause:** implementation began by adding the desired abstractions without first deleting or isolating the old execution owner. Migration convenience became architecture.

**Rebuild rule:** there is one command model and one execution runtime. No public `Legacy*` model, migration import, compatibility lowering, or validation flag based on neighboring route provenance. If a temporary adapter is unavoidable during development, keep it branch-local and delete it before the first consumer migration is accepted.

### 2. Filesystem discovery was not recursively lazy

The prototype's `addDirectoryRoute()` called a descendant-inclusion probe for every group. That probe recursively inspected the whole subtree and imported descendant `group.ts` and `metadata.ts` modules even when no include predicate was supplied. Flat sibling tests passed while nested app creation violated the contract's immediate-child laziness.

**Root cause:** filtering, validation, and mounting were combined in recursive traversal. Determining whether a group had included descendants required a second eager walk because the host represented selection as a leaf predicate rather than a topology operation.

**Rebuild rule:** model a directory as a lazy scope. Opening a scope may read and import only its immediate children. Descendant traversal occurs only when that group is selected, or in a separately named exhaustive inspection operation. Filtering/composition must operate on topology without forcing descendants. Add import-counter tests at depths one through five for app creation, parent help, group help, command help, schema introspection, name completion, option completion, and execution.

### 3. SDK selection and Clinkr execution remained separate routing passes

The SDK loaded a catalog, built a selection app, called `selectRoute()`, classified diagnostics, then allowed Foundation to build a second app and run it. Filesystem structures were first recursively inspected into flat command candidates and later traversed again when mounted. Completion retained another host-specific resolver path.

**Root cause:** diagnostics and extension precedence were modeled around a flattened command catalog before Clinkr owned lazy route selection. The steelthread added Clinkr selection without removing the catalog's selection responsibility.

**Rebuild rule:** one traversal owns selection for execution, help, schema, and completion. Extension diagnostics and selected-command loading attach to nodes in that traversal. Do not build a throwaway app to discover what a second app will execute. Do not flatten a tree into leaves and reconstruct its groups. Test mixed-source topology and precedence at shared ancestors.

### 4. Context-free typing was documentation rather than implementation

The prototype retained an underlying `(context, request)` handler and wrapped filesystem definitions without changing the arity. A context-free one-argument handler therefore received `undefined` as its request; fixtures had to write `(_context, request)` despite the README promising `handler(request)`.

**Root cause:** `void` was treated as a value in a homogeneous generic rather than as a distinct public call shape.

**Rebuild rule:** design context-free and contextful command definitions as honest overloads or discriminated types, and test runtime argument order as well as inference. Every README example must compile in a fixture and run through the public app interface unchanged before blessing.

### 5. Descriptor validation was postponed and reconstructed with duck typing

The SDK descriptor boundary admitted `schema`, `handler`, and completion fields as `unknown`, validated only names plus the presence of `run` or `handler`, and later guessed whether a command was legacy rendered, native, or raw. A non-Zod schema with a handler could enter the native path.

**Root cause:** one broad compatibility shape attempted to carry several generations of command definitions through the registry.

**Rebuild rule:** decode external extension modules once into a discriminated, project-owned union. Each variant has exact runtime validation and a typed loader. Downstream routing switches exhaustively on the decoded variant; it does not infer variants from incidental field presence. Remove legacy variants rather than broadening the new descriptor.

### 6. Outcome validation and rendering had more than one owner

Although Clinkr gained four-status validation and command-level renderers, legacy imports could disable validation, SDK adaptation still performed special rendering/validation work, and `ok`/`negative` continued to carry per-exit human/Markdown overrides that `emitExit()` preferred over command renderers.

**Root cause:** migration was sequenced by adding the new policy before all old policy owners were removed. Compatibility fields made partial migrations pass.

**Rebuild rule:** the selected command definition is the sole owner of outcome schemas and renderers; Clinkr is the sole runtime validator and format dispatcher. Outcome values contain status, message/error identity, and typed data only. There is no per-exit presentation field, SDK render synthesis, or global switch that disables validation. Port callers by changing their data shapes before exposing the rebuilt runtime.

### 7. Raw execution remained a hybrid abstraction

The intended raw seam gives the selected command its argv tail, output bytes, and exit status. The SDK's raw command still returned a structured exit that the host rendered through Clinkr. The filesystem code exposed a raw definition type but provenance marking was owned by `defineCommand()`, whose public typing described rendered definitions; the authoring path was internally contradictory.

**Root cause:** raw behavior was retained as a branded special case inside the structured command model.

**Rebuild rule:** raw is one explicit variant with one constructor. It owns argv, I/O, and numeric status and cannot declare structured outcome schemas or command renderers. Metadata and routing remain shared. A raw definition must be constructible through the same documented filesystem module shape and exhaustively tested.

### 8. Completion ownership was split

`ClinkrApp.complete()` supported programmatic completion and provider-error observation, but enabling completion did not install the README-promised visible shell-script command and hidden resolver. ns continued to mount legacy completion groups and intercept resolver invocations in host preparation.

**Root cause:** completion calculation, shell installation surface, and host transport were treated as one feature in documentation but implemented in separate generations and layers.

**Rebuild rule:** decide the ownership before coding. If app completion configuration promises CLI commands, the app installs and routes them through the same tree. If hosts own transport, the README says so and Clinkr exposes only a planner/renderer interface. Do not intercept completion with an independent pre-dispatch path.

### 9. Filesystem topology was traversed and imported repeatedly

The SDK recursively inspected command structures into candidates, mounted selected structures by traversing again, and the Clinkr include probe recursively inspected groups before mounting them. A single invocation could evaluate the same metadata multiple times before real dispatch.

**Root cause:** inspection returned a flat snapshot while mounting required topology; no immutable topology representation was shared through composition.

**Rebuild rule:** discovery produces one topology object per app construction, with lazy child scopes and cached eager metadata. Inspection, help, selection, and host composition consume that object rather than independently walking the filesystem. Keep invocation context out of topology so Foundation can still create fresh apps without reauthoring command identity.

### 10. Migration breadth hid unfinished clean-cut work

The stack reached hundreds of files before the foundational seams were closed. Later consumer branches had to preserve temporary types, compatibility renderers, old harnesses, and validation exceptions. Tests sometimes asserted transitional behavior, making deletion harder.

**Root cause:** the first steelthread attempted core runtime, Foundation, SDK, multiple consumers, and broad caller migration in one continuously stacked effort.

**Rebuild rule:** use a narrower vertical sequence:

1. compile and run fixtures for the README contract candidate;
2. build the single runtime and recursive filesystem topology;
3. migrate one standalone consumer such as Brmem;
4. solve SDK topology and diagnostics without pre-routing;
5. migrate Objectives as the real-host acceptance consumer;
6. migrate remaining callers only after all temporary seams are gone.

Each stage ends with a deletion check: no obsolete owner, adapter, type, or test remains below the next stage.

### 11. Prototype builder machinery exceeded the proven public need

Builders helped stage the prototype and support Foundation composition, but they substantially enlarged the public interface: builders, immutable nodes, provenance, imports, definition lifecycle, and ownership semantics all became caller-visible concepts despite the README teaching filesystem authoring.

**Root cause:** an implementation seam was promoted wholesale before its caller-facing shape was proven.

**Rebuild rule:** the README now commits to a public advanced builder interface for programmatic topology, extension mounting, custom loading, framework integration, and packaging environments that cannot preserve command directories. Apply the deletion test and independent contract tests to its exact shape: expose only what those use cases require, keep node constructors private, and do not preserve prototype lifecycle machinery by default.

### 12. Metadata semantics need validation at the earliest useful point

The prototype rejected unknown fields and wrong primitive types but accepted empty descriptions, empty aliases, duplicate aliases, and some conflicts until runtime materialization. Registry fallback behavior could turn an empty summary into poor catalog presentation.

**Root cause:** structural decoding and semantic topology validation were split across filesystem, runtime builder, and SDK registry layers.

**Rebuild rule:** validate each fact at the layer that owns it: module shape and field values during immediate discovery; sibling names, aliases, and reserved names when a scope opens; selected command definition and schemas when it loads; handler outcomes after execution. Errors identify the file and canonical command path.

## Testing doctrine for the rebuild

### Preserve behavior evidence, not prototype internals

Port tests that establish public behavior:

- exact filesystem shape and malformed-pair rejection;
- recursive import laziness at multiple depths;
- selected help, schema, completion, and execution loading;
- load sharing, success caching, and retry after failure;
- all four outcome branches in human, Markdown, and JSON formats;
- framework-owned and command-owned usage-error schemas;
- exception and invalid-outcome propagation;
- raw argv/I/O/status ownership;
- explicit aliases and hidden groups;
- package/tarball inventory;
- one standalone CLI and one real SDK host.

Delete or rewrite tests whose subject is a migration import, legacy group execution, duplicate pre-selection, per-exit rendering, or compatibility descriptor detection.

### Make forbidden architecture mechanically visible

Add focused structural guards where behavior tests are insufficient:

- no `LegacyClinkrGroup` or migration import in Clinkr's public source;
- no SDK call to a route-selection pass before execution;
- no per-exit `human`/`markdown` fields;
- no broad descriptor fields typed as `unknown` after boundary decoding;
- no command implementation imports from metadata/group modules;
- no recursive filesystem inspection during app creation or parent help;
- no ability for mounted siblings to disable selected-command validation.

### Test examples as product surface

Every TypeScript example in the README contract candidate should have a compile fixture before blessing. The primary one-command example should execute unchanged. This would have caught the context-free handler mismatch before consumer migration.

## Review checklist for each rebuild slice

Before accepting a slice, ask:

1. Is there exactly one owner of routing, validation, rendering, and completion behavior touched here?
2. Did this add a temporary seam, and if so is it deleted in the same slice?
3. Does opening a scope touch only immediate children?
4. Can an unrelated mounted route alter the selected command's semantics?
5. Are external values decoded once into an honest union?
6. Does the public interface expose implementation lifecycle that callers do not need?
7. Do tests cross the public interface and include a real consumer?
8. Can every README example compile and behave as written?
9. Are packaging assumptions verified against packed output rather than only the source tree?
10. Is the abstraction replacing complexity, or merely layering over it?

## Final instruction to implementation sessions

Do not clean up the prototype in place by default. Start from the refreshed Objective, the README contract candidate, and `implementation-contract-notes.md`. Consult prototype commits for evidence and tests, then implement the smallest single-runtime design that satisfies the contract. If a prototype abstraction conflicts with these lessons, the prototype loses.
