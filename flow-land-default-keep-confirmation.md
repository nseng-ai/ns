# Replace Flow land cleanup selector with a default-keep confirmation

## Goal and outcome

Change the interactive cleanup decision for `ns flow land` when an execute-mode landing starts in a managed Slot with the flag-derived cleanup policy `preserve` and no upstack continuation.

The eligible interaction must be one yes/no confirmation rather than a three-item selector:

- **Yes** approves the landing and selects post-landing cleanup: free the managed Slot and delete the landed local branch (or keep the local trunk branch when the existing cleanup preview says `keep-trunk`).
- **No** approves the landing with the safe default policy: keep the managed Slot and local branch.
- **No is the default**, so pressing Enter keeps the Slot and branch.
- **Ctrl-C / host cancellation** cancels the landing before merge.

The prompt must make the destructive Yes action explicit. A representative title is `Land, free slot-08, and delete local branch add-slot-ff-detached?`; the accompanying details must still disclose the landing plan/PR and cleanup impact. Do not retain a displayed “Cancel landing” option: cancellation is the host’s Ctrl-C path.

Preserve existing behavior for explicit flags and other modes: `--free` remains upfront cleanup consent, `--yes` remains upfront landing approval according to the existing confirmation policy, `--up` retains its continuation-specific Slot preservation behavior, dry runs do not prompt or mutate, non-interactive invocations retain their current refusal/authorization behavior, and cleanup still runs only after a successful verified landing.

## Context and discovered facts

- The current behavior was introduced by commit `770836839` (`Add interactive cleanup selection to land`). It added an optional host `select` capability and a Flow-specific keep/free/cancel selector. This plan changes the Flow interaction, not the generic SDK/host selection capability.
- The canonical eligibility and policy propagation are already modeled in land-domain execution:
  - `src/land/execution/execute.ts` supplies `cleanupChoice` only when the requested cleanup is `preserve`, execution is not dry-run, and continuation is not `upstack`.
  - `src/land/execution/single-branch-landing.ts` does the corresponding work for the single-branch fast path.
  - An approved `LandConfirmationDecision.cleanupPolicy` overrides the flag-derived policy; the existing canonical execution tests prove that selected `free` cleanup occurs only after landing.
- `LandConfirmationDecision` already distinguishes approval (optionally carrying `cleanupPolicy`) from decline. No domain type expansion is required.
- `flow-land-confirmation-gateway.ts` currently intercepts eligible `main-landing` and `single-branch-main-landing` requests in `selectLandingCleanup`, notifies the plan details, then invokes `ctx.ui.select`. Replace this adapter behavior with `ctx.ui.confirm`.
- `ConfirmationResult` is a discriminated result with `confirmed`, `declined`, and `cancelled`. For this special combined prompt, these states must map differently from ordinary landing confirmations:
  - `confirmed` -> approved, `cleanupPolicy: "free"`;
  - `declined` -> approved, `cleanupPolicy: "preserve"`;
  - `cancelled` -> `{ type: "declined" }` (cancel landing).
  The shared `confirmLandStackAction` currently maps both `declined` and `cancelled` to landing refusal, so the cleanup prompt should map the host result directly or use a narrowly designed helper that preserves this special semantic distinction. Do not globally change ordinary confirmation semantics.
- `NsConfirmOptions` supports `defaultAnswer: "no"`; this is already represented in the Flow test fixture.
- The current selector presentation helpers are `landingCleanupChoiceTitle` and `landingCleanupChoiceLabels` in `land-presentation.ts`. They encode keep/free/cancel labels and should be replaced with confirmation-specific presentation that explicitly words the destructive Yes action, including the existing `localBranchDisposition === "keep-trunk"` case.
- `PrintAwareLandStackCommandContext.ui.confirm` is mandatory while `ui.select` is optional. The new interaction therefore works in all interactive confirmation-capable hosts, not only hosts that expose selectors. Retain the generic optional `select` plumbing in the SDK, Pi runtime, and Flow workflow input unless a separate audited cleanup establishes that it is unused repository-wide; removing that capability is outside this behavior fix.
- Canonical product language is documented in `ts/packages/incubating/extensions/flow/CONTEXT.md`. Current text says “selector-capable” and “keep, free, or cancel”; it must change in the same implementation as the behavior.
- User decision from structured grilling: use the requested polarity—Yes cleans up, No lands and keeps, Ctrl-C cancels—with No as the default.

## Files, symbols, tests, and docs

### Primary implementation

1. `ts/packages/incubating/extensions/flow/src/land/flow-land-confirmation-gateway.ts`
   - `confirmFlowLandAction`
   - current `selectLandingCleanup`
   - current `mapSelectedCleanupPolicy`
   - Replace selector dispatch/mapping with a cleanup confirmation path that calls `ctx.ui.confirm(..., { defaultAnswer: "no" })` and preserves the three distinct host outcomes described above.
   - Keep the ordinary `confirmationOptions` / `confirmLandStackAction` path unchanged for requests without `cleanupChoice`, non-interactive requests, explicit cleanup policy, upstack continuation, and other confirmation request kinds.

2. `ts/packages/incubating/extensions/flow/src/land/land-presentation.ts`
   - `landingCleanupChoiceTitle`
   - `landingCleanupChoiceLabels`
   - `usage()`
   - Replace selector-oriented helpers and prose with confirmation-oriented wording. The prompt title should state exactly what Yes will do for both `delete` and `keep-trunk` previews. Provide details that retain the landing target/plan and make No/default preservation and Ctrl-C cancellation understandable without adding cancellation as an option.

### Focused tests

3. `ts/packages/incubating/extensions/flow/test/unit/flow-land-confirmation-gateway.test.ts`
   - Simplify/remove selector fixture setup where it is no longer needed for this gateway behavior.
   - Replace selector policy tests with confirmation-result table coverage:
     - confirmed -> approved/prompted/free;
     - declined -> approved/prompted/preserve;
     - cancelled -> declined/cancel landing.
   - Assert the prompt uses `defaultAnswer: "no"`.
   - Assert destructive title/details for branch deletion and add a `keep-trunk` case so Yes never claims it will delete trunk.
   - Assert no `ui.select` call is needed, including a context without a selector capability.
   - Retain ordinary confirmation tests proving that declines still cancel ordinary landing/maintenance confirmations and that non-interactive requests still refuse safely.

4. Existing domain-policy tests to retain and adjust only if wording or fixture shape requires it:
   - `ts/packages/incubating/extensions/flow/test/land/unit/execute.test.ts` — confirms a prompt-selected `free` policy reaches canonical post-landing cleanup.
   - `ts/packages/incubating/extensions/flow/test/unit/single-branch-fast-path.test.ts` — confirms the single-branch request offers `cleanupChoice` and propagates the chosen policy.
   - These tests should continue to exercise typed policy propagation rather than UI wording. Add assertions only if needed to prove default-preserve approval remains canonical in both execution paths.

### User-facing documentation and domain context

5. `ts/packages/incubating/extensions/flow/README.md`
   - Replace “selector-capable” and “keep, free, or cancel” descriptions in both the Slots integration summary and `land` command behavior.
   - Explain succinctly that eligible interactive landings ask whether to free/delete after landing, default No keeps the Slot/branch, and Ctrl-C cancels.

6. `ts/packages/incubating/extensions/flow/CONTEXT.md`
   - Update **Canonical Landing Execution** to describe confirmation-capable interactive hosts and the Yes/free, default-No/preserve, cancellation semantics.
   - Preserve ownership language: canonical execution owns cleanup ordering/policy; Flow owns host prompt rendering and result mapping.

7. Search for stale behavior text and assertions after editing:
   - `selector-capable`
   - `Land and choose cleanup`
   - `Cancel landing`
   - `landingCleanupChoiceLabels`
   - `keep, free, or cancel`
   Scope remediation to Flow land behavior; do not delete generic SDK selector APIs solely because Flow stops using them.

## Implementation steps

1. Revalidate the current branch and the listed symbols before editing because the saved plan may be implemented after other branches land. Read the nearest `AGENTS.md`, the active Objective orientations, `ts/AGENTS.md`, and the TypeScript/CLI authoring guidance required by repository policy.
2. Introduce confirmation-specific presentation functions in `land-presentation.ts`:
   - derive a destructive-action title from `PostLandingSlotCleanupPreview`;
   - handle `delete` versus `keep-trunk` accurately;
   - produce concise detail text that says No/default keeps the Slot/local branch and Ctrl-C cancels, while retaining the existing plan or PR facts.
   Prefer one deep presentation helper or a small title/details pair over label structures left over from the selector.
3. Refactor the gateway’s eligible-cleanup interception:
   - gate on landing request kind, `cleanupChoice`, and interactive UI;
   - do not require `ctx.ui.select`;
   - call `ctx.ui.confirm` with `defaultAnswer: "no"`;
   - map `confirmed`, `declined`, and `cancelled` exhaustively to free approval, preserve approval, and landing decline respectively.
   Keep this mapping local because ordinary confirmations intentionally treat No as refusal.
4. Leave `LandConfirmationRequest.cleanupChoice`, `LandConfirmationDecision.cleanupPolicy`, and canonical effective-policy selection intact. They already encode the behavior cleanly and keep UI policy out of cleanup execution.
5. Replace the gateway unit tests first or in the same change, covering both main-stack and single-branch request details where relevant, plus `delete` and `keep-trunk` wording. Ensure the safe Enter/default path is observable as `defaultAnswer: "no"`, not merely inferred from prose.
6. Run the focused tests and inspect failures before broad edits. Verify that ordinary confirmation decline/cancellation tests still pass, guarding against an accidental global change to `confirmLandStackAction`.
7. Update `usage()`, package README, and Flow `CONTEXT.md` to match the implemented behavior exactly. Do not describe a selector requirement or a displayed cancel option.
8. Run the stale-string search. Remove selector-specific Flow helpers and tests if no Flow consumer remains, but retain cross-package SDK/Pi selection infrastructure unless an independently justified consumer audit is added to scope.
9. Run formatting/autofix and the required validation lanes. Review the final diff for semantics, especially that No authorizes landing with preservation while Ctrl-C alone cancels this special prompt.

## Validation guidance

Start with the focused package tests, then use repository validation:

```bash
pnpm --dir ts vitest run \
  packages/incubating/extensions/flow/test/unit/flow-land-confirmation-gateway.test.ts \
  packages/incubating/extensions/flow/test/land/unit/execute.test.ts \
  packages/incubating/extensions/flow/test/unit/single-branch-fast-path.test.ts
just ts-format-check
just ts-lint
just ts-check
just ts-test
just
```

If formatting fails, use `just ts-format-fix`; if lint has autofixable failures, use `just ts-lint-fix`, then rerun checks. Run additional integration/sanity/style-guard lanes when changed-file judgment or repository policy requires them; this change should not introduce ambient process state, timers, module mocks, or real adapters into default tests.

Manual acceptance in an interactive managed Slot is valuable after automated tests:

1. Run an eligible `ns flow land` without `--free`, `--up`, or dry-run.
2. Confirm the prompt asks the destructive cleanup question and shows No as default.
3. On No/Enter, verify landing proceeds and the Slot/local branch remain.
4. On Yes in a disposable test case, verify landing proceeds and cleanup happens only after successful merge.
5. On Ctrl-C, verify no merge occurs and the command reports cancellation/refusal rather than preservation approval.

Do not use a production PR merely to exercise destructive cleanup; rely on fakes/scenarios unless an intentionally disposable end-to-end case is available.

## Risks, assumptions, and open questions

- **Combined-prompt semantics are intentionally unusual:** No does not mean “cancel”; it means “land and preserve.” Keep this behavior isolated to the cleanup-choice interception and make the prompt text unambiguous.
- **Cancellation fidelity:** the host must return `cancelled` for Ctrl-C. Existing `ConfirmationResult` supports this and tests already distinguish it. Do not collapse `declined` and `cancelled` before policy mapping.
- **Safe default:** the actual `defaultAnswer: "no"` option is authoritative. Text such as “(default)” is supplementary and must not substitute for setting the host option.
- **Trunk cleanup wording:** `localBranchDisposition: "keep-trunk"` frees the Slot but does not delete the local trunk branch. Prompt text must not overstate destructive impact.
- **Eligibility:** assume existing `cleanupChoice` construction remains correct. This plan does not widen cleanup prompting to dry-run, explicit `--free`, or `--up` paths.
- **Generic selector API:** Flow may become the only or one of few consumers, but removing the SDK/Pi selector capability is a separate compatibility and consumer-audit decision. Leave it in place.
- No material product questions remain open. Exact prose may be refined during implementation as long as Yes/free, default-No/preserve, and Ctrl-C/cancel remain explicit.

## Review and remediation

Before declaring completion, review the change along both specification and repository-standard axes:

- **Specification review:** trace each host result through the gateway to canonical execution and post-landing cleanup. Prove Yes selects `free`, No selects `preserve` while still approving merge, Ctrl-C declines before merge, and explicit/non-interactive/upstack/dry-run paths are unchanged.
- **Safety review:** confirm cleanup remains post-success and the default preserves recoverable local state. Check `keep-trunk` wording and behavior separately.
- **Architecture review:** keep presentation and host-result mapping in Flow, typed cleanup policy and ordering in canonical land execution, and avoid changes to unrelated SDK host capabilities.
- **Documentation review:** README, `usage()`, and `CONTEXT.md` must all describe the same interaction. Run the stale-string inventory and remediate every Flow-owned contradiction.
- **Test review:** ensure tests assert behavior rather than implementation-only helper names, preserve exhaustive discriminated-union handling, and do not weaken existing non-interactive or ordinary-confirmation safety coverage.
- **Remediation loop:** fix all correctness, safety, stale-documentation, formatting, lint, typecheck, and test findings; rerun the affected focused checks and the final repository validation entrypoint before handoff or submission.
