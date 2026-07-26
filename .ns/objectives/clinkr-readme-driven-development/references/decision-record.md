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

Every executable uses a `ClinkrApp`. Its root is either one standalone `ClinkrCommand` or one `ClinkrGroup`.

- `ClinkrApp` owns the executable entry point and execution lifecycle.
- `ClinkrCommand` represents one operation directly.
- `ClinkrGroup` organizes commands and subgroups.

**Rationale:** Entry-point concerns are distinct from operation definition and command-tree organization. A standalone operation should not be represented as a null or degenerate case of a group.

**Tradeoff:** This adds explicit app and command abstractions instead of one multipurpose group abstraction. The additional concepts make ownership clearer and give standalone commands a natural representation.

**Current mismatch:** The implementation has no `ClinkrApp` or standalone `ClinkrCommand`. Execution, version, and runtime metadata currently live on `ClinkrGroup`, with operations registered through `command(...)` or `defaultCommand(...)`.

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

### 9. Invalid handler output is a programmer error

Request-schema failures are usage errors. Outcome data that violates the command's declared schema is invalid handler output and propagates as a programmer error to the application's crash policy.

Clinkr does not turn invalid output into an operational failure envelope.

**Rationale:** Schema-invalid output means the implementation violated its own declared contract. Preserving the thrown error retains stack traces, source lines, and attribution needed to fix the bug.

### 10. Applications explicitly return expected failures

Clinkr does not automatically convert arbitrary exceptions into `failure(...)` outcomes.

- Applications catch expected operational errors and deliberately return a failure outcome.
- Programmer errors, invariant violations, and other uncaught exceptions escape unchanged to app crash policy.

**Rationale:** The framework cannot reliably distinguish expected operational conditions from bugs. Automatic conversion would hide attribution and collapse application policy into framework policy.

**Audit concern:** Current Clinkr dispatch specially catches `ClinkrFailure` and converts it into a failure outcome. The reconciliation audit must decide how that behavior fits the settled explicit-return rule rather than preserving it accidentally.

### 11. Rendering is command-level only

Structured user-facing output is defined by command-level `renderHuman` and `renderMarkdown` functions. Outcome constructors do not carry per-exit human or Markdown overrides.

Fallback order is:

1. Markdown renderer for Markdown format, when present;
2. human renderer when Markdown rendering is absent;
3. indented JSON when neither renderer is present.

**Rationale:** Rendering is part of the stable command contract, not an ad hoc choice made by one handler return path.

**Supporting context:** Markdown is an active caller contract, not speculative surface. Handoff list preserves a distinct Markdown table; Objective commands emit Markdown for direct agent consumption; Pi integrations deliberately request Markdown; SDK and extension registration carry Markdown renderers.

**Current mismatch:** `ok(...)` and `negative(...)` currently support per-exit human or Markdown overrides.

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

### 14. Preserve a complete opaque escape hatch

The raw escape hatch mounts a Commander `Command` as an opaque subtree. That subtree owns parsing, options, help, schemas if any, context, I/O, completion, output bytes, and exit policy. Clinkr does not inject framework flags or interpret the subtree.

**Rationale:** Frameworks inevitably have bugs, omissions, and unusual use cases. Applications need a way to work around them without abandoning Clinkr for the rest of the executable. Existing Commander trees should also be mountable without translation.

**Rejected alternative:** A schema-backed Clinkr command that owns only raw bytes and numeric exit status while Clinkr continues to manage its surface.

**Current mismatch:** `@nseng-ai/clinkr/raw` currently exposes schema-backed `rawCommand()` specifications managed by Clinkr.

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

The package README teaches the core adopter path directly: applications, commands and groups, outcomes, rendering, context, and end-to-end testing. Optional Clinkr features—completion, interaction, raw Commander subtrees, and streaming—remain in the README with one compact example or usage path each.

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

## Accepted implementation behavior

The following current behavior aligns with the settled contract and should not be treated as a mismatch during audit:

- homogeneous command-tree context;
- one non-global context value per run;
- automatic `--format` and `--json-schema` on rendered commands;
- Markdown renderer support and its fallback to human rendering, then indented JSON;
- handlers that do not directly receive output format;
- application-controlled interaction passed through context;
- static completion fallback after dynamic-provider failure.

## Confirmed reconciliation mismatches

The implementation and caller audit begins with these confirmed mismatches:

1. No `ClinkrApp` or standalone `ClinkrCommand`; executable concerns live on `ClinkrGroup`.
2. Version, runtime, and completion ownership must move to opt-in app configuration.
3. Automatic `list`/`ls` alias generation must be removed in favor of explicit aliases.
4. The schema-backed raw-command model must become an opaque Commander subtree mount.
5. Human-readable negative results must move from stderr to stdout while retaining exit code `1`.
6. Outcome data schemas must compose into one discriminated command contract with bodyless defaults and runtime validation.
7. Outcome-schema violations must propagate as programmer errors.
8. Per-exit human and Markdown rendering overrides must be removed.
9. Dynamic-completion error observation must become one app-level callback while preserving static fallback.
10. Special exception-to-failure conversion, including current `ClinkrFailure` handling, must be reconciled with the explicit application-owned failure policy.

These are starting facts, not authorization for an unreviewed refactor. Each material implementation or caller change still requires an explicit disposition and user discussion under the Objective workflow.

## Genuinely open topics

The following topics remain open and should be settled through the remaining README-driven audit:

- What evidence bar should govern detailed observable-behavior claims, including how current ns usage, API currency, focused tests, and independently verified operational instructions contribute.
- Which additional observable current behaviors deserve public-contract status after the package, export, test, and representative-caller audit.
- Which concrete gate-calibration lessons from the Clinkr dry run should become mandatory for later package Subobjectives.
- Whether any discovered complexity should be reconciled in this Objective or parked as unrelated redesign.

Everything else in the settled-decision sections above should remain closed unless new implementation or caller evidence demonstrates a material contradiction.
