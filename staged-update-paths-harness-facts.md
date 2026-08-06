# Remediate User Extension Lifecycle Code-Quality Findings as a Three-PR Stack

## Goal and outcome

Repair the structural code-quality findings from the thermo-nuclear review of the five-branch User extension lifecycle stack (`shared-user-extension-gate` through `retry-safe-user-uninstall-staged-npm-update`) without changing the accepted behavior in ADR 0057.

Produce exactly three coherent PRs, in dependency order:

1. **Decompose the staged User npm-update module without behavior changes.**
2. **Simplify the staged update identity and path model inside the extracted module.**
3. **Unify Supported harness facts in the SDK and clean the User lifecycle command implementation.**

The first PR must contain only file decomposition and import/export rewiring. The second PR depends on that clean module boundary. The third PR combines the SDK gate/facts repair with the command cleanup, as explicitly selected during requirements grilling.

Do not create a separate LOW-priority cleanup PR. Fix a LOW finding only when the owning code is already changed by one of these PRs. Do not broaden this stack into unrelated harness-artifact reconciliation cleanup or test-file reorganization.

## Context and discovered facts

### Product behavior that must remain stable

- At **user scope**, lifecycle commands (`install`, `update`, `uninstall`, and `list`) reconcile descriptor `bundledArtifacts` into the configured harness user roots.
- User artifact reconciliation is independent of the **Active harness** gate. The gate controls User command and point contribution visibility for the current invocation.
- User scope does not run Project activation and does not write repository contributions.
- ADR 0057 defines retry-safe User npm updates:
  - prepare a package-specific candidate under lifecycle-owned managed storage;
  - load and validate the candidate before canonical promotion;
  - preflight bundled Harness artifacts before promotion;
  - promote the candidate while retaining the prior canonical state, or the fact that no canonical package existed;
  - apply Harness artifacts after promotion;
  - commit by deleting operation state, or roll canonical package bytes back after artifact-apply failure;
  - report completed Harness artifact transitions because cross-Harness apply is intentionally non-atomic.
- ADR 0057 also keeps an identifiable User uninstall declaration until targeted artifact removal succeeds.

### Review evidence

- `ts/packages/public/ns/src/init/extension-acquisition.ts` grew from 522 to 1,011 lines. Approximately 490 new lines implement the staged User npm-update Consumer Gateway, its Real and InMemory adapters, its state classifier, and its safety helpers.
- `PreparedUserNpmUpdate` stores several paths that are derived from managed storage, package name, and operation id. `validatePreparedUpdate` recomputes and equality-checks those paths. The Real adapter and InMemory adapter assemble the same layout independently.
- The staged token is in-process command state; it is not a durable serialized record. Retry starts a new preparation operation.
- Path derivation does not replace the live safety checks. Operation-id sanitization, canonical absolute-root checks, directory-chain validation, symlink rejection, and trusted-boundary checks must remain before destructive filesystem operations.
- `ts/packages/public/sdk/src/extensions/user-extension-layer.ts` and `ts/packages/public/ns/src/init/user-extension-lifecycle.ts` both define a type named `UserSupportedHarnessesFacts`, but the shapes differ. They also implement Supported harness parsing separately.
- The ns facts currently carry information needed by lifecycle failures: an empty harness set for missing/invalid input and a structured invalid-config diagnostic with `code`, `message`, and `path`. A unified SDK-owned contract must preserve that information rather than adopt the SDK's current lossy `{ type: "invalid" }` variant unchanged.
- `loadEffectiveUserExtensionLayer()` currently calls `decideUserExtensionLayer()` with fabricated `missing` facts only to resolve the Active harness, then extracts the harness from the disabled reason.
- `updateUserExtension()` is approximately 350 lines and interleaves a stateful staged npm transaction with the local-source flow and dry-run paths.
- Install, update, and list duplicate the User extension layer result schema and decision-to-status mapping. Install and list duplicate the dormant-contribution schema. Update and lifecycle helpers use computed `Awaited<ReturnType<...>>` or `Parameters<...>` types where `DeclaredExtensionDescriptor` and `HarnessId` are the canonical named contracts.
- `listExtensionsResultSchema` carries a constant English `harnessSetDriftNote` in machine-readable output. That prose belongs in human/Markdown rendering, not in the structured result.

### Findings intentionally outside this plan

- Do not split `test/scenario/user-extension-lifecycle.test.ts`; the review challenge found that its organizing axis is User scope and that it contains cross-command journeys with shared setup.
- Do not extract the inline `unauthorizedTargetOwner` scan from Harness artifact transitions solely for this remediation.
- Do not change the TOCTOU posture of `lstat` followed by `rename`/`rm`; the current LBYL behavior is acceptable for this local single-user tool.
- Do not change `hasRemovalAuthority()` unless another planned edit must touch that function. It is not adjacent to the selected work.
- Do not create a general filesystem transaction framework. ADR 0057 explicitly rejects that abstraction.

## Files, symbols, tests, and documentation

### PR 1: decomposition

Primary source files:

- `ts/packages/public/ns/src/init/extension-acquisition.ts`
  - remove the staged User npm-update contracts, Real adapter, InMemory adapter, classifier, and private staged-update helpers;
  - keep install, ordinary update, and uninstall acquisition gateways and their adapters;
  - keep `copyManagedNpmStorage()` here if the remaining adapters still use it. Do not create a reverse dependency from the old module to the new module for this tiny private primitive. A deliberate private duplicate in the new module is acceptable in this mechanical PR.
- **New:** `ts/packages/public/ns/src/init/user-npm-update-acquisition.ts`
  - receive `PrepareUserNpmUpdateParams`, `PreparedUserNpmUpdate`, `PromotedUserNpmUpdate`, result/failure types, `UserNpmUpdateAcquisitionGateway`, `RealUserNpmUpdateAcquisitionGateway`, `InMemoryUserNpmUpdateAcquisitionState`, `InMemoryUserNpmUpdateAcquisitionGateway`, `PreparedUpdateState`, and their private helpers exactly as they exist before extraction.
- `ts/packages/public/ns/src/init/update-extension.ts`
  - import the staged update contracts from the new module.
- `ts/packages/public/ns/src/init/ns/context.ts`
  - import `RealUserNpmUpdateAcquisitionGateway` from the new module.
- `ts/packages/public/ns/src/init/testing/index.ts`
  - re-export the InMemory staged adapter and state from the new module.
- `ts/packages/public/ns/src/init/index.ts`
  - inspect the current public exports and preserve any staged update types or adapters that are part of the package surface; do not silently remove an export during the move.

Tests/import consumers:

- `ts/packages/public/ns/test/integration/user-npm-update-acquisition.test.ts`
- `ts/packages/public/ns/test/scenario/update-extension.test.ts`
- `ts/packages/public/ns/test/scenario/user-extension-lifecycle.test.ts`
- Any additional references found by a bounded `rg` for the staged gateway/type names.

### PR 2: staged identity/path model

Primary source file:

- `ts/packages/public/ns/src/init/user-npm-update-acquisition.ts`

Primary tests:

- `ts/packages/public/ns/test/integration/user-npm-update-acquisition.test.ts`
- `ts/packages/public/ns/test/scenario/update-extension.test.ts`
- `ts/packages/public/ns/test/scenario/user-extension-lifecycle.test.ts`

### PR 3: SDK facts/gate and lifecycle command cleanup

SDK ownership:

- `ts/packages/public/sdk/src/extensions/user-extension-layer.ts`
- `ts/packages/public/sdk/package.json` only if a new export is required; prefer the existing `./extensions/user-extension-layer` export.
- `ts/packages/public/sdk/test/unit/user-extension-layer-decision.test.ts`
- Add or extend SDK loader-level tests for `loadEffectiveUserExtensionLayer()`; do not limit coverage to the pure decision function.
- `ts/packages/public/sdk/CONTEXT.md`
  - update only if the authoritative owner or interface wording changes; keep it synchronized with implemented ground truth.

ns shared lifecycle ownership:

- `ts/packages/public/ns/src/init/user-extension-lifecycle.ts`
- `ts/packages/public/ns/src/init/index.ts`
- `ts/packages/public/ns/src/init/install-extension.ts`
- `ts/packages/public/ns/src/init/update-extension.ts`
- `ts/packages/public/ns/src/init/uninstall-extension.ts`
- `ts/packages/public/ns/src/init/list-extensions.ts`
- `ts/packages/public/ns/test/user-supported-harnesses.test.ts`
- `ts/packages/public/ns/test/scenario/user-extension-lifecycle.test.ts`
- Relevant focused scenario/integration tests for install, update, uninstall, and list.

## Implementation steps

## PR 1 — Extract the staged User npm-update module, with no semantic change

1. Create `user-npm-update-acquisition.ts` beside `extension-acquisition.ts`.
2. Move the staged update contracts, Real adapter, InMemory adapter, state classifier, validation helpers, path helpers, diagnostics helpers, and staged-update-only imports into the new module without redesigning them.
3. Preserve method names, result discriminants, error codes/messages, ordering, path layout, copied-value behavior, and retry semantics exactly.
4. Resolve the shared `copyManagedNpmStorage()` detail without coupling the remaining acquisition module back to the new module:
   - leave the existing private helper in `extension-acquisition.ts` for its remaining users;
   - add a private copy in the new module if needed;
   - do not introduce a public utility module solely for this one-line primitive in the decomposition PR.
5. Rewire source, host-context, testing-barrel, integration-test, and scenario-test imports to the new module.
6. Preserve package-facing exports. If staged update types were not previously exported from `init/index.ts`, do not expand the public interface merely because a new file exists.
7. Confirm `extension-acquisition.ts` is below 1,000 lines after the move.
8. Treat any behavior-changing opportunity found during the move as PR 2 work. PR 1 must remain mechanically reviewable.

**PR 1 acceptance criteria**

- The diff is a move plus import/export changes.
- All staged update tests pass without expectation changes except import paths.
- No result shape, diagnostic, path, operation order, or filesystem effect changes.
- `extension-acquisition.ts` no longer contains staged User npm-update implementation.

## PR 2 — Make staged update paths derived by construction

1. Define the minimal prepared token deliberately. It must retain:
   - `storage`;
   - `operationId`;
   - `packageName`;
   - `sourceSpec`;
   - `intent`;
   - `outcome`;
   - `canonicalExisted` (required by rollback and state classification);
   - `candidateModuleRoot` (required by candidate descriptor loading and by the fake override seam).
2. Remove stored fields that are pure layout derivations, including `operationRoot`, `candidateProjectRoot`, `canonicalProjectRoot`, and `backupProjectRoot`.
3. Add one pure private layout function, for example `userNpmUpdateOperationPaths(storage, packageName, operationId)`, that returns the operation root and all candidate/canonical/backup paths. Use `managedNpmPackagePaths()` for canonical package layout rather than duplicating managed-storage rules.
4. Use this function in `prepare`, `promote`, `settle`, `discard`, state classification, failure construction, the InMemory adapter, and integration fixtures. There must be one package/scoped-package layout implementation.
5. Replace the old cross-field equality block in `validatePreparedUpdate()` with validation of the actual identity and trust properties:
   - parse and verify `sourceSpec` and package identity;
   - reject empty or path-like operation ids (`join(operationId) !== operationId` or the equivalent invariant);
   - require canonical absolute managed storage paths;
   - ensure the derived operation root is strictly below the package-specific updates root;
   - validate the trusted directory chain and reject symlinks/non-directories before filesystem mutation.
6. Preserve the existing `PreparedUpdateState` states and retry behavior (`ready`, `backup-retained`, `promoted`, rollback-restored/retained, missing, inconsistent). Derive the paths once before classification.
7. Keep the candidate module root as an explicit seam, but validate it as far as the Real adapter can safely validate it. Do not assume the fake override is a canonical filesystem path.
8. Repair retained-path reporting while the operation-path code is open:
   - derive candidate paths only after identity/path validation;
   - report only derived paths that actually exist;
   - do not probe or report caller-supplied/forged paths before operation-id, canonical-root, directory-chain, and symlink validation;
   - when candidate acquisition fails before `operationRoot` exists, do not report a false retained path or a false discard-failure diagnostic.
9. Replace positional `trustedAncestors.slice(0, -1)` logic with the named derived path/ancestor values when this improves the same failure-cleanup path.
10. Update integration fixtures so they construct the minimal token and derive expected paths with test-local fixture facts or an intentionally exported testing helper. Do not expose a production-internal path helper publicly only to reduce test code.
11. Retain adversarial integration coverage for forged identity/path state, symlinked update ancestors, retry after partial promotion, commit cleanup, rollback with and without a previous canonical package, and sibling-package isolation.

**PR 2 acceptance criteria**

- Callers cannot supply canonical/candidate/backup project paths in `PreparedUserNpmUpdate`.
- One function owns staged package layout.
- All destructive operations use paths derived from validated identity.
- The state classifier and ADR 0057 operation order remain unchanged.
- Failure evidence does not claim nonexistent retained residue.

## PR 3 — Unify Supported harness facts and clean User lifecycle commands

### A. Put Supported harness facts in the SDK

1. Make `@nseng-ai/sdk/extensions/user-extension-layer` the canonical owner of:
   - `UserSupportedHarnessesFacts`;
   - the Supported harness setting schema;
   - parsing/validation needed to derive those facts from User `ns.toml` content;
   - `decideUserExtensionLayer()`.
2. Design one facts contract that preserves lifecycle needs:
   - configured: canonical, validated, deduplicated `HarnessId[]`;
   - missing: explicit empty harnesses;
   - invalid: explicit empty harnesses plus structured diagnostic (`code`, `message`, and `path`).
3. Ensure the SDK loader preserves its current external distinctions:
   - Active harness unset or unknown short-circuits before filesystem access;
   - user config path/read failure remains `user-config-unavailable`;
   - missing `supported_harnesses` remains missing;
   - malformed TOML/settings and invalid/empty/alias harness lists remain invalid with actionable diagnostics.
4. Remove the fabricated `decideUserExtensionLayer({ supportedHarnesses: { type: "missing" } })` initial call. Resolve the Active harness directly for the pre-I/O short circuit, then call `decideUserExtensionLayer()` once with real parsed facts.
5. Avoid two independent semantic parsers. If the loader must parse extensions and Supported harnesses in one TOML pass, factor the canonical facts conversion below the TOML parser so both the loader and exported lifecycle parser call the same conversion. Prefer a small SDK-owned interface over reparsing solely for reuse.
6. Remove the duplicate facts type, setting schema, parser, invalid helper, and adapter function from `ns/src/init/user-extension-lifecycle.ts`. Import and use the SDK contract directly.
7. Migrate all consumers, including `uninstall-extension.ts`, and update `ns/src/init/index.ts` so it no longer re-exports an ns-owned duplicate. Preserve intended package interfaces by re-exporting the SDK-owned type/function only if the existing ns surface requires compatibility.
8. Update `ns/test/user-supported-harnesses.test.ts` to test the canonical SDK-owned parser/decision through the intended public seam.
9. Add loader-level SDK tests that prove:
   - unset Active harness causes no User config filesystem access;
   - unknown Active harness causes no User config filesystem access and preserves its diagnostic;
   - valid parsed facts produce one final gate decision;
   - invalid and missing facts preserve existing loader decisions and diagnostics.

### B. Define shared lifecycle output contracts once

10. In `user-extension-lifecycle.ts`, define and export one Zod schema and inferred type for the public User extension layer status (`enabled + activeHarness` or `disabled + reason`). Prefer a discriminated/precise shape rather than optional fields that can create impossible combinations.
11. Add one function that converts `UserExtensionLayerDecision` to that public status.
12. Define the dormant-contribution schema/type once beside `summarizeDormantUserContributions()`.
13. Reuse these contracts in install, update, and list schemas/results. Remove the three local layer mappings and duplicate schemas.

### C. Decompose update orchestration and tighten types

14. Split `updateUserExtension()` by behavior, not by arbitrary line count:
   - keep shared source/config/target/gate preparation in the coordinator;
   - move the staged npm transaction into a named function that owns prepare → candidate load/admission → artifact preflight → promote → artifact apply → settle/rollback;
   - move or retain the local-source flow as a separate named function when that makes the coordinator read as policy rather than mechanics;
   - keep compensation logic close to the operation it compensates.
15. Do not add a shallow result-builder interface merely to reduce repeated lines. Extract a result helper only if it encodes a real invariant shared by npm and local outcomes.
16. Replace computed structural types with canonical named contracts:
   - `DeclaredExtensionDescriptor` for loaded descriptor values;
   - `readonly HarnessId[]` for configured harnesses;
   - a precise acquisition-outcome union for artifact preparation/reconciliation instead of `string`.
17. Move `HARNESS_SET_DRIFT_NOTE` out of `ListExtensionsResult`. Keep the sentence in the human and Markdown renderers. Update result schemas and scenario expectations accordingly. This is a structured-output cleanup; document it in the PR description because it changes machine-readable output, even though this private unreleased project permits breaking changes.
18. Fold in only LOW fixes adjacent to these edits. Do not touch Harness artifact transition ownership scans, `hasRemovalAuthority()`, or the large scenario-test organization.
19. Update SDK `CONTEXT.md` in the same PR if the facts/parser ownership statement changes. Use the canonical terms **User extension layer**, **Active harness**, **Supported harnesses**, **User scope**, and **bundled Harness artifacts**.

**PR 3 acceptance criteria**

- One SDK-owned facts contract and semantic parser serve the loader and lifecycle commands.
- The loader does not invent missing facts to learn the Active harness.
- Install, update, list, and uninstall consume the same facts semantics.
- Install, update, and list share one layer-status contract and mapping.
- `updateUserExtension()` is a short coordinator over named npm/local flows.
- Named domain types replace `ReturnType`/`Parameters` gymnastics and `string` widening.
- Constant rendering prose is absent from structured list results.

## Refactor execution strategy

Apply `skills/incubating/branch-context/enriched-plan-save/references/refactor-execution-strategy.md` as follows:

- **PR 1:** use precise file moves and import/export edits. This is a semantic module extraction, not a text-replacement task. Do not use an opaque `text.replace()` script.
- **PR 2:** use direct, reviewed edits in the single extracted TypeScript module plus focused test fixtures. The identity/path change is semantic and security-sensitive; do not automate it with broad replacement.
- **PR 3 same-shape command edits:** install, update, uninstall, and list are four files, so read each affected section and apply precise edits. Reuse the canonical exported schema/helper, but do not run a broad codemod over the package because each command has different result semantics.
- The SDK parser/loader changes and update-orchestration split are distinct semantic workstreams. They may be implemented independently within PR 3 and reconciled before validation; do not use `refactor-swarm` for the four command-local edits because the affected sections are coupled to one shared interface and remain within the reference's 1–4-file precise-edit guidance.
- After each PR, run bounded `rg` checks for stale symbols/imports. After PR 3, specifically check for duplicate `UserSupportedHarnessesFacts`, duplicate `userSupportedHarnessesSettingsSchema`, local `userExtensionLayer` Zod shapes/mappings, descriptor `Awaited<ReturnType<...>>` expressions, and `harnessSetDriftNote`.

## Validation guidance

Follow `ts/AGENTS.md`, `.agents/skills/ns-typescript/SKILL.md`, and `.agents/skills/typescript-style/SKILL.md`. Use native TypeScript 7, pnpm, and Vitest. Do not introduce shared-cache test hazards.

### During each PR

- Run focused Vitest files while developing.
- Run `just ts-format-check`, `just ts-lint`, and `just ts-check` before the PR is considered complete.
- Run the `@nseng-ai/ns` and/or `@nseng-ai/sdk` package tests affected by that PR.
- If formatting fails, use `just ts-format-fix`; if lint autofix is available, use `just ts-lint-fix`.

### PR-specific proof

- **PR 1:** run staged npm acquisition integration tests and User lifecycle/update scenario tests. Verify no assertion changes beyond import paths.
- **PR 2:** run `just ts-test-integration` because the real filesystem adapter and destructive path-safety behavior change. Include focused adversarial path/symlink and rollback tests.
- **PR 3:** run SDK unit and loader tests, ns Supported harness tests, and User lifecycle scenario tests for all four commands. Verify structured output and renderer snapshots/expectations after removal of `harnessSetDriftNote`.

### Final stacked validation

Run the default repository entrypoint and the specialized TypeScript lanes relevant to this architecture change:

```bash
just
just ts-test-integration
just ts-test-typescript-style-guard
```

Run `just ts-test-isolated` only if changed tests belong to that lane; do not move tests there to bypass shared-cache rules.

## Risks, assumptions, and open questions

### Risks

- **Filesystem safety regression:** deriving paths is safer only if all destructive operations use validated identity and derived paths. Never fall back to caller-supplied path fields.
- **Rollback-state regression:** removing `canonicalExisted` would break rollback classification. It must remain in the prepared token.
- **Diagnostic regression:** the SDK's current facts type is too lossy for lifecycle commands. The unified type must preserve structured invalid-config evidence.
- **Loader I/O regression:** Active harness unset/unknown must continue to short-circuit before User config filesystem access.
- **Public result drift:** removing `harnessSetDriftNote` is intentional but must be called out and tested.
- **Accidental behavior in PR 1:** any changed assertion beyond an import path is evidence that decomposition and redesign were mixed.

### Assumptions

- Breaking machine-result changes are allowed because ns is private and unreleased.
- The three PRs form a linear stack in the order listed.
- ADR 0057 remains the accepted behavior; no new ADR is required unless implementation discovers a behavioral decision not covered here.
- No active Objective currently owns this exact remediation. The standing test-performance orientation still applies to test placement.

### Open questions

No material product or data-safety question remains unresolved after grilling. If implementation reveals that one canonical Supported harness parser cannot serve both the combined SDK loader parse and lifecycle commands without a larger public interface, stop and design the smallest two-layer parser (TOML parse plus facts conversion) rather than restoring duplicate semantics.

## Review and remediation checklist

Before each PR is submitted:

- Review the merged PR diff, not commit organization.
- Confirm the PR does only its stated responsibility.
- Confirm tests exercise the module interface through Real and InMemory adapters where applicable.
- Confirm comments explain invariants and safety reasons, not mechanics.
- Confirm no new shallow wrapper exists only to reduce line count.
- Confirm `CONTEXT.md` matches implemented SDK ownership after PR 3.

Before the full stack is considered fixed:

- `extension-acquisition.ts` is below 1,000 lines.
- Staged path mismatch is unrepresentable because callers do not carry derived project paths.
- Safety validation remains before every staged rename/removal.
- One Supported harness facts model and semantic parser exist.
- The Active harness pre-I/O short circuit has loader-level proof.
- `updateUserExtension()` exposes the staged transaction as a named, locally understandable flow.
- User lifecycle result schemas and mappings have one owner.
- The final bounded stale-symbol searches return no unintended duplicates.
