# Reuse-First Semantic Slug Consolidation

## Goal and outcome

Consolidate ns semantic-slug creation around the existing deep modules in `@nseng-ai/extension-kit` instead of adding another generic command or abstraction. The implementation should leave one model-execution path for model-backed slugs, one content-oriented slug pipeline, one plan-family policy, and one Herdr semantic-label policy, with domain operations retaining their own fallback, collision, persistence, and command behavior.

Expected outcome:

- Handoff, Saved Plan, Branch Context, and Herdr content-oriented identities continue to reuse `deriveKitContentSlug()`.
- The newly added Handoff slug implementation becomes a thin domain-policy consumer rather than exporting generic prompt/normalization helpers.
- Saved Plans and Branch Context retain one shared plan-family derivation operation through the curated Plans extension package API.
- New Herdr resource labels and space/tab goal labels use one Herdr-owned 2–6-word semantic-label policy.
- Tracked-branch payload creation reuses `deriveSlugWithModel()` instead of bypassing it through raw model generation.
- Test-only production exports are removed or internalized after bounded consumer verification.
- Existing command faces, schemas, result shapes, storage behavior, collision behavior, and durable slug identities remain unchanged, except for the explicitly approved Herdr goal-label normalization change.

This is a focused slug consolidation. It must not design or implement the future invocation-scoped project-config interface, create a generic `ns content-slug` command, introduce a generic file-reader abstraction, or unify unrelated collision policies.

## Context and discovered facts

### Current branch and originating change

- Planning source branch: `handoff-content-slug-cli`.
- PR #4269, “Move Handoff Content Slug Derivation into the Portable CLI,” is merged: <https://github.com/nseng-ai/ns/pull/4269>.
- Handoff creation now reads the final Markdown, derives a content slug, collision-checks, stores the exact artifact, and returns model and durable-reference evidence.
- `ns handoff exec derive-slug [--file <path>]` is the Handoff-owned file/stdin command. Keep this domain command; do not replace it with a generic content-slug CLI.

### Existing shared depth

`ts/packages/public/extension-kit/src/kit/model-slug.ts` already owns:

- isolated Pi model invocation;
- model selection input;
- timeout and one bounded retry for killed/timed-out execution;
- raw model evidence (`rawOutput`, `provider`, `model`);
- caller-supplied slug normalization;
- normalized slug evidence and structured failures.

`ts/packages/public/extension-kit/src/kit/content-slug.ts` already owns:

- variant-driven prompt assembly;
- exact-content truncation and placeholders;
- first-useful-line/code-fence handling;
- kebab normalization;
- variant-specific suffix stripping and word caps;
- variant validation;
- consistent no-fallback failure construction;
- model evidence propagation.

Do not add a second content derivation interface. The current interfaces are sufficient for the planned Herdr fallback behavior; no generic fallback hook or policy matrix is needed.

### Domain policies that must remain domain-owned

- **Handoff:** final Markdown; 3–8 words; Handoff-specific generic-word rejection and suffix stripping; no model/deterministic fallback; explicit slug remains a separate override; artifact collision refuses overwrite.
- **Plan family:** final plan content; 3–7 words; plan validation rejects dates and generic-only names; no model/deterministic fallback; Saved Plan writes remain exclusive; Branch Context may later suffix branch names as a separate branch-allocation concern.
- **Herdr:** semantic display labels, not Git branch names. Adopt the existing Herdr resource-label contract for both resource creation and goal rename: 2–6 words, flat lowercase ASCII kebab case, and useful removal of `-space`, `-workspace`, and `-tab` suffixes. Slot prefixes and tab/space composition stay outside semantic derivation.
- **Tracked branch:** task/plan content with a branch-oriented prompt, branch sanitizer, deterministic content fallback after successful-but-unusable model output, and branch collision suffixing. It belongs on the lower `deriveSlugWithModel()` interface, not the content variant interface.
- **Flow:** dirty-worktree and latest-commit evidence, Flow fallback behavior, branch availability, and changes-summary structured output remain out of scope.
- **Objectives:** slug parsing/validation is not content generation and remains out of scope.

### Herdr compatibility decision

Herdr currently has two divergent paths:

- `src/pi/resource-label.ts` uses `deriveKitContentSlug()` and fails closed.
- `src/core/space-goal.ts` uses branch-name policy and falls back to the normalized goal only when a successful model response is unusable.

The consolidated behavior is:

- New space/tab descriptions continue to fail closed on any derivation failure.
- Space/tab goals retain fallback only for a successful but unusable model response.
- Model command failure, thrown execution, exhausted timeout retry, and empty output do **not** trigger goal fallback.
- Goal output and fallback now use the Herdr 2–6-word label policy. This intentionally replaces legacy 50-character branch-style goal normalization.
- Managed-Slot space labels retain `sN:` composition; tab labels remain unprefixed.
- Implementation destination labels remain collision-resolved branch names and are not affected.

This can be implemented without changing Extension Kit: goal derivation can call `deriveSlugWithModel()` with a prompt produced by `buildKitContentSlugPrompt()` and a normalization callback equivalent to:

```ts
normalizeContentSlugOutput(rawOutput, HERDR_LABEL_NORMALIZATION) ??
  normalizeContentSlugOutput(goal, HERDR_LABEL_NORMALIZATION)
```

Because `deriveSlugWithModel()` runs this callback only after successful non-empty raw model generation, the current fallback trigger is preserved. Apply the same Herdr validation to the selected value before mutation.

### Configuration constraint

The active `centralize-layered-project-config` Objective directs all configuration access toward a future invocation-scoped typed project-config interface. That interface does not exist yet. This change must:

- preserve current project-only `ns.toml` model selection;
- avoid adding a new slug-specific config abstraction;
- avoid increasing direct low-level `ProjectConfigGateway` use;
- leave composition points straightforward to migrate later;
- not claim config boilerplate reduction as part of this slice.

## Files, symbols, tests, and documentation

### Shared model/content mechanics

- `ts/packages/public/extension-kit/src/kit/model-slug.ts`
  - Keep `deriveSlugWithModel()` and `generateRawTextWithModel()` behavior stable.
  - Reassess and internalize `buildRawTextModelArgs()` if the final bounded search confirms it has no production consumer outside its defining module.
- `ts/packages/public/extension-kit/src/kit/content-slug.ts`
  - Keep `deriveKitContentSlug()`, `buildKitContentSlugPrompt()`, and `normalizeContentSlugOutput()` as the shared production interface.
  - Do not add fallback/config/file/collision policy.
- `ts/packages/public/extension-kit/src/kit/tracked-branch-payload.ts`
  - Migrate `generateTrackedBranchSlug()` from `generateRawTextWithModel()` to `deriveSlugWithModel()`.
  - Internalize `buildTrackedBranchSlugPrompt()` if it remains externally test-only.
- `ts/packages/public/extension-kit/test/unit/model-slug.test.ts`
- `ts/packages/public/extension-kit/test/unit/content-slug.test.ts`
- `ts/packages/public/extension-kit/test/unit/tracked-branch-payload.test.ts`

### Handoff

- `ts/packages/incubating/extensions/handoffs/src/core/content-slug.ts`
  - Retain the Handoff variant and internal validator.
  - Retain `deriveHandoffContentSlug()` as the operation used by Handoff create/derive-slug flows.
  - Delete or internalize prompt/normalization/truncation wrappers and constants that have no production consumer.
- `ts/packages/incubating/extensions/handoffs/src/api/index.ts`
  - Remove content-slug helper exports that are not part of downstream production composition.
  - Do not remove Handoff lifecycle operations, command metadata, schemas, or durable evidence surfaces.
- `ts/packages/incubating/extensions/handoffs/src/core/operations/create.ts`
- `ts/packages/incubating/extensions/handoffs/src/core/operations/derive-slug.ts`
  - Preserve exact command/result/evidence behavior.
- `ts/packages/incubating/extensions/handoffs/test/unit/content-slug.test.ts`
- `ts/packages/incubating/extensions/handoffs/test/scenario/handoff-ns-commands.test.ts`

### Plans and Branch Context

- `ts/packages/incubating/extensions/plans/src/content-slug-derivation.ts`
  - Preserve the shared plan-family operation and variant seed.
  - Internalize standalone prompt/normalization/truncation helpers when they are not production interfaces.
- `ts/packages/incubating/extensions/plans/src/saved-plan-content-slug.ts`
  - Retain `deriveSavedPlanContentSlug()`.
  - Internalize `buildSavedPlanContentSlugPrompt()` when bounded search confirms test-only use.
- `ts/packages/incubating/extensions/plans/src/index.ts`
- `ts/packages/incubating/extensions/plans/src/api.ts`
  - Make the actual plan-family composition operation/type available through the curated Plans extension package API if Branch Context needs it.
  - Remove test-only helper exports rather than preserving a broad root barrel solely for fixtures.
- `ts/packages/incubating/extensions/branch-context/src/core/plan-content-slug.ts`
  - Continue reading the selected file at the Branch Context operation edge and pass content into the plan-family operation.
  - Preserve the injectable `readTextFile` seam.
  - Import cross-package production behavior through `@nseng-ai/plans/api`, not a private source path; avoid broad package-root composition if the curated API can carry the required operation.
  - Internalize `buildPlanContentSlugPrompt()` if it remains test-only.
- `ts/packages/incubating/extensions/branch-context/src/core/index.ts`
- `ts/packages/incubating/extensions/branch-context/src/api/index.ts`
  - Remove test-only prompt-builder exports.
- Tests/fixtures to update without retaining production exports solely for expected prompt construction:
  - `ts/packages/incubating/extensions/plans/test/saved-plan-content-slug.test.ts`
  - `ts/packages/incubating/extensions/branch-context/test/plan-content-slug.test.ts`
  - `ts/packages/incubating/extensions/branch-context/test/plan-preparation.test.ts`
  - `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/test/branch-context-extension-support.ts`
  - `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/test/herdr-impl.test.ts`

### Herdr

- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/src/pi/resource-label.ts`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/src/core/space-goal.ts`
  - Establish one internal, host-owned semantic-label variant/policy, preferably in a focused core module such as `src/core/semantic-label.ts` if that improves ownership and reuse.
  - Keep model/config orchestration in the Pi host adapter; do not move it into harness-independent `@nseng-ai/herdr`.
  - Use the shared policy from both new resource and goal workflows.
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/src/core/new-space.ts`
- `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/src/core/tab.ts`
  - Preserve targeting, mutation ordering, Slot prefix, and tab-label behavior.
- Tests:
  - `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/test/herdr-new-space.test.ts`
  - `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/test/herdr-space-goal.test.ts`
  - `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/test/herdr-tab.test.ts`
  - Add a focused semantic-label policy test file if workflow tests would otherwise duplicate detailed normalization cases.
- Current documentation to synchronize with implementation:
  - `ts/packages/incubating/extensions/herdr/CONTEXT.md`
  - `ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/CONTEXT.md`
  - `ts/packages/incubating/extensions/herdr/AGENTS.md` if the 2–6-word/suffix policy should remain an agent-facing implementation rule.

Do not edit historical ADRs for this current-state consolidation.

## Implementation steps and landing batches

### Batch 1: Close the tracked-branch model-slug bypass

1. In `generateTrackedBranchSlug()`, replace direct `generateRawTextWithModel()` use with `deriveSlugWithModel()`.
2. Pass the existing tracked-branch prompt and exact model selection unchanged.
3. Preserve the exact normalization/fallback expression in `normalizeOutput`:
   - normalize successful raw model output with `sanitizeBranchName()`;
   - if unusable, normalize the **full original content**, not the prompt’s 12,000-character truncation;
   - do not fallback after model command failure, empty output, thrown execution, or timeout exhaustion.
4. Preserve current returned `TextResult`, semantic slug, branch-name suffixing, payload collision behavior, and public tracked-branch result shape.
5. `deriveSlugWithModel()` changes the internal normalization-failure diagnostic. Map the both-unusable case back to the existing user-facing `Could not derive a usable branch slug.` unless bounded evidence shows that message is not observable.
6. Add compatibility tests for:
   - normal model success;
   - successful unusable output falling back to full content;
   - model command failure not falling back;
   - successful unusable output plus unusable content retaining the established failure;
   - fallback remaining `semanticSlug` while only `branchName` receives a collision suffix;
   - fallback using content beyond prompt truncation when relevant.

### Batch 2: Thin domain wrappers and curate package interfaces

1. Run bounded production/test searches before each export removal. Classify each symbol as production composition, package test support, or cross-package fixture support.
2. Handoff:
   - keep the variant, internal validator, derivation operation, context, evidence, and create/derive-slug operations;
   - internalize/remove `MAX_HANDOFF_CONTENT_CHARS`, prompt builder, normalizer wrapper, truncation wrapper, and validator exports when no production consumer exists;
   - rewrite tests to assert domain behavior and recorded model invocation without requiring those symbols from `@nseng-ai/handoffs/api`.
3. Plans:
   - keep one plan-family derivation operation plus its variant seed and evidence types;
   - retain `deriveSavedPlanContentSlug()` as the Saved Plan domain operation;
   - internalize prompt/normalization/truncation helpers used only by tests.
4. Branch Context:
   - consume the plan-family derivation through `@nseng-ai/plans/api`;
   - keep file reading and the injected reader local to Branch Context;
   - retain `derivePlanContentSlug()` while internalizing its prompt builder when test-only.
5. Update package barrels and curated extension package APIs atomically with callers. Do not introduce private `src/` imports or a replacement test-only public helper.
6. Evaluate `buildRawTextModelArgs()` and `buildTrackedBranchSlugPrompt()` under the same rule. If they have no production consumers, internalize them and update fake expectations in the same batch. Prefer behavioral assertions or package-local fixtures over production exports created only to make exact argv tests convenient.
7. Preserve prompt text and normalized outputs for Handoff and the plan family; this batch is interface/ownership cleanup, not a semantic migration.
8. Update package context language only if curated extension package API contents materially change. In particular, keep `ts/packages/incubating/extensions/plans/CONTEXT.md` synchronized if the plan-family composition operation replaces prompt-helper wording in the API description.

### Batch 3: Consolidate Herdr semantic-label policy

1. Move/generalize `RESOURCE_LABEL_VARIANT` and `validateResourceLabel()` into one internal host-owned semantic-label module usable by both Pi registration/composition and core goal workflows.
2. Expose only the minimum internal functions/constants required by those workflows, for example:
   - derive a fail-closed label for new resource creation through `deriveKitContentSlug()`;
   - build the common Herdr content prompt;
   - normalize and validate a Herdr semantic label;
   - derive a goal label with the approved successful-output fallback using `deriveSlugWithModel()`.
3. Keep existing model-policy lookup behavior and command channel. Do not create a new config helper as part of this batch.
4. New space/tab descriptions:
   - continue using the common content pipeline;
   - fail before resource mutation on any model/normalization/validation failure;
   - retain unlabeled creation when no description is supplied.
5. Space/tab goals:
   - use the same prompt rules, 2–6-word normalization, suffix stripping, and validation;
   - when successful model output is unusable, normalize the original goal with that same policy;
   - do not fallback on command failure, empty output, thrown execution, or exhausted retry;
   - fail before rename if both model output and goal are unusable.
6. Preserve caller resolution ordering, idle-wait ordering, notifications except where old prompt/validation wording is necessarily replaced, and all Herdr mutations.
7. Test the unified policy once at its internal interface, then retain workflow integration tests for sequencing and composition:
   - six-word cap;
   - useful stripping of `-space`, `-workspace`, and `-tab`;
   - suffix-only input remains usable according to current shared removal semantics;
   - goal fallback uses the same cap and suffix rules;
   - successful unusable model output triggers goal fallback;
   - command failure and empty output do not trigger fallback;
   - new resource derivation remains fail-closed;
   - managed-Slot space labels retain `sN:`;
   - tab labels remain unprefixed;
   - implementation labels remain collision-resolved branch names.
8. Remove assertions for the legacy “workspace name slug” prompt and replace them with exact or focused assertions for the common Herdr semantic-label prompt.

### Batch 4: Documentation, inventory, and final interface sweep

1. Update Herdr current-state context to state that new resources and goal renames share one semantic-label policy and that only goals have the successful-output fallback.
2. Explicitly document the intentional migration from branch-style goal labels to the Herdr 2–6-word display-label contract.
3. Preserve the distinction between semantic labels and collision-resolved implementation branch labels.
4. Run bounded searches for:
   - `deriveKitContentSlug`;
   - `deriveSlugWithModel` and direct `generateRawTextWithModel` slug conversions;
   - removed prompt/normalization helper names;
   - cross-package root imports that should use curated `/api` surfaces;
   - direct slug model config readers, recording but not expanding scope into the config Objective.
5. Confirm the resulting inventory has:
   - one generic model-to-slug execution implementation;
   - one generic content-to-slug pipeline;
   - one plan-family policy;
   - one Herdr semantic-label policy;
   - thin Handoff policy/orchestration;
   - no new generic CLI, file-reader, collision, or config abstraction.

## Validation guidance

Use repository-standard TypeScript validation and choose lanes based on changed files:

1. Run focused Vitest files during development for Extension Kit, Handoffs, Plans, Branch Context, and Pi Herdr.
2. Run formatting autofixers rather than hand-editing formatter output if needed:
   - `just ts-format-fix`
   - `just ts-lint-fix`
3. Run the normal repository validation entrypoint: `just`.
4. Because this changes TypeScript architecture and package exports, also run:
   - `just ts-check`
   - `just ts-test-typescript-style-guard`
   - `just ts-test-sanity`
5. Run integration tests if package-export or real-loader coverage is affected. `just` does not prove integration or style-guard success.
6. Verify package topology/dependency constraints if curated API imports or exports change (`just ts-deps-check` or the repository aggregate that includes it).
7. Do not add real Pi/Git subprocesses to shared-cache default tests. Continue using injected command and Git fakes.

Validation must prove behavioral compatibility for Handoff, Plans, Branch Context, and tracked branches, and must make the intentional Herdr goal-label change explicit rather than hiding it as refactoring.

## Anticipated impact

The expected value is interface and policy reduction more than raw line deletion:

- remove approximately 35–80 net production lines from shallow wrappers and duplicate model-to-slug orchestration;
- potentially remove additional public export surface and repeated exact-prompt test scaffolding;
- avoid adding the 100–200+ lines that a generic CLI/schema/test surface would require;
- reduce Herdr semantic-label pipelines from two to one;
- reduce model-backed slug execution implementations/bypasses to the shared `deriveSlugWithModel()` path;
- preserve separate domain collision and storage rules, where consolidation would increase complexity.

Treat these as planning estimates, not acceptance criteria. Prefer the smallest coherent implementation even if formatter/test fixture changes alter the line totals.

## Risks, assumptions, and open questions

### Risks

- **Hidden consumers of helper exports:** perform bounded workspace searches immediately before removal. If a production consumer exists, retain the smallest justified interface rather than breaking it accidentally.
- **Test coupling to exact prompts:** removing prompt-builder exports may reveal brittle cross-package tests. Replace them with behavior-oriented fake assertions or package-local fixtures; do not create a new public test-only helper.
- **Herdr semantic change:** goal labels may become shorter or lose `-space`/`-workspace`/`-tab` suffixes. Tests and context must describe this as intentional.
- **Fallback trigger drift:** a broad `catch` around Herdr derivation would incorrectly fallback on model command failures. Keep fallback inside the post-success normalization callback.
- **Tracked-branch diagnostic drift:** explicitly preserve the established both-unusable error while reusing `deriveSlugWithModel()`.
- **Config architecture conflict:** do not factor current root/config lookup into a new shared slug helper. Record migration seams for the project-config Objective instead.
- **Package ownership inversion:** Herdr vocabulary stays out of Extension Kit; model/Pi orchestration stays out of harness-independent `@nseng-ai/herdr`.

### Assumptions

- Breaking removal of test-only exports is acceptable because ns is private/pre-release and bounded searches show no production consumer.
- Handoff and plan-family prompt/output semantics should remain byte-for-byte or behaviorally equivalent after wrapper removal.
- The shared Extension Kit functions remain public because they have multiple real consumers; only shallow domain/test helpers are candidates for internalization.
- No storage migration is required. Existing Handoff artifacts, Saved Plans, Branch Context attachments, branches, and Herdr resources remain readable and addressable.

### Open questions

No material product requirement remains open. During implementation, if a supposedly test-only export has an unexpected production consumer or the Herdr fallback cannot be preserved without broadening the shared interface, stop and reassess the affected batch rather than silently widening the abstraction.

## Review and remediation

Before considering the change complete, review the final diff along two axes:

### Shared-interface review

- Does every remaining public slug helper have at least two live consumers or an explicit single-consumer justification and demotion trigger?
- Is domain vocabulary absent from Extension Kit interfaces?
- Did the change deepen existing modules instead of layering a new wrapper over them?
- Are tests exercising the same interface as production rather than reaching through it?
- Are all cross-package imports through declared package exports and curated extension package APIs?

### Behavioral review

- Handoff create and `exec derive-slug` still return the same schemas, evidence, and no-fallback behavior.
- Saved Plan and Branch Context still derive from content, reject invalid model results, and never fallback to filenames.
- Branch Context still reads files at its operation edge.
- Tracked-branch model failure, fallback, semantic slug, and collision behavior are unchanged.
- Herdr new-resource failure remains fail-closed.
- Herdr goal fallback occurs only after successful-but-unusable output.
- The one intended Herdr normalization change is covered and documented.
- Flow, Objectives, collision algorithms, persistence, and config precedence are untouched.

If review finds duplicated slug execution remaining, move only the common mechanics downward into the existing `model-slug` or `content-slug` module. If review finds a domain-specific option accumulating in the shared interface, move that policy back to the domain callback/operation instead of growing a lowest-common-denominator configuration object.