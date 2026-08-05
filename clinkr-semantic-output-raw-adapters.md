# Narrow semantic output intermediation for embedded Clinkr execution

## Goal and outcome

Eliminate the recursive Pi `/ns:flow:land` output-capture loop by removing process-global stdout/stderr interception from Clinkr and Foundation entirely.

Preserve the existing `ClinkrApp.run(...): Promise<number>` and `runNsCli(...): Promise<number>` contracts. Introduce only a narrow invocation-scoped final-presentation seam for structured commands and Clinkr framework responses. Keep existing Flow-owned live progress, selection, confirmation, and command-I/O channels unchanged; do not add phase, spinner, matrix, widget, or other host-specific UI concepts to Clinkr, Foundation, or the ns SDK.

The resulting ownership must be:

```text
structured command / Clinkr framework
  -> one aggregate semantic final-presentation value
  -> terminal adapter, Pi adapter, or test adapter

raw command
  -> explicit invocation-scoped byte output adapter
  -> terminal, Pi capture, or test capture

unrelated Pi TUI rendering
  -> process.stdout
  -> terminal only
```

Success means an embedded `ns` run inside Pi never replaces process writers, Pi TUI frames cannot enter command output, existing terminal-visible output and exit codes remain stable, raw commands retain exact-byte and arbitrary-exit behavior, and the obsolete interception module/export/tests/docs are deleted.

## Requirements resolved by grilling

- Use the narrow intermediate design rather than a general semantic event framework.
- Mediate only the final structured/framework presentation. Existing Flow/domain live channels remain as they are.
- Preserve `run(...): Promise<number>`; add an invocation-scoped output interface rather than a parallel `invoke()` entrypoint.
- Deliver structured/framework output once per invocation as an aggregate semantic final-presentation value, not stdout/stderr-like calls over time.
- Keep raw commands explicitly byte-oriented through an invocation-scoped raw output adapter.
- Delete process-writer interception entirely now, including its test utility, package export, isolated tests, and documentation.

## Context and discovered facts

### Incident evidence

The source incident occurred on branch `fix-flow-graphite-metadata-contract` during `/ns:flow:land`. The persisted Pi session is:

`/Users/schrockn/.pi/agent/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-07--/2026-08-05T18-22-26-137Z_019fd329-9759-7360-90fb-a8d1793889e1.jsonl`

The CLI trace is normally under:

`$XDG_STATE_HOME/ns/pi-cli-command-extension/ns-pi-cli-command-extension.jsonl`

Observed evidence:

- 2,891 `live_progress_output` events for one invocation;
- final captured stdout size 1,192,176 characters;
- exit code 0 after about 23.7 seconds;
- captured bytes contain Pi cursor-control sequences, the live `$ ns flow land · stdout N` widget, `[wt]`, `[gh]`, and the selection UI.

A bounded reproduction against `withInterceptedProcessWriters` proved that an unrelated `process.stdout.write("PI_TUI_FRAME")` during an intercepted command is captured as command stdout. The feedback chain is:

```text
Pi widget render
  -> process.stdout.write
  -> Clinkr process-writer interception
  -> Pi deps.stdout collector
  -> LiveCommandProgress.appendOutput
  -> requestRender
  -> Pi widget render
```

The command was not deadlocked; it waited for user selection, then completed. Flow/Graphite did not originate the captured terminal frames.

### Current architecture

- `@nseng-ai/pi-ns-flow` loads a fresh in-process `@nseng-ai/ns/cli` module for every command in `src/fresh-ns-cli.ts`.
- `registerCliCommandExtension` supplies `stdout`, `stderr`, `onOutput`, `onProgress`, `confirm`, and `select` to the in-process runner.
- `defineClinkrAppCli` in Foundation sees output overrides and wraps the modern app run in `withInterceptedProcessWriters`.
- Modern `TopologyClinkrApp.run` directly writes framework and structured final output to `process.stdout`/`process.stderr`.
- `runForCliTest` also relies on process-global interception.
- Modern raw definitions explicitly claim ambient process-byte ownership and currently receive only `{ argv }` or `{ context, argv }`.
- Clinkr already has an invocation-scoped `ClinkrIo` abstraction in the legacy/group surface, but the modern app intentionally does not use it. Do not blindly reuse or revive the legacy abstraction; define the smallest modern contracts required here.

### Active Objective constraints

This work overlaps `.ns/objectives/clinkr-readme-driven-development`.

Before implementation, reread:

- `.ns/objectives/clinkr-readme-driven-development/objective.md`
- `.ns/objectives/clinkr-readme-driven-development/roadmap.md`
- `.ns/objectives/clinkr-readme-driven-development/references/README-draft.md`
- `.ns/objectives/clinkr-readme-driven-development/references/implementation-contract-notes.md`

The Objective requires one modern Clinkr runtime/traversal, honest raw ownership, preservation of progressive output, and eventual deletion of transitional architecture. This plan does not introduce a general structured execution API or a second router. It adds one output intermediation contract to the existing run path because production evidence falsified the safety of ambient process capture.

Repo-wide orientations also apply, especially the standing test-performance requirement: default tests must remain deterministic, fake-driven, and safe under shared caches. Deleting interception should allow affected Clinkr tests to remain in the default lane rather than mutate process state.

## Interface design

Names below are recommended intent, not a mandate if nearby Clinkr vocabulary yields clearer names during implementation.

### Structured/framework final presentation

Add a modern Clinkr-owned aggregate value, for example `ClinkrFinalPresentation`, and an optional invocation callback such as `onFinalPresentation` to context-free and contextful run options.

The aggregate must describe purpose and content without naming terminal streams or Pi UI constructs. It should support:

- one optional primary presentation with a closed purpose such as command outcome, help, version, runtime information, completion script/candidates, or JSON Schema;
- rendered text where Clinkr owns human/Markdown/machine rendering;
- command outcome metadata needed by hosts, including output format and outcome status where applicable;
- zero or more formatted diagnostics with truthful diagnostic classification;
- exactly one aggregate callback per completed structured/framework invocation, including framework usage failures and topology/route failures.

A representative shape is:

```ts
type ClinkrFinalPresentation = {
  readonly primary?: ClinkrPrimaryPresentation;
  readonly diagnostics: readonly ClinkrDiagnosticPresentation[];
};
```

The exact primary union should be derived from existing navigation branches rather than invented speculatively. Do not create generic `phase`, `progress`, `message`, `spinner`, or matrix events. Do not expose raw internal topology objects or unvalidated handler outcomes.

When no callback is supplied, `TopologyClinkrApp.run` must pass the aggregate to a terminal adapter that preserves current stdout/stderr bytes and exit behavior. When a callback is supplied, the app must deliver the aggregate only to that callback and must not write process output for the final/framework presentation.

Diagnostics that accompany a successful primary result must remain representable; do not collapse the aggregate to one success/error text field. Preserve ordering where current user-visible behavior depends on diagnostics preceding primary output.

### Completion diagnostics

`ClinkrCompletionRuntime.complete()` currently writes topology issues directly to stderr even outside `run()`. Remove that ambient write. Carry completion diagnostics semantically in the completion result or through an invocation-scoped completion diagnostic collector, with the smallest compatible shape. The `run completion resolve` path must fold those diagnostics into its one final-presentation aggregate. Direct programmatic `complete()` callers must receive or be able to observe diagnostics without process side effects.

### Raw byte output

Extend modern `RawCommandInvocation` and `ContextfulRawCommandInvocation<TContext>` with an explicit byte-output adapter. It should support stdout and stderr bytes/chunks without adding newlines, rendering, outcome semantics, or exit-code policy. Prefer `string | Uint8Array` if exact current Node writer inputs must be retained; normalize only at host adapters that require strings.

Raw definitions continue to:

- own the selected argv tail verbatim;
- own input reading where needed;
- own exact output chunks;
- return arbitrary numeric exit status unchanged;
- bypass structured flags/rendering/schema/completion.

The default raw adapter writes to real process streams. Embedded/test runs supply capture adapters. Migrate every modern raw fixture/example/type expectation away from direct process writes.

### Foundation and ns SDK propagation

`defineClinkrAppCli` should construct and pass invocation output adapters directly; it must never replace `process.stdout.write` or `process.stderr.write`.

Keep existing `stdout`/`stderr` dependencies for compatibility and for existing command-context/live notification behavior, but stop treating them as implicit ambient capture. Add the semantic final-presentation callback through the Foundation and `NsCliDeps` layers so an embedded host can receive the aggregate before terminal routing.

Terminal/default callers should adapt final presentation and raw bytes to their configured writers. Existing `prepareRun` and `handleRunError` output behavior must remain explicit and compatible; distinguish lifecycle diagnostics they emit from the app’s aggregate final presentation.

### Pi adaptation

Extend `CliCommandRunDeps` and `CliCommandOutputDetails` only as needed to receive and retain the Clinkr final-presentation aggregate. The generic Pi CLI bridge must not learn Flow-specific progress vocabulary.

For a runner that provides semantic final presentation:

- use that aggregate as the authoritative final result;
- preserve existing `onOutput`/`onProgress` live widget behavior;
- preserve `confirm`/`select` behavior;
- render one final custom message through the existing `ns-cli-command-output` mechanism;
- do not concatenate Pi TUI/process output into final command details;
- keep legacy string capture as a compatibility fallback only for runners that do not yet provide semantic final presentation, if still required by non-modern CLI bridges.

Avoid double presentation: a semantic final result must not also arrive through the old stdout/stderr final-output collectors.

## Files, symbols, tests, and docs

### Clinkr modern runtime

- `ts/packages/public/infra/clinkr/src/app/app.ts`
  - `ClinkrRunOptions`, `ClinkrContextFreeRunOptions`
  - `ClinkrContextFreeApp`, `ClinkrContextfulApp`
  - `TopologyClinkrApp.run`
  - `emitTopologyIssues`
  - `emitTerminalOutcome`
  - all direct modern framework `process.stdout`/`process.stderr` branches
  - add aggregate construction and terminal adaptation without creating a second traversal
- `ts/packages/public/infra/clinkr/src/app/completion.ts`
  - remove ambient stderr emission and return/collect completion diagnostics semantically
- `ts/packages/public/infra/clinkr/src/app/index.ts`
  - export the narrow modern presentation types required by Foundation/hosts
- `ts/packages/public/infra/clinkr/src/raw/definition.ts`
  - add the raw byte-output adapter to invocation types and correct terminal-only/ambient-output documentation
- `ts/packages/public/infra/clinkr/src/app/testing.ts`
  - rewrite `runForCliTest` using semantic final-presentation capture plus raw byte capture; preserve its `{ exitCode, stdout, stderr }` public test result unless a proven incompatibility requires a synchronized fixture update
- `ts/packages/public/infra/clinkr/src/app/process-writer-interception.ts`
  - delete
- `ts/packages/public/infra/clinkr/package.json`
  - remove `./app/process-writer-interception`

### Foundation lifecycle

- `ts/packages/public/infra/foundation/src/cli-runtime/clinkr-app-cli.ts`
  - delete `runWithOutputOverrides` interception behavior
  - pass semantic final output and raw byte adapters invocation-locally
  - preserve `run(): Promise<number>`, prepare/build/error lifecycle, ANSI policy, and configured writers
- `ts/packages/public/infra/foundation/src/cli-runtime/index.ts`
  - export any new lifecycle dependency types needed by downstream callers

### SDK/ns host propagation

- `ts/packages/public/sdk/src/cli/index.ts`
  - extend `NsCliDeps` and pass semantic final presentation through `defineClinkrAppCli`
  - keep existing domain-owned `onOutput`, `onProgress`, `confirm`, and `select` unchanged
- `ts/packages/public/ns/src/cli/index.ts`
  - preserve the public runner facade while forwarding the new optional dependency
- Raw author surface and docs:
  - `ts/packages/public/sdk/src/sdk/command.ts`
  - `ts/packages/public/sdk/src/sdk/clinkr-command-adapter.ts`
  - `ts/packages/public/sdk/README.md`
  - `ts/packages/public/sdk/docs/writing-an-ns-extension.md`
  - `ts/packages/public/sdk/docs/sdk-reference.md`
  - type tests under `ts/packages/public/sdk/test/type/`

### Pi bridge and Flow host adapter

- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-extension.ts`
  - receive semantic final presentation, adapt it to existing final custom-message details, and prevent duplicate byte capture
- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/test/cli-command-extension.test.ts`
  - add the incident regression at the real bridge seam
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/src/fresh-ns-cli.ts`
  - normally remains a forwarding adapter; update types only if required
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/test/fresh-ns-cli.test.ts`
  - prove semantic callback forwarding/loading behavior if the adapter’s contract changes

### Tests and fixtures to migrate

- Delete `ts/packages/public/infra/clinkr/test/isolated/process-writer-interception.test.ts`.
- Update raw fixtures:
  - `ts/packages/public/infra/clinkr/test/fixtures/raw-tail/command.ts`
  - `ts/packages/public/infra/clinkr/test/fixtures/raw-contextful/command.ts`
- Update modern raw and type tests:
  - `test/app-raw-dispatch.test.ts`
  - `test/app-navigation.test.ts`
  - `test/type/command-definition-types.ts`
- Preserve broad `runForCliTest` consumers by changing the helper implementation rather than mechanically rewriting every assertion. Its consumers include modern Clinkr app tests and `ts/packages/incubating/infra/gitplane/test/scenario/cli.test.ts`.
- Update `ts/packages/public/infra/foundation/test/cli-runtime/clinkr-app-cli-entry.test.ts` to assert process writers are never replaced, unrelated process output is excluded, semantic final output is delivered once, and terminal bytes remain compatible.
- Revisit completion tests that currently spy on process streams; replace ambient-spy assertions with returned semantic diagnostics.

### Documentation/contract synchronization

- Rewrite `ts/packages/public/infra/clinkr/docs/terminal-integration-testing.md` to remove interception guidance and document invocation-scoped test capture.
- Update `.ns/objectives/clinkr-readme-driven-development/references/README-draft.md` testing and raw ownership sections.
- Update `.ns/objectives/clinkr-readme-driven-development/references/implementation-contract-notes.md` if it states ambient raw/process capture assumptions.
- Record roadmap status only if implementation completes a named Objective slice; do not rewrite historical Objective updates or ADRs.
- Run a stale-reference search for `process-writer-interception`, `withInterceptedProcessWriters`, and prose claiming modern raw commands own ambient process output.

## Implementation steps

1. **Establish the regression tests before production changes.**
   - Add a Foundation/Clinkr test that starts an embedded app with command capture, performs an unrelated `process.stdout.write("PI_TUI_FRAME")` during the active invocation, and asserts the frame is absent from captured command output.
   - Add a Pi bridge test with selection pending and a live widget render/update during the run. Assert final command details/custom message contain only command presentation, never widget text, cursor-control sequences, or recursively increasing counters.
   - Keep the repro bounded and non-mutating; never invoke real `ns flow land` in tests.

2. **Define the modern final-presentation contract in Clinkr.**
   - Inventory every `TopologyClinkrApp.run` terminal-emission branch and map it into the smallest closed primary-purpose union plus diagnostics.
   - Add aggregate construction helpers so every structured/framework return path produces exactly one aggregate.
   - Keep rendering policy in Clinkr where it already owns outcome validation, human/Markdown rendering, machine envelopes, help, schema, and completion text.
   - Add a terminal adapter as the default when no callback is supplied, preserving current bytes and exit codes.

3. **Make completion side-effect free.**
   - Remove direct stderr writes from `ClinkrCompletionRuntime`.
   - Carry topology diagnostics in the completion result/collector.
   - Fold completion diagnostics into the aggregate for shell completion commands and update programmatic completion tests.

4. **Introduce explicit raw byte output.**
   - Add byte writers to modern raw invocation types.
   - Pass the invocation adapter from `TopologyClinkrApp.run`.
   - Update raw fixtures, README/type examples, and SDK author types to use the adapter.
   - Prove verbatim argv, no framework newline, exact chunks, context delivery, and arbitrary exit status.

5. **Rewrite test capture without interception.**
   - Make `runForCliTest` provide an aggregate collector and raw byte collector.
   - Adapt the aggregate through the same terminal-presentation mapping used by production, but into in-memory writers.
   - Preserve the helper’s observable `{ exitCode, stdout, stderr }` contract so the large consumer set does not require same-shape assertion churn.
   - Delete the interception module and its isolated tests.

6. **Replace Foundation interception with direct adapters.**
   - Remove the interception import and `runWithOutputOverrides` behavior.
   - Construct terminal/default or embedded semantic/raw adapters from lifecycle dependencies.
   - Keep ANSI capability resolution tied to the selected presentation sink.
   - Prove concurrent unrelated process output is not captured and process writer identities never change.

7. **Propagate semantic final presentation through ns CLI layers.**
   - Add an optional callback to Foundation/SDK deps and forward it through `runNsCli`.
   - Ensure existing command-context `stdout`/`stderr`, transient `onOutput`, structured `onProgress`, and interactions retain their current ownership.
   - Ensure structured final output is not duplicated into old byte collectors when the semantic callback is active.

8. **Adapt the Pi CLI bridge.**
   - Consume the aggregate and convert it into existing `CliCommandOutputDetails`/custom-message presentation.
   - Keep generic bridge logic based on Clinkr purpose/status/diagnostics only; add no Flow-specific event vocabulary.
   - Preserve after-command hooks, usage-error editor restoration, command-finished events, headless fallback, tracing, and stale-context handling.
   - Add trace fields that make semantic-vs-legacy final delivery observable without logging full output.

9. **Delete stale export and update docs.**
   - Remove the package export and all imports/references to interception.
   - Synchronize raw-command docs with explicit invocation byte output.
   - Synchronize the Objective’s approved README draft/testing contract with the new safe seam.

10. **Review for accidental architecture expansion.**
    - Confirm no `invoke()` parallel entrypoint, second router, generic progress protocol, UI component vocabulary, dynamic extension bag, or ambient global capture was introduced.
    - Confirm terminal, Pi, and test behavior are adapters over one existing app traversal.

## Execution strategy for the refactor

This change has same-shape TypeScript contract edits across more than five implementation, fixture, test, and documentation files. Use the repository’s `refactor-swarm` execution strategy for the broad raw-invocation and documentation migration, with ownership split by coherent seam:

1. Clinkr modern app/final-presentation core;
2. raw invocation plus fixtures/type tests;
3. Foundation/SDK propagation;
4. Pi bridge regression/adaptation;
5. docs/Objective contract synchronization.

Before dispatching broad edits, inspect the TypeScript AST/type references for `ClinkrRunOptions`, `RawCommandInvocation`, `ContextfulRawCommandInvocation`, `ClinkrAppCliEntrypointDeps`, and `CliCommandRunDeps`. If a suitable repository AST/codemod tool exists at implementation time, use it for purely syntactic raw-invocation signature updates; otherwise use precise semantic edits within each owned cluster. Do not use an opaque ad hoc text-replacement script for mixed code/docs changes.

Finish with bounded stale-reference searches for deleted interception names and ambient raw-output prose. Preserve locality by changing `runForCliTest` once rather than rewriting its many consumers.

## Validation guidance

Start with focused red/green commands, then run repository policy gates appropriate to the touched public packages and Pi host packages.

Focused tests should include:

```bash
pnpm --dir ts exec vitest run --config vitest.config.ts \
  packages/public/infra/clinkr/test/app-public-seam.test.ts \
  packages/public/infra/clinkr/test/app-raw-dispatch.test.ts \
  packages/public/infra/clinkr/test/app-completion.test.ts

pnpm --dir ts exec vitest run --config vitest.config.ts \
  packages/public/infra/foundation/test/cli-runtime/clinkr-app-cli-entry.test.ts

pnpm --dir ts exec vitest run --config vitest.config.ts \
  packages/incubating/hosts/pi/runtime/pi-runtime/test/cli-command-extension.test.ts

pnpm --dir ts exec vitest run --config vitest.config.ts \
  packages/incubating/hosts/pi/extensions/pi-ns-flow/test
```

Also validate:

- Clinkr package tests and type fixtures;
- Foundation CLI-runtime tests;
- SDK tests, especially CLI scenarios and type tests;
- ns package CLI tests that capture `runNsCli` output;
- Pi runtime and pi-ns-flow package tests;
- integration tests for packed/runtime-loaded Clinkr command modules if raw invocation types changed;
- `just ts-format-check`, `just ts-lint`, and `just ts-check`;
- default `just`/`just check` as appropriate;
- `just ts-test-typescript-style-guard` because this removes process-global test mutation and changes shared-test architecture;
- integration/sanity lanes required by changed boundaries under `ts/AGENTS.md`.

Required behavioral assertions:

- no production or test code assigns `process.stdout.write`/`process.stderr.write` for Clinkr capture;
- unrelated process output during an embedded run bypasses command capture;
- each structured/framework invocation emits one aggregate final presentation;
- terminal output for help/version/runtime/schema/completion/outcomes remains byte-compatible where compatibility is intended;
- diagnostics preserve content and ordering;
- raw commands preserve exact chunks and exits;
- Pi selection/live rendering cannot feed final command capture;
- the original bounded reproduction is green after the fix.

Required stale checks:

```bash
rg -n --glob '!*.map' --max-columns 300 --max-columns-preview \
  'process-writer-interception|withInterceptedProcessWriters' ts docs .ns | head -n 200

rg -n --glob '!*.map' --max-columns 300 --max-columns-preview \
  'raw commands?.*(process output|process\.stdout|process\.stderr)|terminal-only by construction' \
  ts/packages/public/infra/clinkr ts/packages/public/sdk .ns/objectives/clinkr-readme-driven-development | head -n 200
```

The first search should return no shipped/test/doc references. The second should return only intentionally updated historical/provenance text, if any.

## Risks, assumptions, and open questions

### Risks

- **Semantic seam recreates stdout/stderr under new names.** Avoid stream-like methods for structured final output; emit one aggregate value with purpose and diagnostics.
- **Double output.** Existing ns command contexts still have stdout/stderr and command-I/O channels. Ensure the modern Clinkr final result takes exactly one route.
- **Completion diagnostics disappear.** They currently rely on ambient stderr. Make them explicit before deleting writes.
- **Raw migration weakens exact-byte behavior.** Keep a dedicated byte adapter and tests for no newline/chunk mutation.
- **ANSI behavior drifts.** Resolve capabilities from the actual final presentation sink, not ambient stdout when embedded.
- **Public interface inflation.** Export only the presentation and raw output types needed by Foundation/hosts; do not expose topology internals.
- **Objective contract drift.** Update the approved Clinkr draft and implementation notes in the same change; do not leave the new seam undocumented.
- **Fallback preserves the bug.** Do not retain interception as a compatibility path. Unknown direct process writes by raw commands should fail tests/migration review rather than be captured globally.

### Assumptions

- Breaking changes are allowed because ns is private and unreleased, but terminal-visible behavior should remain stable unless explicitly justified.
- Existing domain-owned progress/event channels are outside this remediation and remain valid.
- `runForCliTest` can keep its public result shape while replacing its internal mechanism.
- The modern raw command population is small enough to migrate explicitly.
- A generous Pi output-size ceiling may still be useful defense in depth, but it is not part of this narrow remediation unless implementation evidence shows it is needed to make the regression safe.

### Open questions for implementation judgment

These are non-blocking and should be resolved from nearby types/tests, not by widening scope:

- Exact names and closed variants for the final primary-purpose union.
- Whether completion diagnostics fit best as an optional field on `ClinkrCompletionResult` or an invocation-scoped collector; choose the smaller shape that eliminates ambient writes and preserves direct callers.
- Whether raw byte writers accept `string | Uint8Array` or a narrower existing writer type; preserve current exact-byte requirements.
- Whether non-modern CLI runners still require legacy stdout/stderr fallback in the generic Pi bridge; retain only a clearly separated compatibility path, never process interception.

## Review and remediation checklist

A reviewer should reject the implementation if any of the following are true:

- Clinkr/Foundation still mutates process writers for capture.
- The new interface contains phase, progress, spinner, matrix, widget, Pi, or Flow-specific concepts.
- A second navigation/execution path or new `invoke()` architecture appears.
- Structured final output is delivered more than once or both semantically and through byte capture.
- Raw commands still write ambient process output in modern fixtures/author contracts.
- `complete()` still produces hidden process side effects.
- `runForCliTest` remains isolated solely because it mutates process globals.
- Terminal compatibility, raw exactness, or Pi recursion is asserted only indirectly.
- Interception exports/docs/tests survive deletion.

If review finds the aggregate too broad, narrow its primary-purpose variants to branches that exist today rather than replacing it with a generic event bus. If review finds a direct process write in a raw command, migrate that command to the explicit byte adapter; do not restore interception. If Pi still duplicates output, trace semantic callback receipt and terminal adapter invocation separately and enforce one-owner delivery at the Foundation/SDK seam.