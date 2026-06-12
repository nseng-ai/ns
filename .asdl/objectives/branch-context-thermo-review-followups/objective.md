# Branch-Context Thermo Review Follow-Ups

## Thesis

The branch-context vocabulary stack (`add-enriched-plan-vocabulary` → `branch-context-key-plumbing/structural-cleanups`) renamed planned-branch to branch-context and rethreaded the impl key, but a thermo-nuclear quality review found that the stack cleaned *around* structural debt its own rewrite exposed rather than deleting it: optional-gateway plumbing repeated across five entry modules, a dead `unknown`-params validation layer, the canonical impl-command formatter stranded one layer too low, and new vocabulary docs that contradict ADR 0006's core decision. This objective completes the remediation **before the stack merges**, so the stack lands with self-consistent vocabulary, documented primitives, and the plumbing debt deleted rather than renamed.

## Scope

- The doc/vocabulary blockers from the review: the "branch context = branch type" redefinition contradicting ADR 0006, the lost load-bearing workflow invariants from the 441→144-line doc rewrite, and the undocumented `attach`/`list`/`check`/`delete` primitives.
- Structural refactors in `ts/packages/branch-context`, `ts/packages/ccc`, and `ts/packages/pi-extensions`: required-context refactor, dead validation layer deletion, impl-command relocation, barrel trim, canonical message-contract typing, and the stack-introduced status-sequencing regression plus small rename residue.
- Test health: splitting `branch-context/test/scenario/cli.test.ts` below 1k lines with the dead scripted-exec harness removed, decomposing the extension file and its commands test, and relocating the stranded `@asdl/plans` primitive tests.
- CONTEXT rebaseline for `ts/packages/pi-extensions/CONTEXT.md`, `ts/packages/ccc/CONTEXT.md`, and `CONTEXT-MAP.md` — absorbed from the closed `additive-plan-vocabulary` objective's parked rebaseline item (`roadmap.md:140`), with widened scope: that item named only the enriched-plan retirements and omitted the planned-branch→branch-context rewrites entirely. The closed record stays untouched per consolidation rules.
- All work lands as additional branches or amendments within the existing stack before it merges.

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
- **Assumption**: all 44 `runWithFakes(...)` calls in `cli.test.ts` pass empty scripts, making the `FakeCommands`/`ScriptedExec` machinery unreachable. Verified by review read-through; re-confirm mechanically (grep) before deletion.
- **Risk**: many messages and help texts are pinned in scenario tests, so behavior-preserving refactors will still churn test expectations (e.g. the unreachable "Invalid plan slug" message). Mitigation: treat any pinned-message change as a signal to re-check that behavior actually didn't change.
- **Risk**: CONTEXT rebaseline scope creep — CONTEXT edits invite broader vocabulary work. Bounded to the three files plus the CONTEXT-MAP rows that name dead surfaces.
- **Risk**: this stack is one of several open slots touching `ts/packages` (see `gt ls`); restacking amendments mid-stack may conflict with parallel work. Mitigation: land remediation as new branches at the top of the stack where possible rather than amending deep branches.

## Open Questions

- Where exactly `formatImplBranchContextCommand` lands in `@asdl/branch-context` — `constants.ts` (beside `BRANCH_CONTEXT_PLAN_KEY`, which owns the other half of the elision rule) or `session-artifact.ts` (beside the evidence formatting). Review recommended constants.ts.
- Whether the dry-run `details` fields emitted by `slot-dispatch-plan.ts` (`status: "dry-run"`, `selectedPlan`, `targetBranch`, `key`, `operation`) are consumed by anything — `extractBranchContextEvidence` only reads `status: "success"` + `evidence`. If nothing consumes them, drop them when typing the contract; if something does, extend `BranchContextOutputDetails`.
