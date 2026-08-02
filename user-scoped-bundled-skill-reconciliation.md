# Salvage User-Scoped Bundled-Skill Provisioning onto the Harness-Aware Lifecycle

## Goal and outcome

Create a fresh Graphite child of `harness-aware-user-extension-lifecycle` that selectively reimplements the valuable user-artifact behavior from the obsolete sibling `harness-aware-user-extension-provisioning`, without importing that sibling's older duplicate harness/config/catalog architecture.

The completed child must:

- provision each targeted User extension's descriptor-bundled skills into every User harness root named by the XDG user `ns.toml` `supported_harnesses` list;
- reuse one scope-aware artifact reconciliation engine for Project and User scope while preserving existing Project behavior;
- enforce package-targeted, scope-safe deletion authority and strict preflight semantics;
- make `extension install|update|uninstall|list --scope user` accurately expose artifact outcomes, gate state, dormant contributions, drift, and partial completion;
- preserve the refined Active-harness gate already implemented on `harness-aware-user-extension-lifecycle`;
- submit the salvage child for review and only then delete the obsolete local provisioning stack branch.

This is selective reimplementation, not a cherry-pick. The sibling commit is reference evidence, not the integration base.

## Context and discovered facts

### Branch and stack evidence

- Current source branch: `harness-aware-user-extension-lifecycle` at `d54470e2e2fce9c9401e3c296c97f4ea12794a75`.
- Obsolete sibling: `harness-aware-user-extension-provisioning` at `ac2d19541bb41f41977a8130c5da0baab757040c`.
- Common parent: `b0d9a955f2d76464f2925018c4578838fa568099` (`prove-whole-extension-source-installation`).
- Both branches are siblings parented to `prove-whole-extension-source-installation`; provisioning is not a child to merge forward.
- Lifecycle has PR #4063 and the newer shared harness-gating architecture. Provisioning has no remote/PR and is intended for eventual deletion.
- The lifecycle worktree was clean during planning. Revalidate because lifecycle was locally ahead of and behind its remote tracking ref; build the new child from the intended local lifecycle commit, not by resetting to the remote.

### Authoritative product contract

`docs/adr/0054-harness-aware-user-extension-layer.md` is accepted and already records the target behavior:

- persisted `supported_harnesses` accepts only canonical `claude-code`, `codex`, and `pi` IDs;
- lifecycle administration is never gated by `NS_HARNESS`;
- commands and point definitions are invocation-gated by the Active harness;
- bundled skills are reconciled into all configured User harness roots;
- instructions, consumer directories, point installations, hooks, prompts, models, and extension settings stay dormant at User scope;
- manifest facts are evidence, never authority;
- targeted operations may not remove or rewrite unrelated packages;
- malformed/cross-scope/unsafe manifest facts and edited tracked files block mutation without `--force`;
- identifiable uninstall performs artifact preflight before declaration mutation;
- missing local identity removes the dead declaration but retains uncertain artifacts with an explicit result;
- cross-root apply is non-atomic, reports completed transitions, and must be retryable/idempotent;
- hand-editing `supported_harnesses` creates deferred per-extension reconciliation, and User list is read-only.

Do not rewrite ADR 0054 as part of this implementation: ADRs are immutable records and its accepted text is already the specification.

### Lifecycle architecture to preserve

The lifecycle branch already owns the refined implementation that must remain authoritative:

- `ts/packages/public/sdk/src/project-config/harness-identity.ts`
  - canonical `HarnessId`, `ALL_HARNESS_IDS`, aliases, `NS_HARNESS`, and persisted-list validation;
- `ts/packages/public/sdk/src/extensions/user-extension-layer.ts`
  - `loadEffectiveUserExtensionLayer()`, fail-closed Active-harness selection, XDG config loading, descriptor loading, and Project-over-User source suppression;
- `ts/packages/public/sdk/src/extensions/registry.ts` and `point-catalog.ts`
  - command and point consumption of the shared effective User layer;
- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-extension.ts`
  - Pi's explicit copied-environment injection of `NS_HARNESS=pi`.

Do not recover the provisioning sibling's older `sdk/harness.ts`, `project-config/user-config.ts`, `extensions/user-descriptor-layer.ts`, registry rewrite, point parser rewrite, or duplicate identity/config logic.

### Existing reconciliation substrate

The current Project engine already supplies most safety machinery:

- `ts/packages/public/ns/src/harness-artifacts/declared-artifact-activation.ts`
  - descriptor discovery plus prepared aggregate activation;
- `project-harness-artifact-transitions.ts`
  - ordered removal-before-provision planning, strict/force-capable policy, all-root snapshots, apply-time stale checks, and completed-transition evidence;
- `reconcile.ts`
  - desired pairs, removal reasons, orphan reporting, collisions, and `ReconcileDeletionAuthority` (`full` or package-targeted);
- `provision-manifest.ts`, `provision-removal.ts`, `provision-apply.ts`, and `provision-state.ts`
  - manifest coherence, tracked hashes, path containment, safe removal, stale-state validation, writes, and obsolete-file cleanup;
- `harness-paths.ts`
  - Project and User roots, including `CLAUDE_CONFIG_DIR`, `~/.agents/skills`, and `~/.pi/agent/skills`.

The engine remains Project-shaped in key places: desired pairs hard-code Project scope, manifest reads hard-code Project roots, removal coherence expects Project scope, and transition preparation receives one trusted repo root. These are the seams to parameterize—not duplicate.

### Important remediation beyond the sibling implementation

Use `ac2d19541` to recover behavior and test ideas, but do not preserve its flaws:

- Its uninstall flow mutates the declaration before artifact preflight in some paths, contrary to ADR 0054. The replacement must preflight first whenever package identity is available.
- Deletion authority must cover **every** removal reason, including same-target replacement and deselected-harness removal—not only `removed-source`. Package A must never remove Package B's same-named skill.
- A supplied source argument when the declaration is already absent must not independently broaden artifact deletion authority.
- Install/update success must not claim unconditional current command availability; visibility is derived from the same Active-harness decision used by catalogs.

No active Objective discovered during planning directly owns this closed extension-lifecycle slice. The active repository orientations still apply, especially fake-driven default tests and keeping ambient Graphite dependencies out of runtime package code.

## Files, symbols, tests, and documentation

### Primary implementation files

- `ts/packages/public/ns/src/harness-artifacts/project-harness-artifact-transitions.ts`
  - generalize/rename Project-only transition types and functions to scope-aware aggregate equivalents;
  - parameterize manifest snapshot reads by `HarnessScope`;
  - derive a trusted boundary per scope/harness rather than accepting one ambient repo root.
- `ts/packages/public/ns/src/harness-artifacts/reconcile.ts`
  - add explicit requested scope to desired pairs;
  - enforce package deletion authority for all removal reasons;
  - represent unauthorized replacement/removal as a blocking conflict, not a silently removable entry.
- `ts/packages/public/ns/src/harness-artifacts/provision-apply.ts`
  - expose/use a scope-and-harness-aware trusted boundary resolver: Project root for Project scope, `CLAUDE_CONFIG_DIR` for Claude User scope when configured, otherwise trusted home for User scope.
- `ts/packages/public/ns/src/harness-artifacts/provision-removal.ts`
  - accept and validate the requested scope rather than hard-coding Project.
- `ts/packages/public/ns/src/harness-artifacts/declared-artifact-activation.ts`
  - retain the Project wrapper;
  - add a User wrapper over one private scope-aware preparation function;
  - User preparation accepts explicit path context, configured harnesses, and targeted package names.
- `ts/packages/public/ns/src/harness-artifacts/api.ts`
  - export only the curated new scope-aware/User activation surface needed by the init layer.
- `ts/packages/public/ns/src/harness-artifacts/harness-artifact-actions.ts` (new only if needed)
  - dependency-free shared action constants if the generic rename otherwise introduces a runtime import cycle.
- `ts/packages/public/ns/src/harness-artifacts/README.md`
  - document the now-shared Project/User consumer seam and authority model.

### User lifecycle composition

- `ts/packages/public/ns/src/init/user-artifact-activation.ts` (new)
  - semantic gateway accepting loaded targeted descriptors, configured harnesses, and authorized package names;
  - do not expose manifest-derived authority or a generic subprocess/filesystem mechanism.
- `real-user-artifact-activation.ts` and `fake-user-artifact-activation.ts` (new)
  - real adapter captures trusted `homeDir`/environment at composition;
  - constructor-state fake records prepare/apply operations and models prepared conflicts/failures.
- `user-extension-lifecycle.ts`
  - add the User artifact gateway to the shared context;
  - parse/validate User `supported_harnesses` through canonical SDK identity validation;
  - add helpers for strict preflight blockers, completed-transition evidence, configured-harness presentation, dormant contribution summaries, and retry-safe outcomes.
- `install-extension.ts`, `update-extension.ts`, `uninstall-extension.ts`, `list-extensions.ts`
  - extend User result schemas, orchestration, and renderers as detailed below.
- `init/ns/context.ts`
  - compose the real User artifact adapter with explicit `ctx.env` and `ctx.homeDir`.
- `init/testing/index.ts`
  - expose the new fake for scenario tests.
- `init/ns/commands/extension-{install,list,uninstall}.ts` and related command descriptions
  - remove stale “command-only”/“no bundled artifacts” claims while preserving “no Project activation” language.
- `src/sdk/sdk.ts` only if its exported init context/result surface requires the new gateway/types; avoid broad exports.

### Shared gate reporting

- Refactor `ts/packages/public/sdk/src/extensions/user-extension-layer.ts` to expose a small pure decision helper (or equivalent existing central helper) used by both `loadEffectiveUserExtensionLayer()` and lifecycle reporting.
- The helper takes the invocation environment and already parsed/validated User supported-harness facts. It must not reread files or load descriptors.
- User list/install/update results should report the same enabled/disabled reason and Active harness semantics as catalog loading. Do not reintroduce a second identity table or a second independent gate algorithm.

### Tests

Update/add focused coverage in:

- `ts/packages/public/ns/test/project-harness-artifact-transitions.test.ts` (rename to an aggregate name if the production API is renamed);
- `reconcile-plan.test.ts` and `reconcile-apply.test.ts`;
- `declared-artifact-activation.test.ts`;
- `test/integration/real-artifact-activation.test.ts`;
- `test/scenario/user-extension-lifecycle.test.ts`;
- `test/integration/user-extension-lifecycle-host.test.ts`;
- `test/integration/source-user-extension-install-host.test.ts` where source-backed lifecycle behavior changes;
- CLI contract/rendering tests such as `init-ns-cli-contracts.test.ts` and the existing install/list/update/uninstall scenario files;
- SDK User-layer unit tests if the pure decision helper is extracted.

Keep fake-driven policy/orchestration tests in the default lane. Real filesystem and host-loading proofs belong in `test/integration/`. This work should not require isolated tests or module mocks.

### User-facing and domain documentation

Reconcile the stale command-only statements in:

- `ts/packages/public/ns/README.md`;
- `ts/packages/public/sdk/docs/writing-an-ns-extension.md`;
- `ts/packages/public/sdk/docs/sdk-reference.md` if result/config surfaces are documented there;
- `ts/packages/public/sdk/CONTEXT.md` so User command availability, User bundled-skill provisioning, dormant repository contributions, Supported harnesses, and lifecycle orchestration match implementation;
- `CONTEXT-MAP.md` only where its inventory/relationship facts are stale after implementation.

Do not copy the sibling's unrelated `ts/packages/incubating/extensions/objectives/README.md` change, rewrite the closed `source-installed-ns-extensions` Objective, or update glossary language ahead of implemented ground truth.

## Implementation steps

### 1. Establish the fresh child and preserve comparison evidence

1. Revalidate clean status, exact branch heads, lifecycle PR/parentage, and the absence of a provisioning remote/PR.
2. Check out the intended local `harness-aware-user-extension-lifecycle` tip and create a fresh Graphite child with a semantic name such as `salvage-user-extension-artifact-reconciliation`.
3. Record `ac2d19541bb41f41977a8130c5da0baab757040c` in implementation notes/PR evidence so the old behavior remains inspectable after branch deletion.
4. Never cherry-pick the sibling commit. Use narrow `git show <ref>:<path>` and scoped diffs only to compare algorithms, schemas, and tests.

### 2. Generalize the artifact engine without changing Project behavior

1. Rename the Project-specific aggregate transition module/types/functions to scope-neutral names where they now serve both scopes. Keep a compatibility wrapper only if an existing public subpath requires it; otherwise update internal callers atomically.
2. Add `scope: HarnessScope` to transition planning and `planHarnessArtifactReconcile()`. Desired pairs and manifest identities must carry the requested scope.
3. Replace `readProjectHarnessManifestSnapshots()` with a scope-parameterized all-harness reader. Read all canonical roots, not just currently selected roots, so deselection and orphan drift are visible.
4. Resolve trusted boundaries from `(scope, harness, pathContext)`:
   - Project → repository root;
   - Claude User → nonblank `CLAUDE_CONFIG_DIR` when set, otherwise trusted home;
   - Codex/Pi User → trusted home.
5. Pass expected scope into removal coherence checks. Reject key/scope/harness/root/path mismatch before mutation.
6. Apply `ReconcileDeletionAuthority` to `same-target-replacement`, `deselected-harness`, and `removed-source`. An unrelated package's entry must be retained and produce a blocking collision/diagnostic; its target must not then be overwritten by the incoming package.
7. Preserve strict preflight, ordered remove-then-provision behavior, apply-time stale checks, completed-transition maps, retained untracked files, and idempotent retry.
8. Run existing Project reconciliation tests immediately. Project scope must remain behaviorally unchanged before wiring User lifecycle code.

### 3. Add the targeted User artifact gateway

1. Define `UserArtifactActivationGateway` above the filesystem engine. Its prepare request includes:
   - loaded descriptor records for the lifecycle-targeted extension(s);
   - validated configured harness IDs;
   - package names explicitly authorized by the lifecycle operation.
2. Build `prepareUserDeclaredArtifactActivation()` as a thin User wrapper over the shared scoped engine:
   - scope is `user`;
   - selected harnesses are exactly the configured User list (missing means none, never all);
   - deletion authority is package-targeted;
   - conflict policy is strict and never force-capable.
3. Keep the existing Project `ArtifactActivationGateway` contract and wrapper intact unless a small shared result type reduces duplication without coupling callers.
4. Compose the real adapter with trusted host path facts (`homeDir`, XDG-relevant environment, `CLAUDE_CONFIG_DIR`) and add a constructor-state fake with read-only operation logs.

### 4. Centralize User supported-harness and gate facts

1. Reuse `HarnessId`, `ALL_HARNESS_IDS`, and `validateSupportedHarnesses()` from the SDK. Do not duplicate canonical IDs or aliases in ns init.
2. Add a lifecycle helper that parses top-level User `supported_harnesses` while preserving byte-oriented config editing. Missing returns an explicit `missing` state with an empty configured set; malformed/empty/alias-bearing lists are source-labelled failures.
3. Extract/reuse a pure User-layer decision function from the lifecycle branch's effective loader so lifecycle outputs and command/point catalogs agree on unset, unknown, unsupported, invalid, and enabled states.
4. Keep administration callable with no `NS_HARNESS`; the gate is reporting/contribution state, never permission to install/update/uninstall/list.

### 5. Wire install and update reconciliation

For User install:

1. Read and validate config/supported harnesses; acquire npm bytes when needed; load exactly one descriptor.
2. Prepare strict targeted artifact reconciliation before writing the declaration. A preflight blocker must leave `ns.toml` and artifacts untouched; preserve existing rollback of only newly created npm package projects.
3. Compare-and-write the declaration, then apply the prepared cross-root transitions.
4. If apply partially fails, report declaration completion, acquisition outcome, completed transitions, retained paths where known, and an `extension update --scope user` retry command. Do not roll back successfully written artifacts through ad hoc reverse mutation.
5. Return configured harnesses, artifact outcomes, dormant contribution counts, and the shared User-layer gate decision. Do not label commands unconditionally available.

For User update:

1. Keep config byte-preserving and declaration-stable.
2. After current/prospective package bytes and a valid descriptor are available, prepare and apply targeted reconciliation to the current configured harness set. This closes drift caused by hand-editing `supported_harnesses`.
3. A local update dry-run may prepare and report the current no-write artifact plan. An npm dry-run must not claim knowledge of future descriptor artifacts before acquisition; report artifact effects as unavailable/deferred when the prospective bytes are unavailable. Never apply transitions in dry-run.
4. Surface strict conflicts and partial apply evidence with safe retry guidance.

### 6. Implement ADR-correct uninstall ordering

1. Resolve whether the requested source matches a current declaration.
2. Establish package deletion authority before mutation:
   - npm declaration → canonical package name from the validated source/lifecycle state;
   - available local descriptor → loaded package name;
   - disappeared local source/descriptor → identity unavailable.
3. If identity is available and the declaration exists, prepare removal with empty desired descriptors and targeted package authority **before** changing `ns.toml`. Any edited tracked file, malformed/cross-scope entry, collision, unsafe path, or stale preflight fact leaves declaration and artifacts unchanged.
4. After successful preflight, remove declaration with compare-and-write, apply prepared removals, then clean lifecycle-owned npm bytes.
5. If local identity is unavailable, remove only the dead declaration and return an explicit `artifacts-retained-package-identity-unavailable` outcome with uncertainty/manual-recovery guidance. Do not infer authority from manifests.
6. If the declaration is already absent, do not authorize artifact deletion solely from the supplied argument. Permit only cleanup justified by validated lifecycle-owned managed npm state; keep retries idempotent and report retained artifacts honestly.
7. On post-declaration apply/cleanup failure, report declaration completion, completed transitions, retained paths, cleanup state, and exact retry guidance.

### 7. Make User list a read-only reconciliation inspection

1. Parse all User declarations and supported-harness facts, load descriptors with per-source diagnostics, and compute the shared Active-harness gate decision.
2. Prepare one no-apply User reconciliation for safely loaded declared descriptors against the configured harness set. The authorized package set is limited to those loaded declarations; undeclared manifest entries remain reported orphans, not removal authority.
3. Per row, report package/version/root, acquisition state, command contribution state, bundled skill count, artifact state (`none`, `provisioned`, `needs-reconcile`, `conflicted`, or `unavailable`), observed/affected counts, and dormant instruction/consumer-directory counts.
4. At result level, report configured harnesses, gate state/reason, orphaned User-manifest count, and the deferred reconciliation rule.
5. Ensure an empty declaration list can still report orphan drift; do not let an early “no extensions” renderer hide machine-state evidence.
6. List must never call apply or edit config/artifacts. If inspection cannot prove a precise state, emit `unavailable` plus diagnostics rather than optimistic counts.

### 8. Add safety and behavior proofs

At minimum prove:

- Project behavior parity after scope generalization;
- User install into all three roots, including `CLAUDE_CONFIG_DIR` and per-root ownership manifests;
- missing `supported_harnesses` writes no User artifacts and never defaults to all;
- update reconciles added/removed configured harnesses for only the targeted package;
- Package A cannot delete or replace Package B's same-named artifact;
- cross-scope, wrong-root, wrong-harness, malformed-key, escaping-path, and ambiguous ownership records block mutation;
- edited tracked files block identifiable uninstall before declaration mutation;
- untracked files survive removal;
- stale prepared state reports completed transitions and preserves retry safety;
- missing local descriptor removes the declaration but reports retained uncertain artifacts;
- already-absent declaration does not broaden deletion authority;
- list is read-only and reports enabled/disabled gate reasons, needs-reconcile state, conflicts, orphans, dormant contributions, and partial/unavailable evidence;
- lifecycle results no longer claim unconditional command availability;
- existing npm acquisition isolation, rollback, byte-preserving config edits, and Project activation tests remain green.

### 9. Reconcile docs and command copy

Update package README, SDK author/reference docs, CLI descriptions, and SDK context only after behavior is implemented. Preserve the distinction:

- User scope contributes commands/points only when the invocation gate enables the layer;
- User lifecycle provisions descriptor-bundled skills into configured User harness roots;
- User scope still performs no Project activation and keeps repository-specific contributions dormant.

Run a bounded stale-claim search for `command availability only`, `never activates ... bundled`, `no user artifacts`, and old Project-only transition names.

### 10. Submit, review, then retire the obsolete branch

1. Review the fresh child's net diff against lifecycle and compare its behavior matrix to `ac2d19541`; confirm no obsolete SDK architecture was ported.
2. Submit/update the fresh child PR with Graphite only after validation and publication authorization (`gt submit --no-interactive`). Include the sibling commit hash as provenance for the salvage.
3. Confirm the child PR/remote exists and the obsolete provisioning branch has no live children or unique work omitted by the behavior matrix.
4. Only then delete `harness-aware-user-extension-provisioning` as a local Graphite branch (`gt delete harness-aware-user-extension-provisioning -f -q`), allowing Graphite to reconcile topology if needed.
5. Verify the lifecycle parent, fresh child, and PR remain intact. Do not delete the obsolete branch before submission; retaining it through implementation and initial publication is an explicit safety gate.

## Execution strategy

This change spans more than five files across engine code, lifecycle orchestration, tests, and prose. Use a staged **refactor-swarm** strategy for semantic work, with the central scope-aware engine landed in the worktree before parallel lifecycle/test/doc batches. Do not run an opaque repository-wide `text.replace()` script and do not cherry-pick the sibling.

For the same-shape TypeScript symbol rename (`ProjectHarnessArtifactTransitions` and related functions/files), prefer a deterministic TypeScript language-service/AST-aware rename if a suitable repo tool is available. If not, use precise file edits in the small known importer set, then run typecheck and a bounded stale-symbol grep immediately. Keep semantic changes—authority policy, uninstall ordering, result schemas, and docs—as reviewed targeted edits rather than mechanical replacement.

Suggested workstream order:

1. engine scope/authority refactor plus Project parity tests;
2. User gateway/adapter/fake;
3. install/update/uninstall orchestration;
4. list inspection/gate reporting;
5. integration scenarios;
6. docs/context reconciliation;
7. final stale-term/symbol scan and net-diff review.

## Validation guidance

Use focused tests while iterating, then run repository-required lanes. At minimum:

```bash
pnpm --dir ts exec vitest run \
  packages/public/ns/test/aggregate-harness-artifact-transitions.test.ts \
  packages/public/ns/test/reconcile-plan.test.ts \
  packages/public/ns/test/declared-artifact-activation.test.ts \
  packages/public/ns/test/scenario/user-extension-lifecycle.test.ts

just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-isolated
just ts-test-typescript-style-guard
just ts-deps-check
just dprint-check
just
```

Adjust the focused filename if the transition test is not renamed. If formatting fails, use `just ts-format-fix`; for dprint use `just dprint-fix`; for autofixable lint use `just ts-lint-fix`, then rerun checks. Do not add module mocks, fake timers, direct process mutation, raw production timers, or real filesystem work to the default lane.

Final evidence checks:

```bash
git diff --check
rg -n --glob '!*.map' --max-columns 300 --max-columns-preview \
  'ProjectHarnessArtifactTransitions|readProjectHarnessManifestSnapshots|command availability only|never activates.*bundled' \
  ts/packages/public/ns ts/packages/public/sdk CONTEXT-MAP.md | head -n 200

git diff --stat harness-aware-user-extension-lifecycle...HEAD
git diff --name-status harness-aware-user-extension-lifecycle...HEAD
```

Inspect every remaining grep hit; some historical/contrast wording may be valid, but no current contract should claim User scope is command-only.

## Risks, assumptions, and open questions

### Risks

- **Authority regression:** generic scope support can accidentally let a targeted package remove an unrelated same-target entry. Treat all removal reasons as authority-bearing and test them independently.
- **Unsafe uninstall ordering:** config mutation before preflight can orphan edited or corrupt artifacts. Identifiable uninstall must prove safe removal first.
- **Cross-root partial application:** no filesystem transaction spans Claude/Codex/Pi roots. Preserve completed-transition evidence and idempotent retry rather than pretending atomicity.
- **Gate drift:** lifecycle output can disagree with actual command/point visibility if it reimplements Active-harness logic. Centralize the pure decision and reuse it.
- **List overclaiming:** malformed descriptors/manifests or unavailable roots can make counts partial. Prefer explicit `unavailable` facts and diagnostics.
- **Regression from sibling patching:** the sibling includes thousands of lines of older duplicate SDK work. Selective reimplementation and a final forbidden-file/symbol review are mandatory.
- **Branch topology loss:** deleting provisioning too early removes the easiest comparison ref. Deletion is post-validation and post-submit only.

### Assumptions

- ADR 0054 remains the accepted product decision and no superseding ADR appears before implementation.
- Only bundled `skill` artifacts are provisioned at User scope in this slice.
- Missing User `supported_harnesses` means an empty configured set, never all known harnesses.
- List inspection may read all User harness manifests but obtains no deletion authority and performs no writes.
- The fresh child is based on the local lifecycle tip that owns PR #4063, even if remote tracking state changes.

### Open questions

No material product questions remain. If implementation discovers that the current public API requires preserving Project-named transition exports, retain thin deprecated/internal compatibility wrappers rather than widening the change; this is an implementation compatibility choice, not a reason to alter the behavior above.

## Review and remediation checklist

Before submission, review the child on two axes:

### Specification

- Every ADR 0054 acceptance example has direct test evidence.
- Install/update/uninstall/list semantics match the ordering and retained-artifact contracts above.
- Command/point gating remains lifecycle's shared implementation.
- User scope provisions only bundled skills; repository effects stay dormant.
- User-visible output is truthful under unset/unknown harnesses, drift, conflict, partial apply, and missing identity.

### Standards and architecture

- Project/User share one reconciliation engine with explicit scope and authority.
- Domain logic sits above semantic gateways; real filesystem/path resolution stays in adapters.
- Fakes are constructor-state alternate implementations; default tests are deterministic and I/O-free.
- No new ambient Graphite runtime dependency exists; Graphite is used only for branch/PR workflow.
- Context/docs are synchronized with implemented ground truth, while ADR 0054 remains unchanged.
- No obsolete provisioning SDK files or unrelated Objectives README changes were copied.

If review finds behavior present only on `ac2d19541`, remediate it on the fresh child and rerun the full matrix before deleting the obsolete branch. If deletion preconditions cannot be proven, leave the sibling branch in place and report the exact missing evidence rather than forcing cleanup.