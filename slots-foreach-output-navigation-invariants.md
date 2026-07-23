# Repair Slots Navigation Protocol Invariants and Foreach Output-Mode Gating

## Goal and outcome

Address the two surviving findings from the thermo-nuclear review of PR #3828 without undoing its ownership change:

1. `ns slot foreach` must stop using parent-shell directive capability as a proxy for output format. Every non-human output invocation must require `--yes` rather than attempting an interactive confirmation, while human output retains its existing confirmation behavior.
2. The flat parent-shell directive fields in Slots machine results must encode only legal combinations, and Flow must reject malformed combinations at its external CLI boundary rather than manufacturing fallback warning text.

After the fix:

- `shouldWriteCdDirective` means only whether Slots may write an active parent-shell directive.
- `SlotCliContext` carries the host-selected Clinkr output format explicitly.
- `foreach` requires `--yes` whenever output format is not `human`, even if stdin is interactive and even if a directive path is active.
- The published flat wire fields remain stable:
  - `cdDirectiveStatus`
  - `cdDirectivePath`
  - `cdDirectiveFailureDetail`
- Their legal states are enforced in Slots and independently at Flow’s command boundary:
  - `inactive`: path is `string | null`; failure detail is `null`.
  - `written`: path is `string`; failure detail is `null`.
  - `failed`: path is `string`; failure detail is `string`.
- Flow maps a valid `failed` outcome to the existing non-fatal autoslot warning with no impossible-state fallbacks.
- Successful placement remains successful when the directive write itself fails.

## Context and discovered facts

### Provenance

- Planning branch: `slots-own-autoslot-parent-shell-navigation`
- Planning commit: `1af337e6a5a3a0f676be969664453b36bd716497` (`Make Slots Own Parent-Shell Navigation Outcomes`)
- Planning date: 2026-07-22 local / 2026-07-23 UTC
- PR: #3828, based on `flow-autoslot-checkout-gateway-gating`
- Worktree was clean when this plan was prepared.
- CI reported green for TypeScript, integration, isolated, style guard, dprint, Objective checks, and existing review tripwires before these follow-up fixes.

### Decisions resolved through grilling

- **Confirmation policy:** all non-human output formats require `--yes`, including an interactive JSON invocation. Output format, not terminal interactivity, owns this contract.
- **Wire compatibility:** preserve the newly published flat directive fields and enforce their legal combinations. Do not migrate to a nested `cdDirective` object in this fix.
- **Boundary ownership:** Slots owns the canonical producer schema/model. Flow remains package-decoupled from Slots and mirrors the wire invariant locally at its external `ns slot checkout --format json` boundary.

### Current-state anchors to revalidate before editing

The implementation session must compare these excerpts/symbol facts to live code before step 1. A material mismatch is a STOP.

1. `ts/packages/capabilities/slots/src/lifecycle/operations/foreach.ts` currently contains:

   ```ts
   if (!request.yes) {
     if (!ctx.shouldWriteCdDirective)
       return failure("confirmation-required", "ns slot foreach requires --yes in JSON mode.");
     const confirmed = await repoCtx.interaction.confirm({
   ```

   This is the incorrect capability coupling.

2. `ts/packages/capabilities/slots/src/core/context.ts` currently gives `SlotCliContext` `renderCapabilities` and `shouldWriteCdDirective`, but no `outputFormat`. `NsExtensionApi` already exposes:

   ```ts
   outputFormat?: ClinkrFormat;
   ```

   in `ts/packages/sdk/src/sdk/execution.ts`.

3. `ts/packages/capabilities/slots/src/ns/slot-ns-command.ts` currently binds:

   ```ts
   renderCapabilities: ctx.renderCapabilities,
   shouldWriteCdDirective: true,
   ```

   It does not yet pass `ctx.outputFormat` into the Slot context.

4. `ts/packages/capabilities/slots/test/support/run-scenario.ts` currently constructs every scenario context with:

   ```ts
   shouldWriteCdDirective: true,
   ```

   and `buildScenarioFixture` no longer receives argv. The scenario runner therefore needs argv-derived output format while keeping directive capability true for production fidelity.

5. `ts/packages/capabilities/slots/src/core/shell/cd-directive.ts` already has the coherent source result:

   ```ts
   export type CdDirectiveResult =
     | { status: "inactive"; path: string | null }
     | { status: "written"; path: string }
     | { status: "failed"; path: string; error: string };
   ```

6. `ts/packages/capabilities/slots/src/core/navigation-result.ts` currently flattens that result into three independent fields on `NavigationResultFields`, losing static invariants.

7. `checkoutResultSchema`, `gotoResultSchema`, and `gtNavigationResultSchema` each repeat three independent nullable directive fields in:

   - `ts/packages/capabilities/slots/src/lifecycle/operations/checkout.ts`
   - `ts/packages/capabilities/slots/src/lifecycle/operations/goto.ts`
   - `ts/packages/capabilities/slots/src/lifecycle/operations/gt/up.ts`

8. `ts/packages/capabilities/flow/src/autoslot/slot-checkout.ts` currently validates the same independent nullable fields and then uses:

   ```ts
   const path = checkout.cdDirectivePath ?? "the configured directive path";
   const detail = checkout.cdDirectiveFailureDetail ?? "directive write failed";
   ```

   Valid producer output makes both fallbacks unreachable; malformed output should be a protocol failure instead.

## Inherited evidence and revalidation

### Stable inherited evidence

- The thermo-nuclear review and adversarial challenge agreed that using `shouldWriteCdDirective` for `foreach` confirmation is an actual capability-boundary error.
- Clinkr already exposes output parsing helpers in `ts/packages/infra/clinkr/src/format.ts`, including `clinkrFormatFromArgs`, and `NsExtensionApi` already carries `outputFormat`; no new output-format vocabulary is needed.
- Flow intentionally crosses the command-exec seam and must not reintroduce a direct `@nseng-ai/slots` dependency or a high-level `SlotCheckoutGateway`.
- `CdDirectiveResult` is the canonical coherent source model for directive filesystem outcomes.
- The public machine field names are now documented in PR #3828 and must remain flat in this remediation.

### Volatile facts to revalidate

- Current branch attachment and clean/dirty state.
- Exact `SlotCliContext` construction sites and manual test contexts, using a bounded grep before making `outputFormat` required.
- Whether the installed Zod version’s intersection/discriminated-union composition preserves the desired `z.infer` output without casts. Inspect local dependency types or make a tiny compile-backed spike if necessary; do not guess.
- Current tests that assert `aborted`, `confirmation-required`, directive fallbacks, or malformed envelope behavior.

### Material unresolved questions

None. Exact helper/schema names may follow nearby conventions, but the semantics above are fixed.

## Scope

### In scope

- `ts/packages/capabilities/slots/src/core/context.ts`
  - Add an explicit Clinkr output-format fact to `SlotCliContext` and real context construction.
- `ts/packages/capabilities/slots/src/ns/slot-ns-command.ts`
  - Bind host-selected `ctx.outputFormat`, defaulting only at the host boundary if the compatibility optional is absent.
- `ts/packages/capabilities/slots/src/api/index.ts`
  - Supply the deliberate in-process/default output format when creating a real Slot context.
- `ts/packages/capabilities/slots/src/lifecycle/operations/foreach.ts`
  - Gate confirmation by output format, not directive capability.
- `ts/packages/capabilities/slots/src/core/navigation-result.ts`
  - Define the canonical coherent flat navigation result type/schema and map `CdDirectiveResult` exhaustively.
- Slots operation schemas:
  - `ts/packages/capabilities/slots/src/lifecycle/operations/checkout.ts`
  - `ts/packages/capabilities/slots/src/lifecycle/operations/goto.ts`
  - `ts/packages/capabilities/slots/src/lifecycle/operations/gt/up.ts`
  - Compose the canonical navigation schema instead of repeating permissive directive fields.
- `ts/packages/capabilities/flow/src/autoslot/slot-checkout.ts`
  - Mirror legal flat wire states at the external boundary and remove fallback warning text.
- Focused tests and shared test construction under:
  - `ts/packages/capabilities/slots/test/support/run-scenario.ts`
  - `ts/packages/capabilities/slots/test/scenario/foreach-cli.test.ts`
  - `ts/packages/capabilities/slots/test/scenario/checkout-cli.test.ts`
  - `ts/packages/capabilities/slots/test/scenario/goto-cli.test.ts`
  - `ts/packages/capabilities/slots/test/scenario/gt-navigation-cli.test.ts`
  - `ts/packages/capabilities/slots/test/unit/navigation-presentation.test.ts` only if type fixtures need coherent state updates
  - `ts/packages/capabilities/slots/test/unit/api.test.ts` and other manual `SlotCliContext` fixtures discovered by bounded grep
  - `ts/packages/capabilities/flow/test/unit/slot-checkout.test.ts`
  - Flow scenario fakes/tests only if their fixture types require coherent state updates.

### Out of scope

- Changing the flat machine field names or replacing them with a nested object.
- Changing directive environment names, precedence, filesystem behavior, wrapper behavior, or `--no-cd-directive` semantics.
- Reintroducing Flow-owned directive filesystem writes, a direct Slots package dependency, or a `SlotCheckoutGateway`.
- Broadly redesigning all progress/warning stderr policy. Other existing uses of `shouldWriteCdDirective` as a presentation proxy may be reported separately, but this plan changes them only if required to keep the new explicit output-format field coherent and tests prove a contract regression.
- Changing whether machine-mode progress may appear on stderr; machine stdout must remain a valid envelope.
- Updating Objective/README prose unless implementation reveals a statement that directly contradicts the fixed confirmation or directive-invariant contract.
- Publishing, amending, submitting, or mutating PR #3828; implementation is local unless separately authorized.

## Files, symbols, tests, and documentation

### Output-format and confirmation path

- `ts/packages/sdk/src/sdk/execution.ts`
  - `NsExtensionApi.outputFormat` is the existing host fact; no SDK change is expected.
- `ts/packages/infra/clinkr/src/format.ts`
  - Reuse `ClinkrFormat`/`clinkrFormatFromArgs`; do not add a Slots-specific parser.
- `ts/packages/capabilities/slots/src/core/context.ts`
  - `SlotCliContext`
  - `createRealSlotContext`
- `ts/packages/capabilities/slots/src/ns/slot-ns-command.ts`
  - `createSlotExtensionContext`
- `ts/packages/capabilities/slots/src/api/index.ts`
  - `resolveSlotContext`
- `ts/packages/capabilities/slots/src/lifecycle/operations/foreach.ts`
  - `runForeach`
- `ts/packages/capabilities/slots/test/support/run-scenario.ts`
  - `runScenario`
  - `completeScenario`
  - `buildScenarioFixture`
- `ts/packages/capabilities/slots/test/scenario/foreach-cli.test.ts`
  - Restore and broaden the machine-format `--yes` contract.

### Directive result and schema path

- `ts/packages/capabilities/slots/src/core/shell/cd-directive.ts`
  - `CdDirectiveResult` remains source truth; likely no behavior change.
- `ts/packages/capabilities/slots/src/core/navigation-result.ts`
  - `NavigationResultFields`
  - `prepareNavigation`
  - Add/export canonical navigation result schema(s) as appropriate.
- `ts/packages/capabilities/slots/src/lifecycle/operations/checkout.ts`
  - `checkoutResultSchema`
- `ts/packages/capabilities/slots/src/lifecycle/operations/goto.ts`
  - `gotoResultSchema`
- `ts/packages/capabilities/slots/src/lifecycle/operations/gt/up.ts`
  - `gtNavigationResultSchema`
- `ts/packages/capabilities/flow/src/autoslot/slot-checkout.ts`
  - `SlotCheckoutCommandResult`
  - `parseSlotCheckoutResult`
  - `checkoutSlot`
  - `buildSlotCheckoutEnvelopeSchema`

### Documentation

No planned documentation change. The desired behavior matches the current Slots README and updated Flow Objective records: Slots owns directive outcomes, machine output reports them, and write failure is non-fatal. Only edit prose if live text contradicts this plan after implementation.

## Implementation steps

### 1. Add an honest output-format fact to Slot command context

- Import/use the existing Clinkr `ClinkrFormat` type in `core/context.ts`.
- Add required `outputFormat: ClinkrFormat` to `SlotCliContext`.
- Make `createRealSlotContext` receive an explicit output format rather than deriving it from render capabilities or directive capability.
- In `createSlotExtensionContext`, pass `ctx.outputFormat ?? "human"`; the fallback exists only because the SDK field is compatibility-optional, not because absence is meaningful inside Slots.
- In the in-process Slot API composition, pass a deliberate default (`human`) because no mounted machine-output command is being rendered there.
- Update every manually constructed `SlotCliContext` found by bounded grep. Do not make `outputFormat` optional to reduce fixture edits; that would preserve the ambiguity this change is meant to remove.

Verification gate after this step: `just ts-check` must pass. If the field forces edits outside the declared Slots package/test scope, STOP and report the construction site rather than silently widening scope.

### 2. Restore deterministic machine-format confirmation semantics

- Change `runForeach` so the no-`--yes` branch checks `ctx.outputFormat !== "human"`.
- Preserve the existing `confirmation-required` error type and guidance, but update wording from “JSON mode” to “non-human output” or another accurate phrase if Markdown is supported by the command face.
- Human output continues through `repoCtx.interaction.confirm`, regardless of whether a directive path is active.
- Do not substitute `interaction.isInteractive()`; grilling explicitly chose format-based behavior, so interactive JSON still requires `--yes`.
- In `run-scenario.ts`, pass argv into fixture construction again and derive `outputFormat` with Clinkr’s canonical parser while leaving `shouldWriteCdDirective: true`.
- Restore the JSON scenario to expect `confirmation-required`; add a Markdown/non-human assertion if the mounted test surface supports it without testing framework internals. Preserve human confirmation/decline/abort coverage.
- Do not revert unrelated stderr-progress assertions solely because old fixture coupling had suppressed progress.

Verification gate: focused Slots `foreach` scenarios pass and prove that directive capability true + machine output still requires `--yes`.

### 3. Model the flat directive fields as a coherent state

In `navigation-result.ts`:

- Preserve the public flat keys, but replace the independent-field interface with a union that encodes the legal combinations.
- Keep clipboard/worktree fields as their own coherent base shape.
- Define one canonical Zod navigation schema whose inferred output preserves the directive union if Zod composition supports it cleanly. A suitable conceptual shape is an intersection of:
  - clipboard/worktree navigation object; and
  - a discriminated union on `cdDirectiveStatus` with the three legal variants.
- Derive `NavigationResultFields` from the canonical schema when that keeps runtime and static truth aligned. If Zod inference cannot express the intersection without casts, keep an explicit structural union beside a schema with `superRefine`, document why, and add compile/runtime tests; do not use `as unknown as` or weaken fields.
- Map `CdDirectiveResult` to flat fields through an exhaustive `switch`. The map should make illegal combinations impossible at construction and should not invent fallback path/detail values.
- Keep directive write failure as returned data; `prepareNavigation` must not throw for the expected `failed` result.

Verification gate: `just ts-check` plus focused Slots navigation unit/scenario tests pass.

### 4. Compose the canonical navigation schema into every Slots navigation result

- Update checkout, goto, and Graphite navigation result schemas to compose their operation-specific fields with the canonical navigation schema.
- Remove repeated clipboard/directive field declarations from those three modules where composition replaces them.
- Keep their resulting JSON shape flat and byte-compatible in field naming/value semantics.
- Ensure each operation’s inferred result type still satisfies its renderer and command spec without casts.
- Add malformed-combination schema tests at the canonical schema level or through representative command result schemas. Cover at least:
  - `failed` + null path;
  - `failed` + null detail;
  - `written` + null path;
  - non-failed + non-null detail;
  - valid inactive with null path;
  - valid inactive with non-null path (explicitly disabled active wrapper);
  - valid written and failed states.

Verification gate: focused checkout/goto/gt navigation tests pass; inspect emitted JSON assertions to confirm the flat shape is unchanged.

### 5. Mirror the invariant at Flow’s external command boundary

- Keep Flow independent of `@nseng-ai/slots`; define a local wire schema inside `buildSlotCheckoutEnvelopeSchema`.
- Preserve lazy schema construction at parse time, matching the prior review decision not to build unused module-level Zod schemas eagerly.
- Encode the same three legal flat combinations with a discriminated union/intersection or equivalent strict refinement.
- Let Zod rejection classify malformed combinations as `slot-checkout-invalid-envelope`.
- Make `SlotCheckoutCommandResult` carry a coherent directive outcome rather than three independent nullable fields where practical. It may remain flat if the union is explicit; do not expose directive evidence on `SlotCheckoutTarget`.
- Remove `?? "the configured directive path"` and `?? "directive write failed"`; a valid failed outcome supplies both values.
- Extend unit tests with the malformed combinations listed above and assert they are protocol failures. Preserve success, process/envelope mismatch, valid Slots domain failure, inactive/written success, and valid failed-warning coverage.

Verification gate: focused Flow slot-checkout unit and autoslot scenario tests pass.

### 6. Close out with stale-concept and scope review

Run bounded searches for:

- `shouldWriteCdDirective` uses in `foreach.ts` (none may govern confirmation after this fix);
- `requires --yes in JSON mode` (replace if inaccurate for all machine formats);
- repeated independent directive schemas in the three Slots operation modules;
- Flow fallback strings `the configured directive path` and `directive write failed`;
- `cdDirectiveStatus` declarations whose sibling fields remain independently nullable without refinement.

Review every changed test assertion to ensure green tests prove the intended contract rather than normalize a regression.

## Execution strategy

This is a 5+ file mixed TypeScript/schema/test refactor with same-shape edits across three operation schemas. Use the repository’s **refactor-swarm** strategy if available, with non-overlapping workstreams and one coordinating session:

1. **Output-format workstream:** Slot context/composition, `foreach`, scenario harness, and foreach tests.
2. **Slots protocol workstream:** canonical navigation model/schema, checkout/goto/gt schema composition, and Slots protocol tests.
3. **Flow boundary workstream:** local discriminated wire validation, fallback removal, and Flow tests, after the canonical legal states are fixed.

The coordinator must settle exact field/schema naming before parallel edits, integrate centrally, run formatting once, inspect the aggregate diff, and resolve any Zod inference mismatch. Do not use broad text replacement or an opaque script. There is no suitable existing AST codemod for semantic Zod-union construction; use precise edits after reading each affected schema. Finish with the stale-concept searches above.

## Validation guidance

Follow `ts/AGENTS.md`: use native TypeScript 7, Vitest, oxfmt/oxlint, and autofixers rather than hand-formatting formatter output.

Minimum targeted checks while iterating:

- Focused Slots tests covering `foreach`, checkout, goto, Graphite navigation, navigation presentation/schema, and API context construction.
- Focused Flow slot-checkout unit and autoslot scenario tests.
- `just ts-format-check` (run `just ts-format-fix` first if needed).
- `just ts-lint`.
- `just ts-check`.
- `git diff --check`.

Before completion:

- Run `just` and expect all default tests, style guard, formatting, lint, typecheck, dependency checks, and Objective checks to pass.
- Because context construction can touch isolated extension-context coverage, inspect `ts/TESTING.md` and run `just ts-test-isolated` if that lane is not included by `just` and any isolated Slot context test changed.
- Run integration tests only if a real extension/context integration file changed or the default gate does not cover the changed boundary.

No ordinary validation choice is a product decision; the implementing agent should broaden focused commands according to the actual diff and project policy.

## Risks, assumptions, and open questions

### Risks

- **Zod composition widens the inferred type.** An intersection/refinement may validate correctly while leaving TypeScript fields independently nullable. Verify both runtime rejection and static inference; do not paper over it with casts.
- **Context-field blast radius.** Making `outputFormat` required will expose every manual Slot context constructor. This is desired for honesty, but edits must remain within Slots composition/tests unless a real production constructor is discovered elsewhere.
- **Machine-format semantics accidentally broaden.** The chosen contract applies to every non-human format, not merely JSON. Use the existing `ClinkrFormat` rather than an `isJson` boolean.
- **Wire shape drift.** Schema composition must not nest fields or rename keys. Existing consumers expect the flat result.
- **Flow/Slots divergence.** Cross-package schema import is intentionally forbidden by the decoupling objective, so mirrored boundary validation can drift. Exact malformed-state tests on both sides are the protection; keep the legal-state table visible and identical.
- **Over-scoping stderr behavior.** Existing progress/warning uses of `shouldWriteCdDirective` may be suspicious, but this plan does not redesign them without a demonstrated contract requirement.

### Assumptions

- `NsExtensionApi.outputFormat` is populated by the host for mounted commands and defaults compatibly to human when absent.
- In-process Slot Capability API calls are not mounted machine-output invocations and may deliberately use `human` as their context output format while side effects remain separately controlled.
- Breaking private TypeScript shapes is acceptable; public machine field names remain stable.
- PR #3828’s ownership direction remains correct: Slots owns directive effects, Flow owns command selection/parsing and autoslot warning policy.

### Open questions

None material. Exact Zod composition syntax is implementation detail subject to compile-backed verification.

## Plan-specific STOP conditions

Stop and report instead of guessing if any of these occur:

1. Live code no longer contains the `foreach`/`shouldWriteCdDirective` confirmation coupling or the three flat directive fields described in the anchors.
2. Implementing a required `outputFormat` fact requires changing production packages outside Slots, SDK’s already-existing `NsExtensionApi` field, or the declared Flow boundary scope.
3. Preserving the flat wire keys while enforcing static and runtime invariants proves impossible without casts or a public shape change; report the Zod/type evidence before choosing a migration.
4. Flow can no longer validate the command result without importing Slots directly or recreating a high-level policy gateway.

A verification gate that fails twice after one reasonable local correction is also a STOP under the branch-context implementation protocol.

## Review and remediation

Before declaring completion, perform a focused architecture review:

- `shouldWriteCdDirective` controls directive writing only in the changed confirmation path.
- `outputFormat` is supplied at composition boundaries and is not inferred from ANSI/render capabilities, env presence, or interactivity.
- Machine `foreach` without `--yes` is deterministic and never prompts.
- `CdDirectiveResult` legal states survive flattening into the public wire shape.
- Slots operation schemas reject impossible combinations and share one canonical navigation schema.
- Flow rejects malformed directive combinations as invalid envelopes and contains no impossible-state fallback warning text.
- Flow still uses the injected command-exec seam, has no direct Slots dependency, and owns only parsing/warning policy.
- Directive write failure remains exit 0 after successful placement.

Trust-nothing closeout:

1. Rerun declared gates, including any needed isolated lane.
2. Compare `git diff --name-only` against the scope above; explain formatter-only changes and obtain approval for intentional out-of-scope edits.
3. Read the final changed tests and confirm they assert behavior, not merely snapshots adjusted to current output.
4. Inspect all documented deviations and ensure each has a validation covering it.
5. Re-run bounded stale-concept searches and `git diff --check`.
6. Do not commit, amend, push, submit, or mutate PR #3828 unless separately authorized.