# Vercel Workflow UI observability for cloud dispatch

Research date: 2026-07-14. This note is specifically about what an operator can see in the Vercel Workflows dashboard / Workflow observability UI, not the anchor-PR status contract.

## Version baseline

This checkout resolves `workflow` **4.6.0** and `@vercel/sandbox` **2.5.0** (`ts/packages/capabilities/vercel/package.json` uses catalog entries; exact versions are in `ts/pnpm-lock.yaml`). The current `vercel/workflow` main/tag inspected was **`workflow@5.0.0-beta.34`**. Recommendations below distinguish features available now from v5-only features.

Primary sources:

- Vercel Workflows overview: https://vercel.com/docs/workflows
- Workflow SDK observability: https://useworkflow.dev/docs/observability
- SDK encryption and persisted fields: https://useworkflow.dev/docs/how-it-works/encryption
- SDK errors/retries: https://useworkflow.dev/docs/foundations/errors-and-retries
- SDK streaming: https://useworkflow.dev/docs/foundations/streaming
- SDK child-workflow patterns: https://useworkflow.dev/docs/foundations/common-patterns#child-workflows
- `workflow@4.6.0` source/tag: https://github.com/vercel/workflow/tree/workflow%404.6.0
- Current source/tag (`5.0.0-beta.34`): https://github.com/vercel/workflow/tree/workflow%405.0.0-beta.34

## Current dispatch shape and UI consequences

Inspected `ts/packages/capabilities/vercel/workflows/dispatch.ts`, `src/dispatch/dispatch-run.ts`, `src/dispatch/dispatch-steps.ts`, and the real Sandbox/report adapters.

- The exported identifiers become the display-friendly names: `dispatchWorkflow`, `launchDispatchStep`, `pollDispatchStep`, `readDispatchOutcomeStep`, `landDispatchStep`, `cleanupDispatchStep`, `reportDispatchLandedStep`, and `reportDispatchFailureStep`. Workflow/step IDs encode module path plus function name, and observability parsers expose the function name as `shortName`; there is no documented v4 dynamic display-name option. Sources: [parseWorkflowName](https://useworkflow.dev/docs/api-reference/workflow-observability/parse-workflow-name), [parseStepName](https://useworkflow.dev/docs/api-reference/workflow-observability/parse-step-name).
- The phase decomposition is already good for the timeline. Repeated `pollDispatchStep` invocations make liveness visible, but every poll has the same name and only `{ ok, phase }` output; the poll ordinal is inferred from repetition, while the final workflow output contains the total count.
- Inputs/outputs are very inspectable: Vercel states that every step, input, output, sleep, and error is recorded automatically. The SDK event log persists workflow inputs/returns and step arguments/returns. Vercel encrypts user data, but an authorized operator can deliberately decrypt it in the UI; decryption follows environment-variable-value permissions and is audit logged. Names, IDs, timestamps, lifecycle states, and (in v5) attributes are plaintext. Sources: https://vercel.com/docs/workflows#observability and https://useworkflow.dev/docs/how-it-works/encryption.
- Current workflow input includes the full `prompt`, and `launchDispatchStep(run)` persists it again as a step argument. `reportDispatchLandedStep` similarly receives the full decision log. Conversely, current step results are intentionally safe and bounded: sandbox name, branch/PR identity, statuses, poll count, and safe failure codes/messages; Sandbox command argv/env/stdout are not returned.
- Most step bodies catch operational exceptions and return `{ ok: false }`. Therefore the SDK sees those invocations as **successful steps**, does not apply its normal retry behavior, and the workflow itself normally **completes successfully with an `{ ok: false }` return value**. In the Workflows UI this makes domain failures green/completed rather than failed/error-bearing. The declared default retries on poll/read/land/cleanup/report are largely ineffective because failures are normalized instead of thrown. Only an uncaught crash/kill can exercise SDK retries. `launchDispatchStep.maxRetries = 0` correctly prevents duplicate sandbox/agent launch. SDK default is three retries; `FatalError` suppresses retries and `RetryableError` can set retry timing. Source: https://useworkflow.dev/docs/foundations/errors-and-retries.
- The code emits no deliberate safe phase logs and suppresses Sandbox command output. That is secure but leaves the durable event timeline as the only in-dashboard explanation. Vercel advertises built-in logs, metrics, and tracing, while the SDK automatically emits OpenTelemetry spans for workflow/step invocations. v4 tracing uses one continuous-style trace per run; current v5 defaults to bounded per-invocation traces linked together and recommends querying by `workflow.run.id`. Sources: https://vercel.com/docs/workflows and current v5 [tagged tracing docs/source](https://github.com/vercel/workflow/blob/workflow%405.0.0-beta.34/docs/content/docs/v5/observability/tracing.mdx). The published stable Workflow docs do not yet expose this v5 page.

## Concrete mechanisms

### Names and safe I/O (available in 4.6.0)

Function naming is the cheapest UI improvement. Prefer short operator verbs whose name says what boundary is being exercised, for example `createSandboxAndLaunchHarness`, `checkHarnessCompletion`, `readHarnessResult`, `pushAnchorBranch`, `stopSandbox`, and `updateAnchorPr`. Keep one step per external side-effect boundary; do not split merely to manufacture timeline rows.

Use small, explicit argument/result records so the UI reveals useful non-secret context: anchor PR number, short revision, harness kind, sandbox name, phase, poll ordinal, result outcome, and stable failure code. The current outputs mostly satisfy this. The largest immediate problem is the duplicated full prompt in `launchDispatchStep` input.

### Retries and errors (available in 4.6.0)

A dashboard should distinguish durable success from dispatch failure. Let retryable adapter failures throw (or throw `RetryableError` with a bounded delay), use `FatalError` for classified non-retryable failures, and catch exhausted/classified errors in workflow orchestration only where cleanup and anchor reporting are required. After cleanup/reporting, end through a tiny terminal step that throws a **safe**, stable error (`dispatch failed: <code>`) so the run is failed in the UI. Never put vendor response bodies, command output, prompts, or credentials in thrown error messages.

Preserve `maxRetries = 0` for sandbox/harness launch. Keep landing/report/cleanup idempotent before enabling their SDK retries. `getStepMetadata()` can expose attempt number/idempotency data inside a step when needed for safe logs, but it need not be returned as business output: https://useworkflow.dev/docs/api-reference/workflow/get-step-metadata.

### Attributes (not available in this checkout)

`workflow@4.6.0` exports neither `experimental_setAttributes` nor `setAttributes`; do **not** import either without an SDK upgrade.

Version history from first-party changelogs/source:

- `experimental_setAttributes` first appeared for workflow bodies in **5.0.0-beta.8** ([commit/PR](https://github.com/vercel/workflow/commit/1e6b1fdea2010c1f55b3e6fb5386d436c4406eb4)).
- Step-body calls appeared in **5.0.0-beta.9** ([commit/PR](https://github.com/vercel/workflow/commit/409b1033d9b7dfab9c26fda9a17494c08e43d0ae)).
- It graduated to `setAttributes` in **5.0.0-beta.31**; the experimental spelling remains a deprecated alias ([commit/PR](https://github.com/vercel/workflow/commit/0b956f65cb0ab30501c72e934fc8d4352c4c3ea2)).
- Current attributes require World spec version 4+, are plaintext, appear in the run details and as `attr_set` timeline markers, and are limited to 64 keys/run, key length 1–256, string values up to 256 bytes; `$` keys are reserved. Source: current v5 [tagged docs/source](https://github.com/vercel/workflow/blob/workflow%405.0.0-beta.34/docs/content/docs/v5/observability/attributes.mdx). The published stable Workflow docs do not yet expose this v5 page.

After a deliberate v5 upgrade and deployed compatibility proof, seed immutable searchable attributes at `start()` and update only low-cardinality state: `dispatch.kind=prompt|plan|handoff`, `dispatch.harness=pi`, `dispatch.anchor_pr=<number>`, `dispatch.phase=launching|running|landing|completed|failed`, and `dispatch.failure_code=<stable code>`. Do not attach prompt text, branch content, decision logs, repository tokens, model credentials, full SHAs if unnecessary, or arbitrary error text. Attributes are specifically plaintext and dashboard/filter oriented.

### Logs and traces

Add bounded structured `console.info`/`console.error` events at phase transitions and failures, with only run-safe identifiers and stable codes. Never log environment values, auth headers, Sandbox command argv/env, git remote URLs containing credentials, prompt/decision-log content, or raw stdout/stderr. Avoid workflow-body logging because replay can duplicate it; log inside steps. Keep SDK-generated tracing as the primary timing view rather than adding custom spans until a demonstrated dashboard gap warrants them.

### Streams

`getWritable()` can emit default or namespaced durable streams from steps, and observability tools can inspect stream output. Stream chunks are persisted separately and encrypted, but remain decryptable/viewable. A small `progress` stream could carry safe phase changes and coarse poll counts for a future dispatch TUI. It should not carry the harness transcript, prompt, command output, diffs, tokens, or unconstrained model text. For the Vercel Workflows dashboard alone, streams are lower value than correct step/error semantics because the existing step timeline already records each poll. Source: https://useworkflow.dev/docs/foundations/streaming.

### Child workflows

Directly awaiting a child workflow merges its steps into the parent's event log; starting a child from a step creates a separate run with its own event log/run ID. Neither improves this one-dispatch/one-run supervisor: direct children add abstraction without a new UI boundary, while background children fragment the anchor's single run handle and complicate cancellation/cleanup. Keep one dispatch workflow. Consider background children only for genuinely independent fan-out jobs that deserve separate run IDs. Source: https://useworkflow.dev/docs/foundations/common-patterns#child-workflows.

## Prioritized recommendation

1. **Make failure red and retries truthful.** Stop normalizing every external failure into successful step outputs. Preserve cleanup/reporting, then throw a safe terminal failure; selectively use SDK retries only for idempotent transient operations. This is the largest Workflows UI correctness gain.
2. **Tighten persisted/viewable I/O.** Keep current safe bounded outputs, but stop passing the complete run (especially `prompt`) to the launch step when a narrower reference/argument can work. Prefer git-native prompt/plan/handoff references for future dispatch kinds. Until then, document that prompts and decision logs are encrypted but decryptable operator-visible workflow data and must never contain credentials.
3. **Improve static function names and safe phase logs.** Rename steps around operator-visible external boundaries; add one bounded structured log at phase start/end/failure. Include stable code, PR number, safe sandbox name, harness kind, and poll ordinal; never raw payloads or command output.
4. **Upgrade to v5 for attributes only as an explicit compatibility slice.** The installed 4.6.0 cannot use `experimental_setAttributes`. After upgrade/deploy proof, add plaintext low-cardinality dispatch/phase/failure attributes and verify their actual Vercel dashboard/filter behavior.
5. **Defer progress streams and child workflows.** A safe progress stream may help the future jobs TUI, but adds little to the dashboard after steps/errors/attributes are fixed. Child workflows would make this dispatch harder, not easier, to follow.
