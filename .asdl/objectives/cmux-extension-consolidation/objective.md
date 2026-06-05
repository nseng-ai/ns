# cmux Extension Consolidation

## Thesis

The TypeScript cmux command suite under `ts/packages/pi-extensions/src/cmux/` works but
has accreted significant duplication, a brittle self-serialize/self-parse contract, and
three inconsistent naming schemes. The Python side (`src/asdl_tools/cmux/`,
`exec/cmux_workspace_summary.py`) is already clean and well-layered and is not a target.

Three workspace-opening commands (`cmux:workspace:dispatch-prompt`, `cmux:workspace:open-branch`,
`cmux:workspace:dispatch-plan`) are the same pipeline — obtain a branch, check out a slot,
describe the worktree, open a cmux workspace, notify — re-implemented three times, each
with its own copy of `isRecord`, `formatErrorMessage`, `stringField`, `TextResult`,
shell-quoting, and command-output formatting that already exist canonically in
`command-runtime.ts`/`machine-envelope.ts`. `cmux/branch-slug.ts` copies the pure slug
helpers from the top-level `branch-slug.ts` verbatim. The `planned-branch-output` message
is emitted with structured `details.evidence` by both real producers, yet
`slot-open-branch.ts` still carries a ~120-line text-scraping fallback that parses the
human-readable copy of a message it could read structurally.

Consolidate this in place: reuse the canonical helpers, give the `planned-branch-output`
message one owning module, route the three commands through one shared
`openBranchInCmuxSlot` orchestrator with a uniform workspace description, and finish with a
single isolated naming-normalization slice. Behavior is preserved except for two small,
intentional changes (uniform `repo/branch` description; dropping text-only inference),
both validated against the existing `test/cmux.test.ts`.

## Scope

- Reuse the canonical `command-runtime.ts` (`formatCommand`, `formatOutputSection`,
  `tailText`) and `machine-envelope.ts` (`parseMachineEnvelopeData`) from the cmux files;
  delete the cmux-local re-implementations.
- Collapse the cmux-local duplicate primitives (`isRecord`, `formatErrorMessage`,
  `stringField`, `TextResult`, shell-quoting) into one shared home reachable by the cmux
  files; remove `pi-launch.ts`'s private `shellQuote`/`formatShellArg` in favor of the
  canonical quoter.
- Make `cmux/branch-slug.ts` import the pure helpers (`sanitizeBranchName`,
  `trimBranchSlugToLength`, `finalizeBranchSlug`, `MAX_BRANCH_SLUG_LENGTH`) from the
  canonical top-level `branch-slug.ts`; keep only the GPT-nano slug/summary generation.
- Unify the `planned-branch-output` message contract (Reach = Full): one module owns the
  customType, the `PlannedBranchEvidence` shape, `formatPlanBranchEvidence`, and a typed
  `extractPlannedBranchEvidence(details)`. `slot-dispatch-plan.ts` stops duplicating the
  formatter/constant; `slot-open-branch.ts` reads the structured contract only; the
  text-scraping inference path is deleted. This touches `planned-branch-extension.ts`.
- Extract one `openBranchInCmuxSlot` orchestrator owning the shared tail (checkout slot →
  describe worktree → open workspace → notify, plus unified failure formatting); route all
  three workspace-opening commands through it; unify the workspace description to
  `repo/branch`. Collapse the duplicate error blocks in
  `validateSavedPlanForCurrentCheckout` and remove the dead `present()` success→info level.
- Naming normalization as a final isolated slice: use the accepted public command families
  `cmux:workspace:*` and `cmux:sidebar:*`; settle one user-facing noun for the sidebar
  feature; normalize user copy to lowercase `cmux`; fix the crossed `cmux:sidebar` (Pi
  pill) / `pi-summary` (cmux pill) status-key naming; update docs, CONTEXT.md vocabulary,
  and the `cmux-sidebar` skill to match.

## Non-Goals

- No changes to the Python cmux gateway/transform/exec layer; it is already clean. The
  `CmuxCommandFailure` → `CmuxCommandFailureDto` mirroring is the accepted clinkr boundary
  pattern, not a target.
- No cross-harness CLI pushdown of cmux orchestration. The `cross-harness-parity` objective
  already tracks pushing cmux dispatch down into an agent-neutral shared CLI; this
  objective improves the existing TypeScript implementation in place and does not prejudge
  or perform that pushdown. If the pushdown lands first, the orchestrator slice should be
  reconciled with it rather than duplicated.
- No package-wide `isRecord`/guards consolidation across the ~19 non-cmux files that
  re-declare it (parked).
- No new behavior, commands, or features beyond the rename of the existing prompt-dispatch
  command.

## Completion Criteria

- The cmux files contain no local re-declarations of `isRecord`, `formatErrorMessage`,
  `stringField`, `TextResult`, shell-quoting, `formatCommand`, `formatOutputSection`, or
  `tailText`; `slot.ts` envelope parsing delegates to `parseMachineEnvelopeData`.
- `cmux/branch-slug.ts` no longer copies the pure slug helpers from the top-level module.
- Exactly one module owns the `planned-branch-output` contract; `slot-dispatch-plan.ts` and
  `planned-branch-extension.ts` both use it; `slot-open-branch.ts`'s text-scraping inference
  path and its helper cluster are deleted.
- One `openBranchInCmuxSlot` orchestrator exists; all three workspace-opening commands route
  through it; the workspace description is uniform across them.
- The public cmux command suite uses only `cmux:workspace:*` and `cmux:sidebar:*` names; the
  sidebar feature uses one consistent noun; user-facing copy uses lowercase `cmux`; status
  keys are no longer crossed; `docs/pi/cmux-extension-pattern.md`,
  `ts/packages/pi-extensions/CONTEXT.md`, and `skills/cmux-sidebar/SKILL.md` are updated.
  `grep` finds no stale legacy command names in the suite.
- `just ts-check`, `just ts-test`, and `just dprint-check` pass; `test/cmux.test.ts` (and
  `planned-branch-extension.test.ts` where touched) are updated for the two intentional
  behavior changes and pass.

## Assumptions and Risks

Assumptions:

- Both real producers of `planned-branch-output` emit structured `details.evidence`
  (verified at `planned-branch-extension.ts:541` and in `slot-dispatch-plan.ts`), so
  deleting the text-scraping inference path preserves inference for real flows.
- The repo is unreleased and may break compatibility freely (CLAUDE.md), so renaming the
  prompt-dispatch command and dropping text-only inference are acceptable.
- `command-runtime.ts` and `machine-envelope.ts` are the canonical, tested helper homes and
  are suitable to reuse from cmux files.
- `test/cmux.test.ts` (≈568 lines, command-handler level) plus `command-runtime.test.ts`
  and `machine-envelope.test.ts` cover behavior well enough to validate behavior-preserving
  refactors; helper extraction won't break them except for the two noted changes.

Risks:

- The orchestrator slice changes the prompt-dispatch workspace description from the raw
  slot name to `repo/branch` — a real if minor behavior change. Not yet de-risked: confirm
  nothing depends on slot-name-as-description before the slice; mitigated by updating the
  test.
- The naming slice renames user-typed slash commands; in-repo references are updated but
  external muscle memory or personal notes may break. Mitigated by this being a single-user
  private tool.
- Choosing a cmux-local shared module for the duplicate primitives may create a
  near-duplicate of a future package-wide guards module. Mitigated by preferring any
  existing canonical home and parking the package-wide consolidation.
- Unifying the `planned-branch-output` contract pulls `planned-branch-extension.ts` into the
  diff; its larger test suite (`planned-branch-extension.test.ts`) must stay green.

## Open Questions

- Where should the shared `planned-branch-output` contract module live — beside
  `planned-branch-extension.ts`, as a new top-level module, or inside the
  `@asdl/planned-branch` package — given that `PlannedBranchEvidence` originates in that
  package? Resolve at the start of the contract slice by following the canonical type.
- For the shared cmux primitives (`isRecord`/`TextResult`/`stringField`/shell-quote), is a
  cmux-local `internal.ts` acceptable for now, or should the first slice wait on a
  package-level guards module? Default: cmux-local now; park the package-wide consolidation.
- Sidebar noun: standardize on "sidebar" with internal `workspace-summary`/`summary` symbols
  renamed to match — and does the Python `asdl exec cmux-workspace-summary` command name
  (a separate deterministic CLI contract) stay as-is, or also rename? Default: keep the
  Python exec name; rename only the TS-side symbols/commands and docs.

## Closure

Outcome: completed. The TypeScript cmux extension suite was consolidated in place: shared
command/runtime helpers are reused, the `planned-branch-output` UI message contract has one
owning module, the three workspace-opening commands route through `openBranchInCmuxSlot`,
and the final prompt-dispatch/sidebar naming normalization slice is complete.

Key evidence:

- Roadmap active work is fully checked off; only parked follow-ups remain.
- The public cmux command suite now uses `/cmux:workspace:*` for workspace-opening commands
  and `/cmux:sidebar:*` for caller-sidebar summary commands, with no legacy aliases.
- The sidebar TypeScript module and symbols use the sidebar noun, with Pi transient status
  ownership made explicit as `pi:cmux-sidebar`; `asdl exec cmux-workspace-summary` continues
  to clear the legacy `pi-summary` cmux status pill.
- User-facing standalone `CMUX` prose was normalized to lowercase `cmux` in the scoped cmux
  suite/docs/skill, while literal env vars remain uppercase.
- Validation passed after the final slice: `just ts-check`, `just ts-test`,
  `just dprint-check`, and `git diff --check`; scoped grep found no stale legacy command
  names or standalone user-facing `CMUX` residue outside historical Objective planning notes.

Remaining caveats and follow-ups are intentionally parked rather than closure blockers:

- Package-wide `isRecord`/guards consolidation across non-cmux files.
- Reconciling the two slug-from-content strategies.
- Any future cross-harness CLI pushdown belongs to the separate `cross-harness-parity`
  objective or a new Objective, not this closure.
