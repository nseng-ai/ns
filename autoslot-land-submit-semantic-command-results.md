# Plan: Replace Autoslot, Land, and Submit text adapters with semantic command results

## Goal and outcome

Complete the Flow command-result migration begun by PR [#4123](https://github.com/nseng-ai/ns/pull/4123). Replace the remaining transitional `{ text: string }` success results in `ns flow autoslot`, `ns flow land`, and `ns flow submit` with semantic, schema-validated command results and explicit command-edge renderers.

Land the work as a three-PR Graphite stack, in this order:

1. **Autoslot semantic outcomes and effect-based statuses**
2. **Land semantic outcomes and breaking command-face cutover**
3. **Submit composed checkpoint/publication result and breaking cutover**

The completed stack must:

- keep Clinkr's generic indented-JSON fallback unchanged; commands must not rely on special string rendering;
- return useful structured JSON data from each command;
- make settled human rendering a command-edge responsibility;
- preserve live progress, warnings, verbose subprocess output, telemetry, prompts, and mutation ordering;
- classify outcomes by durable effect rather than notification severity or integer exit codes:
  - a guardrail refusal or cancellation before mutation is `negative` (exit 1);
  - a completed mutation with skipped follow-up work is typed `success` (exit 0), with the partial completion explicit in data;
  - an operational, boundary, invariant, or post-mutation workflow failure is `failure` (exit 2), with completed effects retained in structured failure data where recovery needs them;
  - intentional non-mutating operations such as `land --dry-run` remain successful inspections;
- perform breaking cutovers of obsolete CLI-style exported entrypoints instead of retaining compatibility adapters or permanent parallel interfaces.

## Context and discovered facts

### Baseline and prerequisite

- Source branch at planning time: `flow-string-renderer-regression`.
- Baseline commit: `89b28bc4367c88ead0e3b39e3a6cb58f78b29684` (`Model Flow command results as structured data`).
- PR #4123 already converts the other affected Flow commands to structured success data and explicit renderers. It deliberately leaves Autoslot, Land, and Submit as `{ text: string }` transitional adapters.
- PR #4123 also preserves base SDK render capabilities while allowing invocation-level `canEmitAnsi` to override that capability. The follow-up renderers should consume those capabilities rather than reconstruct terminal state.
- The follow-up stack should be based on a branch containing PR #4123. Do not reintroduce the rejected Clinkr string fallback.

### Architectural direction

- Flow owns the `ns flow ...` Command Face and workflow policy. Presentation belongs at the command edge; renderer-independent workflow/domain facts belong below it.
- The `@nseng-ai/flow/land` domain core already owns canonical landing execution and rich `LandingExecutionReport` facts. Do not create a second competing landing report model.
- `@nseng-ai/flow/api` is a curated extension package API, not a compatibility dumping ground. Breaking removal is approved for obsolete entrypoints in this stack, but every known production consumer and package-boundary test must be migrated in the same PR.
- Preserve command/telemetry channel identity. In particular, land's command stream and telemetry must not be bypassed by constructing a differently channeled gateway.
- Do not add ambient Graphite dependencies or broaden provider-neutral contracts. The current workflows may remain Graphite-backed where they already are.

### Autoslot today

Current path:

`flowAutoslotCommand.handler` → `runFlowCli` → `runAutoslotCli` → `createAutoslotFlow` → autobranch checkpoint flow → optional Slots checkout.

Information is lost in three places:

- `createAutoslotFlow(...)` returns `Promise<void>` after converting typed results into notifications;
- `runAutoslotCli(...)` infers an integer exit code by observing error-level notifications;
- `runFlowCli(...)` converts that integer and captured text into `{ text }`.

Current semantic cases are:

1. autobranch guardrail refusal before branch creation;
2. autobranch operational failure before branch creation;
3. branch created, but slot movement skipped because the worktree is not clean;
4. branch created, but Slots checkout fails;
5. branch successfully moved to a slot.

Autobranch warnings are independent diagnostics. Slots success also performs parent-shell navigation preparation. The current code parses the new branch name back out of a rendered summary string; this must be replaced with a typed branch fact.

A current defect follows from text/stream-derived semantics: branch-created/slot-skipped emits a refusal on stderr, exits 0, and can also receive a generic `Autoslot completed.` stdout line from the outer runner.

### Land today

Current path:

`flowLandCommand.handler` → `runFlowCli` → `runLandCli` → private `runLandCommand` → `runLandingDispatch` → single-branch or stack landing.

- `LandOutcome` is only `{ type: "completed" } | { type: "failure"; failure }`, so success facts are discarded.
- Stack execution already has rich `LandingExecutionResult.report` data.
- Single-branch and stack paths render and notify below the command edge, then collapse to `LandOutcome` and finally an integer.
- Exit semantics are derived from `failureLevel(...)`, so an interactive decline can currently exit 0 while a noninteractive refusal exits 1.
- `runLandCli` is exported through `@nseng-ai/flow/api`, but repository search found no workspace production caller other than the current command path; its direct callers are tests and historical records. Revalidate this immediately before deletion.
- Land progress, matrix forwarding, failure-detail buffering, live progress, telemetry finalization, and optional verbose telemetry output are separate from settled result rendering and must remain operational.
- ANSI styling is CLI-edge-only. Do not leak styled output into shared/Pi orchestration.

### Submit today

Current path:

`createFlowSubmitCommand.handler` → flag authorization/model/hook setup → `runSubmitWithProgress` → checks → checkpoint → `runSubmitCommand` → submit readiness/restack → plan → Graphite submit → current-PR verification → authoritative branch/PR reconciliation → metadata inventory generation/application.

- `SubmitCommandResult` is process-shaped: `{ exitCode, stdout, stderr, failurePresentation?, rawFailureTranscript? }`.
- Rich success facts exist immediately before formatting: the `SubmitPlan`, reconciled PR links, newly-created/existing identity, metadata targets, applied inventory links, preview titles/first lines, and raw submit output.
- These facts are flattened by `formatSubmitSuccessText(...)` or fallback formatting into `SubmitCommandResult.stdout`.
- The command imperatively writes checkpoint stdout and submit stdout, then returns `ok({ text: "" })`.
- Desired settled output ordering is checkpoint result first, publication/inventory result second.
- Live Graphite submit output is intentionally streamed regardless of `--verbose`; other raw phases remain gated by `--verbose`. This is not settled result output and must remain separate.
- Partial failures after publication already retain some PR links in human output. The semantic result must retain those completed effects in machine-readable failure data too.

## Decisions settled by grilling

- Use a **three-PR Graphite stack**: Autoslot → Land → Submit.
- Redesign semantic statuses rather than preserving current severity-derived classifications.
- Apply the same **effect-based status rule** across all three commands.
- Perform a **breaking cutover** of obsolete public CLI-style entrypoints in each PR; do not keep thin compatibility adapters.
- Submit returns **one composed semantic success result** containing optional checkpoint facts followed by authoritative publication/inventory facts. A single command renderer owns final settled stdout.

## PR 1: Autoslot semantic outcomes

### Interface and result design

Introduce one explicit autoslot workflow result union, owned with autoslot workflow logic rather than presentation. Suggested shape (names may follow nearby conventions, but preserve these semantics):

- `refused`: no branch created; carries typed refusal reason/message and cwd;
- `failed`: no branch created due to operational failure; carries typed failure information and cwd;
- `branch-created-slot-skipped`: success; carries `branchName`, cwd, warnings, and a typed skip reason (`worktree-not-clean`);
- `branch-created-slot-failed`: failure after mutation; carries `branchName`, cwd, warnings, and structured Slots failure/cause;
- `moved`: success; carries `branchName`, `slotName`, `worktreePath`, cwd, warnings, and navigation guidance facts.

Do not use rendered headline/body strings as the result interface when the underlying facts exist. A domain-authored diagnostic message may remain data when no better typed cause exists, but presentation framing belongs in the renderer.

### Implementation steps

1. Deepen the autobranch success result used by Autoslot so it carries the created branch name directly. Remove `parseCreatedBranchName(summary)` and any test reliance on parsing `New branch: ...` presentation text.
2. Change `createAutoslotFlow(...)` from `Promise<void>` to the semantic autoslot result union. It may emit phases and warning diagnostics, but it must not emit the settled success/refusal/failure block.
3. Remove `runAutoslotCli(...)` and its integer/status-observer machinery. Remove it from `src/api/index.ts` and migrate all current callers/tests in the same PR.
4. Make `flowAutoslotCommand.handler` call the semantic workflow directly with the existing command context, model selection, command channel, Slot client, and phase/warning seams.
5. Add a Zod command-result schema for success variants. Map:
   - no-branch refusal → `negative`;
   - no-branch operational failure → `failure`;
   - branch-created/slot-skipped → `ok` partial-success data;
   - branch-created/slot-checkout-failed → `failure` carrying the created branch and Slots failure facts;
   - moved → `ok` moved data.
6. Put settled rendering in the command module or an autoslot presentation module called only by the command renderer. Reuse `renderAutoslotResultBlock`/Foundation result blocks. Ensure the partial-success renderer states both completed and skipped effects and does not emit `Autoslot completed.`.
7. Preserve autobranch warning routing to stderr and Slots parent-shell navigation behavior. Warnings should not determine status.
8. Update `@nseng-ai/flow/api` exports and the extension package API boundary test to reflect the breaking removal/renaming.

### Autoslot files and tests

Primary files/symbols:

- `ts/packages/incubating/extensions/flow/src/ns/commands/autoslot.ts`
- `ts/packages/incubating/extensions/flow/src/autoslot/autoslot.ts`
  - `AutoslotFlowInput`
  - `AutoslotCliInput`
  - `runAutoslotCli`
  - `createAutoslotFlow`
  - `parseCreatedBranchName`
- `ts/packages/incubating/extensions/flow/src/autoslot/presentation.ts`
- `ts/packages/incubating/extensions/flow/src/autoslot/slot-checkout.ts`
- `ts/packages/incubating/extensions/flow/src/autobranch/flow-result.ts`
- the autobranch result construction sites in `src/autobranch/dirty-worktree.ts` and `src/autobranch/latest-commit.ts`
- `ts/packages/incubating/extensions/flow/src/api/index.ts`
- `ts/packages/incubating/extensions/flow/test/scenario/autoslot-command.test.ts`
- `ts/packages/incubating/extensions/flow/test/scenario/flow-command-fakes.ts`
- `ts/packages/incubating/extensions/flow/test/unit/slot-checkout.test.ts`
- `ts/packages/incubating/extensions/flow/test/land/api-boundary.test.ts` or the applicable Flow API boundary test
- SDK Flow integration tests where the real extension command is exercised

Add scenario coverage for all five semantic cases, including JSON envelopes and exact status/exit behavior. Explicitly verify completed branch facts survive the slot-checkout failure case.

## PR 2: Land semantic outcomes and breaking cutover

### Interface and result design

Use the canonical land report wherever it already exists. Do not mirror `LandingExecutionReport` into a second domain model merely to satisfy the command.

Define a command/workflow-facing semantic union that can represent:

- successful dry-run with plan/report facts;
- successful stack execution, cleanup-only completion, and upstack continuation details;
- successful single-branch landing with landed PR/branch and cleanup facts;
- nothing-to-land or user cancellation as `negative` no-mutation outcomes;
- typed guardrail refusal as `negative`;
- operational/domain/invariant failures as `failure`, retaining the `LandingFailure`, failed phase, report, and already-landed chunks where available.

The command's Zod result schema should expose stable, useful result fields rather than phase-generated prose. Prefer schemas corresponding to existing canonical types; if the command should not expose every internal report field, project a deliberate command result from the canonical report in one mapping function.

### Implementation steps

1. Revalidate production consumers of `runLandCli` and `@nseng-ai/flow/api` immediately before editing. The approved direction is a breaking cutover: delete `runLandCli`, `LandCliInput`, and obsolete API exports after migrating every live caller.
2. Stop routing the SDK command through `landRawArgsFromCommandRequest(...)` followed by reparsing in `runLandCli`. Convert the already parsed command request directly into `LandingRequest`/the established typed land request at the command edge.
3. Replace private `runLandCommand`/`LandOutcome` ownership with a semantic Flow land workflow function that returns the result union. Delete `landCompleted()` and the bare completed arm once no caller needs them.
4. Refactor stack landing presentation sites so `LandingExecutionResult.report` flows back to the command. Existing progress events, matrix updates, prompts, confirmation gateways, command telemetry, and live command output remain side channels; settled blocks do not.
5. Refactor the single-branch fast path to return equivalent semantic facts instead of notifying and returning bare completion. Do not force it into a fake stack report; use an honest union arm if its facts differ.
6. Remove `renderResultBlock` from shared `PrintAwareLandStackCommandContext` if it becomes presentation-only residue after settled rendering moves out. Keep prompt rendering where interaction requires it, but do not let prompt presentation dictate final command status.
7. Centralize effect-based mapping at `flowLandCommand`:
   - user decline/noninteractive guardrail/no target to land → `negative`;
   - dry-run → `ok`;
   - completed merge/cleanup/continuation → `ok`;
   - execution/boundary/invariant failure → `failure`, even when prior chunks landed; include those facts in failure data.
8. Add explicit `renderHuman` (and `renderMarkdown` only if Markdown differs) driven by semantic result/report facts. Preserve the established house-style output and CLI-only ANSI boundary.
9. Keep `createLandMatrixCliProgress`, `createLandCliProgress`, telemetry finalization, failure-detail forwarding, and `progress.stop()` lifecycle intact. Update them to observe semantic completion rather than an integer exit code where necessary.
10. Update the curated Flow API exports, API allowlist/boundary tests, package README examples if they name removed symbols, and all direct `runLandCli` tests to exercise the new semantic interface or the public command entrypoint.
11. Update `ts/packages/incubating/extensions/flow/CONTEXT.md` in this PR because the authoritative Flow Land Execution/compatibility language currently names the old command adapter contract. Keep it synchronized with implemented ground truth, not ahead of it.

### Land files and tests

Primary files/symbols:

- `ts/packages/incubating/extensions/flow/src/ns/commands/land.ts`
- `ts/packages/incubating/extensions/flow/src/land/land.ts`
  - `runLandCommand`
  - `LandCliInput`
  - `runLandCli`
  - `createCliResultBlockRenderer`
- `ts/packages/incubating/extensions/flow/src/land/types.ts`
  - `LandOutcome`
  - `LandingExecutionResult`
  - `LandingExecutionReport`
- `ts/packages/incubating/extensions/flow/src/land/results.ts`
- `ts/packages/incubating/extensions/flow/src/land/landing-dispatch.ts`
- `ts/packages/incubating/extensions/flow/src/land/landing-execution.ts`
- `ts/packages/incubating/extensions/flow/src/land/single-branch-fast-path.ts`
- `ts/packages/incubating/extensions/flow/src/land/land-presentation.ts`
- `ts/packages/incubating/extensions/flow/src/land/stack/types.ts`
- `ts/packages/incubating/extensions/flow/src/land/stack/command-stream.ts`
- `ts/packages/incubating/extensions/flow/src/api/index.ts`
- `ts/packages/incubating/extensions/flow/CONTEXT.md`
- `ts/packages/incubating/extensions/flow/test/land/api-boundary.test.ts`
- `ts/packages/incubating/extensions/flow/test/land/unit/*`
- `ts/packages/incubating/extensions/flow/test/unit/land-stack-command-scenarios/*`
- `ts/packages/incubating/extensions/flow/test/unit/land-presentation.test.ts`
- `ts/packages/incubating/extensions/flow/test/unit/land-matrix-progress.test.ts`
- `ts/packages/incubating/extensions/flow/test/integration/land-stack-graphite-cli.test.ts`
- `ts/packages/incubating/extensions/flow/test/integration/land-stack-sandbox.test.ts`
- SDK Flow integration tests for human/JSON/ANSI behavior

Update tests that currently assert only integer returns from `runLandCli` to assert semantic outcomes and command status. Add explicit regression coverage for interactive decline changing from exit 0 to `negative`/exit 1, dry-run staying success, and partial landing failures carrying landed chunks.

## PR 3: Submit composed semantic result

### Interface and result design

Replace process-shaped `SubmitCommandResult` with a discriminated semantic workflow result. The exact type names may follow local vocabulary, but the result must separate:

- no-mutation refusal;
- operational failure before publication;
- failure after partial publication, carrying authoritative completed PR links and metadata application facts when known;
- successful publication with authoritative reconciled PRs and inventory results;
- successful publication where no authoritative PR URLs could be resolved, carrying a bounded recent-output diagnostic as a typed fallback arm rather than pretending it is an ordinary reconciled result.

Define one command success schema composed in execution/output order:

```text
{
  checkpoint: clean | checkpoint-created { summary, message },
  publication:
    | reconciled { prs, metadataApplied, metadataPreviews, ... }
    | submitted-unresolved { recentOutput, inventoryGenerated: false, ... }
}
```

Use existing `SubmitPrLink`, `SubmitPlan`, reconciliation, and `SubmitPrInventorySummary` facts. Do not retain pre-rendered success text as the primary machine contract.

### Implementation steps

1. Refactor `runCheckpointIfPending` or replace its use with a semantic checkpoint operation so Submit receives `clean`, `checkpointed`, `refused`, or `failed` facts rather than `exitCode/stdout/stderr`. Preserve checkpoint phase/progress events. Map trunk refusal to `negative`; map snapshot/model/commit boundary failures to `failure`.
2. Replace `SubmitCommandResult` in `submit-contracts.ts` with a semantic result union. Remove `exitCode`, `stdout`, and `stderr` from success ownership. Failure diagnostics may retain bounded raw transcript facts, but status and presentation category must be typed rather than inferred from integers or stream occupancy.
3. Refactor `runSubmitCommand` so the success path returns reconciled PR links, metadata target/application/preview facts, and the fallback arm directly. Move `formatSubmitSuccessText(...)` and `formatSubmitSuccessFallbackText(...)` out of workflow result construction; keep them as command presentation functions over semantic data.
4. Convert transport-readiness, restack, current-PR verification, reconciliation, and inventory failures to typed refusal/failure variants. Preserve existing deterministic failure catalog detail and raw-log remediation, but stop using `failurePresentation` plus exit code as the semantic discriminator.
5. Preserve the exact mutation order: checks → checkpoint → readiness/restack → initial plan → Graphite submit → current-PR verification → authoritative reconciliation → metadata preparation/application.
6. Compose checkpoint and publication facts in `runSubmitWithProgress` and return one `CommandExit` from `flowSubmitCommand`. Remove `writeCommandResultOutput(...)` for settled checkpoint/submit success. The command renderer prints checkpoint content first and publication/inventory content second.
7. Keep progress/matrix completion and `finally` cleanup intact. Keep live Graphite submit streaming and `--verbose`-gated raw phase streaming separate from final rendering.
8. Apply effect-based status mapping:
   - confirmation cancellation or readiness guardrail before mutation → `negative`;
   - operational checks/checkpoint/Graphite/GitHub/model/invariant failure → `failure`;
   - publication followed by reconciliation or metadata failure → `failure` with submitted PRs/partial metadata retained in data;
   - full publication and fallback publication-without-authoritative-links → `ok` with distinct success arms.
9. Add a Zod schema for the composed success result and structured failure data used by recovery. Human output should remain concise and equivalent in substance to current output; JSON should expose checkpoint, PR, and inventory facts.
10. Remove obsolete exports of `SubmitCommandResult` and migrate all internal callers/tests in the same PR. Revalidate `src/submit/index.ts`, `src/submit/ns-runtime.ts`, `src/api/index.ts`, and package-boundary tests.
11. Update `ts/packages/incubating/extensions/flow/CONTEXT.md` if the Flow Submit Boundary or Submit Plan descriptions need to reflect the new authoritative result owner.

### Submit files and tests

Primary files/symbols:

- `ts/packages/incubating/extensions/flow/src/ns/commands/submit.ts`
  - `runSubmitWithProgress`
  - `matrixPhaseFailureResult`
  - `submitFailureExit`
  - `writeCommandResultOutput`
  - failure interpretation/raw-log helpers
- `ts/packages/incubating/extensions/flow/src/checkpoint/checkpoint.ts`
  - `runCheckpointIfPending`
- `ts/packages/incubating/extensions/flow/src/submit/submit-contracts.ts`
  - `SubmitCommandResult`
- `ts/packages/incubating/extensions/flow/src/submit/submit.ts`
  - `runSubmitCommand`
  - `success`
  - success formatting call sites
- `ts/packages/incubating/extensions/flow/src/submit/submit-format.ts`
- `ts/packages/incubating/extensions/flow/src/submit/submit-failure-result.ts`
- `ts/packages/incubating/extensions/flow/src/submit/submit-transport-preparation.ts`
- `ts/packages/incubating/extensions/flow/src/submit/submit-plan.ts`
- `ts/packages/incubating/extensions/flow/src/submit/submit-pr-reconciliation.ts`
- `ts/packages/incubating/extensions/flow/src/submit/submit-pr-inventories.ts`
- `ts/packages/incubating/extensions/flow/src/submit/submit-pr-inventory-summary.ts`
- `ts/packages/incubating/extensions/flow/src/submit/index.ts`
- `ts/packages/incubating/extensions/flow/src/submit/ns-runtime.ts`
- `ts/packages/incubating/extensions/flow/src/api/index.ts`
- `ts/packages/incubating/extensions/flow/CONTEXT.md`
- `ts/packages/incubating/extensions/flow/test/scenario/submit-command.test.ts`
- `ts/packages/incubating/extensions/flow/test/unit/submit.test.ts`
- `ts/packages/incubating/extensions/flow/test/unit/submit-transport.test.ts`
- `ts/packages/incubating/extensions/flow/test/unit/submit-pr-reconciliation.test.ts`
- `ts/packages/incubating/extensions/flow/test/unit/submit-pr-inventories.test.ts`
- `ts/packages/incubating/extensions/flow/test/unit/submit-matrix-progress.test.ts`
- `ts/packages/incubating/extensions/flow/test/unit/extension-shared-flow-cli-runner.test.ts` if Submit no longer needs the generic runner
- SDK Flow integration tests for human, JSON, ANSI, and live-output behavior

Add scenario coverage for clean versus created checkpoint, reconciled success, success fallback without authoritative URLs, cancellation/refusal, pre-publication operational failure, and post-publication partial failure with PR links retained in JSON data.

## Cross-PR execution strategy

This is a semantic refactor across more than five mixed code/test/documentation files per PR. There is no suitable purely syntactic codemod: return types, statuses, presentation ownership, and test expectations require case-by-case judgment.

Use this execution strategy:

1. **Directly edit the owning seam first** in each PR: define the result union/schema and mapping rules before changing callers.
2. **Use `refactor-swarm` for the file-local migration wave** after the owning interface compiles conceptually: partition production call sites, tests/fakes, and API/docs checks into non-overlapping focused batches. Do not let workers independently invent result shapes; the parent-defined union is authoritative.
3. Prefer precise semantic edits over ad hoc `text.replace()` scripts.
4. Compile and run focused tests after each migration batch; do not postpone all type repair to the end.
5. End each PR with stale-interface greps:
   - Autoslot: `runAutoslotCli`, `AutoslotCliInput`, `parseCreatedBranchName`, `{ text: z.string() }` in autoslot.
   - Land: `runLandCli`, `LandCliInput`, bare `LandOutcome` completion constructors, CLI settled renderer fields below the command edge.
   - Submit: `SubmitCommandResult`, `exitCode`, success `stdout`/`stderr`, `writeCommandResultOutput`, `{ text: "" }`.
6. Also grep the package and SDK integration tests for assertions that expect string/text success data.

Keep each PR independently coherent: no branch should leave both old and new semantic owners active, and no compatibility bridge should be added solely to make an intermediate branch releasable.

## Validation guidance

Follow `ts/AGENTS.md`; use Node 24+, pnpm, native TypeScript 7, Vitest, oxfmt, and oxlint. At minimum on every PR:

- `git diff --check`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`
- focused Flow unit/scenario tests for the command changed
- focused SDK Flow integration tests
- `just ts-test-typescript-style-guard` when architecture/test seams change

Before submitting each PR, run the default repository validation entrypoint:

- `just`

Run specialized lanes based on touched boundaries:

- `just ts-test-integration` for real loader/Graphite/Git/sandbox compatibility affected by Land or Submit;
- `just ts-test-sanity` if real adapter sanity coverage changes;
- `just ts-test-isolated` only if an ambient/module/process contract is genuinely touched.

Do not introduce module mocks, fake timers, process mutation, or real external adapters in shared-cache default tests. Use existing in-memory gateway and command-context fakes.

For each PR, verify:

- human output remains professionally equivalent and ANSI is stripped/preserved according to sink capability;
- JSON envelopes contain structured data rather than rendered text;
- progress/live output is not duplicated by the final renderer;
- negative/failure output uses the correct stream and exit status;
- partial mutations remain visible in both human and JSON failure results;
- package exports and packed/runtime loader behavior remain valid after breaking removals.

## Risks and assumptions

### Risks

- **Presentation migration may duplicate output.** Land and Submit currently mix progress, notifications, live subprocess output, and settled output. Classify every emission before moving it; only settled output moves to command renderers.
- **Status changes affect automation.** Interactive Land decline and some submit/autoslot failures will change exit classification. Tests and README/help claims must make this deliberate behavior explicit.
- **Partial mutation can be misreported.** Autoslot and Submit can fail after durable effects. Result unions must retain completed branch/PR/metadata facts; do not collapse them into generic failure messages.
- **Land model duplication.** The canonical `LandingExecutionReport` already exists. A parallel command report would create two truth sources; project only at the command edge when necessary.
- **Graphite/provider coupling.** Structured results should describe Flow facts, not expose provider-private handles or make Graphite ambient in neutral contracts.
- **Breaking export removal.** Historical records mention the old entrypoints, but only live production imports matter. Re-run bounded production-consumer searches immediately before deletion and update curated API tests.
- **Large semantic migration.** Keep the three PRs separate and use the Autoslot result/status pattern as guidance, not as a generic shared framework abstraction. The commands do not share enough result vocabulary to justify a new cross-command result module.

### Assumptions

- PR #4123 is present beneath this stack.
- Breaking changes are acceptable because ns is private and unreleased.
- No current workspace production consumer requires `runLandCli` or `runAutoslotCli`; this must be revalidated before cutover.
- Existing canonical land and submit facts are sufficient to build useful machine results without changing external Git/Graphite/GitHub behavior.
- Help/version/runtime command surfaces remain framework-owned and unchanged.

### Open questions

No material product decisions remain open. Exact type and branch names are implementation details; choose names that match existing Flow vocabulary and keep the interfaces small and domain-specific.

## Review and remediation

Review each PR on two axes:

1. **Semantic contract**
   - Does every result arm correspond to a real workflow state?
   - Is status derived from durable effect and typed cause rather than stream text, notification level, or integer exit code?
   - Are partial effects preserved for recovery?
   - Is machine data free of presentation-only framing where typed facts exist?

2. **Ownership and locality**
   - Does workflow/domain logic return facts while the command renderer owns settled presentation?
   - Are progress, interaction, telemetry, and live command streams still at their proper seams?
   - Did the PR delete the old owner rather than layer a second interface beside it?
   - Are extension package API and `CONTEXT.md` synchronized with implemented ground truth?

If review finds missing facts, deepen the existing workflow result and its fake-driven tests; do not patch the renderer with parsing or hidden lookups. If output differs unintentionally, fix the command renderer over semantic facts rather than restoring captured text. If a live consumer of a removed entrypoint is discovered, migrate it in the same PR; do not add a compatibility adapter unless the user explicitly revisits the approved breaking-cutover decision.
