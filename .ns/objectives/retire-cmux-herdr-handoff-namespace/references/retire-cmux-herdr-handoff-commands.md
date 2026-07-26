# Retire the cmux Capability and Reorganize Herdr Handoff Workflows

## Goal and outcome

Create and execute a new plain Objective, `retire-cmux-herdr-handoff-namespace`, that:

1. reorganizes existing Herdr dispatch commands under a new `ns:herdr:handoff:*` mixin namespace without changing their workflow behavior;
2. replaces the cmux-specific handoff-tab workflow with a Herdr-tab equivalent at `/ns:herdr:handoff:tab`;
3. removes the standalone `/ns:herdr:space:open-branch` command;
4. deletes the dedicated `@nseng-ai/cmux` capability, its Pi discovery adapter, its hidden `ns cmux exec` command group, and its `/ns:cmux:{workspace,surface,sidebar}:*` commands; and
5. keeps the Objective open until the reserved `/ns:herdr:handoff:trunk-plan` surface is explicitly designed and implemented or rejected.

This is a breaking pre-release cleanup. Do not add compatibility aliases for removed or renamed commands.

## Settled user-visible command contract

### Rename existing behavior without changing workflow semantics

| Existing command                        | Replacement command              | Behavior                                                                                                                                                           |
| --------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/ns:herdr:space:prompt-dispatch`       | `/ns:herdr:handoff:prompt`       | Preserve current prompt-derived Graphite branch, Branch Memory payload, slot checkout, and new Herdr workspace launch behavior.                                    |
| `/ns:herdr:space:trunk-prompt-dispatch` | `/ns:herdr:handoff:trunk-prompt` | Preserve current refreshed-trunk branch creation, payload storage, slot checkout, workspace labeling, and Herdr launch behavior.                                   |
| `/ns:herdr:space:plan-dispatch`         | `/ns:herdr:handoff:plan`         | Preserve current latest Saved Plan selection, Attached Plan creation, slot checkout, and new Herdr workspace launch behavior.                                      |
| `/ns:cmux:handoff-tab`                  | `/ns:herdr:handoff:tab`          | Preserve create-and-verify Handoff Artifact semantics, but launch the pickup Pi in a focused Herdr tab in the explicit caller workspace instead of a cmux surface. |

The word `handoff` is a namespace mixin in this reorganization. It does **not** newly require prompt/plan dispatch commands to create Handoff Artifacts. Only the existing handoff-tab workflow retains its durable Handoff Artifact semantics.

### Remove

- `/ns:herdr:space:open-branch`
- the complete `@nseng-ai/cmux` package
- `.pi/extensions/cmux.ts`
- `ns cmux exec ...`, including `workspace-summary`
- every `/ns:cmux:workspace:*` command
- every `/ns:cmux:surface:*` command
- every `/ns:cmux:sidebar:*` command
- `/ns:cmux:handoff-tab` after its Herdr replacement is covered

### Retain unchanged for now

- `/ns:herdr:tab:plan-dispatch`: this is an existing caller-tab plan workflow and is not the nonexistent trunk-plan workflow.
- `/ns:herdr:sidebar:objective-summary`
- `/ns:herdr:space:new`
- `/ns:herdr:space:goal`
- portable Handoff commands such as `/ns:handoff:create`, `/ns:handoff:pickup`, `/ns:handoff:list`, and `/ns:handoff:self`

### Reserve but do not register yet

- `/ns:herdr:handoff:trunk-plan`

There is no existing trunk-plan implementation. Do not mislabel `/ns:herdr:tab:plan-dispatch` as trunk-plan and do not invent refreshed-trunk Saved Plan behavior in the implementation-ready migration phase. The new Objective must carry a later design/disposition row, and final Objective closure is blocked until that row is resolved.

## Context and discovered facts

- The current branch is `remove-cmux-extension`, created independently from refreshed Graphite trunk.
- The repository is private and unreleased, so breaking command removals are allowed.
- Relevant repo rules are in `AGENTS.md`, `ts/AGENTS.md`, `ts/packages/capabilities/herdr/AGENTS.md`, and `docs/conventions/consumer-gateways-and-command-shape.md`.
- Active orienting Objectives require Vercel-native cloud execution and fast fake-driven default tests; this work must not introduce backend abstraction or real-process work into default tests.
- `@nseng-ai/herdr` already implements the cmux features selected for parity: prompt dispatch, trunk prompt dispatch, workspace and caller-tab plan dispatch, branch opening, and Objective labeling.
- `docs/herdr/cmux-parity-checklist.md` records the earlier parity decisions. Its “retained cmux” statements become stale after this migration.
- The installed Herdr CLI was verified as `herdr 0.7.3`. Its workspace commands are create/get/focus/rename/close; it has no workspace metadata-reporting command. Do not recreate `ns cmux exec workspace-summary` as a generic Herdr CLI command.
- Herdr caller targeting must use `HERDR_WORKSPACE_ID`; do not fall back to UI focus or `--current`.
- `HerdrGateway` in `ts/packages/capabilities/herdr/src/core/herdr-gateway.ts` already has the operations needed for the handoff-tab replacement: `createTab` and `runInPane`.
- `openBranchInHerdrWorkspace` and `openBranchInHerdrCallerTab` in `herdr/src/core/slot.ts` remain shared launch mechanics used by prompt/plan dispatch. Remove the standalone open-branch command, not these helpers.
- The current cmux handoff-tab behavior lives in `@nseng-ai/handoffs`, not `@nseng-ai/cmux`: `src/pi/tab.ts`, `tab-launch.ts`, `launch-flow.ts`, `command-constants.ts`, and `registration.ts`.
- Its launch flow creates a Handoff Artifact through the normal generated handoff-create prompt, derives a content-backed slug, verifies the saved artifact, then launches a pickup Pi.
- `@nseng-ai/handoffs/api` currently exports durable artifact operations but not the Pi launch-flow helpers. Avoid private source imports between packages.
- Capability Kit’s `cmux/types` is only a compatibility re-export of vendor-neutral `pi-types`. `hosts/pi/src/runtime/types.ts` should move to `@nseng-ai/capability-kit/pi-types` when pruning cmux subpaths.
- After the dedicated cmux package and handoff-tab consumer are gone, inspect all remaining consumers before deciding whether `ts/packages/capability-kit/src/cmux/` can be deleted completely. Current evidence shows the dedicated package consumes gateway/command helpers, handoffs consumes focused-terminal-tab, and Pi runtime consumes only the compatibility types path.
- Source-development SDK discovery finds workspace package descriptors automatically; there is no explicit cmux registration in `ns.toml`.
- `@nseng-ai/cmux` appears in root workspace dependencies, areg dependencies, release package inventories, style-guard command ownership, runtime import tests, docs, contexts, and the generated pnpm lockfile.
- `.pi/settings.json` contains exclusions for the cmux adapter and stale `ns-cmux-sidebar` skill.
- Historical ADRs, completed Objective records, retrospectives, and reshape specifications accurately describe past state. They should remain historical evidence rather than be rewritten as if cmux never existed.
- `retired website files` content is gated by repo policy. Do not modify it in this slice unless separately and explicitly authorized; report any stale catalog entry as gated follow-up.

## Objective creation and tracking

Before implementation, create exactly one new plain, planning-only Objective at:

```text
.ns/objectives/retire-cmux-herdr-handoff-namespace/
  objective.md
  roadmap.md
  updates/
```

Do not add `orientation.md`: unrelated agents do not need a standing cross-cutting rule. Do not add `closed.md` at creation. No initial Objective Edge is currently required.

### Required `objective.md` substance

- **Title:** Retire cmux and establish the Herdr handoff namespace.
- **Thesis:** cmux workspace orchestration is now redundant with Herdr and should be removed; existing Herdr dispatch behavior should be presented coherently under the `herdr:handoff` mixin namespace; the destination-specific handoff-tab workflow should become Herdr-native.
- **Scope:** the four settled command mappings, Herdr handoff-tab adapter, open-branch removal, cmux package/config/test/doc deletion, topology cleanup, and `trunk-plan` design/disposition.
- **Non-goals:** no behavior changes to existing prompt/plan workflows, no generic terminal multiplexer abstraction, no generic Herdr workspace-summary CLI, no raw Herdr socket integration, no compatibility aliases, and no invention of trunk-plan behavior during the migration phase.
- **Completion criteria:** cmux package and listed live surfaces are absent; the four replacement commands are registered and behavior-covered; `/ns:herdr:space:open-branch` is absent; live architecture/docs match reality; full validation is green; and `trunk-plan` is designed and delivered or explicitly rejected.
- **Assumptions and risks:** caller Herdr IDs remain available via `HERDR_WORKSPACE_ID`; moving handoff-tab ownership may expose an insufficient Handoff Capability API; deleting cmux kit helpers may reveal hidden consumers; historical/live documentation must be distinguished; command renames may leave generated prompt/tool copy stale.
- **Open questions:** only the future `trunk-plan` contract/disposition should remain open after creation.

### Required initial roadmap

Use semantic rows, not validation-only rows:

1. Reorganize existing Herdr prompt/plan command names under `ns:herdr:handoff:*` without behavior changes.
2. Replace cmux handoff-tab with `/ns:herdr:handoff:tab` and a Herdr-native focused-tab launch.
3. Remove standalone Herdr open-branch and delete the cmux capability and live surfaces.
4. Reconcile package topology, contexts, and user-facing documentation.
5. Design and disposition `/ns:herdr:handoff:trunk-plan`; this row blocks final Objective closure, not landing of rows 1–4.

After writing the record, run:

```bash
ns objective check retire-cmux-herdr-handoff-namespace
```

Track material decisions and completion evidence with immutable Semantic Updates as phases land. Keep the Objective open after migration if `trunk-plan` remains unresolved.

## Files, symbols, tests, and documentation

### Herdr command reorganization

Primary files:

- `ts/packages/capabilities/herdr/src/core/command-surfaces.ts`
  - Replace the three space command constants with constants for `handoff:prompt`, `handoff:trunk-prompt`, and `handoff:plan`.
  - Add `handoff:tab` for the ported handoff workflow.
  - Remove `HERDR_SPACE_OPEN_BRANCH_COMMAND_NAME`.
  - Update `HERDR_COMMAND_NAMES` to the exact surviving registered catalog.
  - Do not add `handoff:trunk-plan` until its behavior is designed.
- `src/core/dispatch-prompt.ts`, `src/core/dispatch-from-trunk.ts`, `src/core/dispatch-plan.ts`
  - Update command constant imports and usage/help/error copy only; preserve orchestration.
- `src/pi/dispatch-prompt.ts`, `dispatch-from-trunk.ts`, `dispatch-plan.ts`, `extension.ts`, `index.ts`
  - Update registration constants and exports.
  - Keep both workspace plan and existing caller-tab plan registration; only workspace plan moves to `handoff:plan`.
- `test/herdr-dispatch.test.ts`, `test/herdr-extension.test.ts`, and any command catalog tests
  - Update expected names while preserving scenario assertions that prove behavior did not change.

### Remove standalone Herdr open-branch

Delete:

- `ts/packages/capabilities/herdr/src/core/open-branch.ts`
- `ts/packages/capabilities/herdr/src/pi/open-branch.ts`

Remove their extension registration, exports, completion tests, inferred-branch confirmation tests, and command literals. Retain tests of `openBranchInHerdrWorkspace` and `openBranchInHerdrCallerTab` because dispatch workflows still use those helpers.

### Port handoff-tab to Herdr

Current source anchors:

- `ts/packages/capabilities/handoffs/src/pi/tab.ts`
- `ts/packages/capabilities/handoffs/src/pi/tab-launch.ts`
- `ts/packages/capabilities/handoffs/src/pi/launch-flow.ts`
- `ts/packages/capabilities/handoffs/src/pi/command-constants.ts`
- `ts/packages/capabilities/handoffs/src/pi/registration.ts`
- tests under `ts/packages/capabilities/handoffs/test/pi/handoff-tab*.test.ts`

Target behavior:

1. `/ns:herdr:handoff:tab <continuation-focus>` checks explicit Herdr caller context before sending the create prompt.
2. It uses the existing Handoff Artifact creation contract and content-derived slug tool.
3. After successful storage, its launch tool verifies the artifact exists.
4. It creates a focused Herdr tab in `HERDR_WORKSPACE_ID`, at the current/relevant cwd, labeled `handoff: <slug>`.
5. It runs the same pickup Pi launch command in the returned Herdr root pane.
6. Failures after tab creation report tab/pane/workspace IDs and manual recovery information; missing artifacts cause no Herdr side effect.

Architecture requirement:

- Keep durable Handoff Artifact semantics owned by `@nseng-ai/handoffs`.
- Keep Herdr destination operations behind `HerdrGateway` and its CLI adapter.
- Do not import private `handoffs/src/...` modules from Herdr or private Herdr modules from Handoffs.
- Before editing, inspect the repeated collaborator shape and choose the smallest clean interface. Preferred direction: expose a narrowly curated Handoff Pi launch-flow helper from an intentional package subpath or keep command composition in Handoffs while injecting a Herdr destination adapter from the Herdr composition root. Do not create a generic terminal multiplexer interface: cmux is being removed and only one destination remains.
- If a new cross-capability interface is required, make it domain-shaped and follow `docs/conventions/consumer-gateways-and-command-shape.md`; real Herdr adapters must be constructed at a composition root, not inside domain flow logic.
- Rename destination-specific command/tool/status constants and user copy away from cmux. The command is fixed as `ns:herdr:handoff:tab`; choose a Herdr-explicit tool name such as `herdr_handoff_tab_launch` unless existing tool naming constraints demonstrate a better deterministic name.
- Update handoff parity metadata: the workflow remains a destination-specific Pi/Herdr workflow with the same manual portable fallback, not a generic portable Handoff command.

Tests must preserve and adapt the existing high-value scenarios:

- registration only when tool support exists;
- prompt construction and content-derived slug ordering;
- preflight failure outside a Herdr caller workspace;
- missing artifact stops before destination mutation;
- successful focused tab creation and pickup command launch;
- Herdr create/run failures report recoverable location evidence;
- invalid slug/parameters stop before side effects.

### Delete the cmux capability and integration wiring

Delete:

- `ts/packages/capabilities/cmux/`
- `.pi/extensions/cmux.ts`
- live dedicated docs `docs/pi/cmux-extension-pattern.md`, `docs/cmux/help-querying.md`, and `docs/sdl-exec/cmux-workspace-summary.md` when no surviving live purpose remains

Update:

- `ts/package.json`: remove `@nseng-ai/cmux`.
- `ts/packages/tools/areg/package.json`: remove the unused cmux dependency.
- `ts/packages/internal/ns-dev/src/public-packages/package-set.ts`: remove cmux qualification/publish entries.
- `ts/packages/internal/typescript-style-guard/src/config.ts`: remove cmux command-surface ownership.
- `.pi/settings.json`: remove dead `-extensions/cmux.ts` and `-skills/ns-cmux-sidebar` exclusions.
- `ts/packages/hosts/pi/test/integration/node-runtime-imports.test.ts`: remove dedicated cmux workspace import coverage.
- `ts/packages/hosts/pi/src/runtime/types.ts`: import vendor-neutral types from `@nseng-ai/capability-kit/pi-types` instead of the cmux compatibility path.
- `ts/packages/hosts/pi/test/runtime/helpers.test.ts`, Foundation command-surface tests, CLI-theme package-boundary tests, areg registry tests, and TypeScript style-guard fixtures: remove real cmux expectations or replace purely synthetic fixture names with surviving capabilities.
- `ts/pnpm-lock.yaml`: regenerate with pnpm; do not hand-edit.

### Prune Capability Kit cmux residue after consumer verification

Audit `ts/packages/capability-kit/src/cmux/` and exports in `ts/packages/capability-kit/package.json` after the Herdr handoff-tab port is complete.

Expected outcome if the consumer search is clean:

- delete `command.ts`, `gateway.ts`, `focused-terminal-tab.ts`, `index.ts`, `types.ts`, and `test/cmux/`;
- remove all `./cmux*` exports and the `cmux` subpackage declaration;
- retain the canonical `./pi-types` module;
- update any comments/docs that call cmux substrate neutral when no cmux consumer survives.

Do not delete mechanically before the port because the current Handoff implementation still relies on `focused-terminal-tab` during transition.

### Live documentation and domain model

Update live surfaces:

- `ts/packages/capabilities/herdr/CONTEXT.md` and `AGENTS.md`
  - define the `herdr:handoff` mixin namespace and the retained caller-targeting rule;
  - remove standalone open-branch claims;
  - do not claim trunk-plan exists.
- `ts/packages/capabilities/handoffs/CONTEXT.md` and README/docs where destination-specific tab behavior is described.
- `ts/packages/hosts/pi/CONTEXT.md`
  - remove the deleted cmux capability and Pi subpackage terms;
  - describe Herdr and the destination-specific handoff composition accurately.
- `CONTEXT.md`
  - remove the cmux capability from current first-party capability examples and update Capability API consumer examples where cmux was the chief example.
- `CONTEXT-MAP.md`
  - remove the cmux package context and all live cmux package edges;
  - add/refresh Herdr and Handoff relationships;
  - rebaseline the tracked package count after deletion using `git ls-files 'ts/packages/**/package.json' | wc -l` rather than copying the stale documented count.
- `docs/pi/README.md`
  - remove the cmux adapter/command suite and update handoff-tab and Herdr command inventories.
- `docs/sdl-exec/README.md`
  - remove the deleted workspace-summary entry.
- `docs/herdr/cmux-parity-checklist.md`
  - convert current “retained cmux” statements into completed migration/retirement evidence and record the open-branch retirement.
- Other current README/catalog/help text that presents deleted commands as live.

Do not rewrite historical ADR 0034, completed Objective records, retrospectives, or ontology reshape specifications merely to remove historical strings. A final grep must classify every remaining match as either valid history, surviving Herdr/Handoff vocabulary, or an explicitly gated documentation follow-up.

## Implementation sequence

### Phase 1: Create the Objective and establish renamed Herdr command catalog

1. Create and validate `retire-cmux-herdr-handoff-namespace` as specified above.
2. Rename the three existing Herdr workspace dispatch command constants and registrations to `handoff:{prompt,trunk-prompt,plan}`.
3. Update tests and live command inventories without changing core workflow logic.
4. Keep `/ns:herdr:tab:plan-dispatch` unchanged.
5. Record a Semantic Update with the settled namespace and no-behavior-change evidence.

### Phase 2: Port handoff-tab to Herdr

1. Determine the clean Handoff/Herdr composition seam using current `launch-flow.ts` and `HerdrGateway`; do not add a vendor-generic abstraction.
2. Add `/ns:herdr:handoff:tab` and its verified Herdr launch tool.
3. Move/remove the old cmux-specific command registration and destination implementation only after replacement tests pass.
4. Preserve all portable Handoff commands and artifact semantics.
5. Record a Semantic Update describing ownership and replacement evidence.

### Phase 3: Remove open-branch and cmux

1. Delete the standalone Herdr open-branch modules and registration while retaining shared slot launch helpers.
2. Delete `@nseng-ai/cmux`, `.pi/extensions/cmux.ts`, and all package wiring.
3. Regenerate the lockfile.
4. Re-run consumer inventory and remove Capability Kit cmux residue if no live consumer remains.
5. Repair real-package and synthetic tests deliberately rather than weakening their assertions.
6. Record a Semantic Update with deletion and stale-reference evidence.

### Phase 4: Reconcile live docs and topology

1. Update contexts, map counts/edges, Pi docs, Herdr parity documentation, and package inventories.
2. Delete dedicated live cmux docs that no longer describe a supported surface.
3. Preserve accurate history.
4. Run a bounded stale-reference classification and record any documentation catalog residue as gated follow-up.

### Phase 5: Design/disposition trunk-plan

After migration lands, use the Objective’s remaining row to decide what `/ns:herdr:handoff:trunk-plan` would mean: Saved Plan source selection, refreshed-trunk parent semantics, branch-context provenance, dry-run behavior, destination, and collision/error behavior. Implement it only after that contract is explicit, or record an explicit rejection. Do not close the Objective before this disposition.

## Execution strategy for the cross-file refactor

This change contains 5+ mixed code/test/docs edits and repeated command-name/copy changes. Use the repository’s `refactor-swarm` workflow for the broad namespace and documentation sweep, with narrowly partitioned ownership:

- Herdr command catalog and tests;
- Handoff-to-Herdr tab workflow and tests;
- cmux package/config/topology deletion;
- live contexts/docs and final stale-term audit.

Do **not** use opaque ad hoc `text.replace()` scripts for semantic docs or mixed command copy. For the small TypeScript command-constant rename set, use precise symbol-aware edits (or a suitable deterministic TypeScript codemod if one already exists) and then inspect each call site. Package deletion and lockfile regeneration remain mechanical parent-owned steps. Finish with exact grep inventories for every removed surface.

## Validation guidance

Follow `ts/AGENTS.md`, `typescript-style`, and `ns-typescript` rules. Use default fake-driven tests; put real Herdr/CLI checks only in the explicit integration lane if needed.

Minimum validation evidence:

1. `ns objective check retire-cmux-herdr-handoff-namespace` after Objective creation and any edge/frontmatter change.
2. Herdr package tests, especially command catalog, prompt, plan, tab, caller-ID, and failure scenarios.
3. Handoffs package tests, proving portable workflows remain and old cmux registration is absent.
4. Capability Kit tests after cmux subpackage pruning.
5. Pi runtime import tests and areg/style-guard tests after package graph changes.
6. Regenerate the lockfile with the repo pnpm workflow.
7. Run `just`; if dprint fails, run `just dprint-fix`, then rerun. Use TypeScript format/lint autofix commands rather than hand-editing formatter output.
8. Verify Herdr extension registration exposes the exact intended live set and does not expose `handoff:trunk-plan` yet.

Final live-surface searches should find no active implementation/config/test expectation for:

```text
@nseng-ai/cmux
.pi/extensions/cmux.ts
ns cmux exec
ns:cmux:workspace
ns:cmux:surface
ns:cmux:sidebar
ns:cmux:handoff-tab
ns:herdr:space:open-branch
HERDR_SPACE_OPEN_BRANCH_COMMAND_NAME
ns:herdr:space:prompt-dispatch
ns:herdr:space:trunk-prompt-dispatch
ns:herdr:space:plan-dispatch
```

Expected replacement searches must prove:

```text
ns:herdr:handoff:tab
ns:herdr:handoff:prompt
ns:herdr:handoff:trunk-prompt
ns:herdr:handoff:plan
```

For each residual old string, classify it explicitly as historical evidence or gated documentation residue; do not silently leave live docs stale.

## Risks, assumptions, and open questions

- **Risk — ownership seam:** Handoff’s current reusable launch-flow is private Pi implementation. A careless move could create private cross-package imports or duplicate complex prompt/verification logic. Resolve this with the smallest intentional interface and keep vendor operations in Herdr.
- **Risk — accidental behavior change:** the namespace reorganization must not change branch parentage, payload format, Saved Plan selection, Attached Plan semantics, slot checkout, dry-run, or destination behavior.
- **Risk — premature kit deletion:** Capability Kit cmux helpers can be deleted only after the Herdr handoff-tab replacement no longer consumes them and all importers use canonical vendor-neutral paths.
- **Risk — misleading mixin:** `handoff` is intentionally organizational for prompt/plan variants; document that it does not imply creation of a Handoff Artifact in those workflows.
- **Risk — historical sweep:** exact old strings will remain in historical ADRs/specs. Validation must distinguish history from live surfaces instead of demanding a repository-wide zero count.
- **Assumption — Herdr CLI:** version 0.7.3 supports `tab create --workspace ... --focus --cwd ... --label ...` and `pane run`; revalidate installed help at implementation time because Herdr is moving quickly.
- **Assumption — caller identity:** `/ns:herdr:handoff:tab` runs in a Herdr-managed pane with `HERDR_WORKSPACE_ID`; missing identity fails before Handoff Artifact creation prompt or destination mutation.
- **Open question — trunk-plan:** its semantics remain deliberately unresolved and block final Objective closure only, not migration landing.
- **Gated follow-up:** `retired website files` may retain a stale cmux entry; repo policy forbids package README content work without explicit authorization.

## Review and remediation

Before commit, review the branch along two axes:

1. **Spec:** exact command mappings, no aliases, no open-branch command, Herdr handoff-tab parity, complete cmux deletion, and no premature trunk-plan registration.
2. **Standards:** package-tier/import boundaries, Consumer Gateway and composition-root rules, fake-driven test placement, canonical `pi-types` imports, Objective record structure, and live-vs-historical documentation handling.

Remediate all material findings, rerun focused tests and `just`, then update the Objective with completion evidence for the landed phase. Keep the Objective open if `trunk-plan` is still unresolved.

Finally, create or update the branch commit using the repo’s normal Graphite workflow, then run:

```bash
ns flow submit
```
