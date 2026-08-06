# Plan: Complete Flow Command-Result Conformance, Then Require Explicit SDK Renderers

## Goal and outcome

Build two new Graphite PRs above the current stack tip, `flow-submit-semantic-command-results`:

1. **Flow conformance PR:** close the remaining cumulative Flow gaps around the invariant `typed request → handler → schema-validated typed result → renderHuman`, without redesigning every authored summary or diagnostic field.
2. **General SDK policy PR:** make `@nseng-ai/sdk` structured commands require both a result schema and a human renderer, with the handler result and renderer input derived from the concrete result schema; migrate every SDK wrapper and consumer so there is no permissive alternate authoring path.

The cumulative result must make presentation explicit for every ordinary ns SDK command while preserving generic Clinkr’s lower-level support for bodyless commands and JSON fallback.

The intended stack is:

```text
master
└─ flow-string-renderer-regression
   └─ autoslot-land-submit-semantic-command-results
      └─ flow-land-semantic-command-results
         └─ flow-submit-semantic-command-results   (current source branch)
            └─ <Flow conformance branch / PR>
               └─ <SDK required-renderer policy branch / PR>
```

Use Graphite for branch creation, commits/amends, restacking, and submission. Do not rewrite the four already-published lower PRs merely to make their intermediate states match the final policy; the two new PRs should repair the cumulative tip.

## Context and discovered facts

### Why this work exists

The original regression came from Flow commands using rendered terminal strings as their successful machine result, commonly via `resultSchema: z.string()` with no `renderHuman`. When Clinkr correctly applied its no-renderer JSON fallback, human output acquired JSON quotes and escaped newlines/ANSI.

The desired ns command contract is:

```text
request schema
  → handler returns semantic data
  → result schema validates that data
  → renderHuman receives that typed data
  → human output is emitted
```

JSON mode must serialize the same typed result data, never a pre-rendered terminal string.

### Current stack state

At `flow-submit-semantic-command-results`:

- All 12 structured Flow commands under `ts/packages/incubating/extensions/flow/src/ns/commands/` declare both `resultSchema` and `renderHuman`.
- Autoslot, land, and submit have already been converted to semantic success result schemas by the existing upstack PRs.
- `exec-read-graphite-branch-metadata` intentionally uses compact JSON as its default/human representation; this is a legitimate explicit renderer for a machine-oriented hidden command.
- Representative real-loader coverage already proves `pull-trunk` human terminal rendering and its JSON envelope in `ts/packages/public/sdk/test/integration/flow-extension-cli.test.ts`.

### Remaining Flow conformance gaps

The focused conformance bar is deliberately narrower than eliminating every string from result data. Typed authored content and diagnostic evidence can remain semantic fields for now. In particular, do not redesign model-authored summaries, commit messages, or submission diagnostic tails solely for this PR.

Concrete gaps found at the tip:

1. `ts/packages/incubating/extensions/flow/src/ns/commands/autoslot.ts`
   - `autoslotCommandExit` eagerly calls `renderAutoslotResult` before switching on the outcome.
   - Successful outcomes return `ok(result)` and are rendered again by the command’s `renderHuman`; the eager success render is discarded.
   - Rendering should occur in this helper only for negative/failure outcomes that currently carry a human message.

2. `ts/packages/incubating/extensions/flow/src/ns/commands/land.ts`
   - `landCommandExit` eagerly calls `renderLandWorkflowResult` before classifying the result.
   - Successful outcomes are converted to `landSuccessSchema` and rendered again by `renderLandSuccess`.
   - Compute the legacy workflow rendering only on negative/failure paths; success must flow to `ok(schema-validated-data)` without rendering first.

3. `ts/packages/incubating/extensions/flow/src/ns/flow-cli-runner.ts`
   - `FlowCliTextResult`, `FlowCliOutputCapture`, `createFlowCliOutputCapture`, and `runFlowCli` are the obsolete presentation-as-`{text}` capture path left by the regression repair.
   - Current production Flow commands use `runFlowCliOperation`; repository search found `runFlowCli`/capture consumers only in the corresponding unit test.
   - Preserve `runFlowCliOperation`, its exec-channel behavior, and related types. Delete only the obsolete text-result/capture layer if a fresh use search confirms there are no production consumers.

4. `ts/packages/incubating/extensions/flow/test/scenario/flow-command-fakes.ts`
   - The custom scenario dispatcher parses request data and invokes the handler/renderer, but does not parse successful data through `command.resultSchema` before calling `renderHuman`.
   - This differs from the real Clinkr runtime, where `decodeCommandOutcome` validates successful data before rendering.
   - Make the fake validate success data using the command result schema and pass the parsed value to the renderer. Since all Flow commands now declare both fields, fail loudly if either is absent rather than retaining a JSON fallback in this Flow-specific harness.

5. `ts/packages/incubating/extensions/flow/test/unit/extension-shared-flow-cli-runner.test.ts`
   - Remove tests dedicated to deleted text capture/result behavior.
   - Retain or relocate tests that still qualify `runFlowCliOperation`, trusted-vs-scoped exec behavior, cwd/env behavior, and live-output forwarding.

Presentation-shaped fields that are explicitly out of scope for this focused PR unless implementation reveals a correctness bug:

- `summary` in autobranch/latest-commit results;
- `summaryText` in changes/model-summary results;
- checkpoint `summary` plus authored `message` in cp/submit;
- submit `recentOutput` diagnostic evidence.

### SDK and Clinkr facts

- `ts/packages/public/sdk/src/sdk/command.ts` currently defines `DefineCommandSpec<S, T>` with optional `resultSchema?: z.ZodType<T>` and optional `renderHuman?: (result: T, ...) => string`.
- `ts/packages/public/sdk/src/sdk/clinkr-command-adapter.ts` currently reconstructs a broad `z.ZodType<T>` instead of preserving the concrete result-schema type.
- Generic Clinkr already has the correct schema-derived machinery in `ts/packages/public/infra/clinkr/src/app/command-definition.ts`:
  - `ResultOf<TResultSchema>` is `z.output<TResultSchema>`;
  - handler outcomes and renderers consume that result type;
  - omission of `resultSchema` intentionally represents bodyless success.
- Do **not** impose the ns policy on generic Clinkr. Clinkr fixtures and lower-level consumers legitimately exercise bodyless commands and fallback rendering.
- SDK built-ins in `ts/packages/public/sdk/src/extensions/built-in-extension-commands.ts` already supply schemas and renderers.
- The SDK README command example currently supplies a result schema but omits `renderHuman`.
- Several higher-level wrappers inherit SDK optionality and conditionally forward renderers. These must become strict too, or they remain an alternate path around the policy.

Known wrapper/migration surfaces include:

- `ts/packages/public/extension-kit/src/kit/ns-command.ts` (`NsDomainCommandOptions`, `createNsDomainCommand`);
- `ts/packages/public/ns/src/init/ns/command.ts`;
- `ts/packages/public/ns/src/harness-artifacts/ns/command.ts`;
- `ts/packages/incubating/extensions/branch-context/src/ns/command.ts`;
- `ts/packages/incubating/extensions/handoffs/src/ns/command.ts`;
- `ts/packages/incubating/extensions/objectives/src/ns/objective-command.ts`;
- `ts/packages/incubating/extensions/reviews/src/ns/command.ts`;
- `ts/packages/incubating/extensions/slots/src/ns/slot-ns-command.ts` and `slot-command-specs.ts`;
- `ts/packages/incubating/extensions/pr-feedback/src/exec-operation.ts` and its operation definitions.

Known direct test/documentation call sites that currently omit a renderer include:

- `ts/packages/public/sdk/test/type/sdk-types.ts`;
- `ts/packages/public/sdk/test/type/sdk-types-folded.ts`;
- `ts/packages/public/sdk/test/unit/extension-descriptor-sdk.test.ts`;
- generated SDK command fixtures in `ts/packages/public/sdk/test/integration/completion-cli.test.ts`;
- `ts/packages/public/sdk/README.md`;
- optionality prose in `ts/packages/public/sdk/docs/sdk-reference.md`.

Use the compiler after changing the central type as the authoritative inventory of additional SDK consumers; do not assume the reconnaissance list is exhaustive.

## Decisions and compatibility policy

- Enforce the new requirement at **`@nseng-ai/sdk`**, not generic `@nseng-ai/clinkr`.
- Require both `resultSchema` and `renderHuman` for every ordinary SDK `defineCommand` call.
- Preserve the concrete result schema in the generic type so the handler’s successful data and `renderHuman` input are both `z.output<TResultSchema>`.
- Keep `renderMarkdown` optional; existing Markdown fallback to `renderHuman` remains valid.
- Raw commands remain exempt because they intentionally own argv/output/exit behavior and do not use the structured command contract.
- Migrate every SDK wrapper and consumer in the policy PR; do not add an internal escape hatch or keep wrapper-level renderer optionality.
- Existing human-facing commands must preserve or add command-specific rendering.
- Machine-oriented/hidden commands may deliberately use an explicit deterministic JSON renderer. Match the previous fallback’s observable JSON bytes where compatibility matters. An inline `JSON.stringify` renderer is acceptable; a new shared helper is not required merely for policy conformance.
- Do not require every result schema to be an object. Arrays, discriminated unions, and intentional primitive results remain legal; explicit rendering is the enforcement mechanism.
- Do not redesign negative/failure rendering in this stack. The policy applies to structured successful result data and its renderer; broader typed failure presentation is adjacent work.

## Files, symbols, tests, and documentation

### PR 1: Flow conformance

Primary production files:

- `ts/packages/incubating/extensions/flow/src/ns/commands/autoslot.ts`
  - `autoslotCommandExit`
- `ts/packages/incubating/extensions/flow/src/ns/commands/land.ts`
  - `landCommandExit`
- `ts/packages/incubating/extensions/flow/src/ns/flow-cli-runner.ts`
  - retain `runFlowCliOperation` and exec helpers;
  - delete `FlowCliTextResult`, capture interfaces/options, `createFlowCliOutputCapture`, and `runFlowCli` if the use search remains empty outside tests.

Primary tests:

- `ts/packages/incubating/extensions/flow/test/scenario/flow-command-fakes.ts`
  - `runFlowCommand`
  - `writeCommandExitOutput`
- `ts/packages/incubating/extensions/flow/test/unit/extension-shared-flow-cli-runner.test.ts`
- Existing command scenarios for autoslot and land; add focused assertions only where needed to prove successful rendering occurs at the command renderer seam.
- `ts/packages/public/sdk/test/integration/flow-extension-cli.test.ts` as the real-host regression anchor; preserve its human/JSON dual assertions and add another representative assertion only if the changed fake cannot prove the relevant runtime behavior.

Potential context sync:

- Read `ts/packages/incubating/extensions/flow/CONTEXT.md` before editing. Update it only if current implemented vocabulary/ground truth changes; do not add aspirational policy prose ahead of PR 2.

### PR 2: SDK policy

Central API and adapter:

- `ts/packages/public/sdk/src/sdk/command.ts`
  - `DefineCommandSpec`
  - `NsCommand`
  - `defineCommand`
- `ts/packages/public/sdk/src/sdk/clinkr-command-adapter.ts`
  - preserve the concrete result-schema generic end to end.
- `ts/packages/public/sdk/src/sdk/index.ts` only if exported generic/type names change.

Type and unit evidence:

- `ts/packages/public/sdk/test/type/sdk-types.ts`
- `ts/packages/public/sdk/test/type/sdk-types-folded.ts`
- `ts/packages/public/sdk/test/unit/extension-descriptor-sdk.test.ts`
- Add negative compile-time assertions using the repository’s established type-test idiom:
  - missing `resultSchema` is rejected;
  - missing `renderHuman` is rejected;
  - handler success data incompatible with the schema is rejected;
  - renderer property access incompatible with the schema is rejected;
  - a discriminated-union schema narrows correctly in the renderer.

SDK integration fixtures:

- `ts/packages/public/sdk/test/integration/completion-cli.test.ts`
- Any generated/fixture command module that imports `defineCommand` from `@nseng-ai/sdk`.

Strict wrapper migrations:

- `ts/packages/public/extension-kit/src/kit/ns-command.ts`
- `ts/packages/public/ns/src/init/ns/command.ts`
- `ts/packages/public/ns/src/harness-artifacts/ns/command.ts`
- `ts/packages/incubating/extensions/branch-context/src/ns/command.ts`
- `ts/packages/incubating/extensions/handoffs/src/ns/command.ts`
- `ts/packages/incubating/extensions/objectives/src/ns/objective-command.ts`
- `ts/packages/incubating/extensions/reviews/src/ns/command.ts`
- `ts/packages/incubating/extensions/slots/src/ns/slot-ns-command.ts`
- `ts/packages/incubating/extensions/slots/src/ns/slot-command-specs.ts`
- `ts/packages/incubating/extensions/pr-feedback/src/exec-operation.ts`

Representative downstream command families to inventory and migrate:

- Branch Context commands under `ts/packages/incubating/extensions/branch-context/src/ns/commands/`;
- PR Feedback operation definitions in `primitive-commands.ts`, `download-feedback.ts`, `wait-for-checks.ts`, and adjacent `DefineExecOperationOptions` users;
- public ns init/harness-artifact command definitions;
- any Handoffs, Objectives, Reviews, or Slots definitions exposed by compiler failures;
- direct SDK commands in tests and extension packages.

Documentation and authoring policy:

- `ts/packages/public/sdk/README.md` — add an explicit renderer to the canonical example and state the schema/result/renderer flow.
- `ts/packages/public/sdk/docs/sdk-reference.md` — make result schema and human renderer required for structured SDK commands; retain optional Markdown rendering and raw-command exemption.
- `skills/internal/agent-engineering/ns-cli-design/SKILL.md` — strengthen the hard gate/result-envelope language so every structured ns command explicitly renders its schema-typed result.
- `skills/internal/agent-engineering/ns-cli-design/references/checklist.md` — add/check the required `renderHuman` criterion and explicit machine-oriented JSON exception.
- `ts/packages/public/sdk/CONTEXT.md` only if its current ground-truth description becomes stale after implementation.
- Reconcile the change with the active `clinkr-readme-driven-development` work item that says presentation facts move into typed outcome data before overrides are deleted. Record an Objective update only through the repository’s established Objective update workflow if the implementation materially changes that roadmap’s status; do not rewrite historical ADRs.

## Implementation steps

### Step 0: Establish branch and diff discipline

1. Confirm a clean worktree on `flow-submit-semantic-command-results` and inspect `gt branch info --no-interactive`.
2. Create the Flow conformance child branch with `gt create <flow-conformance-name> -m "..."`.
3. Keep PR 1 limited to cumulative Flow conformance. Inspect its reviewable diff against `flow-submit-semantic-command-results`, not against `master`.
4. After PR 1 is committed and validated, create the SDK policy branch as its child with `gt create <sdk-policy-name> -m "..."`.
5. Inspect each PR independently with its direct parent before submission. Submit/update only when authorized.

### Step 1: Remove eager success rendering in Flow

1. In `autoslotCommandExit`, switch on `result.type` first.
2. Return successful semantic variants directly with `ok(result)`.
3. Call `renderAutoslotResult` only inside refusal/failure arms that need a human outcome message.
4. Preserve structured failure/negative `data` and existing status/exit semantics.
5. Apply the same pattern to `landCommandExit`:
   - classify failure/refusal/nothing-to-land paths and render only there;
   - convert successful workflow results with `landCommandSuccess`;
   - validate successful data through `landSuccessSchema` and return `ok(data)`;
   - preserve the invariant-failure behavior if conversion unexpectedly returns `undefined`, but do not pre-render every successful workflow merely to prepare that branch.
6. Verify no success path calls `renderAutoslotResult`/`renderLandWorkflowResult` before returning typed data.

### Step 2: Delete the obsolete Flow text-result adapter

1. Re-run bounded `rg` for `runFlowCli`, `createFlowCliOutputCapture`, `FlowCliTextResult`, and `FlowCliOutputCapture` across `ts/packages/incubating/extensions/flow`.
2. If there are still no production users, delete the text-result/capture contracts and `runFlowCli` from `flow-cli-runner.ts`.
3. Preserve `runFlowCliOperation`, `execFlowCliCommand`, scoped/trusted exec selection, cwd/env handling, timeout behavior, and live-output callback behavior.
4. Reduce `extension-shared-flow-cli-runner.test.ts` to tests of the retained operation/exec module. Delete tests whose only subject is presentation capture converted into `{text}`.
5. If a real production user appears during revalidation, do not blindly delete the adapter. Convert that user to a semantic result first or split a named blocker; no presentation-text success adapter should survive silently.

### Step 3: Make the Flow scenario harness mirror the real structured seam

1. In `runFlowCommand`, continue parsing requests through `command.schema`.
2. After the handler returns success, require `command.resultSchema`, parse `result.data`, and use the parsed value for both the returned test result and human rendering (construct a success outcome with parsed data rather than retaining unvalidated data).
3. Require `command.renderHuman` in this Flow-specific harness and invoke it with `{ canEmitAnsi: false }`.
4. Remove the harness’s `JSON.stringify` fallback; an absent Flow renderer/schema is now a test failure.
5. Preserve negative/failure stream and exit-code behavior; do not make this PR redesign failure rendering.
6. Ensure machine-envelope test helpers observe schema-validated success data.

### Step 4: Qualify PR 1 and review its boundary

1. Run focused Flow unit/scenario tests, the real-loader Flow integration test, formatting, lint, and typecheck.
2. Run the full TypeScript default suite because shared Flow test infrastructure changed.
3. Grep for deleted adapter symbols and remaining `{ text: ... }` command-success bridges in Flow.
4. Review the direct-parent diff and confirm it does not redesign the intentionally retained summary/diagnostic fields.
5. Commit/amend PR 1 with Graphite.

### Step 5: Make the SDK result schema the generic source of truth

1. Refactor `DefineCommandSpec` from a loose value generic (`T`) to a concrete result-schema generic (`TResultSchema extends z.ZodType`).
2. Make `resultSchema: TResultSchema` required.
3. Make `renderHuman(result: z.output<TResultSchema>, capabilities)` required.
4. Type the handler outcome as `CommandExit<z.output<TResultSchema>>` (or the exact equivalent already provided by Clinkr’s `ContextfulCommandDefinition`).
5. Preserve the concrete schema generic through `NsCommand`, `defineCommand`, and `createContextfulCommand`; do not widen it back to `z.ZodType<T>` in `clinkr-command-adapter.ts`.
6. Keep optional fields conditional only where they remain optional (`renderMarkdown`, completion, positionals/options). Forward `resultSchema` and `renderHuman` unconditionally.
7. Do not change generic Clinkr’s `ResultSchema = z.ZodType | undefined`, its bodyless-command overloads, or its fallback renderer.

A representative target shape is:

```ts
export interface DefineCommandSpec<
  S extends NsCommandSchema,
  TResultSchema extends z.ZodType,
> {
  readonly schema: S;
  readonly resultSchema: TResultSchema;
  readonly handler: (
    context: NsExtensionApi,
    request: z.output<S>,
  ) =>
    | CommandExit<z.output<TResultSchema>>
    | Promise<CommandExit<z.output<TResultSchema>>>;
  readonly renderHuman: (
    result: z.output<TResultSchema>,
    capabilities: RenderCapabilities,
  ) => string;
  // existing optional authoring fields remain
}
```

Adapt this to the existing Clinkr type aliases rather than duplicating incompatible outcome definitions.

### Step 6: Make every higher-level SDK wrapper strict

1. Convert wrapper generics to preserve a concrete result schema rather than a detached `T` where practical.
2. Require `resultSchema` and `renderHuman` in wrapper option/spec types.
3. Forward both unconditionally to SDK `defineCommand`.
4. Keep handler adaptation and context construction unchanged.
5. For legacy-outcome adapters (Branch Context, Handoffs, Objectives, and similar), do not broaden this work into removing the legacy adapter unless needed for type safety. Ensure only that successful `data` is typed from the required result schema and reaches the required renderer.
6. In `createNsDomainCommand` and PR Feedback’s `defineExecOperation`, eliminate optional renderer forwarding. Make operation definitions provide their intended renderer.
7. Use TypeScript errors to find every remaining permissive wrapper or direct call.

### Step 7: Migrate SDK consumers without broad UX redesign

Classify each compiler failure:

1. **Existing renderer available:** thread it through the now-required wrapper field.
2. **Human-facing command with implicit/fallback output:** add a command-specific deterministic renderer over the typed result, preserving current meaningful output where tests/docs establish it.
3. **Machine-oriented or hidden command whose intended default is JSON:** add an explicit deterministic JSON renderer, matching prior fallback output shape/spacing when observable compatibility matters.
4. **Bodyless structured SDK command:** give it an explicit result schema and explicit renderer. Prefer a semantic empty object/result and `renderHuman: () => ""` when empty success is the real contract; do not weaken SDK policy to retain omission.
5. **Raw/TUI/streaming/process passthrough:** keep or convert to the existing raw-command seam only when it genuinely meets the documented raw exemption; do not use raw commands to avoid writing a renderer.

Do not replace semantic review with a bulk `renderHuman: JSON.stringify` insertion. Each human-facing command needs a deliberate representation.

### Step 8: Add type-level policy evidence

1. Update positive SDK type examples to include renderers and prove inference from their concrete result schema.
2. Add expected compile failures for omitted schema/renderer and mismatched handler/renderer data.
3. Include a discriminated-union example whose renderer narrows on its discriminator without casts.
4. Update folded-package type evidence so the published/root SDK surface enforces the same contract.
5. Update runtime/unit fixtures and completion integration fixture modules to satisfy the policy without changing what those tests are intended to prove.

### Step 9: Update docs and authoring guidance

1. Update the SDK README example to return semantic data and render that data explicitly.
2. Update the SDK reference: required schema, required `renderHuman`, optional Markdown renderer, raw exemption, and explicit-JSON allowance for intentional machine-oriented defaults.
3. Update `ns-cli-design` and its pre-ship checklist with the same invariant.
4. Ensure wording distinguishes ns SDK policy from generic Clinkr capability; do not claim Clinkr itself forbids bodyless or renderer-less definitions.
5. Run a final bounded grep for old optionality statements and examples missing renderers.

### Step 10: Qualify and review PR 2

1. Run compiler/type tests first to complete the migration inventory.
2. Run affected package tests for SDK, extension-kit, public ns, and each migrated extension family.
3. Run SDK integration/real-loader tests and TypeScript style guard because a public TypeScript authoring interface changed.
4. Run full repository validation before declaring completion.
5. Inspect PR 2 relative to the Flow conformance branch and confirm it contains general policy/migration only, not deferred Flow workflow redesign.
6. Commit/amend with Graphite and submit/update the two-PR stack only with explicit publication authorization.

## Refactor execution strategy

This plan contains same-shape edits across more than five files, mixed with semantic renderer decisions, tests, and documentation. Use the repository’s **refactor-swarm** strategy for the broad SDK consumer migration, partitioned by non-overlapping ownership areas (for example: central SDK/type tests; public ns + extension-kit wrappers; Branch Context/Handoffs/Objectives/Reviews; Slots; PR Feedback; docs). Keep the central SDK generic refactor and the two Flow command-helper changes as precise, manually reviewed edits.

Do not use an opaque repository-wide `text.replace()` script to insert renderers. Renderer selection is semantic and package-local. A codemod is appropriate only if a suitable existing TypeScript AST tool can perform a purely syntactic generic/field rename while preserving formatting; inspect the AST/tool contract before using one. Regardless of execution method:

- use `tsc` failures as the deterministic remaining-call-site inventory;
- reconcile every worker/batch against the central type before integration;
- run final bounded `rg` checks for stale optional renderer/schema forwarding, deleted Flow adapter names, and old documentation language;
- review human-facing renderers individually rather than accepting compile success as proof of UX correctness.

## Validation guidance

Follow `ts/AGENTS.md` and the `ns-typescript` toolchain. Use autofixers rather than hand-formatting formatter output.

### PR 1 focused validation

Run the narrow relevant package tests first, then broaden. Likely commands include the workspace’s package-targeted Vitest invocation for Flow plus:

```bash
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
```

Ensure `ts/packages/public/sdk/test/integration/flow-extension-cli.test.ts` executes in the integration lane. If formatting fails, run `just ts-format-fix`; for autofixable lint, run `just ts-lint-fix`, then rerun checks.

Required behavioral evidence:

- autoslot/land successful outcomes are rendered exactly once at `renderHuman`;
- failure/refusal output and exit statuses remain unchanged;
- Flow scenario success data is result-schema validated before rendering;
- human output remains unquoted/unescaped;
- representative JSON output remains the typed machine envelope;
- retained Flow exec operations preserve channel/cwd/env/live-output behavior.

### PR 2 broad validation

Because this changes a public SDK authoring type and many packages, run the full TypeScript gates listed by repo policy:

```bash
just ts-deps-check
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-isolated
just ts-test-sanity
just ts-test-typescript-style-guard
```

Then run the repository default:

```bash
just
```

If `just` reports a dprint failure, use `just dprint-fix` and rerun. Record any unrelated blocker rather than weakening the contract to obtain a green run.

Required policy evidence:

- omission of either required field fails at compile time through the public SDK import;
- schema output is the renderer and handler success type without casts;
- higher-level wrappers cannot omit the renderer;
- generic Clinkr bodyless/fallback tests still pass unchanged in intent;
- human-facing commands retain readable output;
- intentional machine-oriented commands retain explicit JSON output;
- `--format json` and `--json-schema` remain based on the typed result schema.

### Final stale-pattern checks

Use bounded searches, for example:

```bash
rg -n --glob '*.ts' --max-columns 300 --max-columns-preview \
  'FlowCliTextResult|createFlowCliOutputCapture|runFlowCli\\(' \
  ts/packages/incubating/extensions/flow | head -n 200

rg -n --glob '*.ts' --max-columns 300 --max-columns-preview \
  'renderHuman\\?|resultSchema\\?' \
  ts/packages/public/sdk ts/packages/public/extension-kit \
  ts/packages/public/ns ts/packages/incubating/extensions | head -n 200
```

Interpret matches; do not demand zero where optionality belongs to generic Clinkr or unrelated legacy types. Also inspect all `@nseng-ai/sdk` `defineCommand` examples/call sites for explicit schema and renderer presence.

## Risks, assumptions, and open questions

### Risks

- **Migration breadth:** requiring renderers at the SDK seam will expose indirect wrappers and generated fixtures beyond the initial inventory. Mitigate with schema-generic central types, compiler-driven inventory, and package-partitioned migration.
- **Accidental UX redesign:** adding renderers can tempt broad output rewrites. Preserve established human output unless a command has only ever intentionally emitted machine JSON.
- **Fake/runtime drift:** the Flow custom harness currently omits successful result decoding. Fix it to mirror the real seam, but avoid reimplementing all Clinkr terminal behavior in the fake.
- **Generic widening:** retaining `DefineCommandSpec<S, T>` or reconstructing `z.ZodType<T>` can make the renderer appear typed while losing the concrete schema relationship. Preserve `TResultSchema` end to end and prove it in type tests.
- **Wrapper loopholes:** optional renderer fields in `createNsDomainCommand`, `defineExecOperation`, or extension-local adapters would undermine the policy. Make wrappers strict rather than adding escape hatches.
- **Over-deletion in Flow:** `runFlowCliOperation` remains live and owns important exec-channel semantics. Delete only the obsolete text capture/result layer.
- **Stack reviewability:** the SDK policy PR may be broad. Keep the Flow cleanup separate and partition the policy migration coherently; do not squash both into one PR.

### Assumptions

- The source branch remains `flow-submit-semantic-command-results` when implementation begins.
- Existing lower PRs remain published and should not be amended solely for architectural neatness.
- Typed authored text (commit messages/model summaries) and diagnostic text can be legitimate result data; this stack enforces explicit schema/result/rendering flow rather than banning strings.
- Explicit compact/deterministic JSON is an acceptable `renderHuman` implementation for intentional machine-oriented commands.
- Generic Clinkr remains a lower-level module with broader capabilities than the stricter ns SDK author contract.

### Open questions

No material product or compatibility questions remain. If compiler inventory reveals a structured SDK command whose successful result is genuinely bodyless and for which `{}` plus an empty renderer would falsify an established machine contract, stop and document that concrete exception before weakening the global policy. Prefer modeling the real semantic success or using a genuinely applicable raw seam over making the required fields optional again.

## Review and remediation

### PR 1 review checklist

- Every Flow success path returns typed data without invoking its final human renderer first.
- `autoslotCommandExit` and `landCommandExit` still render negative/failure messages and preserve structured failure data.
- Deleted Flow text-capture symbols have no production consumers.
- The scenario harness validates successful result data and always uses the explicit Flow renderer.
- Per-parent diff contains no unnecessary redesign of summaries, commit content, or diagnostic tails.
- Human and JSON integration evidence remains green.

### PR 2 review checklist

- `resultSchema` and `renderHuman` are required in the public SDK type, not merely checked by docs or tests.
- `z.output<TResultSchema>` reaches both handler success data and renderer input.
- The SDK-to-Clinkr adapter preserves the concrete schema generic.
- Every higher-level SDK wrapper requires and forwards the renderer.
- No escape hatch, blanket cast, `any`, or `as unknown as` was introduced to quiet migration failures.
- Explicit JSON renderers appear only where JSON is intentionally the default representation.
- Generic Clinkr’s bodyless/raw/fallback contracts are not narrowed by ns-specific policy.
- SDK README, reference docs, and CLI-design checklist agree with shipped types.

### Remediation strategy

- If a package fails because its wrapper loses schema inference, repair the wrapper generic instead of casting individual commands.
- If a human-output snapshot changes unexpectedly, compare the old fallback/rendered bytes and preserve behavior unless the prior output was the known quoting/escaping defect.
- If a renderer needs facts absent from the result, add semantic facts to that command’s result schema and handler; do not render inside the handler or smuggle pre-rendered terminal output through a `text` field.
- If broad migration uncovers a substantial independent domain-result redesign, keep the required explicit renderer with compatibility output in PR 2 and record/split the deeper redesign rather than expanding this policy PR without review.
- After all fixes, rerun the complete validation and stale-pattern checks, then inspect each PR against its direct parent before publication.
