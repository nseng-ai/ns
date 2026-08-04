# Model shortcut prompts after model switching

## Goal and outcome

Extend every repo-owned Pi `/model:*` shortcut so it accepts optional trailing prompt text and executes that prompt immediately after the requested model has been selected successfully.

Examples:

- `/model:fable` continues to only switch models.
- `/model:fable summarize the current diff` switches to Fable and then submits `summarize the current diff` as the next user message.
- The same optional-prompt behavior applies uniformly to every entry generated from `MODEL_SHORTCUTS`, including aliases such as `/model:spud` and `/model:sol`.

Required user-visible semantics:

1. A missing or whitespace-only trailing argument preserves the existing switch-only behavior.
2. Prompt submission happens only after `pi.setModel(...)` reports success.
3. If model lookup or selection fails, preserve the existing error notification and do not submit the prompt on the previously active model.
4. When Pi is idle, submit the prompt normally so it immediately triggers a turn.
5. When Pi is already processing a turn, submit the prompt with `deliverAs: "steer"`, so it is delivered after the current tool calls and before the next model call—the closest Pi-supported interpretation of immediate execution.
6. Preserve the existing prompt text when forwarding it; use `args.trim()` only to detect an empty/whitespace-only prompt, rather than normalizing meaningful whitespace in a non-empty argument.

## Context and discovered facts

- The command family is generated from `MODEL_SHORTCUTS` in `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/core/model-shortcuts/extension.ts`. One loop registers every shortcut, so prompt behavior belongs in this shared handler rather than in per-model branches.
- The current handler intentionally ignores its `args` parameter and calls `switchToModel(...)`. That helper finds the model, retains the current thinking level, awaits `pi.setModel(...)`, and reports success or failure through `notifyCommandUi(...)`.
- Pi’s extension API exposes `pi.sendUserMessage(content, options?)`. When idle, a plain call sends an actual user message and triggers a new turn. While streaming/busy, Pi requires an explicit `deliverAs`; upstream Pi documentation and examples use `ctx.isIdle()` to choose between a plain call and `{ deliverAs: "steer" }`.
- The extension declares a deliberately narrow local `ExtensionAPI` and `CommandContext`. Package guidance says each extension should declare only the host capabilities it consumes, so these local interfaces should gain the minimal `sendUserMessage` and `isIdle` shapes rather than importing or exposing the full upstream host API.
- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/test/model-shortcuts.test.ts` uses a `FakePi` and fake command context. It already covers every shortcut’s model identity, retention of thinking level, missing models, unavailable models, deliberate suppression of generic acknowledgement UI, and headless notification behavior.
- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/parity/model-shortcuts.ts` derives one WAIVED parity record per shortcut. Its workflow currently says only “Switch the current Pi session model,” and its fallback says only to use the target harness’s model-selection mechanism. Both become incomplete once a shortcut can atomically switch and submit a prompt.
- `.pi/extensions/model-shortcuts.ts` is only a discovery adapter that imports the engineered implementation. No adapter change is needed.
- `docs/pi/README.md` only maps that discovery adapter to its owning implementation; it does not document command argument semantics. The command’s registered description and parity metadata are the relevant discoverability surfaces for this change.
- The active `package-disposition-and-host-ontology` Objective explicitly lists `model-shortcuts` among Pi-native functionality awaiting a later Internal package extraction. This feature must modify the current Pi Runtime implementation without opportunistically moving files or creating the future package; keep the host API seam narrow so the behavior remains easy to extract later.
- Model shortcuts are intentionally Pi-native and parity-WAIVED. This feature does not require another harness implementation, but the fallback must explain the equivalent two-step action: select the target model, then submit the prompt.
- The command is already registered through `registerCommandWithImmediateAck`, and focused tests deliberately require no redundant generic acknowledgement because model switching emits its own completion notification. The registration currently relies on the helper’s default `none`; while touching this registration, make that decision explicit with `{ delivery: "none" }` and retain/comment the existing rationale so behavior stays unchanged and the package’s explicit-delivery rule is satisfied.

## Files, symbols, tests, and docs

### Implementation

- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/core/model-shortcuts/extension.ts`
  - `CommandContext`
  - `ExtensionAPI`
  - `modelShortcutExtension(...)`
  - `switchToModel(...)`
  - Add a small prompt-dispatch helper only if it improves the linear success path; do not create a new module for this one-use behavior.

### Focused tests

- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/test/model-shortcuts.test.ts`
  - `FakePi`
  - `createContext(...)`
  - Existing parameterized shortcut tests
  - Existing lookup/selection failure tests
  - Existing acknowledgement regression test

### Parity metadata

- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/parity/model-shortcuts.ts`
  - Generated `workflow`
  - Generated `fallback`
  - Preserve `parity: "WAIVED"`, ownership, source package/module, and the Pi-native rationale.

### Surfaces expected not to change

- `.pi/extensions/model-shortcuts.ts`: remains a thin discovery adapter.
- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/parity/registry.ts`: continues loading the same generated records.
- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/test/parity.test.ts`: should remain unchanged unless validation exposes an exact metadata assertion not visible in current evidence.
- `docs/pi/README.md`: no update is required because its current statement is structural rather than behavioral.
- `.ns/objectives/cross-harness-parity/parity-table.md`: do not hand-edit an Objective artifact as part of this focused implementation; update it only if an existing repository generator/validation command identifies it as derived output that must be refreshed.
- `CONTEXT.md`: no vocabulary or ownership boundary changes, so no domain-language edit is required.

## Implementation steps

1. **Expand the narrow host contracts.**
   - Add `isIdle(): boolean` to the local command context contract used by model shortcuts.
   - Add `sendUserMessage(content: string, options?)` to the local extension host contract, with an options shape sufficient for the selected steering delivery mode.
   - Match the installed Pi API’s return type (`Promise<void> | void`) and option spelling exactly; do not guess or widen to unrelated capabilities.

2. **Make switch success explicit.**
   - Change `switchToModel(...)` to report whether selection succeeded (for example, `Promise<boolean>`), while retaining existing model lookup, thinking-level retention, error wording, success notification, and early-return structure.
   - Return failure after “not found” and “unavailable/auth” notifications; return success only after `pi.setModel(...)` has resolved truthily.
   - Keep prompt dispatch outside the failure branches so it is structurally impossible to run the prompt on the old model.

3. **Dispatch optional prompt text from the shared command handler.**
   - Use the handler’s `args` value instead of discarding it.
   - Await `switchToModel(...)`; stop immediately if it reports failure.
   - If `args.trim()` is empty, stop after the existing switch success notification.
   - If the context is idle, await `pi.sendUserMessage(args)` without delivery options so Pi immediately starts the new turn.
   - If the context is busy, await `pi.sendUserMessage(args, { deliverAs: "steer" })` so the prompt participates in the next model call.
   - Await the host call even though Pi may return synchronously; this preserves sequencing for both supported return shapes and allows command failures to propagate through the normal host boundary.
   - Do not catch and suppress `sendUserMessage` failures unless existing package conventions reveal a specific recoverable host error; a failed prompt injection must not be falsely reported as successful.

4. **Keep acknowledgement behavior explicit and unchanged.**
   - Pass explicit `{ delivery: "none" }` options to `registerCommandWithImmediateAck(...)` at the model-shortcut registration site.
   - Add or retain a concise rationale that the command’s model-switch notification (and, when present, the injected user message) already supplies visible completion, so a generic transcript/footer acknowledgement would be redundant.
   - Preserve the existing regression test asserting no custom ack message or status update on a rendered-message host.

5. **Update command discoverability.**
   - Revise each generated command description to state that it switches to the named model and can optionally run a prompt. Keep the target model reference in the text.
   - Update the registration-description expectation in the focused test rather than hard-coding separate descriptions per model.

6. **Extend fake-driven behavioral coverage.**
   - Give `FakePi` a captured user-message collection that records both content and whether steering options were supplied.
   - Extend `createContext(...)` with an explicit idle/busy input and an `isIdle()` implementation; default to idle so existing tests keep their intended setup.
   - Parameterize a successful prompt test across `EXPECTED_SHORTCUTS` to prove every generated `/model:*` command switches to its configured model and then sends the same prompt.
   - Add a busy-context test asserting `{ deliverAs: "steer" }` is used.
   - Add a whitespace-only test asserting the model switches but no user message is sent.
   - Strengthen both model lookup and model selection failure tests to assert no user message is sent.
   - Preserve the existing empty-argument tests, thinking-level assertion, headless behavior assertion, and acknowledgement regression.
   - If ordering is not self-evident from the awaited implementation, let the fake record model-selection and user-message events in one sequence and assert that `setModel` precedes prompt dispatch; avoid timers, module mocks, and ambient process mutation.

7. **Reconcile parity wording without changing parity status.**
   - Change each generated workflow description to cover selecting the model and optionally executing supplied prompt text.
   - Change the fallback to direct users of another harness to select the equivalent model first and then submit the prompt through that harness’s ordinary input mechanism.
   - Keep the feature WAIVED because the combined convenience remains Pi session-local; do not add cross-harness implementation code.

## Execution strategy

Use **precise, reviewed semantic edits** in the three affected TypeScript files. This is a small 1–4 file change with behavior- and prose-aware modifications; no AST codemod, ad hoc replacement script, or `refactor-swarm` is warranted. The individual model commands are generated from one table and registration loop, so do not edit eleven command implementations or tests separately—implement and test the shared path, using parameterized cases to guarantee coverage across the table.

After editing, run a bounded grep for stale model-shortcut wording such as `Switch the current Pi session model` and the old generated description expectation. Review each hit rather than globally replacing historical or Objective text.

## Validation guidance

Run focused checks first, then repository-standard validation appropriate to the touched TypeScript package:

1. Focused package test:
   - `pnpm --dir ts --filter @nseng-ai/pi-runtime test -- model-shortcuts.test.ts` if the package script/filter forwards the filename as expected; otherwise run the package’s declared test command and confirm `test/model-shortcuts.test.ts` executes.
2. Focused package typecheck:
   - `pnpm --dir ts --filter @nseng-ai/pi-runtime check`
3. Parity coverage:
   - Run the Pi Runtime test suite so `test/parity.test.ts` confirms the generated command inventory and parity metadata remain synchronized.
4. Standard repository gates:
   - `just ts-format-check`
   - `just ts-lint`
   - `just ts-check`
   - `just ts-test`
   - `just` as the default repository validation entrypoint when practical for the final change.
5. The change does not introduce architecture, time, process, real-adapter, or isolated-runtime behavior. Run specialized integration/isolated/style-guard lanes only if implementation expands beyond this plan or standard validation indicates a relevant obligation.
6. If formatting fails, use `just ts-format-fix`; if autofixable lint fails, use `just ts-lint-fix`, then rerun the failing gate.

Manual behavior smoke, if a Pi session is available after automated validation:

- `/model:fable` switches without starting a new prompt.
- `/model:fable reply with the active model name` switches and immediately starts a response from Fable.
- Invoke a shortcut with prompt text while busy and confirm it is treated as steering input rather than throwing.
- Temporarily exercise an unavailable shortcut configuration only through an existing safe test/fake path; do not mutate auth or user configuration merely for a smoke test.

## Risks, assumptions, and open questions

### Risks

- **Upstream Pi API drift:** `sendUserMessage` delivery-option and `isIdle` shapes belong to the third-party Pi harness. Verify against installed types/docs during implementation and keep the local contract minimal.
- **Accidental old-model execution:** Dispatching before the awaited successful `setModel` result, or dispatching from a failure branch, would violate the central safety decision. Failure-path assertions and optional event-order assertions guard this.
- **Busy-session exception:** Calling `sendUserMessage(args)` without `deliverAs` while busy throws upstream. The explicit `ctx.isIdle()` branch and steering test guard this.
- **Prompt mangling:** Trimming the content before forwarding could alter multi-line or intentionally spaced prompts. Trim only for emptiness detection and forward the original argument string.
- **Future package extraction conflict:** An active Objective plans to extract `model-shortcuts` from Pi Runtime. Avoid unrelated restructuring, new package exports, or broad host abstractions so this focused behavior can move intact later.

### Assumptions

- Slash command trailing text arrives in the handler’s `args` string, as documented and demonstrated by Pi’s upstream command examples.
- A successful `setModel` makes the selected model active before the awaited call resolves.
- Steering delivery is the required busy-session meaning of “immediately executed”; this was explicitly selected during requirements grilling.
- On selection failure, dropping the prompt rather than running it on the old model was explicitly selected during requirements grilling.
- No compatibility migration or durable data change is involved.

### Open questions

No material requirements remain unresolved. During implementation, the only non-product check is confirming the exact installed upstream TypeScript signature for `sendUserMessage` options; adapt the narrow local type to that source of truth without changing the settled idle/busy behavior.

## Review and remediation

Before declaring implementation complete, review the diff against these invariants:

- Every command still derives from `MODEL_SHORTCUTS`; no per-command behavior forks were introduced.
- The selected model and thinking behavior are unchanged.
- Empty arguments remain switch-only.
- Non-empty arguments are sent once, only after successful selection.
- Lookup and availability failures never send the prompt.
- Idle sends use ordinary delivery; busy sends use `steer`.
- Prompt content is preserved.
- Generic acknowledgement remains intentionally absent, now with explicit registration policy.
- Command help and parity fallback describe the expanded behavior.
- No package move, discovery-adapter rewrite, Objective artifact churn, or cross-harness implementation slipped into scope.

If review or tests reveal a defect, remediate in the smallest owning seam: host contract mismatch in the local interfaces, sequencing/failure behavior in `switchToModel` and the shared handler, or behavioral confidence in the fake-driven focused test. Do not solve a local typing issue by importing the full Pi extension API or by weakening types with `any`/double casts. Rerun the focused package suite and all previously executed validation gates after remediation.