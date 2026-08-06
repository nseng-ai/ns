# Summarize shared Pi CLI command results with a cheap model

## Goal and outcome

Add a follow-up to PR #4138’s compact footer-status work so every **executed** command registered through `registerCliCommandExtension` receives a cheap-model result summary before its durable Pi transcript entry is emitted.

The completed behavior is:

- Resolve the repository’s configured `fast` model profile for the shared command-result summarization operation.
- After `runCli` completes, preserve exact stdout and stderr in separate files under a unique operating-system temporary directory.
- Pass command metadata and bounded captured output to the configured model.
- For exit code `0`, show a concise success summary.
- For nonzero exit codes, show a concise summary with errors prominently identified.
- Replace normal inline raw stdout/stderr with the model summary and absolute paths to `stdout.log` and `stderr.log`.
- If model resolution, generation, or summary validation fails, fall back to the bridge’s current complete inline raw-output rendering and also show the raw-log paths.
- Keep parse errors, argument-mapping errors, and host-side positional-argument rejection deterministic and inline. Do not create logs or invoke a model unless the underlying CLI runner executed.
- Do not change the command exit code, completion event, usage-error editor restoration, or `afterCommandComplete` semantics because summarization succeeds or fails.

This plan deliberately does **not** add a second implementation to `.pi/extensions/just-fix.ts`; `/just` and `/just-ci` remain outside this follow-up until they consume the shared bridge.

## Context and discovered facts

- The source branch is `pi-cli-heartbeat-status-line`; PR #4138 replaces live widgets with `CliCommandStatusActivity` and currently renders complete captured stdout/stderr through the shared CLI bridge.
- `registerCliCommandExtension` is implemented in `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-extension.ts` and has two production consumers:
  - `@nseng-ai/pi-ns-flow`, which mirrors the Flow CLI command catalog.
  - `@nseng-ai/pi-ns-objectives`, whose shared-bridge use is the Objective list command.
- The bridge already captures stdout and stderr independently, creates `CliCommandOutputDetails`, emits a custom transcript message, publishes `emitPiExtensionCommandFinished`, restores usage errors to the editor, and invokes an awaited `afterCommandComplete` hook.
- Pre-run parse/mapping/positional failures also call `emitCliCommandOutput`, but they do not execute `runCli`; they must remain outside summarization and log persistence.
- The current formatter functions `formatCliCommandOutput`, `formatSuccessfulOutput`, and `formatFailedOutput` are the required raw fallback and should remain available rather than being replaced.
- The repository has an explicit `TextGenerator` contract at `@nseng-ai/sdk` and a shared model policy at `@nseng-ai/extension-kit/model-policy`. `resolveModelOperation` defaults an operation without an override to the required `[models.profiles.fast]` profile. There is no built-in model fallback.
- Add a named model operation ID for command-result summarization so repositories can later override it through `[models.operations]` while the default remains `fast`.
- Pi-host model invocation support already exists in `@nseng-ai/pi-runtime/models/call` as `callPiModelText`. It accepts an explicit `ModelSelection` and a Pi model registry/auth seam. Reuse or adapt this implementation rather than creating another direct `completeSimple` call.
- Local Pi type mirrors currently expose only a narrow model-registry shape in some contexts. Before wiring generation, inspect the installed Pi extension context types and align the project-owned mirror with only the registry/auth methods actually required by `callPiModelText`; do not reach for global model state.
- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/AGENTS.md` requires fake-driven host tests, explicit dependencies, and synchronous command acknowledgement. TypeScript test policy bans real filesystem/model work in the shared-cache default lane.
- `docs/conventions/consumer-gateways-and-command-shape.md` requires domain-first gateway interfaces and composition-root adapter construction. The result summarization module should accept narrow operations for raw-log persistence and model generation; real Node/Pi adapters belong at the host composition seam, while default tests use fakes.
- The active `clinkr-output-and-interaction-model` Objective says Pi owns host presentation and renderer safety while Clinkr owns rendering/stream selection and Foundation owns sink/byte adaptation. Keep summarization and temp-log presentation in the Pi host; do not move it into Clinkr or Foundation.
- User decisions from grilling:
  - Scope: all commands using the shared CLI bridge.
  - Transcript: summary only in the normal path, plus displayed raw-log paths.
  - Raw storage: separate temporary `stdout.log` and `stderr.log` files; absolute paths remain after command completion and eventual cleanup is delegated to OS temp policy.
  - Failure fallback: current complete raw transcript plus the log paths.
  - Model: configured `fast` profile.
  - Model input: complete combined command output up to one fixed total cutoff, then truncate once.
  - Invocation boundary: only outcomes from an executed `runCli`, not bridge-authored validation failures.

## Files, symbols, tests, and documentation

### Primary implementation

- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-extension.ts`
  - `CliCommandExtensionSpec`
  - `CommandContext` / `CliCommandExtensionAPI` model and composition seams
  - `runRegisteredCliCommand`
  - `CliCommandOutputDetails`
  - `emitCliCommandOutput`
  - `formatCliCommandOutput`, `formatSuccessfulOutput`, `formatFailedOutput`
- Add a focused module such as:
  - `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-command-result-summary.ts`
  - Own prompt construction, bounded-input assembly, output validation, deterministic transcript rendering, and the orchestration result union.
- Add a focused raw-log adapter module only if needed to keep Node filesystem code out of the pure summarization module, for example:
  - `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-command-result-logs.ts`
  - Own creation of one unique temp directory and secure writes of `stdout.log` and `stderr.log`.
- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/package.json`
  - Add a curated export only if a consumer composition root must import a newly separated helper. Keep private implementation relative when the shared bridge is the only caller.

### Model policy and composition

- `ts/packages/public/extension-kit/src/kit/model-policy.ts`
  - Add `MODEL_OPERATION_IDS.piCliCommandResultSummary` (recommended value: `pi.cli-command-result-summary`).
- `ts/packages/public/extension-kit/test/unit/model-policy.test.ts`
  - Verify the named ID and normal default-to-`fast` resolution.
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/src/extension.ts` and/or `src/project-extension.ts`
  - Wire only the explicit collaborators the shared bridge requires at the package’s composition root.
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-objectives/src/extension.ts`
  - Wire the same shared-bridge collaborators without duplicating summary policy or formatting.
- `ts/packages/public/extension-kit/src/kit/pi-types.ts` and/or the narrower Pi runtime type mirrors
  - Change only if needed to accurately expose the installed Pi model registry/auth surface used by the adapter.

### Tests

- Add `ts/packages/incubating/hosts/pi/runtime/pi-runtime/test/commands/cli-command-result-summary.test.ts` for pure prompt, truncation, validation, rendering, and fallback classification.
- Extend `ts/packages/incubating/hosts/pi/runtime/pi-runtime/test/cli-command-extension.test.ts` for shared-bridge orchestration and ordering.
- Add a narrow real-filesystem adapter test under the package integration lane if the Node temp-log adapter cannot be fully proven through an injected fake. Do not perform real filesystem writes in default tests.
- Update focused Flow/Objectives adapter tests only for explicit dependency wiring; do not restate all shared summary semantics in each consumer package.

### Documentation and domain sync

- Update `ts/packages/incubating/hosts/pi/runtime/pi-runtime/CONTEXT.md` after implementation to document that the shared CLI bridge owns Pi-side result summarization and temp-log path presentation.
- Update `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/README.md` and `ts/packages/incubating/hosts/pi/extensions/pi-ns-objectives/README.md` only if their current user-facing descriptions would otherwise falsely imply raw output is always rendered inline. Avoid duplicating the complete shared contract in both READMEs.
- Reconcile terminology with `.ns/objectives/clinkr-output-and-interaction-model/` during review. Do not edit the Objective’s immutable/history-like evidence merely to narrate this implementation; update authoritative current docs when ground truth changes.

## Implementation steps

### 1. Define the result-summary contract as a deep module

Create a small external interface for one operation: turn an executed `CliCommandOutputDetails` into a presentation result while preserving raw-log evidence.

Use a discriminated result that makes fallback explicit, for example:

- summarized: validated summary text plus `stdoutPath` and `stderrPath`;
- fallback: fallback reason plus `stdoutPath` and `stderrPath` when persistence succeeded;
- log-unavailable: persistence error requiring inline raw output and no invented paths.

Keep the public interface smaller than the implementation. Do not expose prompt fragments, filesystem primitives, truncation helpers, or Pi vendor response types to `cli-extension.ts`.

Inject narrow operations rather than constructing external adapters inside the workflow:

- a command-result log writer whose domain operation writes the two captured streams and returns their absolute paths;
- a text generator/model call operation receiving an explicit concrete `ModelSelection`;
- a model-policy resolver for the invocation cwd/repository.

If these collaborators repeatedly travel together from both Pi host adapters into the bridge, define one appropriately named shared bridge context rather than adding a growing dependency bag to `CliCommandExtensionSpec`. Do not create a context for only one collaborator.

### 2. Persist exact raw streams before model work

Implement a real Node adapter at the Pi host seam:

1. Create a unique directory with `mkdtemp(join(tmpdir(), "ns-pi-cli-result-"))` or an equivalently specific prefix.
2. Write exact captured stdout bytes-as-text to `stdout.log` and stderr to `stderr.log`, including empty files when a stream is empty.
3. Use restrictive file permissions (`0o600`) and rely on the temp directory’s private creation semantics.
4. Return normalized absolute paths.
5. Do not delete the directory in the command bridge, on model failure, or at command completion; OS temp cleanup owns retention.
6. If directory creation or either write fails, do not claim paths exist. Return a classified persistence failure and render complete inline output with a concise storage warning. Do not invoke the model without the promised raw-log evidence.

Write both logs before invoking the model so every normal or model-fallback transcript has valid evidence paths.

### 3. Add and resolve the model operation

Add `pi.cli-command-result-summary` to `MODEL_OPERATION_IDS` and resolve it through the repository model policy. With no `[models.operations]` override, `resolveModelOperation` must select `[models.profiles.fast]`.

At the composition boundary:

- determine the repository root through an existing injected Git/repository-root capability rather than assuming `ctx.cwd` is always the root;
- load `ns.toml` through the established project-config gateway;
- resolve the named operation to a concrete `ModelSelection`;
- invoke the existing Pi model call/TextGenerator seam using the command context’s registry/auth capability.

Do not hard-code a provider/model, inherit the current interactive model, or reactively reroute after failure. A missing/invalid policy or unavailable/auth-failing model enters raw fallback.

### 4. Build one bounded model input

Build a deterministic prompt from:

- source CLI and command display name;
- slash-command name and argv;
- cwd;
- exit code and success/failure classification;
- labeled stdout and stderr.

Honor the selected **full-until-one-limit** policy:

1. Construct the complete prompt body in a stable order: metadata, stdout, then stderr.
2. Apply one fixed combined character cutoff to that body rather than independent per-stream head/tail budgets.
3. Preserve the prefix up to the cutoff and append an explicit truncation marker with the number of omitted characters.
4. Keep the full streams only in the temp logs.

Use a named constant with an explanatory comment and tests at below/exactly/above the boundary. A conservative initial implementation value such as 40,000 characters is acceptable; verify it against the configured cheap-model expectations and existing prompt-size conventions before finalizing. Cap model output separately (for example 512 tokens).

### 5. Define prompts and validate output

Use distinct outcome instructions while sharing one operation:

- Success prompt: concise factual summary of what completed and any notable warnings; do not invent errors.
- Failure prompt: concise overall summary plus a visibly separate error section that quotes or faithfully paraphrases the actionable failures, includes the exit code, and does not bury errors in generic prose.

Prefer a strict, easy-to-validate Markdown grammar that the host can render without trusting arbitrary structure. Recommended grammar:

- success: `## Summary` followed by one to four bullets;
- failure: `## Summary` followed by one to four bullets, then `## Errors` followed by one to four bullets.

Normalize terminal controls/model whitespace at the Pi presentation seam. Reject empty output, missing/extra required sections, excessive bullets, code fences, and terminal control characters rather than trying to repair arbitrary output. An invalid summary enters raw fallback.

Paths are host-authored evidence, never model output. Mechanically append:

- `stdout: /absolute/temp/.../stdout.log`
- `stderr: /absolute/temp/.../stderr.log`

This prevents model omission or path fabrication.

### 6. Integrate after runner completion without changing command semantics

In `runRegisteredCliCommand`:

1. Preserve current capture and exception-to-stderr behavior.
2. Keep `CliCommandStatusActivity` active after `runCli` returns and set a display-ready phase such as `summarizing command result` while logs/model work occur.
3. Build `CliCommandOutputDetails` once.
4. Persist logs and attempt summarization.
5. Close the activity in a final lifecycle path even when persistence/model work throws.
6. Emit one durable result message:
   - valid summary plus two paths on normal success;
   - current complete `formatCliCommandOutput(details)` plus two paths when model policy/generation/validation fails;
   - current complete output plus storage warning when logs cannot be created.
7. Continue to publish the completion event, restore CLI usage errors, and run `afterCommandComplete` from the original `details`, not from model output.

Preserve ordering guarantees explicitly. The completed command event and `afterCommandComplete` should remain downstream of durable result emission unless existing tests demonstrate a required alternative. Model failure must never modify `details.exitCode`, `details.level`, recovery decisions, or notifications.

Leave the pre-run `emitCliCommandOutput` call sites on the deterministic formatter. Do not create a general “summarize any bridge message” abstraction.

### 7. Preserve non-UI and degraded host behavior

The bridge currently falls back from custom rendered messages to notifications and process stdout/stderr. Use the same summarized/fallback display string across those delivery targets.

Ensure:

- successful executed commands still write their presentation to stdout in a no-UI host;
- failed executed commands still write to stderr;
- raw-log paths are present in all executed-command delivery modes when persistence succeeded;
- stale Pi contexts suppress UI delivery as today but do not leak timers;
- completion behavior remains best-effort and does not trigger a new model turn.

### 8. Update tests by ownership level

Pure summary-module tests should cover:

- success and failure prompt differences;
- failure requirement for an `Errors` section;
- deterministic metadata/stdout/stderr order;
- one combined cutoff, exact boundary, and omission marker;
- valid summary normalization;
- invalid/empty/malformed output classification;
- mechanical path rendering and terminal-control sanitation;
- model-policy/model-call failure classification.

Fake-driven shared bridge tests should cover:

- successful command → two log writes → one model call → summary-only transcript with both paths;
- failed command → failure prompt → summary with highlighted errors and error-level transcript;
- model resolution/generation/validation failure → complete current raw rendering plus both paths;
- log persistence failure → no model call, current raw rendering, storage warning, no fake paths;
- empty stdout/stderr still create two files and produce a useful success/failure summary;
- `runCli` exception is captured into stderr, logged, and summarized as a failed command;
- pre-run parse/map/positional errors make neither log nor model calls;
- completion event, usage restoration, and `afterCommandComplete` receive unchanged raw `CliCommandOutputDetails`;
- status advances to summarization and always clears.

Keep one narrow integration test for actual `mkdtemp`/secure file writes and exact contents, placed in the integration lane. Consumer adapter tests should prove wiring only; do not duplicate summary grammar tests in Flow and Objectives.

### 9. Synchronize documentation after ground truth changes

Update Pi Runtime context vocabulary to state that:

- the shared Pi CLI bridge captures command output;
- Pi persists exact raw stream evidence in temporary files;
- Pi asks the configured model policy’s command-summary operation to produce host presentation;
- Pi mechanically presents evidence paths and falls back to raw output on summarization failure;
- this is Pi host presentation, not Clinkr rendering or Foundation stream adaptation.

Only then adjust Flow/Objectives package READMEs if required for truthful user-visible behavior.

## Refactor execution strategy

This work has same-shape composition edits in two host adapter packages (`pi-ns-flow` and `pi-ns-objectives`) plus semantic changes in the shared runtime and tests. It does **not** cross the five-file-local-edit threshold for a broad mechanical rename, and the files have different composition shapes.

Use precise, read-before-edit changes rather than an opaque text-replacement script or refactor swarm:

1. Implement and test the shared summarization/log module first.
2. Integrate the shared bridge.
3. Wire Flow and Objectives independently at their composition roots.
4. Update their focused tests independently.
5. Run a final bounded grep for stale direct shared-bridge registrations lacking the required summarization context and for old assumptions that executed command output is always inline.

If implementation discovery reveals five or more additional registrations requiring the same local edit, stop and switch that mechanical portion to `refactor-swarm` as required by `skills/incubating/branch-context/enriched-plan-save/references/refactor-execution-strategy.md`.

## Validation guidance

Run focused tests during development, then repository-required gates:

```bash
pnpm --dir ts exec vitest run \
  packages/incubating/hosts/pi/runtime/pi-runtime/test/commands/cli-command-result-summary.test.ts \
  packages/incubating/hosts/pi/runtime/pi-runtime/test/cli-command-extension.test.ts

just ts-test-integration
just ts-test-typescript-style-guard
just
```

Also run focused Flow/Objectives package tests after composition changes. Use `just ts-format-fix` and `just ts-lint-fix` for autofixable formatter/linter failures, then rerun checks.

Final evidence checks:

- `rg` all `registerCliCommandExtension(` production call sites and confirm each receives the intended shared summarization composition.
- `rg` for command-output/widget terminology and update only stale assertions/docs introduced by this behavior.
- Verify generated temp paths are absolute, both files exist, permissions are restrictive, and contents exactly equal captured strings.
- Verify no default/shared-cache test performs real filesystem, network, model, timer, or process-global mutation.

## Risks, assumptions, and open questions

### Risks

- **Latency:** every executed shared-bridge command now waits for a model call before durable output and completion follow-ups. Keep the footer in a summarizing phase, use a bounded request timeout, and fall back raw on failure.
- **Sensitive output:** captured command output is sent to the configured model and written under the OS temp tree. Restrictive permissions reduce local exposure, but this is still a behavior change. Documentation must state it plainly.
- **Temporary retention:** displayed paths are intentionally not deleted by ns. Their lifetime depends on OS temp cleanup and paths may disappear later.
- **Prefix-only truncation:** the selected combined-cutoff policy can omit failure details near the end, especially when stdout is large before stderr. The raw stderr path remains available, and the prompt must disclose truncation. Do not silently change to head/tail selection without new product steering.
- **Model hallucination/omission:** strict output validation, deterministic result metadata, and host-authored paths limit damage; exact evidence remains in raw files.
- **Completion ordering:** adding generation between process exit and completion hooks can delay Flow recovery behavior. Preserve semantics and cover ordering explicitly.
- **Policy/config failures:** `fast` is required but can still be absent or invalid in a checkout. This is a raw-output fallback, not a command failure.

### Assumptions

- The existing configured `fast` profile is the intended meaning of “cheap LM.”
- A fixed combined prompt cutoff and output-token cap are implementation constants, not new user-facing configuration in this slice.
- Empty stream files are useful and should exist so the two displayed paths are predictable.
- File persistence failure should fail safe to inline raw output even though no paths can truthfully be displayed.
- `/just` and `/just-ci` are excluded because they do not use `registerCliCommandExtension`; a later migration can bring them under the same module rather than duplicating logic.

### Open questions

No material product requirement remains open after grilling. During implementation, verify the exact installed Pi model-registry/auth type and choose the smallest accurate project-owned mirror; this is an adapter detail, not a product decision.

## Review and remediation

Before submitting:

1. Review the module using the deletion test: if prompt construction, policy resolution, log persistence, validation, and fallback logic leak back into both host adapters, deepen the shared module rather than adding wrappers.
2. Confirm model output never supplies exit status, level, or raw-log paths; those must remain deterministic host facts.
3. Confirm raw `CliCommandOutputDetails` remains the input to events, usage restoration, and completion hooks.
4. Confirm failure summaries visibly separate errors and that malformed model output cannot bypass fallback.
5. Confirm model or log failures cannot strand footer status, suppress command completion, or alter the underlying exit result.
6. Confirm no Clinkr/Foundation ownership is widened and update `CONTEXT.md` only in sync with implemented ground truth.
7. If review finds the model delay unacceptable for completion hooks, preserve durable-output ordering but consider separating model presentation from workflow completion only through an explicit follow-up decision; do not silently reorder side effects.
8. If review finds temp-output privacy unacceptable, remediate with permissions, documentation, and an explicit product decision about opt-in/redaction rather than quietly dropping exact evidence.
