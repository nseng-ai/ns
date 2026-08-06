# Plan: Make User uninstall retry-safe and User npm update staged

## Goal and outcome

Fix only the two data-safety defects found in the lifecycle review:

1. An identifiable User uninstall must apply targeted bundled Harness artifact removals before it removes the User extension declaration. The declaration remains deletion authority until artifact removal succeeds.
2. A User npm update must validate and preflight a separately staged candidate before changing the canonical managed package. The previous canonical package must remain recoverable until bundled Harness artifact application succeeds.

The outcome is deliberately narrow. Do not address the other review findings (duplicate descriptor loading in list, the synthetic User-layer decision, or trusted-boundary helper duplication) in this change unless a mechanical edit is strictly required by one of these two fixes. Do not introduce a generic transaction framework, durable ownership index, manifest-derived deletion authority, or a claim of cross-Harness filesystem atomicity.

## Scope and settled decisions

- Scope is **User lifecycle only**: `ns extension uninstall --scope user` and npm-backed `ns extension update --scope user`.
- Project lifecycle behavior and local-source User update behavior remain unchanged.
- Identifiable uninstall ordering is: prepare and validate removal, apply bundled Harness artifact removals, guarded compare-and-write of the User declaration, then lifecycle-owned npm cleanup.
- The missing-local-source exception remains unchanged: when package identity cannot be established, remove the dead declaration and retain artifacts because no deletion is authorized.
- User npm update uses a package-specific staged candidate and a narrow prepared-operation lifecycle. Keep the old canonical package available through descriptor/admission checks and artifact preflight. Promotion must retain a backup/absence fact until artifact application succeeds.
- Harness artifact application remains idempotent, retryable, and non-atomic across roots. Preserve completed-transition evidence on failure.
- ADR 0056 is immutable. Add a superseding ADR for the changed uninstall order and staged User npm update contract.

## Discovered facts and prior art

### Current ns behavior

- `ts/packages/public/ns/src/init/uninstall-extension.ts`, `uninstallUserExtension`, currently prepares artifact removal, removes the declaration with `compareAndWrite`, applies artifacts, and cleans npm bytes. An artifact apply failure therefore reports `declarationCompleted: true`, even though rerunning without declaration-backed authority is unsafe.
- `UserArtifactActivationGateway` in `ts/packages/public/ns/src/init/user-artifact-activation.ts` already has the needed `prepare`/`apply` split. `apply` reports completed transitions on partial failure. Reordering uninstall does not require a new artifact gateway.
- `ts/packages/public/ns/src/init/update-extension.ts`, `updateUserExtension`, currently calls `ExtensionUpdateAcquisitionGateway.reconcile` against canonical managed storage before availability evaluation, Extension Descriptor loading, and User artifact preflight.
- `ts/packages/public/ns/src/init/extension-acquisition.ts`, `RealExtensionUpdateAcquisitionGateway.reconcile`, delegates to `resolveDeclaredExtensionModules(... mode: "apply", npmAcquisition: "refresh-floating")`, which installs directly into canonical managed storage.
- Canonical User npm storage is package-isolated under `$XDG_DATA_HOME/ns/extensions/npm/<package-name>/`; path derivation and trusted ancestor facts live in `ts/packages/public/sdk/src/project-config/managed-extension-paths.ts`.
- `prepareUserUpdateArtifacts` prepares bundled Harness artifact changes from a loaded descriptor. Prepared artifact provisioning retains exact source bytes, so candidate cleanup after preparation does not invalidate the prepared artifact bytes.
- `docs/adr/0056-harness-aware-user-extension-layer.md` explicitly chose declaration-first uninstall. The new order supersedes that portion while retaining its package-name deletion authority, missing-identity exception, targeted reconciliation, and non-atomic retry model.

### Pi prior art and limits

Inspected the locally installed Pi package, not the recorded source-session logs:

- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/package-manager.js`, `DefaultPackageManager.removeAndPersist` (observed lines 797–800), performs package removal before removing its settings declaration. This supports artifacts/resources-first, declaration-last ordering, though Pi does not have ns deletion authority or cross-Harness artifacts.
- The same file's npm update path (`updateNpmBatch` → `installNpmBatch`) updates the canonical install root in place. Pi does **not** provide a staged npm package transaction to copy.
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/client/remote-session.js`, `#replace` and `#prepareReplacement` (observed around lines 169–219), prepares and validates a replacement before detaching/rebinding the previous one and cleans up the candidate on failed replacement. Use only this small prepare/validate/replace shape as precedent; do not import Pi architecture or create a general transaction abstraction.
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md` documents Pi's package install/remove/update behavior and confirms that package declarations live in settings and npm packages live in managed package roots.

These are observations of the installed Pi version used in this planning session. Revalidate paths/symbols only if implementation needs to cite a different Pi version; no runtime dependency on Pi is allowed.

## Minimal contract design

Keep the existing project/local update gateway behavior. Add a **User npm-specific Consumer Gateway** in `ts/packages/public/ns/src/init/extension-acquisition.ts` rather than generalizing all extension acquisition into transactions.

Use a small discriminated prepared-operation contract with explicit lifecycle operations:

- `prepare(params)` installs/resolves the requested npm source in a separate package-specific staging location and returns either a structured failure or a prepared value containing:
  - package name, source spec, update intent/outcome;
  - candidate module root for Extension Descriptor loading;
  - opaque staging identity/state required by the real adapter;
  - whether a canonical package existed before preparation.
- `promote(prepared)` atomically replaces the package-specific canonical project where supported by same-filesystem rename operations and returns either a structured failure or a promoted value retaining the backup (or prior-absence fact).
- `settle(promoted, "commit" | "rollback")` has only two meanings:
  - `commit`: remove retained backup/staging residue after artifact application succeeds;
  - `rollback`: restore the previous canonical project, or remove the promoted canonical project if none existed.
- `discard(prepared)` removes an unpromoted candidate after descriptor/admission/artifact preflight failure.

Do not export this as a reusable SDK transaction API. Keep the real filesystem/rename mechanics behind the ns-owned Consumer Gateway and construct the real adapter at `createNsInitContext`. The low-level SDK acquisition gateway may gain only narrowly required, domain-shaped managed-package operations if the ns adapter cannot safely implement staging and promotion using existing methods; do not expose raw arbitrary filesystem operations.

Staging and backup paths must be derived from canonical `ManagedNpmStorage` and the canonical package name, remain under lifecycle-owned trusted roots, reject symbolic-link/non-directory chains with the same LBYL posture as canonical acquisition, and use unique per-operation names to prevent two updates from sharing a candidate. Promotion and rollback must never touch sibling package projects. Clean stale operation-owned candidate/backup state only when its identity and trusted containment are validated.

## User npm update sequence

Change only the npm branch of `updateUserExtension`:

1. Parse User config, `supported_harnesses`, gate facts, and target declaration as today.
2. For dry-run, preserve current no-write behavior and report deferred artifact effects when candidate bytes would be required.
3. `prepare` the npm candidate outside the canonical package project.
4. Load the candidate Extension Descriptor by overriding resolution for the targeted npm source to the candidate module root. Do not make the candidate globally canonical yet.
5. Evaluate package admission/availability using the candidate for the target and canonical roots for all other User declarations. Add the narrow target-root override to the availability boundary rather than mutating canonical storage. Ensure the loaded candidate descriptor is the descriptor used for artifact preparation; do not introduce another target descriptor load merely for convenience.
6. Prepare targeted bundled Harness artifact reconciliation from the candidate descriptor. If descriptor loading, admission, or artifact preflight fails, discard the candidate and return the primary failure plus cleanup diagnostics/retained path if discard also fails.
7. Promote the candidate while retaining previous canonical state.
8. Apply the already-prepared artifact reconciliation.
9. If artifact apply fails, call `settle(..., "rollback")`, report completed artifact transitions, package rollback outcome, retained paths/diagnostics, and retry guidance. Do not claim artifact rollback: completed cross-Harness transitions may remain and the next update must reconcile them idempotently.
10. If artifact apply succeeds, call `settle(..., "commit")`. A commit-cleanup failure must report that package promotion and artifacts completed, identify retained backup/staging residue, and give safe cleanup/retry guidance; it must not revert successful artifact application.
11. On success, report the promoted candidate's package/version/module facts and completed artifacts.

This sequencing prevents invalid or blocked candidates from replacing canonical bytes. It also restores canonical package bytes when artifact application fails, while honestly reporting any artifact transitions already completed.

## Uninstall implementation steps

### `ts/packages/public/ns/src/init/uninstall-extension.ts`

In `uninstallUserExtension`:

1. Keep config parsing, declaration planning, package identity establishment, targeted artifact preparation, and preflight blockers unchanged.
2. Move `context.userArtifacts.apply(...)` before `context.userExtensionConfig.compareAndWrite(...)` for identifiable declarations.
3. On artifact apply failure, report:
   - declaration retained / `declarationCompleted: false`;
   - `completedArtifacts` from the apply result;
   - diagnostics and retry guidance.
4. After successful artifact apply, perform the existing guarded declaration compare-and-write.
5. On compare-and-write failure, report the declaration as retained, include completed artifact evidence, and explain that retry will reconcile already-removed artifacts idempotently before retrying declaration removal.
6. Keep npm cleanup last. Include completed artifact evidence in cleanup failures so all completed transitions remain visible.
7. Keep declaration-already-absent and package-identity-unavailable behavior unchanged; a supplied source must not broaden deletion authority.

No `UserArtifactActivationGateway` expansion is needed.

## Acquisition and wiring implementation steps

Likely touched implementation files:

- `ts/packages/public/ns/src/init/extension-acquisition.ts`
  - Add the narrow prepared User npm update types, real adapter, and fake.
  - Preserve `ExtensionUpdateAcquisitionGateway` for existing project update and dry-run behavior unless a tiny reuse is clearly simpler.
- `ts/packages/public/ns/src/init/update-extension.ts`
  - Wire the candidate sequence above into only the User npm branch.
  - Refactor `prepareUserUpdateArtifacts` comments/failure fields so they describe candidate preparation/promotion truthfully rather than “acquisition already advanced.”
  - Add one cleanup helper only if it prevents repeated primary-failure + cleanup-failure reporting logic; do not create a lifecycle transaction class.
- `ts/packages/public/ns/src/init/declared-extensions.ts` and `fake-declared-extensions.ts`
  - Add the narrow target npm module-root override needed for candidate availability/admission, while preserving canonical resolution for other declarations.
- `ts/packages/public/ns/src/init/ns/context.ts`
  - Construct and inject the real User npm update Consumer Gateway at the composition root.
- `ts/packages/public/sdk/src/project-config/managed-extension-paths.ts` and/or `ts/packages/public/sdk/src/extensions/acquisition.ts`
  - Change only if required to derive/validate lifecycle-owned candidate/backup locations or provide domain-shaped managed-package stage/promote operations. Keep these additions package-specific and trusted-root-aware.
- `ts/packages/public/sdk/src/testing/index.ts`
  - Extend the fake only for any new low-level SDK operation actually introduced.

Before adding a low-level method, re-check `docs/conventions/consumer-gateways-and-command-shape.md`: ns owns the domain Consumer Gateway; SDK substrate methods must not become raw filesystem primitives.

## Tests

Write the regression assertions before or with each behavior change.

### Uninstall scenarios

Update/add cases in `ts/packages/public/ns/test/scenario/user-extension-lifecycle.test.ts`:

- Artifact apply failure leaves the declaration present, reports `declarationCompleted: false`, reports completed transitions, and performs no npm cleanup.
- A second uninstall invocation after a partial artifact failure uses the still-present declaration/package identity, treats completed removals idempotently, removes remaining artifacts, then removes the declaration.
- A compare-and-write race after successful artifact removal leaves the declaration present, reports completed artifact evidence, and performs no npm cleanup; retry succeeds safely.
- Successful identifiable uninstall proves apply-before-config-write-before-npm-cleanup ordering through gateway logs or an explicit shared test event log.
- The missing-local-source identity exception still removes only the declaration and retains artifacts.
- Cleanup failure remains declaration-complete and now includes completed artifact evidence.

Retain focused real-adapter coverage in `ts/packages/public/ns/test/integration/real-user-artifact-activation.test.ts` and `user-extension-lifecycle-host.test.ts` for edited-file preflight/deletion authority; change only expectations affected by ordering.

### Staged update contracts

Update `ts/packages/public/ns/test/extension-acquisition.test.ts` and any SDK acquisition/path tests:

- Preparing a floating or missing pinned npm candidate does not change the canonical package root.
- Candidate module root is separate, canonical, trusted, and package-specific.
- Promotion retains old state; commit removes retained operation state; rollback restores old bytes/state or removes a newly promoted package when no old package existed.
- Preparation/promotion/settlement failures return structured diagnostics and never touch sibling packages.
- Fake state and logs defensively copy inputs and model prepare/promote/commit/rollback/discard transitions.

### User update scenarios

Update/add cases in `ts/packages/public/ns/test/scenario/user-extension-lifecycle.test.ts`:

- Candidate descriptor/admission failure discards candidate and leaves canonical bytes and artifacts unchanged.
- Artifact preflight failure discards candidate and leaves canonical bytes and artifacts unchanged.
- Candidate descriptor facts, not old canonical facts, drive artifact preparation and the success result.
- Promotion occurs only after descriptor/admission/artifact preflight.
- Successful artifact application commits promotion and removes backup/staging residue.
- Partial artifact apply reports completed transitions, rolls canonical package bytes back, and gives retry guidance without claiming artifact rollback.
- Rollback failure reports both the primary artifact failure and retained package paths/state.
- Commit cleanup failure reports completed promotion/artifacts plus retained operation residue.
- Dry-run performs no staging, promotion, artifact apply, or config writes.
- Local-source User updates and Project updates retain existing behavior.

Update `ts/packages/public/ns/test/scenario/update-extension.test.ts` only if shared types/fakes require expectation changes; add an explicit regression proving Project update behavior was not accidentally routed through the User staging contract.

## ADR and current documentation

Add `docs/adr/0057-retry-safe-user-extension-lifecycle-mutations.md` (final title may vary without changing terms) and index it in `docs/adr/README.md`. The ADR must:

- supersede only ADR 0056's identifiable uninstall declaration-first ordering;
- retain package identity as deletion authority and the missing-identity exception;
- define candidate validation/preflight before canonical User npm promotion;
- state that promotion retains rollback state until artifact apply succeeds;
- state that cross-Harness artifact application is still non-atomic and partial transitions remain explicit/retryable;
- reject a generic transaction framework, manifest-derived authority, and hidden durable ownership state.

Update present-tense docs with implementation:

- `ts/packages/public/ns/README.md`: correct the Active-harness ADR citation from ADR 0055 to ADR 0056; describe artifacts-first/declaration-last uninstall and staged User npm update/rollback behavior; remove the current claim that failed cleanup after declaration removal is the primary retry model where it no longer applies.
- `ts/packages/public/ns/src/harness-artifacts/README.md`: document that identifiable User uninstall keeps declaration authority through artifact apply and that update preflights from staged package bytes.
- `ts/packages/public/sdk/CONTEXT.md`: update only if implemented ground truth changes its existing User bundled-artifact statement; do not add proposed vocabulary ahead of code.

## Execution strategy

This is a mixed semantic change across more than five code/test/doc files. Use `refactor-swarm` for the implementation if available, split into coherent ownership slices (acquisition contract/fakes, lifecycle sequencing/scenarios, ADR/docs), then perform one parent integration pass. Do not use broad text replacement for lifecycle semantics. For each file, read the affected function/test section and make precise edits.

No broad naming migration is planned. If contract symbols are renamed during implementation, finish with a bounded stale-name grep for the retired names and old declaration-first wording.

## Validation

Focused during development:

```bash
pnpm --dir ts --filter @nseng-ai/ns test -- test/extension-acquisition.test.ts test/scenario/user-extension-lifecycle.test.ts test/scenario/update-extension.test.ts
pnpm --dir ts --filter @nseng-ai/sdk test
```

Use the package scripts' actual Vitest argument behavior; if filtering syntax differs, run the complete `@nseng-ai/ns` package test script rather than inventing another lane.

Required before completion:

```bash
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-sanity
just ts-test-typescript-style-guard
just dprint-check
just
```

Run `just ts-test-isolated` only if implementation adds or changes isolated-lane coverage; no isolated test is currently expected. Plain `just` does not include integration, isolated, or TypeScript style guard, so report each specialized lane separately.

## Risks, assumptions, and verification

- **Filesystem replacement semantics:** candidate, canonical, and backup must be on the same filesystem and below validated lifecycle-owned roots. Verify Node rename behavior and failure recovery on supported platforms before fixing the exact adapter algorithm.
- **Process interruption:** promotion can be interrupted between renames. Keep operation state self-describing enough for the next invocation to classify safe candidate/backup residue without adding a hidden database. Prefer filesystem names and validated package manifests within the owned package area; document any recovery rule in the ADR and tests.
- **Partial artifact apply:** rolling package bytes back cannot roll back already-completed Harness transitions. This is accepted existing non-atomicity; report completed transitions and rely on idempotent retry.
- **Availability against candidate bytes:** verify that only the targeted npm source resolves to the candidate while all other declarations retain canonical roots. Do not accidentally admit two roots for one package identity.
- **Descriptor execution boundary:** Extension Descriptor loading executes trusted package descriptor code. Staging changes its path, not its trust model.
- **Historical validation:** the handoff recorded a clean `just` run with 590 Vitest files and 6,365 tests, but that result is stale and must not be reported as current validation.
- **Branch/stack:** planning verified the branch as `user-lifecycle-artifact-reporting` with a clean short status. Recheck before implementation because stack state is volatile.
- **Objectives:** active orientations were loaded during planning. None changes this User lifecycle design; continue to avoid unrelated ambient Graphite coupling and keep tests fake-driven.

## Review and remediation checklist

Before declaring implementation complete, review the diff against these questions:

1. Does any failure before artifact preflight alter canonical User npm bytes? If yes, fix it.
2. Can an identifiable uninstall lose its declaration before all targeted artifact removals succeed? If yes, fix it.
3. Does any retry depend on manifest-derived package authority? If yes, fix it.
4. Are candidate/backup operations confined to one canonical package and validated trusted roots? If not, fix them.
5. Do partial failures expose completed artifact transitions, canonical package state, retained paths, and safe retry guidance? If not, improve the result contract/tests.
6. Did the change create a reusable transaction abstraction or touch the three deferred cleanup findings? If yes, remove that scope unless mechanically unavoidable and documented.
7. Do current docs match implementation while ADR 0056 remains unedited? If not, add/fix the superseding ADR and mutable docs.
8. Did fake-driven default tests cover sequencing and recovery, with real filesystem behavior retained only in integration/sanity lanes? If not, rebalance coverage before completion.
