# Clinkr Contract-to-Code Audit

**Audited:** 2026-07-26

## Purpose and evidence bar

This audit compares the provisional contract in `README-draft.md` with Clinkr's package exports, implementation, focused tests, and representative current ns callers. It records evidence and proposed dispositions; it does not authorize implementation or caller refactoring.

The evidence bar for this audit is:

- current ns usage is sufficient evidence for behavior it actually exercises when the caller uses the latest currently available Clinkr API;
- focused Clinkr tests establish precise observable semantics;
- operational claims not exercised by ns, such as shell-specific installation instructions, require direct verification before promotion;
- evidence establishes current behavior and caller reliance, but does not by itself make accidental behavior part of the desired contract.

Representative callers are current relative to the implemented `0.1.4` API. Several necessarily use APIs that the provisional contract supersedes because `ClinkrApp`, `ClinkrCommand`, explicit aliases, status-specific schemas, and opaque raw mounting do not exist yet.

## Confirmed mismatch dispositions

### 1. Application, command, and group are not separate

**Current evidence:** `src/group.ts` defines `ClinkrCommandSpec` only as registration data and gives `ClinkrGroup` command registration, tree organization, execution, Commander construction, and completion planning. `src/index.ts` exports no `ClinkrApp` or runtime `ClinkrCommand`. `@nseng-ai/foundation`'s `defineCli` returns a `ClinkrGroup`, and `@nseng-ai/clinkr/testing` runs groups directly.

**Impact and complexity:** High, cross-cutting migration. The group currently combines namespace, executable, default operation, completion host, and dispatch lifecycle. Foundation's `defineCli` is the primary executable-construction seam; SDK adapters and testing helpers are the next leverage points. Mounted feature groups such as Slots must remain non-executable tree components.

**Approved disposition:** **Reconcile implementation and callers through the foundational clean break.** Introduce private-constructor async `ClinkrApp.create(...)` plus public app/group/command builders that return immutable nodes from terminal `define()`. The app owns a transparent root scope and is the only executable/completion host; groups remain non-executable organization. Named command/group declarations become recursive lazy routes, while one nameless default command remains eagerly built with its containing scope. Migrate through Foundation and SDK rather than forcing every feature package to become an executable.

### 2. Executable features live on groups

**Current evidence:** `ClinkrGroupOptions` in `src/group.ts` owns `version` and `runtimeInfo`; root-only checks and completion-plan metadata are threaded through group construction. `test/groups.test.ts` pins the current behavior. Foundation and SDK both construct root groups with executable metadata.

**Impact and complexity:** Medium-high. Root conditionals mix executable policy into recursive group construction. Completion ownership must move with version/runtime ownership.

**Approved disposition:** **Reconcile implementation and callers.** Put version, runtime diagnostics, and completion on opt-in `ClinkrApp` configuration while preserving the currently exercised behavior for apps that enable them. Version/runtime bypass route/default construction; one lazy loader serves execution, help, and deep completion.

### 3. `list`/`ls` aliases are inferred

**Current evidence:** `clinkrAutomaticAliasesForName` and `clinkrNameMatchesAutomaticAlias` in `src/group.ts` feed dispatch, group traversal, and completion. `test/groups.test.ts` pins collision behavior. SDK imports the matching helper for pre-routing. Neither command nor group specs currently expose explicit aliases.

**Impact and complexity:** Medium. Alias policy is duplicated across Commander construction, completion, traversal, and SDK routing.

**Proposed disposition:** **Reconcile implementation and callers.** Add explicit command/group aliases, remove inference and exported automatic-alias helpers, then explicitly retain `ls` only where an application chooses it.

### 4. The raw entrypoint is Clinkr-managed

**Current evidence:** `src/raw/index.ts` brands a Zod-backed `RawCommandSpec`; `src/group.ts` still owns parsing, schemas, help, context, completion, exception handling, and selected framework behavior. `test/raw-exit.test.ts` pins this hybrid model. SDK uses it for pass-through routing, while Vibechk uses it for an imperative command.

**Impact and complexity:** High. Existing raw callers are not Commander subtrees and require deliberate reclassification. The SDK pass-through path is the riskiest. The current meaning of “raw” creates special `isRawExit` and `shouldPassThrough` branches while remaining framework-managed.

**Proposed disposition:** **Reconcile implementation and callers.** Provide an opaque Commander subtree mount. Audit each existing `rawCommand` caller: convert ordinary structured operations to `ClinkrCommand`; adapt true passthrough/existing Commander trees to the opaque mount.

### 5. Human negative results use stderr

**Current evidence:** `emitExit` in `src/emit.ts` writes negative human output to stderr while retaining exit code `1`; `test/dispatch.test.ts` and `test/rendering.test.ts` pin it. JSON outcomes already use stdout. Objective publication and other callers use negative outcomes as meaningful “no” answers.

**Impact and complexity:** Low implementation complexity but observable shell behavior. Focused tests and any caller assumptions about stderr must change.

**Proposed disposition:** **Reconcile implementation and callers.** Emit human negative answers on stdout with exit code `1`.

### 6. Outcome schemas are success-only and permissive

**Current evidence:** `ClinkrCommandSpec` exposes only `resultSchema`. `src/exit.ts` permits arbitrary optional non-success data and requires success data. `src/json-schema.ts` treats an omitted result schema as unrestricted output and publishes a success-centric machine schema. `test/json-schema.test.ts` pins `{}` for an omitted result schema. Objective publication demonstrates differently shaped status payloads; Vibechk has schema-less rendered commands.

**Impact and complexity:** Very high. Every rendered command must decide bodyless versus typed data for each reachable status. SDK command types and envelope helpers currently model only the success schema.

**Proposed disposition:** **Reconcile implementation and callers**, staged around one internal outcome-schema model. Add `resultSchema`, `negativeSchema`, `failureSchema`, and `usageErrorSchema`; omission means bodyless and `z.any()` means deliberately untyped.

### 7. Handler output is not validated uniformly

**Current evidence:** Clinkr dispatch uses `resultSchema` for schema publication but does not parse returned outcome data. SDK's `withRenderOverrides` separately validates successful data only. There is no focused Clinkr test proving invalid handler output propagation.

**Impact and complexity:** Medium-high. Enforcement currently depends on whether execution passes through SDK adaptation.

**Proposed disposition:** **Reconcile implementation and callers.** Validate every configured status in Clinkr, remove duplicate SDK-only success validation, and let validation errors propagate unchanged as programmer errors.

### 8. Outcomes carry render overrides

**Current evidence:** `src/exit.ts` gives `ok` human/Markdown overrides and `negative` a human override; `src/emit.ts` gives them precedence over command renderers. `test/rendering.test.ts` pins the precedence. SDK synthesizes overrides as an adapter protocol. Direct production uses remain in Plans, Branch Context, Slots, Packagechk, internal release tooling, Brmem, and other operations.

**Impact and complexity:** High. SDK redesign is prerequisite. Branch-dependent presentation must move into typed result data plus command-level renderers rather than being deleted mechanically.

**Proposed disposition:** **Reconcile implementation and callers.** Make rendering command-level only after callers and SDK carry enough structured data for stable renderers.

### 9. Completion error policy is per invocation

**Current evidence:** `ClinkrGroup.completeAsync` and `completeClinkrWordsAsync` accept `onDynamicCompletionError` per call. `test/completion.test.ts` pins callback invocation and static fallback. SDK repeatedly supplies no-op callbacks. The callback receives only the error.

**Impact and complexity:** Low-medium. Policy wiring is repeated and lacks command/completion context.

**Proposed disposition:** **Reconcile implementation and callers.** Move one enriched callback to app configuration and preserve static fallback exactly.

### 10. `ClinkrFailure` receives special framework conversion

**Current evidence:** rendered and raw dispatch in `src/group.ts` catch `ClinkrFailure` and convert it to failure output; other exceptions propagate. `test/failure.test.ts` and `test/raw-exit.test.ts` pin conversion. Representative production callers return `failure(...)`; no material production throw site was found. Foundation already owns explicit operation-error conversion in its CLI runtime.

**Impact and complexity:** Low in production, concentrated in exports and tests, subject to a final exhaustive usage check before removal.

**Proposed disposition:** **Reconcile implementation and callers.** Remove special framework conversion and the throwable public API; retain explicit application-owned adapters for expected operational errors.

## Additional material findings

### Context-free signatures are absent

Current handlers always receive `(context, request)`, and group runs require a context option. The README promises `handler(request)` and `app.run(args)` when no context is needed.

**Proposed disposition:** **Reconcile implementation** with the app/command split. Preserve homogeneous context for contextful trees while avoiding ceremony for context-free apps.

### Bodyless success is absent and README wording is ambiguous

Current `ok(data)` requires data, `ClinkrOkExit` always carries it, and JSON always emits an envelope with `data`. The README promises `ok()` and says Clinkr emits “no result body,” while also promising a JSON envelope for every outcome.

**Proposed disposition:** **Reconcile implementation and clarify the contract.** Bodyless means no human result text and no `data` field in the JSON envelope—not no JSON envelope/stdout bytes.

### Positional metadata uses `position`, not `index`

The README examples use `{ index: 0 }`; the current public `PositionalSpec` and callers use `{ position: 0 }`.

**Proposed disposition:** **User decision required before reconciliation.** Prefer retaining `position`, which is established current API and accurately names ordinal placement, unless the new command API deliberately chooses `index` as part of a clean break. This mismatch does not justify an implicit rename.

### Markdown format also accepts `md`

Current parsing and completion accept `md` in addition to the README's `human|json|markdown` spelling. Focused tests in `test/format-option.test.ts` and `test/completion.test.ts` deliberately pin parsing, rendering, validation text, and completion for the alias.

**Proposed disposition:** **User decision required before reconciliation.** Prefer documenting `md` as an explicit alias because it is an intentional, comprehensively tested current surface; otherwise remove it deliberately. Do not leave an undocumented accepted spelling.

### Node 24 is not declared in package metadata

The README requires Node 24+, but `package.json` has no `engines` field.

**Proposed disposition:** **Reconcile package metadata** if Node 24 remains the intended public compatibility floor.

### Completion installation claims remain operationally unverified

The implementation renders Bash, Zsh, and Fish scripts, and tests cover rendering/planning, but representative ns callers do not establish the README's shell-directory and activation instructions.

**Proposed disposition:** **Verify directly before promotion**; revise instructions if direct shell evidence differs.

## Accepted current contracts

The audit found evidence supporting these already settled behaviors:

- one homogeneous context type and one per-run, non-global context value;
- automatic `--format` and `--json-schema` on rendered commands;
- Markdown rendering with fallback to human rendering and then indented JSON;
- format-agnostic handlers, with exceptional streaming policy supplied through host context;
- application-controlled interaction and strict test fakes;
- static completion candidates surviving dynamic-provider failure;
- real use of Markdown renderers, streaming sinks, interaction, testing helpers, and mounted non-executable groups across ns.

These remain accepted unless reconciliation evidence exposes a contradiction.

## Refactoring approval and remaining discussion gates

The user approved the foundational app/builder/lazy-route refactor for later implementation. It is bounded as follows:

- framework-owned builders, provenance checks, immutable nodes, one-parent identity, and transactional loader publication;
- cheap route-only identity/help metadata; selected-path loading; shared in-flight loads, per-app success caching, retryable failures, and fresh Commander trees per run;
- scope-time name/alias/reserved-name validation without child loading;
- relative terminal builder imports using a named async `build(builder)` export;
- fresh app creation per Foundation invocation after discovery, with package builders contributing route declarations;
- coordinated clean-cut migration in this dependency order: Clinkr internals/tests, old API replacement, Foundation, SDK/catalog routing, remaining CLIs/testing, obsolete routing/API deletion, README promotion.

This approval authorizes the direction, not TypeScript work in this documentation update. It does not authorize a compatibility layer, two public models, manual application argv pre-routing, or a filesystem-routes API. The latter may later compile to builders.

Other proposals remain discussion-gated where their prior disposition is not independently settled:

1. Centralize all four status schemas, runtime validation, schema publication, and rendering in one command/outcome model.
2. Redesign the SDK adapter before removing render overrides; eliminate SDK-owned duplicate validation and rendering policy.
3. Replace the hybrid raw path with opaque Commander mounting and reclassify every current raw caller.
4. Move completion failure observation to app policy while preserving static fallback.
5. Remove `ClinkrFailure` conversion after exhaustive usage confirmation.
6. Settle `position` versus `index` and the `md` alias explicitly.

## Audit conclusion

All ten known mismatches have implementation, test, and representative-caller evidence plus proposed dispositions. The audit added six material findings. Two API choices—`position` versus `index`, and whether `md` remains a public format alias—require user steering. The foundational split and migration sequence are approved, but TypeScript implementation has not begun. Remaining disputed dispositions must still be discussed before their implementation. An exhaustive search found `ClinkrFailure` construction only in Clinkr tests plus a TypeScript style-guard fixture, strengthening the proposed removal disposition but not authorizing it.
