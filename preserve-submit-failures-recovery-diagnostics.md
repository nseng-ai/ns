# Preserve Primary Submit Failures and Report Accurate Recovery Diagnostics

## Goal and outcome

Improve failure presentation for Pi-mirrored `ns flow submit` so that the operation that actually failed remains authoritative and automatic recovery problems are clearly secondary.

The completed behavior should be:

1. A failed pre-submit check remains the primary rendered command result, including its original bounded stdout/stderr and raw-log pointer. In the motivating case, the user should continue to see pnpm’s private-registry `401 Unauthorized` and missing environment-substitution warning as the cause of `just` failing.
2. If submit-check recovery cannot start, the slash command does not reject with a replacement extension error. Pi emits a warning labeled as a recovery/completion-hook failure after the already-rendered primary command result.
3. Git repository discovery distinguishes a genuine “not a Git repository” outcome from an inability to execute or interpret the Git probe. `GitOptionalResult` already has `found`, `missing`, and `error`; the real adapter must honor those variants.
4. No Socket/private-registry-specific preflight is added to `Justfile`. This slice improves generic Flow/Pi/Git error fidelity and leaves pnpm’s own authentication diagnostics intact.

The governing presentation rule is: **the first operation that failed remains the headline; diagnostic or recovery failures appear only as secondary context.**

## Context and discovered facts

### Reproduced incident

The observed output contained two stacked failures:

- `ns flow submit` ran the installed `flow.submit.pre` hook, `just`.
- Because `ts/pnpm-lock.yaml` had changed relative to `ts/node_modules/.ns-workspace-ready.stamp`, `Justfile`’s `_ts-workspace-ready` recipe ran `pnpm install`.
- pnpm could not substitute `${SOCKET_PASSWORD_B64}` and received `401 Unauthorized` from the configured private registry. This was the actual pre-submit failure.
- Flow’s Pi completion hook detected `NS_FLOW_SUBMIT_CHECK_FAILURE` and tried to start submit-check recovery.
- Recovery’s Git-root probe was reported as “Could not find a Git repository root,” even though `git -C <slot> rev-parse --show-toplevel` succeeds and the slot has a valid linked-worktree `.git` file.
- The recovery hook threw after primary output emission, causing Pi to emphasize `Extension "command:ns:flow:submit" error: Could not start flow submit-check recovery...` and making the secondary failure appear authoritative.

### Existing architecture and contracts

- `ts/packages/hosts/pi/src/commands/cli-extension.ts`
  - `runCliCommand(...)` builds and emits `CliCommandOutputDetails`, publishes the completion event, and then awaits `spec.afterCommandComplete?.(details)` without a guard.
  - Primary output is therefore already rendered before a completion-hook exception rejects the slash-command handler.
  - The host already has non-fatal warning presentation through `ctx.ui.notify(message, "warning")` and safe stale-context handling via `withSafePiUi`.
  - Flow is currently the only production registrant of `afterCommandComplete`; tests also exercise the seam.
- `ts/packages/capabilities/flow/src/pi/ns-extension.ts`
  - Flow’s `afterCommandComplete` filters to failed `ns:flow:submit` commands with an exact submit-check marker line.
  - It resolves the repository root and recovery prompt, then sends one recovery user turn.
  - Repository/prompt resolution failures currently become thrown `flowSubmitRecoveryError(...)` errors.
- `ts/packages/capabilities/flow/src/submit/submit-check-recovery.ts`
  - `resolveFlowSubmitRecoveryRepositoryRoot(...)` already distinguishes `{ type: "missing" }` from `{ type: "error" }` and includes the gateway error message in the latter case.
  - The missing production error fidelity is therefore below Flow, in the real Git adapter.
- `ts/packages/infra/foundation/src/git/contract.ts`
  - `GitOptionalResult<T>` already declares `found | missing | error`; no public type expansion is required.
- `ts/packages/infra/foundation/src/git/index.ts`
  - `RealGitGateway.optionalRepoRoot(...)` currently converts command startup failures, all unsuccessful command results, and empty successful stdout to `{ type: "missing" }`.
  - `runGit(...)` already preserves thrown command-execution failures as a structured `git_startup_failed` error.
  - `repoRoot(...)` already uses `repo_root_failed` and `repo_root_empty` error vocabulary that can guide consistent optional-probe diagnostics.
- `ts/packages/infra/foundation/src/primitives/command.ts`
  - `ExecResult` distinguishes exited, spawn-failed, cancelled, and timed-out outcomes.
  - `formatCommandFailure(...)`/existing Git helpers can preserve command, termination, stdout, and stderr evidence without inventing a new execution contract.
- `ts/packages/infra/foundation/src/git/git-testing.ts`
  - `InMemoryGitGateway` already supports error state for `optionalRepoRoot`, so Flow can test the previously unreachable production branch without adding a fake.

### Consumer-impact audit

Correcting `RealGitGateway.optionalRepoRoot(...)` globally is intentional. Existing consumers fall into three groups:

- Consumers that already distinguish `missing` from `error` and will automatically gain accurate production behavior: Flow submit recovery, ns-init extension listing/activation, retros evidence collection, and areg project/doctor resolution.
- Consumers that preserve some error evidence but map both outcomes to one domain category, such as pending-worktree/checkpoint.
- Consumers that intentionally or historically collapse all non-found outcomes to a generic failure/fallback, including some Objective, Plans, Handoff, Herdr, Vercel, Flow model-policy, and harness-artifact paths.

Do not widen this implementation into redesigning every consumer. Verify the provider contract correction does not break them, and record any newly evident misleading consumer behavior as follow-up rather than silently expanding this slice.

### Product and documentation history

- `ts/packages/capabilities/flow/README.md` documents pre-submit recovery but does not currently explain secondary recovery-failure presentation.
- `docs/guides/points.md` establishes that Flow owns fatality policy for prompt-point diagnostics.
- The closed/historical `generic-flow-extension` Objective recorded a prior fail-fast choice for broken recovery policy. The grilled decision for this plan supersedes that runtime behavior: recovery failure is now a secondary warning. Do not rewrite closed historical Objective records; update the current product documentation and tests to express the new contract.
- The active `prod-submit-roast-and-fix` Objective concerns the broader `submit`/`ship` split and should not be expanded by this diagnostic correction.

## Requirements decisions from grilling

- **Primary versus secondary:** preserve the failed submit/check output as authoritative and emit recovery failure as a secondary warning.
- **Registry-specific scope:** do not add `SOCKET_PASSWORD_B64` or private-registry logic to `Justfile`; keep this generic.
- **Git scope:** correct `RealGitGateway.optionalRepoRoot(...)` globally rather than adding a Flow-only probe or workaround.

## Files, symbols, tests, and docs

### Pi command host

- `ts/packages/hosts/pi/src/commands/cli-extension.ts`
  - `CliCommandExtensionSpec.afterCommandComplete`
  - `runCliCommand(...)` completion-hook invocation
  - existing warning notification and safe-UI helpers
  - Add a small formatter/helper only if it makes the secondary warning wording deterministic and testable; avoid introducing a new presentation abstraction.
- `ts/packages/hosts/pi/test/cli-command-extension.test.ts`
  - tests near “invokes command completion hook with output details after output emission”
  - fake context notification capture

### Flow recovery

- `ts/packages/capabilities/flow/src/pi/ns-extension.ts`
  - Flow completion hook and `flowSubmitRecoveryError(...)`
  - Keep exact marker matching and successful recovery-turn behavior unchanged.
- `ts/packages/capabilities/flow/src/submit/submit-check-recovery.ts`
  - `resolveFlowSubmitRecoveryRepositoryRoot(...)`
  - No result-shape redesign is expected; add/adjust tests to prove gateway errors retain their details.
- `ts/packages/capabilities/flow/test/pi/ns-extension.test.ts`
  - Replace current “hard-fails recovery” expectations for missing root and broken prompt with non-rejection plus secondary-warning assertions.
  - Extend `FakePi`/`createContext(...)` to capture notifications.
  - Assert ordering: primary command output is delivered before the warning, and no recovery user turn is sent on setup failure.
- `ts/packages/capabilities/flow/test/unit/submit-check-recovery.test.ts`
  - Add an explicit `optionalRepoRoot: { type: "error", ... }` case proving the recovery message says Git-root resolution failed and preserves the underlying gateway message.
- `ts/packages/capabilities/flow/README.md`
  - In “Pre-submit check recovery,” document that recovery startup/policy failures are non-fatal secondary warnings and never replace the failed submit result.

### Foundation Git adapter

- `ts/packages/infra/foundation/src/git/index.ts`
  - `RealGitGateway.optionalRepoRoot(...)`
  - Add a narrow classifier/helper only if needed to keep recognized non-repository handling explicit.
  - Reuse existing `GitErrorInfo`, command formatting, and output helpers rather than creating a second error model.
- `ts/packages/infra/foundation/test/git/git-gateway.test.ts`
  - Replace “softens optional repo root failures” with classified-result coverage.
  - Test successful root, recognized non-repository exit, thrown/startup failure, unexpected nonzero exit, non-exited termination (timeout/cancellation or spawn failure according to fixture support), and empty successful output.

No `Justfile`, npm configuration, raw submit-log phase, point definition, prompt content, marker, command surface, or Objective record changes are in scope.

## Implementation steps

### 1. Lock down completion-hook failure semantics at the Pi host boundary

Add a host-level regression test before changing runtime code:

- Register a fake CLI whose primary command exits nonzero and writes a recognizable stderr cause.
- Make `afterCommandComplete` throw a recognizable recovery failure.
- Assert the handler resolves rather than rejects.
- Assert the ordinary `ns-cli-command-output` error message still contains the original command failure and is emitted first.
- Assert one warning notification follows and identifies the completion/recovery failure using `formatErrorMessage(error)`.
- Assert the warning does not duplicate or relabel the primary command as successful.

Then guard the awaited completion-hook invocation in `runCliCommand(...)`:

- Preserve awaiting/order semantics for successful hooks.
- Catch hook exceptions only after primary output and completion-event emission.
- Emit a concise warning through the existing `ctx.ui.notify(..., "warning")` path, wrapped consistently with existing stale-context safety.
- Do not throw the hook exception onward.
- Include enough stable context to identify the affected Pi command, for example: `Automatic follow-up for /ns:flow:submit could not start: <reason>`. Prefer “automatic follow-up” or similarly generic host vocabulary because the host seam is not Flow-specific.
- Add a trace event for the completion-hook failure if the command tracing convention supports it, preserving diagnostics even if UI notification encounters stale context. Do not log secrets beyond the already formatted exception message.

This generic boundary is preferred over swallowing errors inside Flow because completion hooks run after the command has completed and must not retroactively replace its outcome. Flow remains responsible for deciding that recovery setup failures throw; the host classifies that throw as a failed secondary action.

### 2. Update Flow Pi behavior tests to express primary-first presentation

Modify Flow’s Pi fake/context to retain warning notifications and delivery order. Convert the current tests that expect rejected handlers for:

- no Git root,
- empty selected recovery prompt,
- unreadable selected recovery prompt.

New assertions should prove:

- the slash-command handler completes without throwing,
- the original failed-submit output remains present as an error custom message,
- exactly one warning describes why recovery could not start,
- the primary output precedes the warning,
- `sendUserMessage` is not called,
- successful recovery still sends exactly one bounded user turn after primary output,
- non-submit commands, successful submits, and marker-like prose still do not trigger recovery.

Keep `flowSubmitRecoveryError(...)` (or equivalent Flow-owned error wrapping) if it supplies the useful “Could not start flow submit-check recovery” context consumed by the host warning. Do not catch and silently discard failures in Flow.

### 3. Correct `RealGitGateway.optionalRepoRoot(...)` classification

Implement the existing three-way contract precisely:

- Return `found` only when `git rev-parse --show-toplevel` exits successfully and yields a non-empty first line.
- Return `missing` only for the recognized Git result that means the cwd is outside a repository. Classify from an exited Git result and a narrowly recognized Git diagnostic (the canonical `fatal: not a git repository` family), rather than treating every code `128` as absence.
- Return `error` with the existing structured `git_startup_failed` information when the exec API throws before producing an `ExecResult`.
- Return `error` with `repo_root_failed` and formatted command evidence for unexpected nonzero exits, spawn-failed/cancelled/timed-out results, or other unsuccessful outcomes.
- Return `error` with `repo_root_empty` when Git claims success but emits no repository root.

Keep the classifier local to the Git provider unless a second concrete consumer of that exact command-shape emerges. Do not add a Flow-owned raw Git probe and do not widen the `GitGateway` contract.

Be careful not to classify arbitrary stderr containing “not a git repository” as missing if the termination shape is inconsistent with Git’s normal repository miss. Use existing output-combination helpers where suitable, with a narrow phrase list and deterministic tests.

### 4. Prove the Flow recovery path preserves real Git errors

Add a unit case for `resolveFlowSubmitRecoveryRepositoryRoot(...)` with an in-memory `optionalRepoRoot` error. Assert the result differs from the missing-root message and includes:

- the cwd,
- “Could not resolve” rather than “Could not find,”
- the underlying gateway error message.

The Pi-level warning test should use this error state for at least one scenario so the production path no longer turns execution failure into repository absence.

### 5. Audit affected consumers without broadening the slice

After the provider change:

- Typecheck and run tests to identify consumers that assumed only `found | missing` in practice.
- Confirm explicit `error` branches now receive real production errors as intended.
- For consumers that intentionally collapse non-found outcomes, avoid unrelated behavior changes unless compilation or a directly failing contract test proves the provider correction makes them unsafe.
- Record concrete follow-up findings for silent fallback consumers rather than introducing a many-package refactor into this plan.

This is an audit/read-and-verify step, not a same-shape multi-file rewrite.

### 6. Update user-facing recovery documentation

Adjust `ts/packages/capabilities/flow/README.md` to state:

- the failed pre-submit check remains the command result,
- automatic recovery is best-effort assistance,
- inability to resolve the repository or selected prompt appears as a secondary warning,
- successful recovery still sends instructions and does not run commands itself.

Do not document Socket-specific credentials, because they are consumer-environment details and not part of Flow’s generic contract.

### 7. Review for semantic consistency

Before validation, inspect the diff for these invariants:

- no recovery exception can replace the primary command output,
- warnings retain the actual underlying Git/prompt error,
- `missing` means a recognized absence, never “the probe failed,”
- exact submit failure marker matching is unchanged,
- successful recovery turn content/bounds are unchanged,
- no check bypass (`--no-checks`) is introduced or recommended,
- no secrets are printed.

## Execution strategy

This plan does **not** require a same-shape mass refactor. The changes are semantic and localized across four implementation/test areas plus one README:

1. Pi host completion-hook policy,
2. Flow recovery presentation tests,
3. Foundation Git-result classification,
4. Flow resolver coverage,
5. documentation.

Use precise, reviewed edits in each affected section rather than an ad hoc replacement script or codemod. Although more than four files are touched, they are not repeated file-local transformations; `refactor-swarm` would add coordination overhead and risk splitting one end-to-end error contract across agents. A single implementation session should proceed test-first by seam, validating after each coherent stage.

No stale-name grep is required because no symbol or concept is being renamed. Do perform a bounded final grep for the old behavioral assertion/wording (`softens optional repo root failures`, `hard-fails recovery`) to ensure tests and docs no longer encode the superseded semantics.

## Validation guidance

Use fast seam-specific tests while implementing, then the repository’s standard gates.

Suggested focused commands (confirm exact workspace script/filter syntax from package metadata before running):

- Foundation Git gateway test file covering `RealGitGateway.optionalRepoRoot(...)`.
- Pi host CLI command extension test file.
- Flow unit submit-check recovery test file.
- Flow Pi extension test file.

Required broader validation for the final change:

```bash
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-isolated
just ts-test-typescript-style-guard
just
```

If formatting fails, use `just ts-format-fix` (or `just dprint-fix` for Markdown formatting) rather than hand-formatting generated formatter output, then rerun the failed gates.

Manual/behavioral evidence should include a fake-driven scenario with the exact stacked shape:

```text
primary: ns flow submit pre-check failed because just/pnpm failed
secondary: repository/prompt recovery setup failed
```

Verify the visible ordering is primary error first, secondary warning second, with no thrown `Extension "command:ns:flow:submit" error` replacing the result. A live private-registry failure is not required and should not be manufactured; the regression must remain deterministic and credential-free.

## Risks, assumptions, and open questions

### Risks

- **Over-broad host suppression:** Catching every `afterCommandComplete` exception changes the generic host contract. Mitigation: Flow is currently the only production user; preserve awaiting and emit a visible warning plus trace rather than silently swallowing. Document the hook as best-effort post-command side effects.
- **Locale/version-sensitive Git diagnostics:** A phrase classifier can be brittle. Mitigation: require the expected exited termination shape, keep the recognized phrase narrow, and return `error` (not `missing`) for unknown diagnostics. False errors are safer and more truthful than false absence.
- **Consumer assumptions become visible:** Existing consumers that distinguish `error` may begin failing rather than treating infrastructure problems as non-repository state. This is intended. Run the full suite and inspect any failures instead of weakening provider classification.
- **Secondary warning loses detail:** Generic formatting could hide the Flow-owned context. Preserve the thrown Flow message and its underlying gateway/prompt detail via `formatErrorMessage`.
- **Duplicate presentation:** The primary output is already emitted before the hook. Ensure the warning contains only recovery failure context and does not re-render all primary stdout/stderr.

### Assumptions

- `GitOptionalResult` is the stable intended contract; no compatibility migration is needed because `error` already exists.
- Pi notification warnings are durable enough for secondary diagnostics in interactive UI, while tracing supplies additional evidence for stale-context cases.
- Raw submit failure logs remain owned by `ns flow submit`; changing `phase: unknown` is outside this generic fidelity slice.
- The prior fail-fast recovery decision may be superseded through current code/tests/docs without rewriting closed Objective history.

### Open questions

No material product decisions remain. During implementation, choose exact warning prose to remain host-generic and deterministic, but do not change the agreed semantics.

## Review and remediation

Review the completed diff along two axes:

### Contract review

- Does every provider outcome map honestly to `found`, `missing`, or `error`?
- Does the primary CLI exit/result remain unchanged when the completion hook fails?
- Is the warning visibly secondary and does it retain actionable root-cause detail?
- Are successful and non-triggering recovery paths unchanged?
- Are generic host, Flow capability, and Foundation Git responsibilities kept in their owning layers?

### Regression review

- Ensure tests fail against the old behavior:
  - a thrown completion hook must previously reject,
  - a Git startup/unexpected failure must previously appear as `missing`.
- Ensure tests do not depend on a real Git subprocess, private registry, ambient credentials, or mutable process state in the default lane.
- Check that no test merely asserts “does not throw”; it must assert the exact primary-before-secondary presentation and classified diagnostic.

If review discovers broad silent error collapsing in unrelated `optionalRepoRoot` consumers, do not dilute this fix. Capture file/symbol evidence and propose a follow-up plan grouped by consumer semantics.