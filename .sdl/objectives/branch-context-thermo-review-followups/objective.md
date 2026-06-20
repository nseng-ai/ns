# Branch-Context Thermo Review Follow-Ups

## Thesis

The branch-context vocabulary stack (`add-enriched-plan-vocabulary` → `branch-context-key-plumbing/structural-cleanups`) renamed planned-branch to branch-context and rethreaded the impl key, but a thermo-nuclear quality review found that the stack cleaned *around* structural debt its own rewrite exposed rather than deleting it: optional-gateway plumbing repeated across five entry modules, a dead `unknown`-params validation layer, the canonical impl-command formatter stranded one layer too low, and new vocabulary docs that contradict ADR 0006's core decision. This objective completes the remediation **before the stack merges**, so the stack lands with self-consistent vocabulary, documented primitives, and the plumbing debt deleted rather than renamed.

## Scope

- The doc/vocabulary blockers from the review: the "branch context = branch type" redefinition contradicting ADR 0006, the lost load-bearing workflow invariants from the 441→144-line doc rewrite, and the undocumented `attach`/`list`/`check`/`delete` primitives.
- Structural refactors in `ts/packages/branch-context`, `ts/packages/ccc`, and `ts/packages/pi-extensions`: required-context refactor, dead validation layer deletion, impl-command relocation, barrel trim, canonical message-contract typing, and the stack-introduced status-sequencing regression plus small rename residue.
- Test health: splitting `branch-context/test/scenario/cli.test.ts` below 1k lines with the dead scripted-exec harness removed, decomposing the extension file and its commands test, and relocating the stranded `@asdl/plans` primitive tests.
- CONTEXT rebaseline for `ts/packages/pi-extensions/CONTEXT.md`, `ts/packages/ccc/CONTEXT.md`, and `CONTEXT-MAP.md` — absorbed from the closed `additive-plan-vocabulary` objective's parked rebaseline item (`roadmap.md:140`), with widened scope: that item named only the enriched-plan retirements and omitted the planned-branch→branch-context rewrites entirely. The closed record stays untouched per consolidation rules.
- All work lands as four new Graphite branches (`thermo-followups/vocabulary-and-docs`, `thermo-followups/package-cleanup`, `thermo-followups/canonical-contracts`, `thermo-followups/extension-decomposition`) stacked on top of `branch-context-key-plumbing/structural-cleanups`, before the stack merges. The roadmap's Work rows map one-to-one onto these branches in order, sized for `objective-stack-impl` slices.

## Non-Goals

- Behavior changes. All remediation is behavior-preserving, except fixing the introduced status-sequencing regression in the from-plan handlers (which restores the intended behavior).
- Zod-first boundary conversions (`brmem-gateway.ts` typeof ladders, extension boundary parsers) and cosmetic residue — parked, see roadmap.
- Renaming the `plans-write` prompt key or the `@asdl/plans` package — deliberate, ADR-documented carve-outs.
- Renaming the `from-plan` skill — flagged in review but ADR-0006-bound; not in scope.
- Editing the closed `additive-plan-vocabulary` record or its updates.

## Completion Criteria

- No active doc or skill defines "branch context" as a branch type; lifecycle/workflow/skill prose matches ADR 0006's "standing working context stored in Branch Memory" framing.
- The dropped workflow invariants (Graphite creation mechanics, upstack-impl-session resumption contract, plan-path normalization) live somewhere agents can route to, and the attach/list/check/delete primitives are documented in the workflow doc and diagnostics-admin reference.
- `branch-context/test/scenario/cli.test.ts` is split into focused files each well under 1k lines, with the unreachable scripted-exec harness deleted and duplicate attach/list/check/delete coverage trimmed.
- `BranchContextContext` has required `brmem`/`graphite` fields; all `?? new Real*Gateway(...)` fallback sites and the `BranchContextPrimitiveContext` shim are gone.
- The hand-rolled params validation layer in `branch-context-creation.ts` is deleted; the slug is validated in exactly one place.
- `formatImplBranchContextCommand` and the `/branch-context:impl` command-name constant live in `@asdl/branch-context`, imported by both ccc and pi-extensions; the duplicate literal is gone.
- `index.ts` exports only the externally consumed surface.
- `presentBranchContextMessage` producers are typed against the canonical `BranchContextOutputDetails` contract (or a shared builder exported beside the parser).
- `branch-context-extension.ts` is decomposed into a thin registrar plus per-family modules, and the commands test is split by command family.
- The stranded `@asdl/plans` tests (including the sole `writeSavedPlanFile` coverage) live in `ts/packages/plans/test/`.
- The three CONTEXT files teach branch-context/enriched-plan vocabulary: correct store path, CLI names, brmem namespace, package name, and skill names.
- The stack merges only after the above are done; `just` green on every branch is completion evidence, not a roadmap row.

## Assumptions and Risks

- **Assumption**: the extension decomposition is consumer-invisible because the `.pi/extensions/branch-context.ts` adapter imports only the default export. Verified for the adapter during review; re-verify there are no other importers before splitting.
- **Assumption**: the barrel-trim surface is exactly the ~26-symbol import inventory enumerated in the roadmap (extracted from all `@asdl/branch-context` imports across ccc and pi-extensions src+test, multi-line aware), and `runCli` needs no export because `package.json` bin points directly at `src/cli.ts`. Re-run the import inventory before trimming in case intervening stack work adds consumers.
- **Assumption**: all 44 `runWithFakes(...)` calls in `cli.test.ts` pass empty scripts, making the `FakeCommands`/`ScriptedExec` machinery unreachable. Verified by review read-through; re-confirm mechanically (grep) before deletion.
- **Risk**: many messages and help texts are pinned in scenario tests, so behavior-preserving refactors will still churn test expectations (e.g. the unreachable "Invalid plan slug" message). Mitigation: treat any pinned-message change as a signal to re-check that behavior actually didn't change.
- **Risk**: CONTEXT rebaseline scope creep — CONTEXT edits invite broader vocabulary work. Bounded to the three files plus the CONTEXT-MAP rows that name dead surfaces.
- **Risk**: this stack is one of several open slots touching `ts/packages` (see `gt ls`); restacking amendments mid-stack may conflict with parallel work. Mitigation: land remediation as new branches at the top of the stack where possible rather than amending deep branches.

## Open Questions

None blocking. The two questions from creation were resolved with code evidence (recorded in `updates/2026-06-12-stack-impl-flesh-out.md`):

- `formatImplBranchContextCommand` lands in a new `src/impl-command.ts` module in `@asdl/branch-context` — `constants.ts` stays a pure constants file; the formatter imports `BRANCH_CONTEXT_PLAN_KEY` from it.
- The dry-run `details` fields are consumed by nothing programmatic: `extractBranchContextEvidence` parses only the `status: "success"` + `evidence` variant via `successfulBranchContextOutputDetailsSchema`. The typed contract keeps a dry-run variant only where fields add information beyond the human-readable content string.

Remaining execution-detail judgment call (not a blocker): if the `thermo-followups/package-cleanup` slice produces too much pinned-message test churn to review comfortably, it may split into a src-refactor branch and a test-split branch — same theses, one extra stack entry.

## Closure

Closed as completed by the four-branch follow-up stack:

- `thermo-followups/vocabulary-and-docs` aligned branch-context vocabulary/docs with ADR 0006, restored workflow invariants, documented primitives, and rebaselined active CONTEXT surfaces.
- `thermo-followups/package-cleanup` removed `@asdl/branch-context` gateway fallback plumbing, deleted the duplicate validation layer, trimmed the public surface, and split the package scenario tests.
- `thermo-followups/canonical-contracts` moved the impl-command formatter and output-message contract into `@asdl/branch-context` and updated ccc/pi-extensions consumers.
- `thermo-followups/extension-decomposition` fixed status sequencing, split the Pi extension by command family, and moved plans-domain saved-plan slug/file/primitive tests to `@asdl/plans`.

Evidence is recorded in the roadmap rows and the 2026-06-12 Semantic Updates. Validation passed on each branch with the documented per-slice commands, including full TypeScript validation for the three code slices. Parked zod-boundary and cosmetic residue remain intentionally out of scope. PR submission/merge remains manual and is not part of this Objective's closure.
