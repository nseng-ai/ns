# Finish Slot Path Consolidation and Branch-Context Read Failures

## Goal and outcome

Repair the two HIGH code-quality findings from review of commit `bec8168ca25877f0e46edaa1f6a2e107abefe49d` (`[cp] Propagate structured slug derivation results`) without broadening into unrelated cleanup.

The completed change should:

1. Make `@nseng-ai/slots/api` the only owner of lexical managed-Slot-worktree recognition, preserve separator-independent recognition for POSIX- and Windows-style paths, and remove Flow’s competing regex/parser model.
2. Make ordinary plan-file read failures participate in branch-context’s typed preparation failure path instead of rejecting outside the new result contract.
3. Preserve existing successful behavior, user-facing labels/messages where practical, mutation ordering, and fail-before-mutation guarantees.

Out of scope:

- model-policy operation ownership or content-slug operation routing;
- Herdr result-shape redesign;
- Extension Kit model-slug test-helper redesign;
- unrelated Flow landing refactors;
- commit/stack restructuring.

## Context and discovered facts

### Review and requirements decisions

- The latest-commit thermo-nuclear review produced two surviving HIGH findings after an adversarial challenge; weaker candidate findings were dropped.
- The user selected one focused remediation plan covering both findings.
- The user explicitly selected preservation of separator-independent managed-Slot path recognition. The canonical Slots parser must recognize a Windows-style managed path even when tested on a non-Windows host; centralization must not silently narrow Flow’s current compatibility.
- At planning time the source branch is `semantic-slug-consolidation-herdr-labels` at `bec8168ca25877f0e46edaa1f6a2e107abefe49d`.

### Repository rules and architecture

- TypeScript work follows `ts/AGENTS.md`, `.agents/skills/typescript-style/SKILL.md`, and `.agents/skills/ns-typescript/SKILL.md`.
- `ts/packages/incubating/extensions/slots/CONTEXT.md` defines the Slot extension package API as the owner of canonical lexical recognition for `slots/repos/<repo>/worktrees/slot-NN` and explicitly says to avoid consumer-owned managed-worktree recognition.
- Flow already declares `@nseng-ai/slots` as a workspace dependency, so consolidation requires no dependency addition.
- This repository is private and unreleased; tightening an incubating internal type invariant is allowed when it simplifies the design and all producers/fixtures are migrated coherently.
- No changed production file crossed from below 1,000 lines to above 1,000 lines in the reviewed commit.

### Managed Slot path state

Canonical implementation:

- `ts/packages/incubating/extensions/slots/src/core/worktree-path.ts`
  - `parseManagedSlotWorktreeRoot(worktreeRoot)` currently normalizes with host-native `node:path` functions, validates the owner segments and `slot-NN` basename, and returns the canonical Slot name.
- `ts/packages/incubating/extensions/slots/src/api/index.ts`
  - exports `parseManagedSlotWorktreeRoot` through `@nseng-ai/slots/api`.
- `ts/packages/incubating/extensions/slots/test/unit/worktree-path.test.ts`
  - covers canonical POSIX layout, lexical normalization, nested-path rejection, malformed owner segments, and malformed Slot basenames.

Competing Flow implementation:

- `ts/packages/incubating/extensions/flow/src/land/worktree-paths.ts`
  - `isManagedSlotPath()` and `slotNameFromPath()` use independent regexes.
  - The regex accepts arbitrary `slot-*` basenames and descendants of a worktree root, unlike the Slots parser.
  - `slotFreeArgs()`, `formatSlotConflict()`, and related presentation helpers re-extract identity from paths.
- `ts/packages/incubating/extensions/flow/src/land/stack/land-context-adapter.ts`
  - `classifyWorktree()` uses both Flow helpers and has an impossible fallback `slotNameFromPath(path) ?? "slot"` after recognizing the path as managed.
- `ts/packages/incubating/extensions/flow/src/land/execution/post-landing-cleanup.ts`
  - both skip reporting and mutating cleanup derive a Slot name through the duplicate Flow helpers; the cleanup target ultimately drives `ns slot free --wt` behavior.
- `ts/packages/incubating/extensions/flow/src/land/execution/pre-merge.ts` and `execution/maintenance-plan.ts`
  - recover Slot names from paths despite managed-slot classification already carrying Slot identity.
- `ts/packages/incubating/extensions/flow/src/land/types.ts`
  - `WorktreeClassification` requires `slotName` for `type: "managed-slot"`, but `ManagedSlotWorktree.slotName` is optional. Actual classification in `preflight.ts` supplies the name, so this optionality permits an invalid managed-slot state and causes fallback parsing.
- `ts/packages/incubating/extensions/flow/test/unit/land-worktree-paths.test.ts` and `land-stack-helpers.test.ts`
  - directly test the duplicate helpers, including Windows-style separators.

### Branch-context result state

- `ts/packages/incubating/extensions/branch-context/src/core/plan-content-slug.ts`
  - `derivePlanContentSlug()` advertises `Promise<PlanContentSlugResult>`.
  - `PlanContentSlugResult` is currently an alias of `ContentSlugResult`.
  - The default `readFile()` call occurs before content-slug derivation and can reject for ordinary missing, unreadable, or raced-away files.
  - An injected `readTextFile` seam exists for focused tests.
- `ts/packages/incubating/extensions/branch-context/src/core/plan-preparation.ts`
  - `preparePlanBranchContext()` maps returned slug failures to `FailedPreparedPlanBranchContext` before branch selection or mutation.
  - A rejected file read bypasses that discriminated path.
- `ts/packages/incubating/extensions/branch-context/test/plan-content-slug.test.ts`
  - covers returned model/config/normalization failures but not default filesystem read failure.
- `ts/packages/incubating/extensions/branch-context/test/plan-preparation.test.ts`
  - covers model failure returning before Git, Graphite, and Branch Memory mutation.
- Existing repository code uses `formatErrorMessage()` for stable unknown-error rendering and uses narrow Node error checks where a specific filesystem code changes semantics.

## Files, symbols, tests, and docs

### Expected production changes

- `ts/packages/incubating/extensions/slots/src/core/worktree-path.ts`
  - `parseManagedSlotWorktreeRoot`
- `ts/packages/incubating/extensions/slots/src/api/index.ts`
  - only if type/export documentation needs adjustment; the parser is already exported
- `ts/packages/incubating/extensions/slots/CONTEXT.md`
  - document separator-independent lexical recognition if implementation makes that contract explicit
- `ts/packages/incubating/extensions/flow/src/land/worktree-paths.ts`
  - delete `isManagedSlotPath` and `slotNameFromPath`; retain only Flow-owned command/presentation helpers
- `ts/packages/incubating/extensions/flow/src/land/stack/land-context-adapter.ts`
  - `classifyWorktree`
- `ts/packages/incubating/extensions/flow/src/land/execution/post-landing-cleanup.ts`
  - `postLandingCleanupSkipReport`, `postLandingCleanupTarget`
- `ts/packages/incubating/extensions/flow/src/land/execution/pre-merge.ts`
  - `toManagedSlotWorktree` and imports
- `ts/packages/incubating/extensions/flow/src/land/execution/maintenance-plan.ts`
  - managed-slot repair presentation and imports
- `ts/packages/incubating/extensions/flow/src/land/types.ts`
  - `ManagedSlotWorktree.slotName`
- Other Flow production call sites identified by bounded search for `isManagedSlotPath` and `slotNameFromPath`
- `ts/packages/incubating/extensions/branch-context/src/core/plan-content-slug.ts`
  - `PlanContentSlugResult`, a local read-failure type/helper, and default-read handling
- `ts/packages/incubating/extensions/branch-context/src/api/index.ts`
- `ts/packages/incubating/extensions/branch-context/src/core/index.ts`
  - export a new failure type only if it is useful as part of the public result contract

### Expected test changes

- `ts/packages/incubating/extensions/slots/test/unit/worktree-path.test.ts`
- `ts/packages/incubating/extensions/flow/test/unit/land-worktree-paths.test.ts`
- `ts/packages/incubating/extensions/flow/test/unit/land-stack-helpers.test.ts`
- `ts/packages/incubating/extensions/flow/test/unit/post-landing-slot-cleanup.test.ts`
- Any Flow fixtures that construct `ManagedSlotWorktree` without `slotName`, found by typecheck and bounded search
- `ts/packages/incubating/extensions/branch-context/test/plan-content-slug.test.ts`
- `ts/packages/incubating/extensions/branch-context/test/plan-preparation.test.ts`

## Implementation steps

### 1. Make the Slots parser separator-independent without weakening its grammar

Update `parseManagedSlotWorktreeRoot()` so lexical parsing behaves consistently for POSIX and Windows-style input regardless of the host running the test.

Requirements:

- Preserve exact managed layout: `.../ns/slots/repos/<non-empty-repo>/worktrees/slot-NN`.
- Preserve canonical Slot basename validation through the existing Slots naming functions; do not duplicate the `slot-NN` grammar in Flow or introduce another regex catalog.
- Continue rejecting descendants beneath the worktree root, malformed owner segments, ordinary checkouts, and malformed Slot names.
- Continue to perform no filesystem or symlink access.
- Normalize `.` and `..` lexically.
- Handle both `/` and `\` separators deterministically. Use explicit POSIX/Win32 path operations or a small normalization strategy within the Slots-owned module; do not rely solely on the host-native `node:path` implementation.
- Avoid accepting a mixed or malformed path merely because a substring resembles the managed layout. Parse complete owner segments and the root basename.

Expand `worktree-path.test.ts` with:

- Windows drive-letter managed root recognition on a non-Windows test host;
- Windows-style nested descendant rejection;
- malformed Windows owner/basename cases;
- existing POSIX lexical-normalization cases to prevent regression.

### 2. Tighten Flow’s managed-slot identity invariant

Change `ManagedSlotWorktree.slotName` from optional to required in `flow/src/land/types.ts`.

Rationale: `type: "managed-slot"` means classification has succeeded, and `WorktreeClassification` already requires the canonical Slot name. Optional identity is an impossible state that forces reparsing and fallback strings later.

Then update every producer and fixture:

- Real classification must obtain the name from `parseManagedSlotWorktreeRoot()`.
- `preflight.ts` should continue copying the required classified name into each `ManagedSlotWorktree`.
- In-memory gateways, test builders, and direct fixtures must supply explicit canonical names.
- Copy helpers should copy `slotName` directly rather than conditionally spreading it.
- Do not preserve `?? "slot"`, path-string fallback, or an optional managed-slot name merely to minimize fixture edits.

Use typecheck failures plus a bounded `rg` for `ManagedSlotWorktree` and `type: "managed-slot"` to locate all affected constructors.

### 3. Delete Flow’s independent path recognizers and use the Slots API at recognition boundaries

In `flow/src/land/stack/land-context-adapter.ts`:

- import `parseManagedSlotWorktreeRoot` from `@nseng-ai/slots/api`;
- call it once in `classifyWorktree()`;
- return `manual-worktree` when it returns `undefined`;
- return `managed-slot` with the exact parsed name when it succeeds;
- delete the impossible generic `"slot"` fallback.

In `flow/src/land/execution/post-landing-cleanup.ts`:

- parse `shape.repoRoot` once per decision point with the canonical Slots parser;
- use the returned value directly for skip reporting and cleanup target construction;
- ensure malformed or descendant paths remain `not-applicable` and never create an `ns slot free --wt` mutation target.

In `flow/src/land/worktree-paths.ts`:

- delete `isManagedSlotPath()` and `slotNameFromPath()` entirely;
- keep only Flow-owned presentation and command-building helpers;
- make those helpers consume `ManagedSlotWorktree`/typed `slotName` rather than rediscovering identity from `path`;
- retain stable deduplication and display ordering in `slotFreeArgs()`.

In `execution/pre-merge.ts`, `execution/maintenance-plan.ts`, and other affected call sites:

- use `conflict.slotName` after discriminating `conflict.type === "managed-slot"`;
- remove parser imports and path fallbacks;
- preserve existing user-facing command and conflict text.

Update Flow tests to assert outcomes rather than preserve deleted helper APIs:

- move separator and grammar ownership tests to Slots;
- test Flow classification through `classifyWorktree`/adapter behavior with valid POSIX and Windows paths, malformed `slot-*`, and nested descendants;
- test cleanup planning refuses malformed and nested paths before mutation;
- retain `slotFreeArgs()` deduplication and presentation tests using typed managed-slot inputs with required names;
- remove expectations that `slotNameFromPath()` extracts names from arbitrary non-managed paths.

### 4. Give branch-context plan reads an explicit failure result

In `branch-context/src/core/plan-content-slug.ts`, stop aliasing the complete local result directly to `ContentSlugResult` if that prevents describing a read-specific failure.

Preferred shape:

- keep `PlanContentSlugEvidence = ContentSlugEvidence`;
- define a branch-context-owned read failure such as `{ code: "plan-content-read-failed"; message: string }`;
- define `PlanContentSlugResult` as `Result<PlanContentSlugEvidence, ContentSlugFailure | PlanContentReadFailure>` (or an equivalent local discriminated result that preserves existing content-slug failures unchanged);
- include the affected path and a normalized diagnostic in the read-failure message so callers can act on it.

Keep failure ownership at the boundary that performs the read:

- The default Node `readFile` adapter should catch its system-boundary rejection and return `plan-content-read-failed` using `formatErrorMessage()` or an equivalent established formatter.
- Do not catch around the entire `derivePlanContentSlug()` operation.
- Do not convert arbitrary exceptions from the injected `readTextFile` seam into expected filesystem failures; injected collaborator programmer errors should continue to reject loudly. Structure the default adapter/helper separately so only its real filesystem boundary is normalized.
- After a successful read, return `derivePlanSlugFromContent()` unchanged so model/config/normalization failure detail and success evidence remain intact.

If the new failure type is part of `PlanContentSlugResult`, expose it consistently from the branch-context core/API barrels next to `PlanContentSlugResult`; avoid exporting a helper implementation.

### 5. Preserve branch-context preparation’s fail-before-mutation behavior

`preparePlanBranchContext()` already maps `!slugEvidence.ok` to `FailedPreparedPlanBranchContext`. Keep that single guard as the canonical transition from slug/read result to preparation failure.

Add tests at both layers:

- In `plan-content-slug.test.ts`, call the default reader with a definitely missing plan file and assert a returned `plan-content-read-failed` result with path and filesystem diagnostic; assert no Git or Pi model execution occurs after the failed read.
- Add a focused injected-reader test showing an arbitrary rejected injected collaborator still rejects, proving programmer errors were not broadly swallowed.
- In `plan-preparation.test.ts`, remove or invalidate the selected plan file before preparation, assert `{ type: "failed" }`, and verify no Git branch creation, Graphite tracking, Branch Memory attachment, or model execution occurs.
- Keep the existing model-failure no-mutation test; read failure and model failure are distinct boundary cases.

Do not add a second catch-and-rethrow layer in Pi/Herdr consumers. They should continue consuming `FailedPreparedPlanBranchContext` as they do for model failures.

### 6. Synchronize documentation with implemented ownership

After code behavior is in place:

- update `ts/packages/incubating/extensions/slots/CONTEXT.md` to state that canonical managed-root recognition is lexical and separator-independent, if that nuance is not already clear;
- do not add new domain terms unless implementation introduces one;
- Flow context likely needs no prose change because it does not currently claim ownership of path parsing, but verify no touched comment or documentation still describes Flow-owned recognition.

## Validation guidance

Start with focused checks while implementing:

- Slots worktree-path unit tests.
- Flow worktree-path, land-context adapter, pre-merge, and post-landing cleanup unit tests affected by required `slotName` and canonical parsing.
- Branch-context plan-content-slug and plan-preparation tests.

Then run repository-required TypeScript validation:

```bash
just ts-deps-check
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-isolated
just ts-test-sanity
just ts-test-typescript-style-guard
```

Run `just` as the default repository validation entrypoint. If formatting fails, use the prescribed autofixers (`just ts-format-fix` for TypeScript or `just dprint-fix` for repository Markdown/TOML) and rerun checks rather than hand-formatting generated output.

Specific behavioral assertions:

- Valid POSIX and Windows-style managed roots resolve to the same canonical `slot-NN` identity.
- Nested paths and malformed `slot-*` names never classify as managed and never produce cleanup mutations.
- All values tagged `managed-slot` carry a real canonical `slotName`; no `"slot"` or path fallback remains.
- Existing free-command argument ordering/deduplication and conflict text remain stable.
- Missing/unreadable default plan reads return typed failures before Git/model/Graphite/Branch Memory work.
- Injected collaborator programmer errors still reject rather than being mislabeled as filesystem failures.

## Risks, assumptions, and open questions

### Risks

- **Cross-platform lexical parsing:** blindly replacing separators before considering drive roots, UNC-like prefixes, `.`/`..`, or mixed separators can over-accept paths. Keep complete-segment tests and use explicit path-flavor handling.
- **Type-invariant blast radius:** making `ManagedSlotWorktree.slotName` required will expose stale fixtures and fake outputs. Treat these as useful invariant repairs, not reasons to restore optionality.
- **Mutation safety:** Flow’s post-landing cleanup is destructive. A malformed path must fail closed to `not-applicable`; tests should cover the exact boundary before command construction.
- **Failure over-catching:** a broad `try/catch` around plan derivation would incorrectly convert dependency bugs into expected failures. Catch only the real filesystem adapter call.
- **Message stability:** filesystem diagnostic text can vary by platform. Assert stable code/path/prefix fields and only robust diagnostic fragments.

### Assumptions

- The managed Slot basename remains the existing canonical two-digit `slot-NN` grammar implemented by Slots naming helpers.
- Separator-independent recognition is an intentional lexical API contract, not a claim that Windows paths are usable on a POSIX filesystem.
- `ManagedSlotWorktree` is an incubating internal model whose optional `slotName` can be tightened without compatibility shims.
- `FailedPreparedPlanBranchContext.message` remains sufficient for current consumers; no new preparation-level error code is needed because the detailed code lives in `PlanContentSlugResult`.

### Open questions

No material product or compatibility questions remain. If implementation discovers a real producer of `ManagedSlotWorktree` that cannot know a Slot name, stop and reassess the model instead of silently reintroducing optionality.

## Review and remediation checklist

Before considering the work complete, perform a focused structural review:

- Confirm `rg` finds no Flow-owned `isManagedSlotPath` or `slotNameFromPath` implementation or import.
- Confirm all managed-worktree lexical recognition routes through `@nseng-ai/slots/api`.
- Confirm Flow parses once at untyped path boundaries and carries typed Slot identity thereafter.
- Confirm `ManagedSlotWorktree.slotName` is required and no fallback placeholder survives.
- Confirm malformed/nested paths cannot reach `ns slot free --wt` construction.
- Confirm `derivePlanContentSlug()` has one coherent returned failure channel for expected model/config/read failures while unexpected injected dependency exceptions still reject.
- Confirm plan preparation returns before all mutation seams on read failure.
- Confirm the change did not introduce another wrapper/parser/result type that merely renames an existing concept.
- Re-run the thermo-nuclear concerns mentally: the remedy should delete competing recognition and fallback branches rather than just rearrange them.
