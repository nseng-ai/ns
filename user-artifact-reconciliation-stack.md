# Split PR #4074 into a lower-risk replacement stack

## Goal and outcome

Replace the already-published, single-commit PR #4074 (`user-scoped-bundled-skill-reconciliation`) with four new Graphite PRs that tell independently reviewable stories:

1. shared User-extension gate policy;
2. scope-neutral harness-artifact reconciliation infrastructure;
3. transactional User install/update/uninstall artifact integration;
4. read-only User lifecycle reporting and documentation.

The replacement stack must preserve the accepted architecture and safety contracts in ADR 0056 by default. The executor may correct obvious, bounded flaws exposed by decomposition, including internal seams and user-visible behavior, but must not redesign merely because the split creates an opportunity. Any proposed change to deletion authority, mutation ordering, compatibility, irreversible behavior, or another data-safety contract requires a fresh explicit user approval before implementation.

All four replacement branches must compile and pass their appropriate tests independently relative to their parent. Publish the replacement stack only after local validation. After all four replacement PRs and their topology are verified, close PR #4074 with a pointer to the replacement stack. Do not reuse #4074 for any replacement slice.

## Context and discovered facts

- Source branch: `user-scoped-bundled-skill-reconciliation`.
- Published PR: <https://app.graphite.com/github/pr/nseng-ai/ns/4074>.
- Source commit at planning time: `6408cdbf50428438ce71e049e3d8c6324f93df0c` (`[cp] Add user-scope artifact activation`).
- Merge base captured at planning time: `5a3090faa650c6665bb5f34becc431921e7f33ed` on `master`.
- The source branch is clean, tracked by Graphite, parented directly to `master`, and was submitted as PR #4074.
- The combined diff is 46 files, 2,865 insertions, and 440 deletions. It currently passes `just check` (590 test files, 6,365 tests at the time of planning).
- The source commit combines pure SDK policy, reusable artifact reconciliation, lifecycle mutations, read-only reporting, tests, and documentation. These have different review, deployment, and revert boundaries.
- ADR `docs/adr/0056-harness-aware-user-extension-layer.md` is accepted and immutable. It fixes the default product contract for supported harnesses, `NS_HARNESS`, contribution gating, bundled-skill provisioning, targeted deletion authority, uninstall behavior, reconciliation timing, and read-only reporting.
- Relevant active orientation: stacking is becoming opt-in/provider-neutral, but this is an explicitly Graphite-branded stack operation. Do not introduce any new ambient Graphite runtime dependency.
- Canonical user-facing pre-launch documentation is the package README. Keep `ts/packages/public/ns/README.md` synchronized with the behavior-bearing slice.
- The SDK context is authoritative vocabulary ground truth and must move with the implementation that establishes its terms; do not defer context updates until after code exists.

## Fixed decisions from requirements grilling

- Create four entirely new replacement PRs; do not reuse PR #4074 as the bottom or top PR.
- Permit redesign of internals and product semantics only to catch clear, evidenced flaws; do not perform opportunistic cleanup.
- Bounded flaws may be fixed in the appropriate slice. Data-safety or irreversible semantic changes require explicit approval before implementation.
- Keep #4074 open as a reference while reconstructing and validating the replacement stack.
- Submit and verify all four replacement PRs, then close #4074 with links/pointers to the replacement stack.

## Proposed stack

### PR 1 — Extract the shared User-extension gate

**Suggested slug:** `shared-user-extension-gate`

**Review narrative:** Make the already-accepted Active-harness/User-supported-harness decision a pure, exported SDK policy consumed by I/O-bearing loading code. This is the smallest, lowest-risk prerequisite and performs no lifecycle mutation.

**Expected files and symbols:**

- `ts/packages/public/sdk/src/extensions/user-extension-layer.ts`
  - `UserSupportedHarnessesFacts`
  - `decideUserExtensionLayer()`
  - refactor `loadEffectiveUserExtensionLayer()` to consume the pure decision without changing its observable behavior
- `ts/packages/public/sdk/test/unit/user-extension-layer-decision.test.ts`
  - matrix for unset, unknown, missing, invalid, unsupported, and enabled harness decisions
- `ts/packages/public/sdk/package.json`
  - export `./extensions/user-extension-layer` only if the new lifecycle consumer needs the curated subpath at this layer
- `ts/packages/public/sdk/CONTEXT.md`
  - update only vocabulary grounded by this slice
- `CONTEXT-MAP.md`
  - update only if its SDK summary must change with the new exported ground truth

**Boundary constraints:**

- No harness-artifact filesystem work.
- No changes to install/update/uninstall/list behavior.
- No new I/O in `decideUserExtensionLayer()`.
- Preserve the fail-closed behavior and diagnostics required by ADR 0056.

**Why it cannot combine with PR 2:** The pure contribution-visibility decision is independently reviewable and revertible; PR 2 introduces filesystem path and deletion-authority risk.

### PR 2 — Generalize harness-artifact reconciliation for User scope

**Suggested slug:** `user-scope-artifact-reconciliation`

**Depends on:** PR 1 only where canonical gate/harness types are needed; otherwise keep the artifact engine independent of invocation visibility.

**Review narrative:** Parameterize the existing Project artifact engine by explicit scope, selected harnesses, trusted path boundaries, and package deletion authority, then expose a narrow User artifact activation gateway. This PR establishes reusable infrastructure but does not yet mutate artifacts from extension lifecycle commands.

**Expected production files and symbols:**

- `ts/packages/public/ns/src/harness-artifacts/harness-paths.ts`
  - `resolveHarnessTrustedBoundaryRoot()` and `ResolvedHarnessTrustedBoundaryRoot`
- `ts/packages/public/ns/src/harness-artifacts/provision-removal.ts`
  - trusted-boundary validation needed for scoped removals
- `ts/packages/public/ns/src/harness-artifacts/reconcile-actions.ts`
  - shared deterministic action vocabulary; add only if it materially reduces duplication
- `ts/packages/public/ns/src/harness-artifacts/reconcile.ts`
  - explicit full vs targeted `ReconcileDeletionAuthority`
  - desired pairing/removal/orphan/collision behavior without trusting manifests for authority
- Rename `project-harness-artifact-transitions.ts` to `harness-artifact-transitions.ts`
  - scope-neutral preparation/application
  - `createEmptyPreparedHarnessArtifactTransitions()`
  - preserve ordered same-target application and completed-transition evidence
- `ts/packages/public/ns/src/harness-artifacts/declared-artifact-activation.ts`
  - retain Project/full behavior
  - add `prepareUserDeclaredArtifactActivation()` through a common scoped engine
- `ts/packages/public/ns/src/harness-artifacts/api.ts`
  - export only the narrow public contracts needed by later slices
- `ts/packages/public/ns/src/harness-artifacts/README.md`
  - document the scope-neutral engine and the Project/User authority distinction
- `ts/packages/public/ns/src/init/user-artifact-activation.ts`
  - narrow semantic gateway
- `ts/packages/public/ns/src/init/real-user-artifact-activation.ts`
- `ts/packages/public/ns/src/init/fake-user-artifact-activation.ts`
- `ts/packages/public/ns/src/init/fake-artifact-activation.ts`
  - rename/shape propagation only if needed by the generalized transition contract
- `ts/packages/public/ns/src/init/testing/index.ts`
- `ts/packages/public/ns/src/init/index.ts`
  - gateway exports only; defer command composition to PR 3

**Expected tests:**

- Rename/replace `ts/packages/public/ns/test/project-harness-artifact-transitions.test.ts` with `harness-artifact-transitions.test.ts` while retaining Project coverage and adding User/targeted cases.
- `ts/packages/public/ns/test/reconcile-plan.test.ts`
  - targeted package authority, deselected harnesses, unrelated-package protection, collisions, and orphan behavior
- `ts/packages/public/ns/test/declared-artifact-activation.test.ts`
  - Project/full compatibility and User/targeted preparation
- `ts/packages/public/ns/test/user-artifact-activation.test.ts`
- `ts/packages/public/ns/test/integration/real-user-artifact-activation.test.ts`

**Design review checkpoints:**

- Inspect whether `user-extension-lifecycle.ts` currently accumulates gate parsing, artifact evidence formatting, and mutation helpers. If decomposition shows an obvious cohesion flaw, extract focused internal modules (for example supported-harness facts vs artifact evidence) only when doing so simplifies dependency direction for multiple later commands. Do not create abstractions used by only one call site without a concrete payoff.
- Manifest data is evidence, never authority. Targeted operations must not remove or rewrite unrelated package entries.
- Cross-root application remains explicitly non-atomic and retryable.

**Why it cannot combine with PR 1:** It adds filesystem, manifest, path-boundary, and deletion-authority risk absent from pure policy.

**Why it cannot combine with PR 3:** The engine can be tested independently of lifecycle transactions, giving reviewers a separate safety/revert boundary before command mutations adopt it.

### PR 3 — Integrate artifacts into User install, update, and uninstall

**Suggested slug:** `user-lifecycle-artifact-mutations`

**Depends on:** PRs 1 and 2.

**Review narrative:** Compose the User artifact gateway into mutating lifecycle transactions, preserving strict preflight, compare-and-write ordering, rollback/evidence, and targeted authority.

**Expected production files and symbols:**

- `ts/packages/public/ns/src/init/user-extension-lifecycle.ts`
  - parse User `supported_harnesses` facts
  - bridge to `decideUserExtensionLayer()` for reporting without gating administration
  - shared preflight blocker and completed/planned evidence helpers needed by mutation commands
  - if PR 2 extracted cohesive helper modules, consume them rather than recreating a grab-bag module
- `ts/packages/public/ns/src/init/install-extension.ts`
  - acquire/load/admit, artifact preflight, guarded config write, apply, and rollback ordering
- `ts/packages/public/ns/src/init/update-extension.ts`
  - dry-run and applied targeted reconciliation
- `ts/packages/public/ns/src/init/uninstall-extension.ts`
  - four ADR uninstall cases, including identity-unavailable declaration removal plus retained-artifact evidence
- `ts/packages/public/ns/src/init/ns/context.ts`
  - production composition of the real User artifact gateway
- `ts/packages/public/ns/src/init/ns/commands/extension-install.ts`
- `ts/packages/public/ns/src/init/ns/commands/extension-update.ts`
- `ts/packages/public/ns/src/init/ns/commands/extension-uninstall.ts`
- `ts/packages/public/ns/src/init/index.ts` as required for the behavior-bearing exports
- `ts/packages/public/ns/README.md`
  - install/update/uninstall semantics, configured harness roots, mutation ordering, retained-artifact recovery; defer list-specific prose to PR 4
- `ts/packages/public/sdk/docs/writing-an-ns-extension.md`
  - concise author-facing statement that User lifecycle provisions descriptor `bundledArtifacts` without Project activation, if that behavior first becomes true here

**Expected tests:**

- `ts/packages/public/ns/test/user-supported-harnesses.test.ts`
- mutation-focused cases in `ts/packages/public/ns/test/scenario/user-extension-lifecycle.test.ts`
- `ts/packages/public/ns/test/integration/source-user-extension-install-host.test.ts`
- mutation-focused cases in `ts/packages/public/ns/test/integration/user-extension-lifecycle-host.test.ts`
- `ts/packages/public/ns/test/scenario/install-extension.test.ts`
- `ts/packages/public/ns/test/scenario/update-extension.test.ts`
- `ts/packages/public/ns/test/scenario/uninstall-extension.test.ts`
- `ts/packages/public/ns/test/scenario/activate-ns.test.ts` only if fixture/context construction must propagate the new dependency

**Required semantic invariants:**

- Lifecycle administration is not gated by `NS_HARNESS`.
- Configured supported harnesses select all User provisioning roots.
- Preflight blockers occur before declaration mutation when package identity is available.
- Missing-source/package-identity-unavailable uninstall removes the dead declaration but retains artifacts and reports uncertainty.
- Declaration completion, completed transitions, retained paths, acquisition/cleanup state, and retry guidance remain explicit after partial failure.
- No `--force` path and no manifest-derived deletion authority.

**Why it cannot combine with PR 2:** This is transactional command behavior and rollback risk; reviewers should be able to establish engine safety first.

**Why it cannot combine with PR 4:** Mutating transaction correctness and read-only observability have independent deployment/revert boundaries and substantially different test narratives.

### PR 4 — Add read-only User lifecycle reporting and finish documentation

**Suggested slug:** `user-lifecycle-artifact-reporting`

**Depends on:** PRs 1–3.

**Review narrative:** Make configured harnesses, gate state, planned artifact transitions, drift/orphans, dormant contributions, and deferred reconciliation legible without mutating machine state.

**Expected production files and symbols:**

- `ts/packages/public/ns/src/init/list-extensions.ts`
  - discriminated User list result
  - full gate decision
  - configured harnesses
  - read-only planned/orphaned/drift evidence
  - dormant instruction/consumer-dir reporting
  - truthful deferred-reconciliation wording
- `ts/packages/public/ns/src/init/user-extension-lifecycle.ts` or the focused helper modules established earlier
  - read-only description/summary helpers only
- `ts/packages/public/ns/src/init/ns/commands/extension-list.ts`
- `ts/packages/public/ns/README.md`
  - canonical complete lifecycle/list behavior and direct-shell fail-closed explanation
- `ts/packages/public/sdk/CONTEXT.md` and `CONTEXT-MAP.md`
  - final vocabulary synchronization only for ground truth first established in this slice
- `ts/packages/public/sdk/docs/writing-an-ns-extension.md`
  - only remaining author-facing reporting/contribution clarification

**Expected tests:**

- list/reporting-focused cases in `ts/packages/public/ns/test/scenario/user-extension-lifecycle.test.ts`
- `ts/packages/public/ns/test/scenario/list-extensions.test.ts`
- list/reporting-focused cases in `ts/packages/public/ns/test/integration/user-extension-lifecycle-host.test.ts`

**Required semantic invariants:**

- `extension list --scope user` never applies reconciliation.
- It reports the gate decision even though administration itself is ungated.
- It does not claim installed commands are currently available when the gate is disabled.
- Drift precision must not exceed available evidence.

**Why it cannot combine with PR 3:** It is read-only and separately revertible, while PR 3 owns mutation and recovery safety.

## Implementation and history-reconstruction steps

1. Revalidate volatile state before mutation:
   - `git status`
   - `gt branch info --no-interactive`
   - confirm the source commit and merge base; if either differs from the captured SHAs, inspect the new diff rather than blindly using old anchors.
2. Preserve a durable local reference to the full validated source commit before rewriting or switching branches. The published source branch/PR remains untouched and open during reconstruction.
3. Start a new Graphite branch from current `master` for PR 1; do not commit on `master`.
4. Reconstruct PR 1 from the source commit by selecting files/hunks, then make only the minimal or clearly evidenced design corrections permitted above. Validate and commit with `gt`.
5. Create PR 2 as a child of PR 1 and reconstruct the engine/gateway slice. Ensure Project behavior still passes on this intermediate branch.
6. Create PR 3 as a child of PR 2 and add mutation integration.
7. Create PR 4 as a child of PR 3 and add reporting/docs.
8. At each branch, compare cumulative tree state to the source commit:
   - expected differences must be attributable to the intentional redesign or to deferring later-slice hunks;
   - by the tip, the cumulative diff should equal the source behavior plus explicitly reviewed corrections.
9. Use Graphite plumbing to verify parent/child topology. Restack as needed; resolve conflicts using the repository’s Graphite conflict workflow rather than raw history improvisation.
10. Validate every branch relative to its parent, then validate the full tip.
11. Submit the new four-PR stack with `gt submit --no-interactive` only after local reconstruction and validation succeed. This publication is authorized by the requirements decision.
12. Verify all four PR URLs, branch parents, and review diffs. Confirm #4074 is not part of the replacement topology.
13. Close PR #4074 only after replacement publication succeeds, adding a concise pointer to the replacement stack. Use the repo’s GitHub workflow/`code-gh` guidance for the close/comment operation. Do not delete its branch until the user separately requests cleanup.

## Execution strategy for repeated edits

This reconstruction affects more than five files and includes mixed TypeScript, tests, exports, context, and prose. Use the repository’s `refactor-swarm` execution approach for file-local reconstruction and cross-cutting migration work rather than an opaque ad hoc `text.replace()` script. Before dispatch, partition ownership by the four PR narratives so workers do not overlap the same files concurrently.

For symbol/API renames such as `project-harness-artifact-transitions` → `harness-artifact-transitions` and `createEmptyPreparedProjectHarnessArtifactTransitions` → `createEmptyPreparedHarnessArtifactTransitions`, first inspect the TypeScript symbols/import graph and prefer deterministic language-aware edits or precise edits. Finish with bounded `rg` checks for stale filenames/symbols and old Project-only terminology. Documentation and ADR-sensitive prose require direct semantic review and precise edits, not bulk replacement.

## Validation guidance

Run validation on each intermediate branch, not only at the tip.

Minimum per-branch guidance:

- PR 1: focused SDK unit tests for `user-extension-layer`, `just ts-check`, formatting/lint as required.
- PR 2: transition, reconcile-plan, declared-activation, fake/real User artifact tests; `just ts-check`; run the TypeScript style guard because module/API architecture changes.
- PR 3: mutation scenario and integration tests for install/update/uninstall; `just ts-check`; relevant isolated/integration lanes where real adapters are involved.
- PR 4: list/reporting scenarios and integration tests; docs/context consistency checks.
- Every branch: formatter check, `git diff --check`, and a conflict/stale-name sweep.
- Stack tip: `just check` at minimum. Because the change includes TypeScript architecture and real-adapter integration, also run `just ts-test-typescript-style-guard` and the relevant integration lane (or `just ci` when practical under repository policy). Remember that plain `just check` does not include every specialized lane.

Before publication, review each PR diff against its parent rather than reviewing only `master..tip`. Verify that tests and docs travel with the behavior they establish.

## Risks, assumptions, and open approval gates

- **Published-history risk:** #4074 remains an independent published branch while the new sibling stack is built. Do not accidentally reparent or submit it as part of the replacement stack.
- **Intermediate-compilation risk:** several current files contain hunks belonging to multiple slices, especially `user-extension-lifecycle.ts`, `init/index.ts`, `ns/context.ts`, `README.md`, `sdk/CONTEXT.md`, and lifecycle scenario/integration tests. Split these semantically; whole-file copying will produce leaky or uncompilable intermediate branches.
- **Test-fixture coupling:** constructor/context additions may force mechanical fixture changes earlier than the behavior that uses them. Prefer optional/narrow composition or slice-local fakes over dragging mutation behavior downstack merely to satisfy fixtures.
- **Authority risk:** any apparent simplification that widens deletion authority, trusts manifests, changes preflight ordering, or hides partial-apply evidence is not a cleanup. Stop and ask for approval.
- **ADR risk:** do not edit ADR 0056 to match implementation. If an approved semantic correction supersedes it, write a new ADR rather than rewriting the accepted record.
- **Publication assumption:** the user authorized submitting the replacement stack and closing #4074 after successful verification. Branch deletion was not authorized.
- **No routine open questions remain.** Only a discovered, decision-bearing data-safety or irreversible semantic change should interrupt execution for user approval.

## Review and remediation

Before considering the split complete:

1. Review each PR for one coherent story and no premature upstack behavior.
2. Confirm dependency direction: pure gate → reconciliation engine → mutations → reporting.
3. Confirm Project artifact activation remains behaviorally compatible in PR 2 and above.
4. Confirm ADR 0056 acceptance examples are covered cumulatively at the tip.
5. Confirm each PR can be reverted conceptually without corrupting the review narrative of branches below it.
6. Run a final bounded stale-symbol/terminology search for the renamed transition module and old Project-only names.
7. If review finds only placement or dependency leakage, amend/restack the new stack before submission or update it before closing #4074.
8. If review finds a semantic flaw, classify it:
   - bounded and non-safety-bearing: correct it in the earliest owning PR and restack;
   - deletion authority, mutation ordering, compatibility, irreversible behavior, or another data-safety contract: stop and request explicit approval.
9. After submission, verify replacement PR links/topology, then close #4074 with a replacement pointer and report the final stack.
