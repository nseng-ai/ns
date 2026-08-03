# Make Flow landing fail closed around descendant reconciliation

## Goal and outcome

Harden `ns flow land` so that landing a PR with open descendants cannot report full success while those descendants remain locally un-restacked, remotely stale, or incorrectly based.

The completed behavior must be:

1. Before any merge, reconcile provider-reported descendants with remote GitHub dependency facts. If GitHub shows an open PR based on a landing branch’s current head commit but the selected stack provider does not report that PR branch as a descendant, refuse before mutation with a topology-mismatch diagnostic. Do not automatically adopt or reparent an undiscovered branch.
2. If a known descendant is checked out in another worktree, the safe default is no merge. The existing main landing confirmation is the override: an interactive affirmative answer or `--yes` authorizes the parent merge with deferred descendant maintenance. There is no new flag. Confirmation/help text must disclose that `--yes` accepts this known partial-state risk.
3. After a target PR merges, descendant maintenance is a required completion postcondition. Full completion requires proof that each maintained descendant root:
   - is locally based on refreshed trunk and no longer depends on the landed branch in provider topology;
   - has a remote PR head equal to the reconciled local SHA;
   - has the expected PR base/provider topology for a root above trunk.
4. A restack, submit, verification, or deferred-maintenance failure after merge returns a structured failed result with a nonzero process exit. The report must retain the already-landed PR facts and give branch-specific repair instructions. The command must not emit the wrapper’s unconditional `Land completed.` success response.
5. Preserve recoverable state and existing backup-ref safeguards. Do not mutate descendants held by other worktrees, silently adopt provider-unknown branches, or trust a successful `gt` exit without checking observable postconditions.

## Context and discovered facts

### Incident that motivates the change

PR #4063 (`harness-aware-user-extension-lifecycle`) was landed successfully, but open PR #4074 (`user-scoped-bundled-skill-reconciliation`) was left inconsistent:

- #4063 became merged and locally parented to `master`.
- Graphite locally reported #4074’s branch parent as `master`, but the local Git history still carried the old landed stack and needed restack.
- The local #4074 branch and remote head diverged.
- GitHub still showed #4074 based on `graphite-base/4074`; that synthetic base pointed at the old #4063 head.
- The land command printed `Land completed.` despite the unresolved descendant.
- Immediately before landing, narrow Graphite plumbing did not report #4074 as a child of #4063. Therefore this is not only a post-maintenance verification defect: preflight also failed to detect a remote dependency absent from provider topology.

This plan does not repair #4074 itself. It fixes the landing workflow so the same state is refused before merge when discoverable, or reported as nonzero partial completion when failure occurs after merge.

### Current execution path

The command path is:

- `ts/packages/incubating/extensions/flow/src/ns/commands/land.ts` — command wrapper; currently supplies fixed `successMessage: "Land completed."`.
- `src/land/land.ts` and `src/land/landing-dispatch.ts` — CLI outcome and path routing.
- `src/land/execution/execute.ts` — canonical landing lifecycle and report construction.
- `src/land/execution/merge-loop.ts` — merge, merged-state verification, and maintenance dispatch.
- `src/land/execution/maintenance-plan.ts` — currently classifies final descendants as `optional-descendants` with warning severity.
- `src/land/execution/maintenance.ts` — refreshes, deletes/reparents the landed branch, restacks descendants, conditionally submits, and records warnings.

A selected branch with descendants does not use the isolated single-branch fast path; it enters canonical stack execution. The core therefore already has the correct ownership seam for this fix.

### Specific current weaknesses

- `planGraphiteMaintenanceTargets` classifies final descendants as warning-grade optional maintenance. Failures become `skip` outcomes, the merge loop still succeeds, and canonical execution returns completed.
- `restackMaintenanceBranch` trusts a successful `gt restack` result without checking local ancestry or provider topology afterward.
- `checkSubmitMaintenanceBranch` may skip submit when only local SHA/remote head and `baseRefName === trunk` look current. It does not prove that restack removed the landed parent history.
- `submitMaintenanceBranch` trusts successful `gt submit` without a second remote/provider verification.
- `buildDescendantMaintenancePlan` turns worktree-held descendants into a skipped plan. That state is disclosed as a warning but does not enforce explicit consent or nonzero partial completion.
- `runMergeLoop` collapses maintenance failure into a merge failure phase, even when the PR merge was already verified.
- `LandGitGateway.branchContainsParent` can verify that a branch contains refreshed trunk, but is currently used only in pre-submit planning.
- `LandGraphiteGateway.branchChildren` can inspect provider topology, but there is no corresponding parent read in the land Consumer Gateway.
- GitHub PR facts contain `baseRefName` but not `baseRefOid`, and the gateway has no complete domain operation for discovering open PRs whose base commit is one of the landing branch heads. The incident requires that remote dependency check.

### Architectural constraints

- Keep workflow policy in Flow. `@nseng-ai/extension-kit/graphite` may own reusable Graphite command shape/facts, but it must not absorb landing policy.
- Extend Flow’s domain-first Consumer Gateways only with operations needed to prove landing postconditions. Do not expose raw GraphQL, filesystem, or subprocess primitives.
- Respect the active opt-in/provider-neutrality direction: postconditions are observed Git/GitHub/provider facts, not Graphite claims. Provider-private reads stay in the Graphite adapter; domain outcomes should be expressible by future reconciliation providers.
- Do not introduce a monolithic stack-provider interface or new ambient Graphite dependency.
- Keep both completed and failed canonical landing results on the existing `LandingExecutionReport`; do not create a parallel report model.

## Files, symbols, tests, and documentation

### Production types and gateway seams

- `ts/packages/incubating/extensions/flow/src/land/types.ts`
  - `LandingPreflightMode`
  - `LandingDomainFailureReason`
  - `DescendantMaintenancePlan`
  - `LandingExecutionReport` / `LandingExecutionResult`
  - `LandGitGateway`
  - `LandGraphiteGateway`
  - `LandGithubPrGateway`
- `ts/packages/incubating/extensions/flow/src/land/preflight.ts`
  - `buildStackLandingPlan`
  - `buildDescendantMaintenancePlan`
  - add pure remote/provider descendant consistency validation
- `ts/packages/incubating/extensions/flow/src/land/stack/pr-facts.ts`
  - GitHub query/parsing for complete open-PR dependency facts, including base OID
- `ts/packages/incubating/extensions/flow/src/land/stack/land-context-adapter.ts`
  - real Git, GitHub, and Graphite Consumer Gateway adapters
- `ts/packages/incubating/extensions/flow/src/land/testing.ts`
  - stateful or scripted in-memory facts needed to model restack/submit postconditions

### Execution and presentation

- `ts/packages/incubating/extensions/flow/src/land/execution/execute.ts`
  - confirmation/consent handling for deferred descendants
  - phase-accurate failed result construction
- `ts/packages/incubating/extensions/flow/src/land/execution/merge-loop.ts`
  - propagate descendant-maintenance failure distinctly while preserving landed facts
- `ts/packages/incubating/extensions/flow/src/land/execution/maintenance-plan.ts`
  - replace “optional means warning-grade success” with required completion semantics
- `ts/packages/incubating/extensions/flow/src/land/execution/maintenance.ts`
  - post-restack and post-submit verification
  - aggregate branch-specific failures safely across descendant roots where possible
- `ts/packages/incubating/extensions/flow/src/land/landing-execution.ts`
  - present already-landed summary followed by the maintenance failure; return `landOutcomeFailure`
- `ts/packages/incubating/extensions/flow/src/land/land-presentation.ts`
  - explicit pre-merge disclosure and post-merge partial-completion wording
- `ts/packages/incubating/extensions/flow/src/land/stack/flags.ts`
  - update `--yes` usage/command description; do not add a flag
- `ts/packages/incubating/extensions/flow/src/ns/commands/land.ts`
  - retain wrapper behavior only if nonzero outcomes reliably suppress success; otherwise derive final success text from the canonical outcome rather than an unconditional string

### Tests

Primary suites to update or extend:

- `test/land/unit/preflight.test.ts`
- `test/land/unit/merge-loop.test.ts`
- `test/land/unit/execute.test.ts`
- `test/land/gateways/in-memory-gateways.test.ts`
- `test/unit/land-graphite-maintenance.test.ts`
- `test/unit/flow-land-confirmation-gateway.test.ts`
- `test/unit/land-presentation.test.ts`
- `test/unit/land-stack-command-scenarios/landing-and-descendants.test.ts`
- `test/unit/land-stack-command-scenarios/execution-failures-and-slots.test.ts`
- fixture helpers under `test/unit/land-stack-command-scenarios/`
- `test/land/api-boundary.test.ts` if curated testing/API exports change

### Documentation and domain language

- `ts/packages/incubating/extensions/flow/README.md` — document descendant reconciliation, `--yes` consent, fail-closed topology mismatch, and nonzero partial completion.
- `ts/packages/incubating/extensions/flow/CONTEXT.md` — update Canonical Landing Execution / Stack Landing Plan language so full completion includes verified descendant reconciliation and known deferred maintenance is explicit consent plus failed completion.
- No ADR is expected: this is a safety correction within the existing canonical landing and provider-neutral postcondition direction.

## Implementation steps

### 1. Encode the policy in landing-domain types

1. Extend the landing request/preflight policy so canonical execution knows whether the main landing was explicitly approved. Do not add a CLI flag. Interactive approval and `--yes` must converge on the same typed consent fact.
2. Refine `DescendantMaintenancePlan` so it distinguishes:
   - no descendants;
   - automatically maintainable descendants;
   - descendants blocked by worktree occupancy and therefore requiring explicit deferred-maintenance consent.
3. Add a specific domain failure reason for remote/provider topology mismatch. Keep it separate from worktree-blocked maintenance.
4. Represent post-merge descendant-maintenance failure as a failed `LandingExecutionResult` carrying the existing report and landed chunks. Avoid a new “partial” top-level result variant unless existing failed-result invariants make that impossible; the failed result already models irreversible work through `report.landedChunks`.
5. Make failed phase attribution truthful: failures after verified merge should identify `descendant-maintenance` or `merge-maintenance-cleanup`, not generically `merge`.

### 2. Add complete remote dependency facts at the GitHub Consumer Gateway

1. Add a Flow-domain GitHub gateway operation that returns all relevant open PR dependency facts needed for preflight, including PR number, head branch/head OID, base ref name, and base OID. Name it for the domain question (for example, open PRs depending on landing heads), not for GraphQL mechanics.
2. Implement it with a complete/paginated GitHub query rather than an arbitrary `--limit`. Parse and validate the response at the adapter boundary.
3. Given the landing branch head OIDs, identify open PRs whose `baseRefOid` matches one of those OIDs. Exclude the landing PR itself and branches already represented in the provider-reported descendant subtree.
4. If any unmatched remote dependent exists, fail preflight before backup refs, confirmation, merge, or Graphite mutation. The message must name the landing branch, dependent PR number/head branch, observed base ref/OID, and provider descendant set, then instruct the operator to repair/reparent/restack and submit the stack.
5. Do not auto-track, auto-adopt, or auto-reparent the mismatched branch.

### 3. Make worktree-blocked descendants require main-landing consent

1. Keep detecting descendant worktree conflicts during preflight.
2. Include blocked descendant branches, worktree paths/slot names, and the exact deferred repair consequence in the main confirmation details.
3. Without a usable confirmation channel and without `--yes`, refuse before merge as today’s confirmation policy does.
4. An interactive affirmative main confirmation or `--yes` authorizes the merge despite known blocked descendants. Update `--yes` help to state that it also accepts disclosed deferred descendant maintenance.
5. Do not mutate a descendant checked out elsewhere. After the parent merge, record descendant maintenance as failed/deferred, retain the landed PR facts, emit concrete repair commands/guidance, and exit nonzero.
6. Dry-run remains non-mutating and should show that full completion is impossible without freeing/detaching the listed worktrees or explicitly approving deferred maintenance.

### 4. Make descendant reconciliation required after merge

1. Change final descendant maintenance from warning-grade optional success to required completion. Preserve the distinction from “next branch that will also be merged,” but both modes must fail canonical execution if required reconciliation does not complete.
2. Continue safe multi-root behavior: refresh/guard all roots before deleting the landed branch. If failures make deletion unsafe, do not delete. Aggregate affected roots into one branch-specific failure where safe rather than hiding later failures.
3. Preserve existing moved-SHA guards, unexpected-child checks, backup refs, and worktree protections.
4. A provider command failure after merge must return `halt`/failed execution, not a warning-only `skip` that leads to success.

### 5. Verify observable postconditions instead of trusting commands

For every maintained descendant root, execute and verify in this order:

1. Refresh it through the existing safe Graphite operation and guard its expected SHA.
2. Delete/reconcile the landed local parent only after the authoritative child re-check passes.
3. Restack the descendant root.
4. Verify local/provider state after restack:
   - read the new local SHA;
   - verify the descendant contains refreshed trunk using `LandGitGateway.branchContainsParent`;
   - verify provider parent/topology now places the descendant root directly above trunk and no longer below the landed branch. Add a narrow `parentOf`/equivalent method to the Flow Graphite Consumer Gateway if needed, backed by the existing metadata topology reader.
5. Submit/update the descendant whenever local reconciliation changed it or remote/provider facts are not already proven current. Avoid the current pre-submit shortcut that can skip publication without first proving ancestry/topology.
6. Reload GitHub PR facts after submit and verify:
   - state is open and head branch is the expected branch;
   - remote head OID equals the post-restack local SHA;
   - base ref/base OID is consistent with the expected trunk/provider topology.
7. Re-read provider parent/topology after submit if submission can update provider metadata.
8. Only then mark descendant maintenance completed. A zero-exit `gt restack` or `gt submit` is evidence that the command ran, not proof of the postcondition.

Keep these checks as small pure predicates over observed facts where possible, with I/O orchestration in `maintenance.ts`. This creates a deep reconciliation module: callers receive one completed/failed maintenance outcome while the implementation owns command sequencing and proof.

### 6. Correct result, exit, and presentation semantics

1. Propagate maintenance failure out of `runMergeLoop` with the correct phase and all observations accumulated so far.
2. In canonical execution, construct a failed report with:
   - verified landed PRs/chunks;
   - deleted or retained local branches;
   - descendant branches and failed verification step;
   - backup-ref recovery hint and exact next actions.
3. In Flow presentation, print the already-landed summary first, then a prominent partial-completion failure. Do not label the operation “completed.”
4. Ensure `runLandCli` returns nonzero for this failure and `runFlowCli` emits `Land failed.` (or a more precise partial-completion headline) rather than `Land completed.`.
5. Keep an ordinary fully reconciled landing at exit 0 with the existing success summary.

### 7. Build regression coverage around the real failure shape

Add tests that prove:

1. **Remote/provider mismatch:** provider reports no child, but GitHub reports an open PR whose base OID equals the landing branch head. Preflight refuses before confirmation or mutation and identifies the dependent PR.
2. **No auto-adoption:** the mismatch path makes no `gt track`, delete, restack, submit, or merge call.
3. **Worktree default refusal:** a descendant held elsewhere plus no confirmation/`--yes` performs no merge.
4. **Interactive/`--yes` override:** explicit approval allows parent merge, does not mutate the held descendant, returns nonzero partial completion, and reports already-landed PR plus repair steps.
5. **Restack false success:** `gt restack` exits 0 but the descendant does not contain refreshed trunk or provider parent remains the landed branch; maintenance fails and submit/full success do not proceed incorrectly.
6. **Submit false success:** `gt submit` exits 0 but remote head/base facts remain stale; maintenance fails nonzero.
7. **Full success:** restack mutates fake local ancestry/topology, submit mutates fake remote facts, all postconditions verify, and only then does the command report success.
8. **Multiple roots:** all safe roots are attempted/verified; failures are aggregated without unsafe parent deletion or false completion.
9. **Phase/report accuracy:** failed result uses descendant-maintenance phase and carries landed chunks, warnings/cleanup observations, and recovery evidence.
10. Existing required-next-landing, `--up`, managed-slot cleanup, dry-run, and isolated no-descendant fast-path behavior remain unchanged.

Upgrade the in-memory fakes so configured restack/submit success can transition local/provider/GitHub state. Static “success” fakes are insufficient for postcondition tests and risk reproducing the same trust bug in tests.

### 8. Update user-facing and domain documentation

1. In the Flow README, state that landing includes descendant reconciliation as part of completion, not best-effort cleanup.
2. Document that the main confirmation/`--yes` accepts disclosed worktree-blocked deferred maintenance, but the eventual command still exits nonzero because the landing is only partially complete.
3. Document remote/provider topology mismatch as a pre-merge refusal.
4. Synchronize `CONTEXT.md` with the implemented terms and avoid describing required descendant reconciliation as optional.

## Execution strategy

This is a semantic, cross-cutting refactor across more than five mixed production, test, fixture, and documentation files. Use **refactor-swarm** to partition work by coherent ownership, not a broad text-replacement script:

1. domain types/preflight and GitHub dependency discovery;
2. maintenance execution/postcondition verification and stateful fakes;
3. presentation/CLI semantics and command scenarios;
4. documentation/context synchronization.

Integrate those edits in one worktree only after each worker reports exact symbols and tests touched. There is no suitable purely syntactic codemod: the changes alter result semantics, gateway behavior, and scenario state transitions. Use precise edits after reading each affected section. Finish with bounded `rg` checks for stale concepts such as `optional-descendants`, warning-only descendant success, and assertions that worktree-held descendants exit successfully.

## Validation guidance

Follow `ts/AGENTS.md` and the TypeScript skills. At minimum:

1. Run focused Flow land unit, gateway, API-boundary, and command-scenario tests while iterating.
2. Run formatting autofix if needed, then format check.
3. Run TypeScript lint and native TypeScript 7 typecheck.
4. Run the full default, integration, isolated, and TypeScript style-guard test lanes.
5. Run dependency checks because gateway/type imports may change.
6. Run `just` as the repository default validation entrypoint.
7. Inspect the final diff for accidental public API widening and run the Flow land API allowlist test.
8. Verify bounded stale-pattern searches:
   - no warning-only success path remains for failed required descendant reconciliation;
   - no command-success-only path marks restack/submit complete without postcondition reads;
   - no new raw Graphite dependency appears outside the existing Flow/adapter composition boundary.

Do not claim validation from the current #4074 live state alone. The deterministic fake-driven scenarios are the acceptance evidence; a later human may perform a real stack smoke after the repair lands.

## Risks, assumptions, and open questions

### Risks

- **GitHub query completeness/performance:** remote mismatch detection must be paginated and bounded by open PRs. An incomplete query would recreate the safety hole.
- **Graphite synthetic-base semantics:** verify fixtures against current Graphite behavior. The domain check should compare observed base OID/topology, not assume every valid root immediately uses a literal `master` base name if Graphite legitimately uses a synthetic base during transition.
- **False ancestry confidence:** “contains trunk” alone is insufficient if provider parent still points at the landed branch. Require both Git ancestry and provider topology.
- **Partial mutation across multiple roots:** one root may reconcile before another fails. Reports and backup guidance must identify exact completed and failed roots; do not imply rollback.
- **`--yes` semantic widening:** this is an explicit user decision. Help and confirmation text must make the broadened consent visible; do not let `--yes` silently authorize undisclosed descendant conflicts.
- **Provider-neutral migration overlap:** keep new domain outcomes provider-neutral and Graphite facts adapter-local so this safety fix does not harden the ambient-Graphite architecture the active Objective is removing.

### Assumptions

- The selected stack provider remains authoritative for mutation topology; GitHub remote dependency facts are a fail-closed consistency check, not an alternate provider.
- The existing failed canonical result plus `report.landedChunks` is sufficient to represent nonzero partial completion.
- The repository’s open PR count is practical for a complete paginated dependency query.
- Existing backup refs remain the recovery substrate; no new durable state is needed.

### Open questions

No material product decisions remain. During implementation, choose exact method/type names that fit current Flow vocabulary and verify Graphite synthetic-base postconditions against existing adapter fixtures before freezing predicates.

## Review and remediation checklist

Before submitting the implementation, review it specifically for:

- every irreversible merge path either proves descendant completion or returns nonzero with landed evidence;
- topology mismatch is detected before any merge and cannot be overridden by `--yes`;
- worktree-blocked descendants require main-confirmation/`--yes` consent and are never mutated from another checkout;
- no automatic adoption/reparenting of provider-unknown branches;
- restack and submit success are followed by observable Git/provider/GitHub checks;
- failures name affected branch/PR, exact failed phase, already-landed PRs, and recovery action;
- full success is impossible while a descendant remains `needs restack`, local/remote heads differ, or PR base/provider topology is stale;
- tests use state transitions rather than static successful command stubs;
- Flow README and `CONTEXT.md` match the landed behavior;
- no unrelated provider-neutrality redesign or #4074 branch repair is mixed into this change.

If review finds that complete remote dependent discovery cannot be implemented reliably through the current GitHub adapter, stop before weakening the requirement. Record the limitation and design a complete query seam; do not fall back to provider-only discovery or an arbitrary PR limit.