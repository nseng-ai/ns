# Restore invocation-scoped Clinkr output for embedded Pi execution

## Goal and outcome

Restore the pre-regression ownership model in modern Clinkr without reverting the filesystem-backed runtime:

```text
Clinkr framework/structured rendering
  -> invocation-scoped text output adapter
  -> terminal, Foundation host, Pi capture, or test capture

Clinkr raw command
  -> invocation-scoped byte output adapter
  -> terminal, Foundation host, Pi capture, or test capture

unrelated Pi TUI/process output
  -> process.stdout/process.stderr
  -> terminal only
```

The completed change must:

- let `ClinkrApp.run()` and programmatic `app.complete()` use caller-supplied stdout/stderr adapters;
- preserve process-backed defaults for ordinary direct terminal callers;
- preserve exact raw-command byte ownership through a separate byte-oriented adapter;
- route the existing Pi `stdout`/`stderr` callbacks through `runNsCli` and Foundation into modern Clinkr without introducing a semantic-presentation model;
- delete process-global writer interception completely, including its package export, tests, and documentation;
- keep Pi’s existing live progress, confirmation/selection, final `CliCommandOutputDetails`, usage-error restoration, and after-command behavior unchanged;
- prove that unrelated Pi/TUI writes during an embedded command cannot enter command output or create a render/capture feedback loop.

This is a restoration of invocation-local I/O architecture, not a rollback to mutable `ClinkrGroup`, not a revival of the provisional `execute()` transport, and not adoption of PR #4124’s semantic final-presentation model.

## Context and discovered facts

### Historical regression chain

The relevant history was established from local git and GitHub PR evidence:

1. PR #3967, commit `5a774a6d1edf28bb1cb46b7c6c6d82ed262beaaa` (`Introduce clinkr execute() host seam and direct-write terminal adapter`) removed `ClinkrIo` from modern `ClinkrApp.run()`, made framework/structured output write directly to process streams, and removed I/O from raw invocation objects.
2. PR #3999, commit `e997efe1e48e7b7a29c428eb9c9e4cb3e2688c2f`, removed the provisional typed `execute()` host seam. The modern runtime was then left with the direct-process `run()` transport.
3. PR #4013, commit `f5f96cdd642a543597644f49a5d211465daf4dce`, introduced Foundation’s `defineClinkrAppCli()` and compensated for the missing modern I/O seam by replacing `process.stdout.write` and `process.stderr.write` for the duration of override-backed runs.
4. PR #4121, authored cutover commit `31d1dbcfccdb15ddd3215448da46aafc8d43dac1`, landed as `d30314d22dd13f14774c81a2e8c2357bcb4f08a2`, switched the ns SDK host from legacy `defineCli`/`ClinkrIo` execution to modern `defineClinkrAppCli`. That activated the process-global interception hazard for ns commands embedded in Pi.
5. The observed failure chain is: Pi renders a TUI frame to `process.stdout`; Foundation’s active interception captures it as command stdout; Pi appends that output to its live widget and requests another render; the new frame is captured again. A recorded incident produced thousands of live-output events and over a million captured characters before user interaction completed.
6. Open PR #4124, commit `df8ad82469b30186fb014a39be6dc5c27b2ef1ab`, is useful implementation evidence for raw byte adapters, interception deletion, and tests, but its semantic final-presentation contract is explicitly not the selected design.

### Current code facts

- `ts/packages/public/infra/clinkr/src/io.ts` still contains legacy `ClinkrIo`, `createProcessIo()`, and `resolveIo()`, used by the quarantined legacy runtime. Do not broaden or repurpose that legacy root surface for the modern app.
- Modern ambient writes are concentrated in:
  - `ts/packages/public/infra/clinkr/src/app/app.ts` for version, runtime, completion, help, route/topology diagnostics, schemas, and outcomes;
  - `ts/packages/public/infra/clinkr/src/app/completion.ts` for topology diagnostics from programmatic completion.
- `ts/packages/public/infra/clinkr/src/raw/definition.ts` currently documents raw commands as terminal-only and gives them no output dependency.
- Foundation’s interception is localized in `ts/packages/public/infra/foundation/src/cli-runtime/clinkr-app-cli.ts`.
- Clinkr’s modern test helper uses the same interception in `ts/packages/public/infra/clinkr/src/app/testing.ts`.
- The interception module/export has only those production consumers plus its dedicated isolated tests and documentation.
- Pi already constructs invocation-local `stdout` and `stderr` callbacks in `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-extension.ts`, and `runNsCli()`/SDK dependency forwarding already carries these dependencies toward Foundation. The repair should deepen that existing path, not add a parallel Pi-specific transport.
- There are few modern raw-command consumers: Clinkr fixtures/tests and the SDK author adapter/type tests. This keeps the raw migration bounded.
- Direct `app.complete()` is used heavily in Clinkr tests and currently may emit topology diagnostics ambiently. Its result shape need not change; completion should receive the same optional invocation text-output adapter.

### Settled requirements

- Use a modernized invocation I/O design: text output for Clinkr-owned framework/structured rendering and a separate exact-byte adapter for raw commands.
- Delete process-writer interception atomically; retain no compatibility fallback.
- Keep adapters optional for `run()`/context-free `complete()` and default to real process output for terminal compatibility.
- Keep Pi channel-based. Do not add semantic outcome/presentation authority to Pi.
- Add optional output to programmatic `complete()` options; preserve stderr behavior through the adapter rather than adding diagnostics to `ClinkrCompletionResult`.
- Ordinary validation scope is implementation-owned under repository policy; no reduced validation exemption is intended.

### Architectural constraints

- Keep one modern `ClinkrApp` runtime/traversal. Output adaptation must not introduce another router, command transport, outcome renderer, or SDK pre-dispatch path.
- Clinkr remains the owner of framework and outcome rendering. Pi receives rendered stdout/stderr text and does not reinterpret Clinkr statuses.
- Raw output remains byte-oriented, newline-free, and semantically opaque to Clinkr.
- Default tests must be fake-driven and safe under the shared Vitest cache. Once interception is deleted, output behavior belongs in the default lane; only genuine process-terminal adapter smokes should remain isolated/integration as justified.
- Preserve strict TypeScript, explicit `.ts` relative imports, `exactOptionalPropertyTypes`, curated package exports, and the repo’s package dependency closure.
- Keep `CONTEXT.md` synchronized only if implementation changes authoritative domain vocabulary. This plan does not propose new domain terms; it restores an execution seam.

## Proposed interfaces and behavior

### Structured/framework text output

Define a modern app-owned interface under `@nseng-ai/clinkr/app`, named according to nearby vocabulary (recommended intent: `ClinkrOutput`):

```ts
export interface ClinkrOutput {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}
```

Add optional `output?: ClinkrOutput` to the common modern run-adapter options used by both `ClinkrRunOptions<TContext>` and `ClinkrContextFreeRunOptions`. Do not add this to command handler context: it belongs to the app invocation/host seam.

Resolution rules:

- no supplied output: use process-backed adapters and preserve current direct-terminal behavior;
- supplied output: all Clinkr-owned framework and structured final output uses that adapter and never touches process writers;
- retain `canEmitAnsi` as the explicit capability override rather than duplicating it in both the output object and run options;
- when an output override exists and `canEmitAnsi` is absent, treat it as a redirected/unknown sink and default ANSI off, matching legacy `resolveIo()` semantics; when output is absent, continue deriving ANSI capability from the real process stdout;
- preserve existing output routing exactly: successful/negative human answers and all JSON envelopes to stdout; failures, usage errors, and topology diagnostics to stderr; preserve text, newline, ordering, and exit codes.

Use a private process-backed adapter/factory inside the modern app. Do not import the legacy root `ClinkrIo` into `src/app/`.

### Programmatic completion

Introduce a context-free completion options shape carrying optional output, and extend contextful `ClinkrCompleteOptions<TContext>` with optional output while retaining required context. Preserve source compatibility:

- context-free `complete(request)` remains valid;
- context-free `complete(request, { output })` becomes valid;
- contextful `complete(request, { context })` remains valid;
- contextful `complete(request, { context, output })` becomes valid.

`ClinkrCompletionRuntime.complete()` must emit topology diagnostics through the invocation output adapter. The `run completion ...` route must pass its already-resolved run output into completion. Do not change `ClinkrCompletionResult` or suppress existing diagnostics.

### Raw byte output

Define and export a raw-owned byte interface from `@nseng-ai/clinkr/raw` (recommended intent: `ClinkrRawOutput`):

```ts
export interface ClinkrRawOutput {
  readonly writeStdout: (bytes: Uint8Array) => void;
  readonly writeStderr: (bytes: Uint8Array) => void;
}
```

Add `output: ClinkrRawOutput` to `RawCommandInvocation` and therefore to `ContextfulRawCommandInvocation<TContext>`. The modern app passes either the invocation-provided raw adapter or a process-backed default. Raw commands continue to own the selected argv tail and arbitrary numeric exit code.

Keep this byte contract exact:

- no implicit newline;
- no ANSI stripping;
- no UTF-8 decode/re-encode inside Clinkr;
- multiple writes preserve order;
- split multibyte UTF-8 sequences remain intact when eventually decoded by a text-only embedding host;
- default terminal adapters write `Uint8Array` directly to the corresponding process stream.

Foundation and test adapters that must bridge bytes into existing string callbacks need a streaming `TextDecoder` per stream, not one stateless decode per chunk. Flush each decoder after the raw run completes so a split UTF-8 scalar is not corrupted or dropped. Keep stdout and stderr decoder state independent. Clinkr’s own `runForCliTest()` can alternatively accumulate raw byte chunks and decode each complete stream once after the invocation.

Do not add raw stdin to this output change; existing raw stdin ownership remains out of scope.

## Files, symbols, tests, and documentation

### Clinkr modern runtime

- `ts/packages/public/infra/clinkr/src/app/app.ts`
  - `ClinkrRunOptions`, `ClinkrContextFreeRunOptions`, `ClinkrCompleteOptions`, and the new context-free complete options;
  - `ClinkrContextFreeApp` / `ClinkrContextfulApp` signatures;
  - `TopologyClinkrApp.run()` and `.complete()`;
  - every direct `process.stdout.write` / `process.stderr.write` branch;
  - `emitTopologyIssues`, `emitTerminalOutcome`, and any helper signatures required to carry resolved output;
  - process-backed output default and ANSI-resolution behavior.
- `ts/packages/public/infra/clinkr/src/app/completion.ts`
  - `CompletionRuntimeOptions` / invocation options and topology diagnostic emission.
- `ts/packages/public/infra/clinkr/src/app/index.ts`
  - export the modern output and completion-option types needed by hosts/tests.
- `ts/packages/public/infra/clinkr/src/raw/definition.ts`
  - define/export `ClinkrRawOutput` and add it to invocation types;
  - replace terminal-only ambient-output documentation.
- `ts/packages/public/infra/clinkr/src/raw/index.ts`
  - expose the byte-output type through the existing raw subpath.
- `ts/packages/public/infra/clinkr/src/app/testing.ts`
  - replace interception with invocation-local text and raw capture;
  - preserve the public `{ exitCode, stdout, stderr }` result.
- Delete `ts/packages/public/infra/clinkr/src/app/process-writer-interception.ts`.
- `ts/packages/public/infra/clinkr/package.json`
  - remove `./app/process-writer-interception`.

### Clinkr tests and fixtures

- `ts/packages/public/infra/clinkr/test/app-public-seam.test.ts`
  - type/runtime evidence for optional output defaults and explicit output capture across framework branches.
- `ts/packages/public/infra/clinkr/test/app-navigation.test.ts`
  - migrate inline raw definitions away from ambient process writes.
- `ts/packages/public/infra/clinkr/test/app-raw-dispatch.test.ts`
  - prove verbatim argv, arbitrary exit status, exact stdout/stderr byte routing, no automatic newline, and split UTF-8 correctness.
- `ts/packages/public/infra/clinkr/test/app-completion.test.ts`
  - replace process spies with injected output; prove direct and run-mediated completion diagnostics use the supplied stderr.
- `ts/packages/public/infra/clinkr/test/type/command-definition-types.ts`
  - update raw invocation compile expectations and complete-option overload expectations.
- `ts/packages/public/infra/clinkr/test/fixtures/raw-tail/command.ts` and `raw-contextful/command.ts`
  - write encoded bytes through `invocation.output`.
- Delete `ts/packages/public/infra/clinkr/test/isolated/process-writer-interception.test.ts`.
- Audit `test/readme-examples.test.ts`, `test/type/readme-examples/`, and other `runForCliTest()` consumers. Preserve assertions where output shape is unchanged; update only raw author examples and new interface typing.

### Foundation lifecycle

- `ts/packages/public/infra/foundation/src/cli-runtime/clinkr-app-cli.ts`
  - remove the interception import and `runWithOutputOverrides()`;
  - resolve existing `deps.stdout`/`deps.stderr` once;
  - pass a modern text output adapter and raw byte adapter directly into `app.run()`;
  - preserve `readStdin`, cwd/env preparation, `handleRunError`, metadata, and `runIfMain` behavior;
  - implement correct per-stream streaming UTF-8 decoding when configured callbacks receive raw bytes, including final flush;
  - keep direct process byte writes for streams without an override.
- `ts/packages/public/infra/foundation/test/cli-runtime/clinkr-app-cli-entry.test.ts`
  - replace restoration-focused assertions with stronger identity and exclusion assertions;
  - prove process writer functions never change during success, failure, selection/pending work, and raw execution;
  - perform an unrelated `process.stdout.write` while the app invocation is active and prove it is absent from configured command output;
  - prove structured text and raw bytes reach the configured stdout/stderr callbacks once and in order;
  - include split-UTF-8 raw output coverage at this text-callback bridge.

### SDK and raw author surface

- `ts/packages/public/sdk/src/sdk/command.ts` and `src/sdk/clinkr-command-adapter.ts`
  - allow the new raw invocation type to flow through `defineRawCommand()` without creating an SDK-specific duplicate output contract.
- `ts/packages/public/sdk/test/type/sdk-types.ts` and `test/unit/extension-descriptor-sdk.test.ts`
  - update raw runner invocations to supply byte output and verify forwarding.
- Confirm `ts/packages/public/sdk/src/cli/index.ts`, `ts/packages/public/ns/src/cli/index.ts`, and their types continue to forward Foundation’s existing `stdout`/`stderr` dependencies unchanged. Modify them only if static typing reveals a dropped field; do not add semantic presentation fields or renderer adaptation.

### Pi regression evidence

- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/test/cli-command-extension.test.ts`
  - add a bounded regression using the existing command bridge and a pending select/confirm or deferred runner;
  - while the command is pending, write unrelated widget/TUI-like text (including representative cursor-control bytes if useful) to ambient `process.stdout`;
  - continue emitting command-owned stdout/stderr through `CliCommandRunDeps` and transient progress through `onOutput`;
  - assert the live widget still shows command progress, the final custom message/details contain only command-owned stdout/stderr, unrelated ambient text is absent, output counters do not recursively grow, and hooks/usage handling remain unchanged.
- Prefer no production change in `src/commands/cli-extension.ts`; Pi already owns the correct channel contract. If a production edit becomes necessary, constrain it to forwarding/correctness and retain existing `CliCommandOutputDetails` semantics.
- Where practical, add or retain a thin forwarding test in the fresh ns CLI adapter used by `@nseng-ai/pi-ns-flow`, but do not duplicate the Foundation regression at every Pi mirror.

### Documentation and Objective synchronization

- `ts/packages/public/infra/clinkr/docs/terminal-integration-testing.md`
  - replace interception guidance with invocation-scoped adapter guidance;
  - explain process defaults, redirected-sink ANSI behavior, raw byte capture, and concurrency safety.
- `ts/packages/public/sdk/README.md`, `docs/sdk-reference.md`, and `docs/writing-an-ns-extension.md`
  - update raw command examples from ambient process writes to `invocation.output`;
  - avoid promising semantic presentations or exposing Foundation internals.
- `.ns/objectives/clinkr-readme-driven-development/references/README-draft.md`
  - synchronize testing/raw ownership examples and stdout/stderr contract wording.
- `.ns/objectives/clinkr-readme-driven-development/references/implementation-contract-notes.md`
  - record invocation-scoped output ownership and the prohibition on process-global capture.
- `.ns/objectives/clinkr-readme-driven-development/roadmap.md`
  - update only if the implementation completes a named active slice in the then-current Objective state. Revalidate the Objective before editing because roadmap state is volatile.
- Do not rewrite historical Objective updates or ADRs; they are time-in-place records.

## Implementation steps

1. **Revalidate volatile state before editing.**
   - Run `ns objective exec load-orientations --format md` and inspect the current Clinkr Objective’s `objective.md`/`roadmap.md`.
   - Confirm the working branch is not `main`/`master`, inspect worktree status, and check whether PR #4124 or another branch has since landed overlapping changes.
   - Re-run bounded searches for modern direct process writes, interception imports/exports, raw definitions, and `app.complete()` call sites. Use the anchors above rather than repeating broad historical research unless history changed.

2. **Write the red-capable regression at the correct seams.**
   - In Foundation, create a deterministic embedded-run test that holds an invocation open, emits unrelated ambient stdout during the hold, then completes. Assert configured command capture excludes the ambient bytes and process writer identities never change.
   - In Pi runtime, create the bounded pending-interaction/live-widget regression described above. Assert final details exclude ambient TUI bytes and recursive counter/widget text.
   - Run the focused tests against current code and capture the failure. The Foundation test should fail because interception captures unrelated ambient output; this is the primary red signal.

3. **Introduce modern text output at the Clinkr app seam.**
   - Define/export the small text adapter and optional run/complete option shapes.
   - Resolve the default once per invocation, including ANSI capability rules.
   - Route every framework branch, topology/usage diagnostic, schema/help/completion response, and structured outcome through the resolved adapter.
   - Pass output through the run-mediated completion path and direct programmatic completion options.
   - Keep all outcome rendering and stream-selection policy in Clinkr.

4. **Introduce explicit raw byte output.**
   - Add `ClinkrRawOutput` and require it on raw invocation objects.
   - Resolve a process-backed default in `TopologyClinkrApp.run()` and pass it to context-free/contextful raw definitions.
   - Migrate raw fixtures, inline tests, SDK types, and documentation.
   - Add byte-level tests before relying on string capture, including split UTF-8, interleaved per-stream writes, no newline, and arbitrary exit status.

5. **Replace Clinkr test interception with local capture.**
   - Make `runForCliTest()` supply text and raw output adapters directly.
   - Accumulate raw bytes per stream and decode after invocation completion, or use a correctly flushed streaming decoder.
   - Preserve its existing public result shape so broad consumer assertions remain stable.
   - Move any output tests made safe by DI back to the default lane as appropriate.

6. **Replace Foundation interception with direct adaptation.**
   - Delete `runWithOutputOverrides()` and pass text/raw adapters to `app.run()`.
   - For raw bytes bridged to string callbacks, maintain independent streaming decoders and flush them after completion; direct terminal streams receive bytes untouched.
   - Preserve partial overrides: overridden stdout is host-local while unoverridden stderr remains process-backed, and vice versa.
   - Re-run the Foundation red regression and confirm it turns green without changing process writers.

7. **Confirm SDK/ns/Pi forwarding remains shallow and channel-based.**
   - Typecheck the existing `NsCliDeps`/`RunNsCliDeps` path end to end.
   - Make only necessary type propagation edits; do not add `presentFinal`, status metadata, or Pi-specific output concepts to Clinkr/Foundation/SDK.
   - Run the Pi regression and verify existing live progress and final details remain behaviorally identical except that ambient TUI output is excluded.

8. **Delete interception atomically.**
   - Delete the implementation and isolated test.
   - Remove the package export and all imports/documentation.
   - Run a repository-wide bounded stale-reference search. There must be no `withInterceptedProcessWriters`, `app/process-writer-interception`, or modern documentation recommending process mutation.

9. **Synchronize public examples and contract records.**
   - Update raw author examples and the terminal-testing guide.
   - Update Objective README/implementation notes only after code and tests establish the behavior.
   - Keep legacy `ClinkrIo` references that genuinely describe the quarantined legacy runtime; do not perform a misleading global rename.

10. **Review and remediate before submission.**
    - Compare terminal output snapshots/fixtures before and after for help, version, runtime, schema, completion, success, negative, failure, usage error, topology diagnostics, JSON, Markdown, ANSI on/off, and raw execution.
    - Inspect for duplicate defaults, accidental decoder state sharing, output ordering changes, or host-specific concepts leaking down-stack.
    - Apply formatter/linter autofixers as directed by `ts/AGENTS.md`, then run the validation guidance below.

## Refactor execution strategy

This plan contains same-shape edits across more than five mixed code/test/documentation files, so use a split strategy rather than an opaque search-and-replace script:

1. Make the central semantic interface changes manually and precisely in `app.ts`, `completion.ts`, `raw/definition.ts`, `app/testing.ts`, and Foundation. These edits change ownership and runtime behavior and are not safe for blind textual replacement.
2. Inspect the TypeScript AST/symbol references before migrating raw invocation call sites. If a suitable repo-supported AST/codemod tool is available, use it only for the mechanically uniform addition of `output` destructuring/arguments; otherwise use compiler errors plus targeted edits.
3. Use `refactor-swarm` for the 5+ leaf-level mixed migrations (raw fixtures, type tests, SDK examples, and prose-aware docs), partitioned by owner so workers do not overlap central runtime files. If `refactor-swarm` is unavailable in the downstream harness, perform the same partition sequentially; do not substitute an ad hoc `text.replace()` script for semantic code or prose edits.
4. Finish with compiler-driven cleanup and bounded stale-reference searches for interception symbols, ambient raw-output claims, and direct process writes in the modern app/raw command fixtures.

## Validation guidance

Start with focused red/green loops, then run repository gates appropriate to the final changed set.

Focused commands should include the relevant Vitest files through the workspace configuration, especially:

- Clinkr app public seam, raw dispatch, completion, navigation, and README/type examples;
- Foundation `clinkr-app-cli-entry.test.ts`;
- Pi runtime `cli-command-extension.test.ts`;
- SDK raw type/unit tests.

Required behavior matrix:

- direct terminal defaults still write identical bytes and exit codes;
- explicit structured/framework output never touches process writers;
- direct and run-mediated completion diagnostics honor supplied stderr;
- custom output defaults ANSI off unless explicitly enabled; terminal defaults retain process capability resolution;
- raw stdout/stderr bytes preserve order, boundaries, split UTF-8 decoding at text hosts, no newline, and arbitrary exit status;
- partial stdout-only/stderr-only overrides behave correctly;
- concurrent independent injected runs do not reject or cross-capture;
- unrelated ambient stdout/stderr during an embedded run is excluded;
- Pi selection/confirmation/live progress and final details remain stable without recursive output.

Run at minimum after focused tests:

```bash
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-isolated
just ts-test-sanity
just ts-test-typescript-style-guard
just ts-deps-check
just dprint-check
just
```

If formatting fails, use `just ts-format-fix` or `just dprint-fix` rather than hand-formatting, then rerun the failed and aggregate checks. Verify lane discovery after deleting the isolated interception test; do not claim the isolated lane covers output interception after that subject is gone.

Final stale-reference/evidence searches should establish:

- no interception symbol/import/export/documentation remains;
- no direct process writes remain in `src/app/app.ts` or `src/app/completion.ts` except inside the explicit private process-backed adapter;
- no modern raw command definition/example writes directly to process stdout/stderr;
- legacy `ClinkrIo` references are confined to genuine legacy/root consumers;
- no `ClinkrFinalPresentation`, `presentFinal`, or semantic-presentation field was introduced by this implementation.

## Risks, assumptions, and open questions

### Risks

- **UTF-8 corruption at the Foundation bridge.** Stateless `TextDecoder.decode()` per raw chunk corrupts split multibyte sequences. Use independent streaming decoders with explicit final flush, or buffer and decode once where live delivery is unnecessary.
- **Output ordering drift.** Refactoring many early-return branches can change diagnostic/primary ordering. Preserve the current order and pin mixed diagnostic/result cases.
- **ANSI regression.** A custom callback is not automatically the real terminal. Default custom sinks to ANSI off unless the caller explicitly supplies capability; preserve terminal capability resolution otherwise.
- **Partial override leaks.** Treat stdout and stderr independently. A caller overriding one stream must not accidentally capture or suppress the other.
- **Raw author break.** Adding required `output` to raw invocation is an intentional breaking author-contract change. Migrate every in-repo definition/type/example atomically; ns is private/unreleased, so no compatibility shim is needed.
- **False Pi confidence.** A shallow fake that merely calls `deps.stdout` cannot prove Foundation stopped intercepting globals. Keep the Foundation ambient-write regression as the primary causal test and the Pi pending-widget test as end-presentation evidence.
- **Over-restoring legacy architecture.** Reusing root `ClinkrIo` would couple modern `/app` back to quarantined legacy ownership. Define the modern interface in `/app` and leave legacy deletion sequencing intact.
- **Semantic-model creep.** Do not cherry-pick PR #4124 wholesale. Its raw/output test ideas are evidence; its semantic presentation types and Pi authority are rejected for this plan.

### Assumptions

- Existing Pi `CliCommandRunDeps.stdout`/`stderr` callbacks remain the authoritative final-output channels.
- Direct terminal callers depend on optional `run()` options and process-backed defaults, so the adapter remains optional.
- `ClinkrCompletionResult` compatibility is more valuable than returning topology diagnostics as data for this repair.
- No external published consumer requires modern raw invocations without an output member; the package is private/unreleased and breaking changes are allowed.
- The active Clinkr Objective still requires one modern runtime/traversal and preservation of raw/progressive output. Revalidate before implementation because Objective state may advance.

### Non-blocking implementation questions

Resolve these from nearby code during implementation rather than reopening product requirements:

- final symbol names (`ClinkrOutput` versus a nearby clearer modern-app name);
- whether process-backed text/raw adapter factories remain private to `app.ts` or one is exported for Foundation reuse (prefer private unless a second real consumer requires the exact factory);
- whether `runForCliTest()` buffers raw bytes or shares a small decoder helper with Foundation (prefer locality over premature shared abstraction).

## Review and remediation

Before considering the work complete, perform a focused architecture review against the causal regressions:

- PR #3967: confirm modern Clinkr once again has a real embedded-host output seam while retaining the single filesystem runtime.
- PR #4013: confirm the temporary process-global workaround is fully deleted, not merely bypassed.
- PR #4121: confirm the SDK/ns host can remain on `defineClinkrAppCli` and now reaches Pi’s invocation callbacks directly.

Review along these axes:

1. **Ownership:** Clinkr renders; Foundation adapts; Pi presents captured channels; raw commands own bytes.
2. **Locality:** output selection is resolved once per invocation, not threaded as unrelated booleans or ambient state.
3. **Compatibility:** terminal text/bytes, stream choice, ANSI, diagnostics, and exit codes remain stable.
4. **Concurrency:** no process writer replacement, singleton capture lock, sequential-only caveat, or shared decoder state remains.
5. **Testing:** the exact ambient Pi/TUI contamination symptom is red-capable before the fix and green after it; tests use injected seams in shared-cache lanes.
6. **Surface discipline:** no parallel execution transport, semantic presentation framework, host-specific UI event, or legacy modern bridge was added.

If review finds a behavior mismatch, fix the owning layer and rerun the focused regression plus the broad gates. Do not preserve a mismatch with a Pi-only patch or a compatibility interception fallback. Record the causal finding—process-global interception captured unrelated Pi TUI output—in the eventual commit/PR rationale so future maintainers understand why invocation-local output is a hard architectural requirement.
