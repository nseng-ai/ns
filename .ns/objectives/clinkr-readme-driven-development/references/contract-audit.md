# Clinkr Contract-to-Code Audit

**Audited:** 2026-07-26

## Purpose and evidence bar

This audit compares the provisional contract in `README-draft.md` with Clinkr's package exports, implementation, focused tests, and representative current ns callers. It records evidence and proposed dispositions; it does not authorize implementation or caller refactoring.

The evidence bar for this audit is:

- current ns usage is sufficient evidence for behavior it actually exercises when the caller uses the latest currently available Clinkr API;
- focused Clinkr tests establish precise observable semantics;
- operational claims not exercised by ns, such as shell-specific installation instructions, require direct verification before promotion;
- evidence establishes current behavior and caller reliance, but does not by itself make accidental behavior part of the desired contract.

Representative callers are current relative to the implemented `0.1.4` API. Several necessarily use APIs that the provisional contract supersedes because `ClinkrApp`, `ClinkrCommand`, explicit aliases, status-specific schemas, and the reconciled framework-neutral raw execution seam do not exist yet.

## Confirmed mismatch dispositions

### 1. Application, command, and group are not separate

**Current evidence:** `src/group.ts` defines `ClinkrCommandSpec` only as registration data and gives `ClinkrGroup` command registration, tree organization, execution, Commander construction, and completion planning. `src/index.ts` exports no `ClinkrApp` or runtime `ClinkrCommand`. `@nseng-ai/foundation`'s `defineCli` returns a `ClinkrGroup`, and `@nseng-ai/clinkr/testing` runs groups directly.

**Impact and complexity:** High, cross-cutting migration. The group currently combines namespace, executable, default operation, completion host, and dispatch lifecycle. Foundation's `defineCli` is the primary executable-construction seam; SDK adapters and testing helpers are the next leverage points. Mounted feature groups such as Slots must remain non-executable tree components.

**Approved disposition:** **Reconcile implementation and callers through the foundational clean break.** Introduce the immutable app/group/command builder runtime described in the decision record, then place a runtime filesystem adapter over it as the primary README and common authoring path. The app owns a transparent root scope and is the only executable/completion host; groups remain non-executable organization. Direct route directories, cheap complete group definitions, and cheap command metadata drive recursive selection, while selected command definitions lower into builders. Migrate through Foundation and SDK rather than forcing every feature package to become an executable. Builders remain public as the advanced escape hatch, not the main README tutorial.

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

**Impact and complexity:** Medium-high. Existing raw callers demonstrate raw argv passthrough or application-owned byte/exit behavior, not Commander subtree reuse. The SDK pass-through path is the riskiest. The current meaning of “raw” creates special `isRawExit` and `shouldPassThrough` branches while remaining partly framework-managed.

**Approved disposition:** **Retain a narrow framework-neutral raw execution seam and reconcile callers.** A selected raw command receives its argv tail and owns output bytes and exit status, while Clinkr continues to own application routing and command metadata. Preserve this for SDK passthrough commands and genuine byte-owning operations such as `vibechk run`; convert ordinary structured operations to `ClinkrCommand`. Do not add opaque Commander subtree mounting without a concrete ns caller.

### 5. Human negative results use stderr

**Current evidence:** `emitExit` in `src/emit.ts` writes negative human output to stderr while retaining exit code `1`; `test/dispatch.test.ts` and `test/rendering.test.ts` pin it. JSON outcomes already use stdout. Objective publication and other callers use negative outcomes as meaningful “no” answers.

**Impact and complexity:** Low implementation complexity but observable shell behavior. Focused tests and any caller assumptions about stderr must change.

**Proposed disposition:** **Reconcile implementation and callers.** Emit human negative answers on stdout with exit code `1`.

### 6. Outcome schemas are success-only and permissive

**Current evidence:** `ClinkrCommandSpec` exposes only `resultSchema`. `src/exit.ts` permits arbitrary optional non-success data and requires success data. `src/json-schema.ts` treats an omitted result schema as unrestricted output and publishes a success-centric machine schema. `test/json-schema.test.ts` pins `{}` for an omitted result schema. Objective publication demonstrates differently shaped status payloads; Vibechk has schema-less rendered commands.

**Impact and complexity:** Very high. Every rendered command must decide bodyless versus typed data for each reachable status. SDK command types and envelope helpers currently model only the success schema.

**Approved disposition:** **Reconcile implementation and callers around one Clinkr-owned outcome-schema model.** Add `resultSchema`, `negativeSchema`, `failureSchema`, and `usageErrorSchema`; omission means bodyless and `z.any()` means deliberately untyped. Clinkr owns the composed discriminated machine schema and the runtime meaning of every configured status.

### 7. Handler output is not validated uniformly

**Current evidence:** Clinkr dispatch uses `resultSchema` for schema publication but does not parse returned outcome data. SDK's `withRenderOverrides` separately validates successful data only. There is no focused Clinkr test proving invalid handler output propagation.

**Impact and complexity:** Medium-high. Enforcement currently depends on whether execution passes through SDK adaptation.

**Approved disposition:** **Validate every configured status in Clinkr.** Outcome-schema violations propagate unchanged as programmer errors to app crash policy rather than becoming failure envelopes. Remove SDK-only success validation after the SDK adapter delegates this policy to Clinkr.

### 8. Outcomes carry render overrides

**Current evidence:** `src/exit.ts` gives `ok` human/Markdown overrides and `negative` a human override; `src/emit.ts` gives them precedence over command renderers. `test/rendering.test.ts` pins the precedence. SDK synthesizes overrides as an adapter protocol. Direct production uses remain in Plans, Branch Context, Slots, Packagechk, internal release tooling, Brmem, and other operations.

**Impact and complexity:** High. SDK redesign is prerequisite. Branch-dependent presentation must move into typed result data plus command-level renderers rather than being deleted mechanically.

**Approved disposition:** **Make rendering command-level only.** First migrate the SDK adapter and direct callers so branch-dependent presentation is represented by typed outcome data and stable command-level renderers; then remove per-exit human/Markdown overrides. The SDK must stop synthesizing render overrides and must not retain a second rendering policy.

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

**Approved disposition:** **Retain `position`.** It is the established public spelling, accurately names ordinal placement, and avoids an unmotivated rename during the clean break. The README now uses `position`; no implementation migration is required for this item.

### Markdown format also accepts `md`

Current parsing and completion accept `md` in addition to the README's `human|json|markdown` spelling. Focused tests in `test/format-option.test.ts` and `test/completion.test.ts` deliberately pin parsing, rendering, validation text, and completion for the alias.

**Approved disposition:** **Retain and document `md` as an explicit alias for `markdown`.** The alias is intentional and comprehensively covered by parsing, rendering, validation-text, and completion tests. Reconciliation must preserve that behavior and its focused coverage.

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

The user approved filesystem-first authoring over the foundational app/builder/lazy-route runtime for later implementation. It is bounded as follows:

- direct filesystem hierarchy with `group.ts` and `command.ts`: each group exports one cheap complete `group()` definition, while each command exports cheap typed `metadata()` plus a selected-only `command()` definition authored through `defineCommand({...})`;
- runtime discovery only: no generated manifest, generated runtime module, filesystem codegen, or production-codegen requirement;
- one filesystem adapter owning traversal, dynamic ESM imports, builder callbacks, provenance, and transactional publication while lowering into the same immutable runtime;
- framework-owned builders, provenance checks, immutable nodes, one-parent identity, and transactional loader publication;
- cheap immediate-child loading for help/name completion—command `metadata()` and complete group `group()` definitions—with command definitions loaded only after selection; shared in-flight loads, per-app success caching, retryable failures, and fresh Commander trees per run;
- scope-time name/alias/reserved-name validation without constructing child definitions;
- builders and relative terminal builder imports retained as the advanced lower-level seam;
- fresh app creation per Foundation invocation after discovery;
- the common bootstrap `createClinkrApp({ name, commandDirectory, version?, runtimeInfo?, completion? })`, with an absolute command-directory path such as `import.meta.dirname`, explicit app name, and invocation-owned context;
- coordinated clean-cut migration: establish the lower builder runtime, add the filesystem adapter and common public path, migrate Foundation, SDK/catalog command selection, remaining CLIs/testing, delete obsolete command-dispatch/API paths, then promote the README.

This approval authorizes direction, not TypeScript work in this documentation update. It does not authorize a compatibility layer, two command-dispatch implementations, manual application argv pre-dispatch, or a manifest fallback. The README leads with filesystem command authoring and mentions builders only as a separately documented advanced escape hatch. Command/group files and directories must ship intact; bundling and single-file packaging remain an explicit risk that may require builders or a later adapter. The `app.ts` bootstrap API is settled in `references/decision-record.md`.

Approved reconciliation clusters and remaining discussion gates:

1. **Approved:** centralize all four status schemas, runtime validation, schema publication, and rendering ownership in Clinkr's command/outcome model.
2. **Approved:** redesign the SDK adapter and direct callers before removing render overrides; eliminate SDK-owned duplicate validation and rendering policy.
3. **Approved:** expose the common filesystem command structure through `createClinkrApp`, require an absolute `commandDirectory`, keep context invocation-owned, and let Foundation create a fresh app after `prepareRun`.
4. **Approved:** move completion-provider failure observation to optional `completion.onProviderError` app policy while preserving static fallback even when observation fails.
5. **Approved:** replace the hybrid raw path with a narrow framework-neutral raw argv/output/exit seam, preserve demonstrated SDK passthrough and byte-owning uses, and keep opaque Commander mounting parked until a concrete caller requires it.
6. **Discussion-gated:** remove `ClinkrFailure` conversion after exhaustive usage confirmation.
7. **Settled current behavior:** preserve the `position` spelling and documented `md` alias during reconciliation.

## Audit conclusion

All ten known mismatches have implementation, test, and representative-caller evidence plus proposed dispositions. The audit added six material findings. The positional spelling and Markdown alias decisions are settled: retain `position`, and retain and document `md` as an alias for `markdown`. The outcome-schema, runtime-validation, command-level-rendering, and SDK-policy migration cluster is also approved. The foundational split and migration sequence are approved, but TypeScript implementation has not begun. Raw execution and completion-error policy are settled; only `ClinkrFailure` removal remains discussion-gated before implementation. An exhaustive search found `ClinkrFailure` construction only in Clinkr tests plus a TypeScript style-guard fixture, strengthening the proposed removal disposition but not authorizing it.
