# Clinkr Contract Decision Record

**Status:** Settled decisions for the README-driven-development audit, unless an item is explicitly marked open.

**Recorded:** 2026-07-26

## Purpose

This record preserves the decisions and tradeoffs behind the provisional Clinkr contract in `README-draft.md`. It is evidence for the later implementation and caller audit: a cold implementation session should not have to infer settled intent from current code or reopen decisions merely because they appear under the Objective's historical `Open Questions` heading.

The draft README remains the provisional user-facing contract. This file explains why that contract has its current shape, identifies accepted current behavior and confirmed mismatches, and distinguishes settled direction from genuinely open work.

## Product and process context

The repository is being prepared for public launch through a bottoms-up, README-driven audit of foundation packages. Each package first develops a coherent cold-audience contract, then reconciles its implementation, exports, tests, and representative callers to that contract before promoting the draft to the canonical package README.

Clinkr is the first package in this sequence because it is infrastructure with no internal workspace dependency that must be audited first. That makes it the dependency-order starting point and a useful dry run for calibrating the graduation gate before dependent packages repeat the process.

The cold external TypeScript adopter is the design and explanation lens. External adoption is not itself the product goal; the lens is used to make ns's CLI infrastructure coherent, explainable, and suitable for public release.

This Objective-only PR deliberately does not reconcile implementation. Premature TypeScript changes discovered during contract discussion were reverted. Implementation changes require the later audit, an explicit mismatch disposition, and user approval for contract-supporting refactors.

## Settled decisions

### 1. Separate application, operation, and organization

Every executable is an immutable `ClinkrApp`. The app owns its executable name and has a transparent root scope containing a nameless default command and/or named command and group routes. `ClinkrCommand` represents one operation; `ClinkrGroup` organizes routes. Only `ClinkrApp` executes or computes completion—commands and groups have no `run`/`complete` compatibility methods.

**Rationale:** Entry-point concerns are distinct from operation definition and command-tree organization. A transparent root avoids representing the executable as a command or degenerate group.

**Tradeoff:** This adds explicit app and immutable node abstractions instead of one multipurpose group abstraction. The additional concepts make ownership and lifecycle clear.

**Current mismatch:** The implementation has no `ClinkrApp` or standalone immutable `ClinkrCommand`. Execution, version, runtime metadata, and completion currently live on `ClinkrGroup`, with operations registered through `command(...)` or `defaultCommand(...)`.

### 2. App-level executable features are opt-in

Version information, runtime diagnostics, and shell completion belong to `ClinkrApp`, but an app exposes only the features it configures.

**Rationale:** These are executable concerns, not command or group concerns. They are not universal requirements for every CLI.

**Rejected alternative:** Automatically expose version, runtime, and completion surfaces on every app.

### 3. Rendered-command framework flags are automatic

Every rendered Clinkr command receives `--format` and `--json-schema` automatically.

**Rationale:** Multi-audience output and machine-readable contract discovery are core Clinkr behavior, unlike optional executable metadata.

**Accepted current behavior:** Automatic `--format` and `--json-schema` on rendered commands are not mismatches.

### 4. The whole command tree shares one context type for now

A group declares one context type for its tree. Registered commands infer it, subgroups share it, and each app run supplies one non-global context value.

**Rationale:** One explicit, fakeable per-run dependency value is sufficient for current use cases and keeps the model simple.

**Tradeoff:** Commands and subgroups cannot yet declare narrower context types. More granular context derivation may be added when concrete use cases justify the extra model.

**Accepted current behavior:** The current homogeneous context type and per-run context value are not mismatches.

### 5. Core handlers remain format-agnostic

Clinkr handlers receive context and validated request data, not the selected output format. Clinkr owns ordinary format selection and rendering after the handler returns.

Hosts with an exceptional need to stream durable answer data before completion may derive the format from argv and expose it through their application context. Such commands must avoid durable stdout streaming in JSON mode.

**Rationale:** Format-dependent domain handlers are usually a layering smell. Keeping format out of the core handler contract preserves separation between operation behavior and presentation.

**Tradeoff:** Exceptional streaming commands need explicit host plumbing. The ns SDK already demonstrates this pattern by placing host-selected `outputFormat` in `NsExtensionApi`.

### 6. Aliases are always application-defined

Clinkr does not infer aliases from command or group names. Applications explicitly configure every alias that becomes part of their public CLI surface.

**Rationale:** An alias is public API. Framework inference creates undocumented surface and can introduce collisions or commitments the application did not choose.

**Rejected alternative:** Automatically alias every command or group named `list` to `ls`.

**Current mismatch:** Clinkr currently generates automatic `list`/`ls` aliases in dispatch and completion.

### 7. Negative results are answers on stdout

A negative result represents a completed operation whose answer is no: nothing matched, a check did not pass, or there was nothing to change.

- Human output goes to stdout.
- The process exits with code `1`.
- Failures and usage errors go to stderr and exit with code `2`.
- JSON envelopes for every outcome go to stdout.

**Rationale:** The negative text is the command's answer, not diagnostic trouble. This follows the `grep`/`diff` family of conventions: exit status communicates the negative branch while stdout carries the result.

**Current mismatch:** Human-readable negative results currently render to stderr.

### 8. Each command publishes one composed outcome schema

Clinkr publishes one top-level discriminated JSON Schema per command. It composes Clinkr's fixed envelope fields with optional command data schemas:

- `resultSchema` for `ok` data;
- `negativeSchema` for negative-result data;
- `failureSchema` for failure data;
- `usageErrorSchema` for usage-error data.

For each status:

- omitting its schema makes that outcome bodyless;
- supplying its schema requires and validates `data`;
- `z.any()` is the explicit escape hatch for intentionally untyped data.

Omitting all outcome schemas permits bodyless outcomes such as `ok()`. Clinkr emits no result body for a bodyless `ok()`.

**Rationale:** Consumers need one predictable machine contract, but success, negative, operational-failure, and usage-error payloads commonly have different shapes. A framework-composed discriminated schema preserves both predictability and status-specific data.

**Rejected alternatives:**

- Treat an omitted success schema as unrestricted output. Omission means bodyless; `z.any()` expresses unrestricted output explicitly.
- Apply one shared domain-data schema to every outcome. Different statuses need independently meaningful data shapes.
- Forbid structured data on non-success outcomes. Applications need structured data for all outcome classes.

**Current mismatch:** Result validation is optional and success-only, while non-success outcomes can carry arbitrary data. The current JSON Schema does not express the complete configured outcome union.

**Approved reconciliation:** Clinkr owns one internal outcome-schema model spanning all four statuses. The same model drives handler return typing, runtime validation, machine-envelope construction, and `--json-schema`; adapters must not reconstruct or partially enforce it.

### 9. Invalid handler output is a programmer error

Request-schema failures are usage errors. Outcome data that violates the command's declared schema is invalid handler output and propagates as a programmer error to the application's crash policy.

Clinkr does not turn invalid output into an operational failure envelope.

**Rationale:** Schema-invalid output means the implementation violated its own declared contract. Preserving the thrown error retains stack traces, source lines, and attribution needed to fix the bug.

**Approved reconciliation:** Validate the selected outcome's configured data schema in Clinkr before rendering or envelope emission. An omitted schema requires a bodyless outcome; `z.any()` is the explicit untyped escape hatch. Remove SDK-only success parsing once the adapter delegates validation to Clinkr.

### 10. Applications explicitly return expected failures

Clinkr does not automatically convert arbitrary exceptions into `failure(...)` outcomes.

- Applications catch expected operational errors and deliberately return a failure outcome.
- Programmer errors, invariant violations, and other uncaught exceptions escape unchanged to app crash policy.

**Rationale:** The framework cannot reliably distinguish expected operational conditions from bugs. Automatic conversion would hide attribution and collapse application policy into framework policy.

**Approved reconciliation:** Remove the public throwable `ClinkrFailure` API and Clinkr's special exception-to-failure conversion. Expected operational failures remain explicit returned `failure(...)` outcomes; application or Foundation adapters may deliberately catch known operational errors and return those outcomes. Unexpected exceptions propagate unchanged to app crash policy.

### 11. Rendering is command-level only

Structured user-facing output is defined by command-level `renderHuman` and `renderMarkdown` functions. Outcome constructors do not carry per-exit human or Markdown overrides.

Fallback order is:

1. Markdown renderer for Markdown format, when present;
2. human renderer when Markdown rendering is absent;
3. indented JSON when neither renderer is present.

**Rationale:** Rendering is part of the stable command contract, not an ad hoc choice made by one handler return path.

**Supporting context:** Markdown is an active caller contract, not speculative surface. Handoff list preserves a distinct Markdown table; Objective commands emit Markdown for direct agent consumption; Pi integrations deliberately request Markdown; SDK and extension registration carry Markdown renderers.

**Current mismatch:** `ok(...)` and `negative(...)` currently support per-exit human or Markdown overrides.

**Approved reconciliation:** Migrate the SDK adapter and direct callers first so every presentation branch is represented by typed outcome data and stable command-level renderers. Then remove per-exit render fields and constructors' override parameters. SDK must pass schemas and renderers into Clinkr rather than capturing exits, validating success itself, and synthesizing rendered strings back onto outcomes.

### 12. Bodyless imperative commands emit no Clinkr result body

A command with no outcome data schema may perform an imperative action and return `ok()`. Clinkr emits no result body.

Imperative writes are application-owned stderr chatter. User-facing answer output belongs in a structured outcome and command-level renderer so JSON stdout remains a valid single envelope.

**Rationale:** This keeps no-data commands low-boilerplate without allowing arbitrary stdout to corrupt JSON mode.

**Rejected alternative:** Treat `console.log(...)` from a bodyless handler as the command's answer. That would contaminate machine stdout before Clinkr emits its envelope.

### 13. Shell completion is optional and failure-tolerant

Completion is an opt-in `ClinkrApp` feature. When enabled, static candidates derive from the command tree and schemas. Dynamic candidates may augment them.

If a dynamic provider throws:

1. Clinkr invokes one optional app-level completion-error callback with the thrown error and relevant command/completion context;
2. Clinkr still returns static candidates;
3. Clinkr does not print the provider error directly.

**Rationale:** A transient completion dependency must not break Tab completion, but applications need a central way to observe or log failures without coupling every provider to process stderr.

**Current mismatch:** Error observation exists only as a lower-level completion-call option, not as the desired app-level policy.

### 14. Preserve a narrow framework-neutral raw escape hatch

The raw escape hatch lets a selected command receive its raw argv tail and own its output bytes and exit status. Clinkr still owns application routing and command metadata, but it does not parse the selected command's argv tail or impose the rendered-command output contract.

**Rationale:** Current ns callers demonstrate two concrete needs: SDK commands that pass an argv tail to an embedded parser, and genuinely byte-owning operations such as `vibechk run`. Neither requires exposing Commander trees as public Clinkr objects. A framework-neutral seam meets those needs without adding a Commander-specific composition API.

**Rejected alternative:** Mount Commander `Command` subtrees as an opaque public contract without a concrete ns caller. That would add API and composition complexity for a hypothetical use case.

**Current mismatch:** `@nseng-ai/clinkr/raw` currently exposes schema-backed `rawCommand()` specifications whose parsing and dispatch ownership is split across Clinkr-specific `isRawExit` and `shouldPassThrough` branches. Reconciliation should narrow and clarify that seam, preserve demonstrated passthrough/byte-owning uses, and migrate ordinary structured commands to `ClinkrCommand`.

### 15. Retain Clinkr's interaction subsystem under application control

Retain `ClinkrInteraction`, the real line-oriented terminal adapter, non-interactive gating helpers, confirmation helpers, and strict test fakes.

Applications decide whether and where prompting is available by placing an interaction dependency in their own context. Dispatch does not prompt automatically.

**Rationale:** Confirmation remains application-controlled while Clinkr centralizes subtle reusable behavior: stdin and TTY handling, EOF/abort semantics, default answers, stderr prompts, non-interactive refusal, and strict fake verification. Removing it would duplicate this safety-sensitive behavior across callers.

**Supporting context:** Handoffs, Slots, Flow, Packagechk, and internal release tooling already consume this subsystem through application-owned contexts.

### 16. Preserve streaming as an explicit escape path

Progress and logging use stderr so JSON stdout remains clean. The stream package owns TTY-aware live-region behavior and settled non-TTY output.

Durable answer streaming to stdout is exceptional. The host must expose the selected format through context and suppress such streaming in JSON mode.

**Rationale:** Ordinary commands should return one outcome for Clinkr to render. Explicit streaming support remains necessary for progressive terminal experiences and commands whose answer cannot be buffered conveniently.

### 17. Teach workflows, not the complete export catalog

The package README teaches the core adopter path directly: applications, commands and groups, outcomes, rendering, context, and end-to-end testing. Optional Clinkr features—completion, interaction, framework-neutral raw execution, and streaming—remain in the README with one compact example or usage path each.

The README does not attempt to catalog every supported root export. Low-level capability, I/O, envelope, format, emission, completion-planning, and testing utilities remain supported public API and are discoverable through their exported TypeScript types. An individual utility belongs in the narrative only when a core workflow needs it or its behavioral contract is otherwise easy to miss.

Application-architecture guidance such as plugin-owned context factories is not part of the primary package narrative. It should live in a focused example or guide rather than making the README an exhaustive handbook.

**Rationale:** A cold adopter needs a coherent route from one command to a testable CLI, plus clear discovery points for optional features. Teaching every export and every host-architecture pattern would obscure that route and duplicate the typed API surface.

**Documentation consequences:**

- keep one `runForTest` example and briefly route to the remaining testing-helper categories;
- keep interaction as an optional feature with one context, confirmation, non-interactive, and fake-driven example;
- shorten completion to app-level enablement, concise shell activation guidance, one dynamic-provider example, and its fallback/error-observation contract;
- keep raw and streaming as concise escape hatches with explicit ownership and stream contracts;
- route exact APIs to the five public package entrypoints and their exported types.

**Deferred decision:** The evidence bar for accepting detailed observable-behavior claims will be settled during the implementation, test, export, and representative-caller audit. This contract-boundary pass neither requires separate external-adopter proof nor treats current ns usage as automatically sufficient.

## Settled builder and lazy-route reconciliation (2026-07-25)

This section records the focused design review that approved the foundational refactor. It supersedes earlier constructor and root-object examples in this record and the draft: there is no desired `new ClinkrCommand(...)`, `new ClinkrGroup(...)`, or app `{ root }` public model.

### Creation and immutable authoring

- `ClinkrApp` has a private constructor. Creation is async: `ClinkrApp.create(options, async (appBuilder) => { ...; return await appBuilder.define(); })`. `options` owns the executable name and includes `moduleUrl: import.meta.url` for relative imports.
- Public authoring uses `ClinkrAppBuilder`, `ClinkrGroupBuilder`, and `ClinkrCommandBuilder`. Terminal `define()` returns immutable `ClinkrApp`, `ClinkrGroup`, or `ClinkrCommand`; command/group constructors are not public.
- Every async build callback must return the immutable object produced by the supplied builder, and runtime verifies provenance. The standard local names are `appBuilder`, `groupBuilder`, and `commandBuilder`; documented terminal form is `return await ...define()`.
- Every command builder defines exactly once. Group/app `define()` finalizes its scope. App definition cannot change after definition.

### Scope and routing contract

- A scope exposes `defaultCommand(async (commandBuilder) => ...)`, `command(metadata, async (commandBuilder) => ...)`, `group(metadata, async (groupBuilder) => ...)`, and `define()`.
- The one nameless default command belongs to its containing scope and is built eagerly while that scope is constructed. Keep this behavior. Named routes and explicit aliases beat default positional parsing; a group with neither a selected child nor a default shows help.
- Named commands and groups are lazy routes at every level. Route metadata is cheap and contains only kind, name, description/summary/help grouping, explicit aliases, hidden state, and loader. Identity/help metadata exists only on the route, never duplicated on the loaded node. Schemas, handlers, renderers, completion providers, and children remain behind the loader.
- Only the selected path is constructed. For example, `some_cli some_group -h` constructs `some_group` and its one default command, but no sibling or named child. Parent/top-level help uses route metadata without loading children.
- Clinkr owns argv traversal; applications do not manually pre-route. One route loader serves execution, help, and deep completion. Name completion uses metadata; option/argument completion loads the selected command. There is no separate completion loader.
- The app root is transparent. Context-free apps use `void` with no ceremony. Contextful apps require one per-run context homogeneous throughout the tree; adaptation remains above Clinkr.

### Imports and module composition

Builders provide terminal `builder.import("./relative-module.ts")`. Specifiers must be relative and resolve from the module currently being built. The imported module exports standard named async `build(builder)`, and `import()` returns the finalized immutable object. A concise route may use `appBuilder.group(metadata, async (groupBuilder) => groupBuilder.import("./admin-group.ts"))`.

The builder model remains the canonical lower-level runtime model. The later filesystem-first decision below supersedes it as the primary README authoring interface; builders remain public for advanced and programmatic uses.

### Loading, identity, and validation

- Route construction is transactional. Framework-owned builders establish node identity; publish/cache only after the callback succeeds and definition validates.
- Concurrent requests share an in-flight load. Successful loads cache for the app lifetime; failed loads are cleared and retryable. Commander trees are fresh per run.
- Command/group nodes have one parent. Reuse requires a fresh builder/factory.
- Route name, alias, and reserved-name conflicts validate when the containing scope is built without loading children. Aliases are explicit only.
- App-level `--version` and `--runtime` bypass all named routes and default-command construction.

### Foundation and migration boundary

Here, Foundation means `@nseng-ai/foundation`'s `defineCli`. After `prepareRun`/discovery, it creates a fresh `ClinkrApp` per invocation; package builders contribute route declarations, then Foundation wraps and runs them. It is not a process singleton. Direct external consumers create an app themselves. Current ns request-specific extension loading migrates behind Clinkr's lazy routes, while mounted feature groups remain non-executable.

This is a hard clean break, not a compatibility layer or two public models. Migration order is: Clinkr internals/tests; replace the old API; Foundation; SDK/catalog lazy routing; remaining CLIs/testing; delete obsolete group execution, automatic aliases, and duplicated SDK pre-routing; then update and promote the README. Reviewable internal commits or a stack are acceptable, but cutover is coordinated.

### Explicitly unresolved and unchanged

Outcome, raw execution, rendering, and completion-error decisions remain as recorded elsewhere in this document; approval of the foundational refactor did not silently settle or reopen them. Positional metadata and the Markdown format alias were subsequently settled in [Public-surface naming decisions](#public-surface-naming-decisions-2026-07-25).

## Filesystem-first authoring (2026-07-25)

This decision supersedes builders as the primary package-README interface without superseding the approved builder/runtime design above. The common path is a web-framework-like filesystem hierarchy:

```text
cli/
  app.ts
  command.ts
  issues/
    group.ts
    command.ts
    list/
      command.ts
    labels/
      group.ts
      add/
        command.ts
```

The hierarchy is direct: there are no `groups/`, `commands/`, or per-level `routes/` taxonomy directories. Directory path is CLI path. A directory containing `group.ts` is a named group. A `command.ts` without a peer `group.ts` is the named command represented by that directory. A `command.ts` beside `group.ts` is that group's default command. Root `cli/command.ts` is the app default. Normal routes use one file; there is no `route.ts` metadata sidecar.

Filesystem route modules retain exported functions for future-proofing, but commands and groups deliberately have different shapes. A `group.ts` exports one cheap, complete `group(): ClinkrGroupDefinition`; it includes description/summary, explicit aliases, hidden state, help grouping, and any other cheap group configuration. Children come from the filesystem, and an adjacent `command.ts` remains the default command. There is no separate group `metadata()` and no lazy second group-definition function. This explicitly supersedes the earlier filesystem-first `metadata()` plus lazy `group()` split for groups.

A `command.ts` keeps two functions because its implementation may be expensive: cheap, explicitly typed `metadata(): ClinkrCommandMetadata` for description/summary, explicit aliases, hidden state, and help grouping, plus async `command()` for the selected definition. Command definitions use a generic typed `defineCommand({...})` helper rather than `satisfies ClinkrCommandDefinition`, so `schema` and `resultSchema` drive handler and renderer inference. The exact helper and type spellings remain provisional, but this is the desired README authoring style. Group and metadata functions use direct explicit return types rather than `satisfies`.

Importing a route module evaluates its top level. For parent routing, help, and name completion, the adapter calls a command module's cheap `metadata()` or a group module's cheap, complete `group()`. Only a selected command's `command()` is invoked. Schemas, handlers, gateways, renderers, completion providers, expensive imports, and expensive construction belong inside `command()`; an unusually heavy command may dynamically import a private implementation there. Group top levels and `group()` itself must remain cheap, and the normal path remains one route file.

Runtime filesystem discovery is the approved direction. There is no generated manifest, generated runtime module, filesystem code generation, or production-codegen requirement. The filesystem adapter owns traversal, dynamic imports, builder callbacks, transactional loading, successful per-app caching and retry after failure, ownership/provenance, and ESM resolution. It lowers into the same immutable builder/App model, so routing, execution, help, and completion retain one implementation.

Laziness is recursive and fast by default. Help and name completion may import immediate child modules, call command metadata, and call cheap complete group definitions, but do not construct sibling command definitions. Only a selected command's `command()` runs. The existing lower-seam decisions remain approved: async immutable builders; terminal `define()` and `import()`; app-only execution and completion; transactional selected-command loads; successful per-app caching with retryable failures; a fresh Foundation app per invocation; and no compatibility layer.

Builders remain a public advanced escape hatch for unusual or programmatic topology, extension mounting, custom loading, and framework integration. The package README should mention this briefly and point to a separate future advanced builder guide; its main flow must not teach builder callbacks.

Runtime discovery creates a packaging constraint: command/group files and directories must ship intact. Bundled or single-file environments may need the builder escape hatch or a later dedicated adapter. This decision does not authorize a manifest fallback.

The common bootstrap and completion-error policy were subsequently settled below. Raw execution was subsequently settled as a narrow framework-neutral seam. Positional metadata, the Markdown format alias, and the outcome/rendering reconciliation were also subsequently settled below.

## Filesystem bootstrap API settled (2026-07-26)

The common `cli/app.ts` interface is `createClinkrApp({ name, commandDirectory, version?, runtimeInfo?, completion? })`. Public language describes a filesystem-defined **command structure**, command directory, command path, command module, and group module; it does not describe Clinkr's command model as routes.

`commandDirectory` is a required absolute filesystem path string. The colocated Node 24+ form is `commandDirectory: import.meta.dirname`; a nested structure uses an absolute derived path such as `path.join(import.meta.dirname, "commands")`. Clinkr rejects relative paths and never resolves the command structure against `process.cwd()`. `name` is explicit; Clinkr does not inspect package metadata or infer a bin name. Foundation continues to own package metadata lookup and supplies its derived name, version, and runtime diagnostics.

`createClinkrApp` returns `Promise<ClinkrApp<TContext>>`. Context-free apps use `app.run(args)` and `app.complete(request)`; contextful apps require per-invocation options carrying `context` (and optional I/O). Context is not captured during app creation or stored globally. Only `ClinkrApp` executes commands or computes completion.

The factory is the common-path convenience over the same immutable builder/App runtime. Advanced and Foundation composition may add the filesystem command structure and programmatic commands through the app builder; the filesystem adapter is not a second parser or command-dispatch implementation. Foundation runs `prepareRun` first, creates a fresh app for each unhandled invocation, then runs it with the prepared context and I/O. No app, invocation context, or per-app successful-load cache is shared between Foundation invocations.

Completion remains opt-in app policy. Optional `completion.onProviderError` receives the thrown provider error, command path, completion request, and invocation context. Clinkr then returns static candidates without printing the provider error; observer failure cannot break that fallback. This callback is not a general application-error observer.

The public builder operation's exact spelling may be finalized during implementation, but its semantics are fixed: adapt an absolute command directory into the same command/group model, preserving transactional selected-command loading, concurrent in-flight sharing, per-app success caching, retry after failure, provenance, and fresh Commander trees. There is no manifest, production codegen, compatibility runtime, manual argv pre-dispatch, or second command-dispatch implementation.

## Public-surface naming decisions (2026-07-25)

Clinkr retains `position` as the positional-metadata field name. It is the established public spelling, accurately describes a positional argument's zero-based ordinal placement, and avoids an unmotivated rename during the clean break. The provisional README now uses `position`; reconciliation does not need an `index` migration.

Clinkr also retains and documents `md` as an explicit alias for the canonical `markdown` format value. The alias is intentional and already has focused parsing, rendering, validation-text, and completion coverage. Reconciliation must preserve both the long spelling and alias rather than leaving `md` as undocumented behavior.

These decisions settle only the two naming questions. They do not alter raw execution or exception policy. The outcome/rendering reconciliation, bootstrap/completion-error policy, and removal of the throwable `ClinkrFailure` API were settled separately.

## Outcome and rendering reconciliation approved (2026-07-25)

The outcome and rendering decisions above are approved as one migration cluster. Clinkr owns the four status-specific data schemas, their composed discriminated machine contract, runtime validation, and command-level rendering policy. Invalid configured outcome data is a programmer error and escapes to app crash policy; it is never converted into a failure outcome.

Migration order is part of the approval. First extend the SDK command model and direct callers so each reachable status carries typed data sufficient for stable command-level human and Markdown renderers. Then route all status validation and rendering through Clinkr, remove SDK's `withRenderOverrides`-style success parsing and render synthesis, migrate remaining direct per-exit override callers, and finally delete override fields and constructor options from Clinkr outcomes.

Do not mechanically delete branch-dependent presentation or preserve it as an adapter-side policy. Move the distinguishing facts into typed outcome data. Bodyless means no `data` field and no human result body, while JSON still emits the status envelope. An explicit `z.any()` remains the only intentionally untyped data escape hatch.

This approval does not settle raw execution or exception policy. The filesystem bootstrap, completion-error policy, and removal of the throwable `ClinkrFailure` API were settled separately.

## Accepted implementation behavior

The following current behavior aligns with the settled contract and should not be treated as a mismatch during audit:

- homogeneous command-tree context;
- one non-global context value per run;
- automatic `--format` and `--json-schema` on rendered commands;
- Markdown renderer support and its fallback to human rendering, then indented JSON;
- handlers that do not directly receive output format;
- application-controlled interaction passed through context;
- static completion fallback after dynamic-provider failure;
- positional metadata spelled `position`;
- `md` accepted and documented as an alias for the canonical `markdown` format.

## Confirmed reconciliation mismatches

The implementation and caller audit begins with these confirmed mismatches:

1. No `ClinkrApp` or standalone `ClinkrCommand`; executable concerns live on `ClinkrGroup`.
2. Version, runtime, and completion ownership must move to opt-in app configuration.
3. Automatic `list`/`ls` alias generation must be removed in favor of explicit aliases.
4. The hybrid schema-backed raw-command model must become a narrow framework-neutral argv/output/exit seam; opaque Commander mounting remains parked without a concrete caller.
5. Human-readable negative results must move from stderr to stdout while retaining exit code `1`.
6. Outcome data schemas must compose into one discriminated command contract with bodyless defaults and runtime validation.
7. Outcome-schema violations must propagate as programmer errors.
8. Per-exit human and Markdown rendering overrides must be removed.
9. Dynamic-completion error observation must become one app-level callback while preserving static fallback.
10. The public throwable `ClinkrFailure` API and special exception-to-failure conversion must be removed in favor of explicit returned failures and application-owned error adaptation.

These are starting facts, not authorization for an unreviewed refactor. Each material implementation or caller change still requires an explicit disposition and user discussion under the Objective workflow.

## Genuinely open topics

The following topics remain open and should be settled through the remaining README-driven audit:

- What evidence bar should govern detailed observable-behavior claims, including how current ns usage, API currency, focused tests, and independently verified operational instructions contribute.
- Which additional observable current behaviors deserve public-contract status after the package, export, test, and representative-caller audit.
- Which concrete gate-calibration lessons from the Clinkr dry run should become mandatory for later package Subobjectives.
- Whether any discovered complexity should be reconciled in this Objective or parked as unrelated redesign.

Everything else in the settled-decision sections above should remain closed unless new implementation or caller evidence demonstrates a material contradiction.
