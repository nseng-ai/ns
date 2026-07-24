# Make `flow land` cleanup part of the landing confirmation

## Goal and outcome

Change `ns flow land` so a landing that will also free the current managed slot and delete (or retain, for trunk) the local branch asks for **one informed confirmation**, not a landing confirmation followed immediately by a cleanup confirmation.

The single confirmation must:

- cover both the PR/stack landing and the already-previewable post-landing cleanup;
- disclose the exact slot, worktree, local branch disposition, and cleanup commands before any PR is merged;
- apply consistently to the isolated single-PR fast path and the canonical stack landing path;
- preserve the existing behavior of `--yes`, `--force`, `--preserve`, dry run, non-interactive refusal, cleanup-only execution, and post-merge cleanup failure reporting.

Concrete expected UX for the reported single-PR case:

1. Show `Land this PR?` once.
2. Include the PR facts and a clearly separated post-landing cleanup section containing the current slot/worktree/branch and the `ns slot free ...` / `gt delete ...` commands.
3. Treat “yes” as approval for both the disclosed landing and disclosed cleanup.
4. Merge, verify, then perform cleanup without a second prompt.

The same contract applies to `Land this stack path?` when stack landing has a previewable current-slot cleanup.

## Context and discovered facts

- The report was reproduced conceptually against current `master` at `fe13a2571` (`Make Submit PR Description Regeneration Explicit`, the just-landed PR #3839). The working tree was clean during planning.
- Recent commits `73499218f` (`Unify land confirmations and harden pull request preflight validation`) and `e0f36189f` (`Gate Isolated Landing Confirmation and Refine Batched PR Fact Selection`) intentionally centralized landing confirmation, but the current domain flow still evaluates cleanup as a second confirmation request.
- `ts/packages/capabilities/flow/src/land/execution/host-seams.ts` currently models main landing and post-landing cleanup as separate `LandConfirmationRequest` variants:
  - `main-landing` for a stack plan;
  - `single-branch-main-landing` for an isolated PR;
  - `post-landing-cleanup` for the managed-slot cleanup.
- Stack execution in `execution/execute.ts` confirms `main-landing`, then calls `resolveCleanupAuthorization(...)`, which emits `post-landing-cleanup`, before merge mutation.
- Single-branch execution in `execution/single-branch-landing.ts` follows the same order: confirm the PR, then resolve cleanup authorization, then merge.
- Cleanup is already deterministic and previewable before merge. `planManagedSlotPostLandingCleanup(...)` / `planPostLandingSlotCleanup(...)` derives the branch, repository root, and slot name. The private cleanup target additionally derives whether the local branch will be deleted or kept because it is trunk.
- Presentation is already structural rather than prose-parsed:
  - `confirmation-commands.ts` builds cleanup commands;
  - `land-presentation.ts` formats cleanup details;
  - `flow-land-confirmation-gateway.ts` maps typed requests to UI prompts.
- `landing-confirmation-policy.ts` maps explicit CLI flags to pre-approved request kinds. Today `--yes` approves main landing and previewed cleanup, while `--force` approves only previewed cleanup. This flag authority must remain scoped; approval of the combined interactive prompt must not authorize unrelated `free-managed-slots` or `submit-required-updates` pre-merge actions.
- `--preserve` maps cleanup to `preserve`, so no cleanup target is previewed and no cleanup details should appear in the landing prompt. Dry run does not prompt or mutate.
- Cleanup-only canonical execution (already on trunk or no PR path, but still in a managed slot) has no landing action to combine with. It should retain its standalone cleanup confirmation; the requirement is one confirmation for an actual landing, not removal of the only confirmation from cleanup-only execution.
- Cleanup mutation must remain after successful merge verification. Combining authorization must not move `freeSlots(...)` or local branch deletion earlier.
- Post-merge cleanup decline should become unreachable for an actual landing when the combined prompt was approved. Real cleanup failures remain typed partial-success failures with recovery commands.
- The active `flow-slots-opt-in` Objective overlaps the managed-slot boundary. Its pending work will add absent-slots graceful degradation around `execution/post-landing-cleanup.ts`. Revalidate that Objective before implementation and avoid coupling the confirmation change to its not-yet-landed capability-presence work.
- Repository rules relevant to implementation:
  - never commit on `master`; create a feature branch before committing;
  - follow `ts/AGENTS.md`, `typescript-style`, `ns-typescript`, and `ns-cli-design`;
  - use fake-driven default tests and keep real subprocess tests in the integration lane;
  - run the repository validation entrypoint (`just`) before completion.

## Files, symbols, tests, and docs

### Primary production files

1. `ts/packages/capabilities/flow/src/land/execution/host-seams.ts`
   - `LandConfirmationRequest`
   - Extend the two main-landing request variants with an optional typed cleanup preview/authorization payload. Do not replace the standalone `post-landing-cleanup` variant because cleanup-only execution still needs it.

2. `ts/packages/capabilities/flow/src/land/execution/post-landing-cleanup.ts`
   - `PostLandingSlotCleanupPreview`
   - `planManagedSlotPostLandingCleanup(...)`
   - `resolveManagedSlotPostLandingCleanupDecision(...)`
   - Make the preview sufficient for both disclosure and later execution authorization, including `localBranchDisposition`. Keep target/command derivation structural and centralized; do not duplicate managed-slot path or branch-disposition logic in presenters.

3. `ts/packages/capabilities/flow/src/land/execution/execute.ts`
   - `executeLandingRequest(...)`
   - `resolveCleanupAuthorization(...)`
   - Attach the cleanup preview to `main-landing`. If the user approves a main request that disclosed cleanup, carry an approved cleanup decision forward without issuing a second gateway request. If no cleanup was disclosed, retain normal not-needed/preserve behavior. Preserve the cleanup-only path’s standalone authorization.

4. `ts/packages/capabilities/flow/src/land/execution/single-branch-landing.ts`
   - `executeSingleBranchLanding(...)`
   - Compute/attach the same cleanup preview to `single-branch-main-landing`. Approval of that combined request supplies the later cleanup decision; do not call the gateway again for the same disclosed cleanup.

5. `ts/packages/capabilities/flow/src/land/land-presentation.ts`
   - `formatSingleBranchMainLandingConfirmationDetails(...)`
   - stack plan formatting used by `mainLandingOptions(...)`
   - `formatPostLandingCleanupConfirmationDetails(...)`
   - Add a reusable cleanup-details section that can be appended to either landing prompt without changing the standalone cleanup prompt. Keep exact commands sourced from `postLandingCleanupCommands(...)`.

6. `ts/packages/capabilities/flow/src/land/flow-land-confirmation-gateway.ts`
   - `mainLandingOptions(...)`
   - `singleBranchMainLandingOptions(...)`
   - Ensure interactive and non-interactive text uses the combined request details. A non-interactive invocation without `--yes` must refuse before mutation and show the full combined impact.

### Supporting files to inspect and change only if the type flow requires it

- `ts/packages/capabilities/flow/src/land/post-landing-slot-cleanup.ts`
  - Flow-side preview adapter and exports.
- `ts/packages/capabilities/flow/src/land/landing-dispatch.ts`
  - Existing preview computation and approved-kind wiring.
- `ts/packages/capabilities/flow/src/land/landing-confirmation-policy.ts`
  - Preserve flag semantics. `post-landing-cleanup` preapproval is still needed for cleanup-only execution under `--yes`/`--force`; do not remove it merely because actual landings now combine authorization.
- `ts/packages/capabilities/flow/src/land/confirmation-commands.ts`
  - Reuse existing command builders; no prose parsing or duplicate argv construction.
- `ts/packages/capabilities/flow/src/land/stack/flags.ts`
  - Existing help remains semantically correct unless implementation reveals wording that still promises a separate prompt. Do not rename flags or alter their authority.

### Focused tests

- `ts/packages/capabilities/flow/test/unit/flow-land-confirmation-gateway.test.ts`
  - Main stack and single-PR requests with cleanup render one prompt containing landing facts plus exact cleanup facts/commands.
  - Main requests without cleanup retain current concise details.
  - Combined declines and non-interactive refusals return existing typed refusal semantics with no second prompt.
  - Standalone `post-landing-cleanup` remains covered for cleanup-only execution.

- `ts/packages/capabilities/flow/test/unit/single-branch-fast-path.test.ts`
  - Replace the current “main approved, cleanup refused at second request” expectation with one combined request.
  - Assert one approval leads to merge/verification and an approved cleanup decision.
  - Assert declining the combined prompt performs neither merge nor cleanup.
  - Assert preserve and dry-run issue no cleanup authorization.

- `ts/packages/capabilities/flow/test/land/unit/execute.test.ts`
  - For a managed-slot stack landing, assert confirmation requests contain one combined `main-landing` request rather than `main-landing` plus `post-landing-cleanup`.
  - Preserve phase/report facts and verify cleanup still runs only after successful landing.
  - Keep cleanup-only tests expecting the standalone cleanup request.
  - Preserve `--force`/preapproved and cleanup-failure/partial-success coverage.

- `ts/packages/capabilities/flow/test/unit/landing-confirmation-policy.test.ts`
  - Reconfirm `--yes`, `--force`, dry-run, and no-flag approved-kind sets after the request-shape change. In particular, cleanup-only authorization must remain possible.

- `ts/packages/capabilities/flow/test/unit/land-stack-command-scenarios.test.ts`
  - Add or adapt end-to-end fake-backed scenarios for both landing shapes from a managed current slot.
  - Pin exactly one prompt title (`Land this PR?` or `Land this stack path?`), combined detail text, merge-before-cleanup call ordering, and successful slot free/local branch deletion.
  - Pin decline/non-interactive no-mutation behavior.
  - Do not conflate current-slot post-landing cleanup with the separate `Free landing slots?` pre-merge conflict prompt; that prompt remains independently authorized.

- `ts/packages/capabilities/flow/test/unit/post-landing-slot-cleanup.test.ts`
  - Update preview shape expectations if `localBranchDisposition` becomes public in the preview.
  - Retain standalone cleanup-only confirmation and cleanup mutation/failure tests.

### Documentation and Objective records

- No README contract currently describes the number of land prompts, so a README change is not required solely for this UX correction.
- Update `stack/flags.ts` help only if wording is inaccurate after implementation.
- Do not mark any `flow-slots-opt-in` roadmap row complete; this plan does not implement capability-presence or slots-absence degradation. If that Objective has advanced before implementation, reconcile its new cleanup seam rather than overwriting it.
- `CONTEXT.md` terminology need not change unless implementation changes ownership; confirmation remains in Flow Land Execution and cleanup ordering remains in Canonical Landing Execution.

## Implementation steps

1. **Revalidate volatile state and branch safely.**
   - Confirm current trunk and inspect the latest `flow-slots-opt-in` objective/roadmap plus any newer land commits.
   - Create a feature branch before the first commit; never commit on `master`.

2. **Strengthen the cleanup preview as the shared disclosed-impact value.**
   - Extend the existing preview with local branch disposition, derived in the canonical cleanup target function.
   - Keep the preview immutable and sufficient to render slot, worktree, branch behavior, and command list.
   - Avoid a second parallel cleanup DTO. Prefer one structural value shared by request construction, presentation, and authorization.

3. **Model combined main confirmation explicitly.**
   - Add an optional cleanup preview to `main-landing` and `single-branch-main-landing` request variants.
   - Keep `post-landing-cleanup` as a distinct request kind only for flows that have no main landing prompt (notably cleanup-only execution).
   - Do not introduce ambient gateway state that remembers a prior prompt. The request/result flow should explicitly show that the approved main request disclosed cleanup.

4. **Combine authorization in both executors.**
   - Stack: compute the cleanup preview before asking `main-landing`, include it in the request, and convert approved combined disclosure into the cleanup decision carried to `executePostLandingCleanup(...)`.
   - Single PR: after loading/validating PR facts and before mutation, include the same preview in `single-branch-main-landing`; carry approval into the existing post-merge cleanup call.
   - If cleanup is not applicable or is preserved, do not add a cleanup section and retain a not-needed decision.
   - If cleanup is force-approved, retain that authority while still disclosing the cleanup in any main prompt that is needed.
   - Leave the actual cleanup invocation after successful merge verification.

5. **Render one complete prompt.**
   - Factor a cleanup-impact section from the existing standalone cleanup formatter, preserving current wording where practical.
   - Append it to both single-PR details and stack-plan details only when the request carries cleanup.
   - Ensure non-interactive refusal contains the same combined details and still directs users to `--yes`; preserve `--preserve`/`--force` guidance where relevant.
   - Do not silently treat a generic landing “yes” as cleanup authority unless the prompt included the cleanup section.

6. **Preserve independent confirmations.**
   - Keep `free-managed-slots` and `submit-required-updates` as separate prompts because they are distinct pre-merge remedial actions and were not approved by the combined landing/cleanup choice.
   - Keep standalone post-landing cleanup confirmation for cleanup-only execution.
   - Keep explicit flag policy scoped exactly as today.

7. **Update tests from domain core outward.**
   - First update pure request/decision tests for stack and single-branch executors.
   - Then update gateway/presentation tests.
   - Finally add command-scenario regression coverage matching the reported managed-slot UX and asserting call ordering and one-prompt behavior.
   - Use injected gateways/fakes; do not add shared Vitest module state, fake timers, or process mutation.

8. **Review user-visible wording and stale assumptions.**
   - Search for wording and tests that assume a separate post-landing cleanup prompt (`Free current slot and delete local branch?`, “post-landing cleanup requires confirmation”, request-count assertions).
   - Retain standalone wording where cleanup-only still uses it; remove only assumptions that actual landing always prompts twice.

## Execution strategy for repeated edits

This is a semantic TypeScript contract change across more than five production/test files, not a safe global text replacement or a purely syntactic AST rename.

Use **`refactor-swarm` for the file-local test/presentation updates after one primary implementer establishes the canonical request and executor shape**:

- one owner changes `host-seams.ts`, cleanup planning, and both executors as a coherent dependency-ordered core slice;
- independent workers may then update (a) gateway/presentation tests, (b) land-domain executor tests, and (c) command scenarios against that fixed shape;
- merge/review those edits centrally to prevent workers from inventing competing cleanup DTOs or authorization semantics.

Do not use an ad hoc `text.replace()` script. A codemod is unnecessary because the request construction sites are few and semantically different. Finish with a bounded grep for stale two-prompt assumptions and old exact request shapes.

## Validation guidance

Run focused feedback first, then repository gates:

```bash
pnpm --dir ts --filter @nseng-ai/flow run check
pnpm --dir ts --filter @nseng-ai/flow run test
just ts-test-typescript-style-guard
just
```

If integration files change or focused evidence indicates a real-adapter boundary was affected, also run the explicit integration lane (`just ts-test-integration`). Run isolated tests only if an isolated file changes (`just ts-test-isolated`). If formatting fails, use `just ts-format-fix`; if dprint fails, use `just dprint-fix`, then rerun validation.

Behavioral validation checklist:

- interactive single PR in a managed slot: exactly one combined prompt;
- interactive stack in a managed slot: exactly one combined landing/cleanup prompt;
- combined prompt shows exact slot/worktree/branch and cleanup commands;
- decline: no merge, slot free, branch deletion, submit, restack, or ref mutation;
- non-interactive without `--yes`: refuses before mutation with combined impact text;
- `--yes`: no prompts and unchanged landing/cleanup behavior;
- `--force` without `--yes`: cleanup is authorized, but landing still requires its prompt;
- `--preserve`: landing prompt has no cleanup action and slot/branch are retained;
- dry run: no prompt or mutation;
- cleanup-only execution: one standalone cleanup prompt still works;
- pre-merge slot-conflict and submit/update prompts remain separate;
- merge/verification failure: no post-landing cleanup;
- cleanup failure after merge: retains existing typed partial-success report and recovery guidance;
- cleanup subprocess ordering remains merge + verification, then slot free, then local branch deletion.

## Risks, assumptions, and open questions

### Resolved decisions

- The first prompt is a **combined authorization**, not implicit or automatic cleanup.
- The behavior applies to both single-PR and stack landing paths.
- Exact cleanup impact must be disclosed before approval.

### Assumptions

- Cleanup-only execution is intentionally excluded from “combined” behavior because there is no landing prompt; it retains one cleanup prompt.
- Main prompt approval authorizes only the cleanup payload actually embedded in that request. It does not authorize pre-merge slot conflict cleanup or PR submit/restack work.
- Existing public API compatibility is preserved because confirmation requests are host seams within the land capability; nevertheless, run the land API boundary tests and avoid exposing a second model.

### Risks

- **Authority leakage:** blindly treating every prompted main approval as cleanup approval would be unsafe. Mitigate by requiring a typed cleanup payload on the approved request.
- **Preview/execution drift:** rendering one target and executing a recomputed different target would violate informed consent. Keep derivation centralized and ensure the carried decision corresponds to the same shape/preview; if implementation can observe volatile target changes, revalidate or refuse rather than silently clean a different target.
- **Cleanup-only regression:** removing the standalone request kind would strand trunk/no-PR cleanup. Keep and test it.
- **Objective overlap:** `flow-slots-opt-in` may alter cleanup availability. Rebase on its latest state and compose with its presence seam if it lands first.
- **Test overfitting:** do not update only request counts. Assert disclosed facts, no-mutation refusal, and merge/cleanup ordering.

No material product questions remain open.

## Review and remediation

Before completion, perform a focused review against these invariants:

1. One user choice authorizes exactly the actions disclosed in the prompt.
2. No destructive cleanup occurs before merge verification.
3. Separate remedial actions retain separate authority.
4. Cleanup-only behavior remains operable.
5. Typed failures and report phases are unchanged except that a declined second cleanup prompt is no longer reachable after an approved combined landing.
6. Human output, non-interactive recovery text, and flag help agree.

Then run a bounded stale-assumption sweep, for example:

```bash
rg -n --glob '!*.map' --max-columns 300 --max-columns-preview \
  'Free current slot and delete local branch\?|post-landing cleanup requires confirmation|post-landing-cleanup|single-branch-main-landing' \
  ts/packages/capabilities/flow/src ts/packages/capabilities/flow/test | head -n 200
```

Classify each remaining match: standalone cleanup-only behavior is expected; actual-landing tests or prose that still require a second prompt must be remediated. If review uncovers preview/execution drift, fix it in the canonical cleanup planning seam rather than adding presenter-side checks or gateway memory.
