# Plan: Make Flow Land Treat Slots Cleanup as an Optional Enhancement

## Goal and outcome

Implement the next semantic slice of Objective `flow-slots-opt-in`: `ns flow land` must remain a complete Graphite/GitHub landing workflow when `@nseng-ai/slots` is not installed, while using Slots-specific cleanup only when the extension is present.

The delivered behavior must distinguish three independent facts:

1. Exact effective-catalog presence of `@nseng-ai/slots` determines whether Flow may invoke Slots operations.
2. Worktree facts and canonical managed-slot path shape identify checkout conflicts; path shape must never be used as a proxy for extension presence.
3. A successful PR landing remains successful even when the optional Slots cleanup enhancement is unavailable.

Use neutral optional-feature language throughout new code, tests, and tracking. Do not call the no-Slots state “degraded” or suggest that core Flow is impaired.

Expected user-visible outcomes:

- In an ordinary repository/worktree with no managed-slot facts, land behaves exactly as it does today whether or not Slots is installed.
- If a landing branch is checked out in another canonical managed-slot path and Slots is installed, preserve the current targeted `ns slot free` confirmation and execution path.
- If such a checkout conflict exists and Slots is not installed, refuse before PR or Graphite mutation because the checkout is unsafe. Present it as a generic worktree conflict, not as a missing dependency. Tell the user to detach or remove the blocking worktree using their own worktree workflow, then rerun. Do not offer or require installing Slots.
- If a PR lands successfully from a canonical managed-slot path while Slots is not installed, do not run or confirm cleanup. Keep the worktree and local branch and record a dedicated neutral `slots-extension-not-installed` cleanup outcome. Present a concise success-adjacent notice such as: “Landing completed. Managed-worktree cleanup was not run because @nseng-ai/slots is not installed; the worktree and local branch were kept.”
- The same post-landing behavior applies under `--force`: the flag bypasses cleanup confirmation when cleanup is available; it does not make the optional Slots extension mandatory.
- If the current path is canonical managed-slot-shaped but there is no PR path to land (including already being on trunk), return the existing successful “nothing to do” outcome. Do not enter cleanup-only execution, prompt, mutate, or show a Slots-specific skipped-cleanup notice.
- `--preserve` remains an explicit preservation policy and should continue to report `preserved`; it should not be relabeled as extension absence.
- Dry runs remain non-mutating and continue to report dry-run semantics.

## Context and discovered facts

- Selected Objective: `.ns/objectives/flow-slots-opt-in/`.
- Planning branch: `slots-foreach-output-navigation-invariants`.
- Planning baseline HEAD: `332c95f14` (`[cp] Tighten Slots navigation protocol`).
- Worktree was clean during planning.
- Objective tracking gate used `master...HEAD` and showed the prior Flow/Slots work and corresponding Objective updates are recorded.
- The generic presence mechanism is already delivered. `NsExtensionApi.hasExtension(packageName)` performs an exact effective-catalog lookup, and the Objective requires land to resolve `hasExtension("@nseng-ai/slots")` once per ns command invocation.
- Flow no longer has a production import or manifest dependency on `@nseng-ai/slots`; Slots operations cross the `ns slot ...` command boundary through the existing land worktree gateway.
- `ts/packages/capabilities/flow/src/ns/commands/land.ts` is the ns command boundary and currently calls `runLandCli(...)` without an extension-presence fact.
- `runLandCli` in `src/land/land.ts` constructs the shared Flow land orchestration context. The same orchestration routes to both canonical stack execution and the single-branch fast path.
- `runLandingDispatch` in `src/land/landing-dispatch.ts` loads the shape once, computes a post-landing cleanup preview, resolves upfront confirmation kinds, then chooses single-branch or stack execution.
- `executeLandingRequest` in `src/land/execution/execute.ts` owns canonical stack discovery/preflight/confirmation/merge/post-landing cleanup.
- `executeSingleBranchLanding` resolves cleanup authorization before its merge; `runPostLandingSlotCleanup` performs cleanup afterward.
- `confirmAndFreeManagedSlots` in `src/land/execution/pre-merge.ts` currently assumes every `managedSlotConflict` can use the worktree gateway’s `freeSlots`, whose real adapter invokes `ns slot free`.
- `classifyWorktree` in `src/land/stack/land-context-adapter.ts` uses canonical path shape to classify a managed-slot worktree. Keep that classification behavior; do not make classification depend on extension presence.
- `PostLandingSlotCleanupReport` is already a closed discriminated union with `not-applicable`, `preserved`, `dry-run`, `not-run`, `declined`, `completed`, and `failed` variants. A dedicated extension-absence variant fits this report rather than being collapsed into `preserved` or `not-applicable`.
- The current README presents Slots in the command matrix and integration prose. The Objective has a separate remaining roadmap row for full README/code-adjacent contract alignment; this plan should not absorb that entire documentation slice.
- The branch already records PR #3830 and the Slots navigation protocol follow-up in `.ns/objectives/flow-slots-opt-in/updates/20260723T133443Z-navigation-protocol-invariants-tightened.md`.

## Design constraints and implementation shape

### Presence fact

Use one explicit boolean with capability-owned naming, for example `hasSlotsExtension`. Resolve it exactly once in the ns command handler:

```ts
const hasSlotsExtension = ctx.hasExtension("@nseng-ai/slots");
```

Pass that value through typed options to the shared land orchestration and execution layers. Do not call `hasExtension` below the command boundary, cache it across invocations, derive it from paths, probe `ns slot`, inspect package resolution, or add a new gateway.

The boolean is invocation capability/configuration, not an external I/O operation. Keep it separate from `LandContext`, whose worktree gateway continues to own worktree facts and available command effects.

### Pre-merge conflicts

After preflight has identified `plan.managedSlotConflicts` but before any confirmation or mutation:

- When `hasSlotsExtension` is true, retain the existing `confirmAndFreeManagedSlots` flow.
- When false, convert the conflict into a typed landing refusal/failure at the submit-preparation safety gate. The message should explain that landing branches are checked out in other worktrees, list branch/path facts, state that no PRs were landed, and advise detaching/removing those worktrees manually before rerunning.
- Do not mention installing Slots, do not present `ns slot free`, and do not send a `free-managed-slots` confirmation request.
- Verify no GitHub merge, Graphite mutation, Git ref mutation, or `ns slot` invocation occurs.

Prefer a small named formatter/policy helper in the pre-merge/domain layer if it is reused by stack and presentation tests. Do not relabel the underlying `WorktreeConflict` as `manual-worktree`; its canonical-path classification remains an observed fact even when the Slots extension is absent.

### Post-landing cleanup

Extend the cleanup policy inputs with the resolved presence fact, or add it as a peer execution option that is threaded to cleanup planning/authorization/execution. Keep the state explicit and typed.

Add this report variant:

```ts
{ readonly type: "slots-extension-not-installed"; readonly slotName: string; readonly branch: string; readonly worktreePath: string }
```

Field names may follow nearby conventions, but the variant must carry enough observed evidence to render the retained worktree/branch notice without reconstructing facts from ambient state.

Behavior ordering:

1. `dry-run` continues to dominate cleanup mutation.
2. Explicit `preserve` continues to report `preserved` and requires no Slots-specific notice.
3. A non-managed current path remains `not-applicable`.
4. For cleanup-requesting policies (`free-slot` and `force-cleanup`) on a managed path with Slots absent:
   - create no cleanup confirmation request;
   - perform no `freeSlots` or local-branch deletion;
   - after a successful merge, return `slots-extension-not-installed` as a completed execution with a skipped `post-landing-cleanup` phase;
   - surface the neutral notice in both canonical stack and single-branch presentation paths;
   - do not turn the command exit code into failure.
5. With Slots present, preserve current confirmation, mutation, report, and failure behavior.

For no-PR/trunk shapes, cleanup planning must not cause `completionDisposition: cleanup-only` when Slots is absent. The dispatch should fall through to the existing `nothing-to-land` result. This rule applies even if the path matches the canonical managed-slot shape.

### Public/API compatibility

`runLandCli` is exported from the Flow Capability API and `executeLanding` is exported from the Land Capability API. Thread the new fact deliberately:

- Prefer a required boolean at the ns command composition point and internal execution options so supported runtime composition cannot silently omit it.
- Before finalizing any public signature change, run a workspace consumer search for `runLandCli(` and `executeLanding(`. Package-local tests are expected to be the main callers of `executeLanding`; update them explicitly rather than adding a misleading default that conflates “not supplied” with “not installed.”
- If a real downstream production consumer exists outside Flow, preserve compatibility with a narrowly justified adapter/default at that public boundary and document why. Do not make the core execution state optional merely to reduce test edits.
- The Pi `/ns:flow:land` mirror delegates to the ns CLI, so the ns command’s invocation-time lookup remains authoritative. Do not add startup-catalog state to the Pi mirror for land.

## Files, symbols, tests, and docs

### Primary production files

- `ts/packages/capabilities/flow/src/ns/commands/land.ts`
  - `flowLandCommand.handler`
  - Resolve exact Slots presence once and pass it to `runLandCli`.
- `ts/packages/capabilities/flow/src/land/land.ts`
  - `LandCliInput`
  - `runLandCli`
  - `runLandCommand`
  - Carry the fact into dispatch without putting it in an ambient host bag.
- `ts/packages/capabilities/flow/src/land/landing-dispatch.ts`
  - `RunLandingDispatchOptions`
  - `runLandingDispatch`
  - Ensure no-PR/trunk managed-path execution becomes “nothing to do” when Slots is absent; thread state into both fast and stack paths.
- `ts/packages/capabilities/flow/src/land/landing-execution.ts`
  - `RunFlowStackLandingOptions` / `runFlowStackLanding`
  - Present the dedicated successful non-cleanup outcome.
- `ts/packages/capabilities/flow/src/land/execution/execute.ts`
  - `ExecuteLandingRequestOptions`
  - Pre-merge safety branch, cleanup authorization, execution reporting, and skipped-phase reason.
- `ts/packages/capabilities/flow/src/land/execution/pre-merge.ts`
  - Add a neutral generic-worktree-conflict refusal path; preserve existing Slots-present cleanup.
- `ts/packages/capabilities/flow/src/land/execution/post-landing-cleanup.ts`
  - `PostLandingCleanupRequest` and/or cleanup option types
  - `planManagedSlotPostLandingCleanup`
  - `resolveManagedSlotPostLandingCleanupDecision`
  - `runManagedSlotPostLandingCleanup`
  - Encode absence before confirmation/mutation.
- `ts/packages/capabilities/flow/src/land/post-landing-slot-cleanup.ts`
  - Single-branch cleanup glue and neutral success notice propagation.
- `ts/packages/capabilities/flow/src/land/execution/single-branch-landing.ts`
  - Thread the fact into cleanup authorization.
- `ts/packages/capabilities/flow/src/land/single-branch-fast-path.ts`
  - Thread the fact and retain successful merge presentation before the optional-cleanup notice.
- `ts/packages/capabilities/flow/src/land/types.ts`
  - Extend `PostLandingSlotCleanupReport` with the dedicated variant.
- `ts/packages/capabilities/flow/src/land/land-presentation.ts`
  - Add a neutral formatter for extension-not-installed cleanup evidence.
  - Keep existing completed-cleanup success wording unchanged.
- `ts/packages/capabilities/flow/src/land/api.ts`
  - Update exported option/type shape only as required by the execution contract.

### Likely tests

- `ts/packages/capabilities/flow/test/land/unit/execute.test.ts`
  - Slots-present pre-merge behavior remains unchanged.
  - Slots-absent managed conflict refuses before confirmation/mutation with generic manual worktree guidance.
  - Ordinary path is invariant across presence values.
  - Managed current path after merge reports `slots-extension-not-installed` without cleanup mutation.
  - `free-slot`, `force-cleanup`, `preserve`, and dry-run precedence.
  - No-PR/trunk managed-path behavior is “nothing to do,” not cleanup-only, when absent.
- `ts/packages/capabilities/flow/test/unit/post-landing-slot-cleanup.test.ts`
  - Cleanup planning/authorization/execution produces no prompt or mutation when absent.
  - Dedicated notice contains retained branch/worktree facts.
- `ts/packages/capabilities/flow/test/unit/single-branch-fast-path.test.ts`
  - Successful single-branch merge stays successful and then reports optional cleanup not run.
- `ts/packages/capabilities/flow/test/unit/land-stack-command-scenarios.test.ts`
  - End-to-end command behavior: no `ns slot` execution and no mutation before an absent-Slots conflict refusal; successful landing output includes the neutral notice.
- `ts/packages/capabilities/flow/test/unit/land-pre-merge.test.ts` and/or `land-pre-merge-presentation.test.ts`
  - Exact generic worktree recovery wording and no Slots-install suggestion.
- `ts/packages/capabilities/flow/test/unit/landing-execution-completion.test.ts`
  - Completed-report/presentation semantics for the new variant.
- A focused ns command-boundary test (existing land command/runner test or a new narrow case)
  - Instrument `hasExtension` and prove exact `@nseng-ai/slots` lookup occurs once per land invocation and is passed through.

Use existing in-memory land gateways and constructor-state fakes. Do not add module mocks, real Slot backends, package-resolvability tests, or scripted high-level domain mocks.

### Objective tracking and documentation boundary

After implementation and validation:

- Update `.ns/objectives/flow-slots-opt-in/roadmap.md` to mark the land optional-enhancement row complete and replace its “degrade/degradation” wording with neutral optional-cleanup language.
- Make source-backed neutral terminology corrections in the current Objective narrative where they describe this delivered behavior, without rewriting immutable historical update files.
- Add a new immutable Semantic Update under `.ns/objectives/flow-slots-opt-in/updates/` recording implementation, tests, validation, and PR/commit evidence available at that point.
- Do not edit existing Semantic Updates, including `20260723T133443Z-navigation-protocol-invariants-tightened.md`; historical wording remains immutable provenance.
- Leave the separate README/code-adjacent alignment roadmap row open unless the implementation necessarily changes a line required for truthful current behavior. A subsequent slice should update the complete command matrix, requirements, and integration narrative together.

## Implementation steps

1. **Revalidate branch and consumer state.** Confirm the worktree is clean, HEAD still contains `332c95f14` or its successor, read the latest Objective files/updates, and search all callers of `runLandCli`, `runLandingDispatch`, `runFlowStackLanding`, `executeLanding`, and cleanup helpers. Reconcile any intervening land refactor before editing.
2. **Introduce one explicit presence value at composition.** In `flowLandCommand.handler`, call `ctx.hasExtension("@nseng-ai/slots")` exactly once. Add the required typed field to `LandCliInput` and thread it through `runLandCommand` and `runLandingDispatch`.
3. **Thread presence through both execution paths.** Carry the boolean to canonical stack execution and single-branch execution/cleanup. Keep it out of `LandContext`; do not create a capability-presence gateway.
4. **Model the post-landing outcome.** Add `slots-extension-not-installed` to `PostLandingSlotCleanupReport`, including branch, worktree path, and slot-name evidence. Add exhaustive switch handling and a neutral presentation formatter.
5. **Update cleanup planning and authorization.** Ensure absent Slots suppresses cleanup preview/confirmation for cleanup-requesting policies, while preserving `--preserve` and dry-run precedence. Ensure `--force` still lands and produces the dedicated non-cleanup outcome.
6. **Handle cleanup-only/no-landing dispatch.** Prevent managed-path shape alone from selecting cleanup-only execution when Slots is absent; preserve the existing successful nothing-to-do path.
7. **Add the pre-merge safety gate.** Before `confirmAndFreeManagedSlots`, if managed checkout conflicts exist and Slots is absent, return a typed pre-mutation refusal with branch/path evidence and tool-neutral detach/remove guidance. Do not emit Slots commands or installation advice.
8. **Preserve Slots-present behavior.** Keep existing targeted cleanup confirmation, `ns slot free` invocation, recheck, post-landing cleanup, and diagnostics untouched when presence is true.
9. **Cover domain and command behavior with fakes.** Add the focused tests listed above, including exact-once lookup, no-prompt/no-command assertions, no-mutation safety assertions, report variants, output, flag precedence, fast-path parity, and no-op behavior.
10. **Run formatting and validation.** Use project autofixers for formatter/linter failures, then run focused Flow tests and the standard repository validation described below.
11. **Record Objective evidence.** Mark only this semantic row complete, neutralize mutable Objective wording, add a new Semantic Update, and leave the full README alignment row open.

## Execution strategy

This is a semantic contract propagation across more than five mixed code/test/tracking files, not a same-shape syntactic rename. Do **not** use an opaque search-and-replace script or AST codemod. Read each affected symbol and make precise edits in dependency order: type/result model → cleanup policy → canonical execution → single-branch/dispatch composition → command boundary → presentation/tests → Objective tracking.

Although the file count is high, do not use `refactor-swarm` by default: the edits are tightly coupled around one discriminated state and one execution invariant, and parallel file-local edits would risk inconsistent cleanup precedence or duplicated policy. If implementation reveals a genuinely mechanical same-shape caller update across five or more independent test files, use `refactor-swarm` only for that isolated caller migration, then manually review every changed call site.

Finish with bounded stale-language and stale-call checks, for example searches for:

- missing/old construction sites of `ExecuteLandingRequestOptions`, `LandCliInput`, and `PostLandingCleanupRequest`;
- all exhaustive switches over `PostLandingSlotCleanupReport`;
- new mutable Objective/code wording containing `degrad` in the selected Objective and touched Flow files;
- output/recovery text that suggests installing Slots for generic worktree conflicts.

Do not rewrite immutable historical Semantic Updates merely to satisfy the terminology grep.

## Validation guidance

Start with focused tests for the touched behavior, using the package’s existing Vitest configuration. Select exact test paths rather than inventing a new lane. At minimum, run the relevant subsets covering:

- land execution over in-memory gateways;
- post-landing cleanup policy and presentation;
- single-branch fast path;
- land command scenarios and command-boundary composition.

Then run repository-required checks:

```sh
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-isolated
just ts-test-typescript-style-guard
just
```

If formatting fails, run `just ts-format-fix`; if TypeScript lint has autofixable failures, run `just ts-lint-fix`; if dprint fails under `just`, run `just dprint-fix`. Rerun the failed check and final `just` afterward.

Also run:

```sh
git diff --check
ns objective check flow-slots-opt-in
```

Validation evidence should explicitly state:

- the exact effective-catalog lookup was called once per ns land invocation;
- absent Slots never triggered an `ns slot` command;
- a pre-merge conflicting checkout prevented all PR/Graphite/ref mutation;
- successful stack and single-branch merges remained successful when optional cleanup was unavailable;
- current behavior remained unchanged with Slots present;
- no-PR/trunk managed-path execution returned nothing-to-do;
- Objective changes stayed under `.ns/objectives/flow-slots-opt-in/`.

## Risks, assumptions, and open questions

### Risks to guard

- **Conflating path identity with presence.** Keep canonical path classification independent; consult only the explicit boolean before Slots operations.
- **Accidentally weakening the pre-merge safety gate.** The no-Slots case changes recovery/presentation, not the fact that a conflicting branch checkout must stop unsafe mutation.
- **Prompting for impossible cleanup.** Resolve extension absence before constructing cleanup confirmation requests or upfront approval kinds.
- **Making `--force` fail core landing.** Forced cleanup remains optional when its provider is absent; report non-cleanup after success.
- **Deleting a local branch without freeing its current worktree.** The extension-absence path must skip both `freeSlots` and local Graphite branch deletion.
- **Breaking fast-path/stack parity.** Both routes share cleanup helpers but have different result presentation; test both.
- **Misclassifying no-op execution as cleanup-only.** Presence must participate in cleanup preview selection before dispatch chooses that disposition.
- **Public type churn.** Update explicit callers; do not hide an unsupported default in core types.
- **Terminology drift.** New user-facing and mutable Objective language must describe an optional enhancement, while historical updates remain immutable.

### Settled assumptions

- Exact package identity is `@nseng-ai/slots` and lookup is case-sensitive.
- Pi land delegates to the ns CLI; it does not need a separate startup presence fact.
- Users in non-root worktrees may be managing worktrees independently. Flow must not offer Slots installation or claim ownership of their worktree workflow.
- Generic manual detach/remove guidance is sufficient for a conflicting checkout; do not prescribe a destructive exact Git command without re-inspecting the user’s state.
- A dedicated report state is preferable to overloading `preserved` or `not-applicable`.
- Full Flow README alignment remains the next semantic slice rather than being folded into this one.

No material product questions remain open. If repository changes invalidate the discovered dispatch or cleanup ownership, stop and re-plan rather than silently introducing a second cleanup model.

## Review and remediation

Before declaring completion, perform a focused review against the Objective and these invariants:

1. Trace the boolean from `flowLandCommand.handler` to every potential Slots operation and confirm there is one lookup and no inferred fallback.
2. Trace all exits with `managedSlotConflicts` and prove the absent path stops before confirmation/mutation while the present path remains unchanged.
3. Trace stack, single-branch, cleanup-only, dry-run, preserve, free-slot, and force-cleanup combinations.
4. Review every `PostLandingSlotCleanupReport` switch for exhaustiveness and correct success/failure semantics.
5. Inspect human output for neutral language, retained-state evidence, and absence of installation advice.
6. Inspect fake-driven tests for state-based setup and observable outcomes rather than brittle internal call scripts.
7. Confirm no direct `@nseng-ai/slots` import or manifest edge was reintroduced.
8. Confirm Objective tracking is meaningful, immutable updates were not edited, and the separate documentation row remains accurately open.

If review finds a mismatch:

- repair the owning domain type/policy rather than adding presentation-only conditionals;
- add the missing regression at the lowest meaningful fake-driven layer plus a command-surface scenario when user output or mutation ordering is affected;
- rerun focused checks and full `just`;
- record corrected evidence in the new Semantic Update rather than amending prior updates.
