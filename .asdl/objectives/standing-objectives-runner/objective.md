# Prototype Standing Objective Runner

## Thesis

Prototype an opt-in Objective implementation runner that can advance standing and autonomy-designed Objective work without changing the canonical Objective system or the main `/objective:*` command surface.

The prototype should prove the runner shape from `docs/pi/perpetual-objectives-and-runners.md`: a normal Objective record supplies durable intent and progress guidance, while a separate runner harness chooses bounded work, validates it, materializes kept progress, and stops safely.

## Scope

This Objective covers a prototype island, not a production Objective-system migration:

- Add a portable internal skill named `proto-objective-impl`.
- Add an opt-in Pi command surface such as `/proto:objective-impl` that can select an Objective and invoke the prototype skill.
- Reuse existing Objective selection/picker and runner-subagent patterns where practical, without changing existing `/objective:next`, `/objective:current`, `/objective:update`, or `/objective:stack-impl` behavior.
- Support both autonomy-designed Objectives and human-assisted mode for ordinary Objectives.
- Require an explicit upfront preview/confirmation before material git work.
- Permit local Graphite branch/commit creation inside the confirmed scope.
- Permit PR submission only when the confirmed preview explicitly includes submission; submission should use the repo's Graphite workflow, e.g. `gt submit --no-interactive`.
- Include tests for the skill/wrapper behavior that can be tested deterministically.

## Non-Goals

- Do not change the canonical Objective file contract, Objective CLI status model, or Objective lifecycle semantics.
- Do not update `docs/objective-system.md` or existing Objective skills unless a narrow blocker makes the prototype impossible.
- Do not add a main `/objective:impl` command yet.
- Do not define a general repository-wide `proto-` naming convention yet; use the prefix for this prototype only.
- Do not add a daemon, scheduler, cross-Objective sweeper, automatic Objective prioritizer, hidden run ledger, YAML registry, or task database.
- Do not require real dogfood runs, dry-run transcripts, or examples as closure evidence for this Objective.
- Do not submit PRs unless PR submission was explicitly included in the confirmed execution preview.

## Completion Criteria

Close this Objective when:

- `proto-objective-impl` exists as an internal prototype skill and documents the v1 runner contract.
- A `/proto:objective-impl` Pi command or equivalent prototype wrapper exists and can route an explicitly selected Objective into the skill.
- The prototype preserves the isolation boundary: no canonical Objective behavior or main `/objective:*` command changes are required for normal users.
- Tests or targeted validation cover the wrapper/selection behavior and any deterministic helper logic added for the prototype.
- Relevant formatter/type/test checks for the touched surfaces pass.

Dogfooding on real Objectives is valuable follow-up but is not required for closure.

## Assumptions and Risks

Assumptions:

- Normal Objective records are already flexible enough to contain optional standing/autoobjective prose sections without schema changes.
- The existing Pi extension layer can host a `/proto:*` command surface without changing the main Objective extension contract.
- Existing Objective picker and skill-expansion helpers are reusable enough for the prototype wrapper.
- Existing runner-subagent patterns are sufficient for a skill-authored parent orchestrator to run serial implementation passes when needed.
- Graphite submission through `gt submit --no-interactive` is acceptable only when the user-confirmed preview explicitly includes PR submission.

Risks:

- The prototype may blur into canonical Objective behavior if it changes `docs/objective-system.md`, the `objective` CLI, or existing `/objective:*` commands too early.
- Runner safety is the primary product risk: branch creation, commits, validation, rollback, and PR submission must remain inside explicitly confirmed scope.
- A broad `impl` runner can overreach into external side effects; external writes other than explicitly previewed PR submission should remain out of scope.
- The `proto-` prefix may look inconsistent with existing `dev-` tooling; this Objective intentionally does not solve the broader naming convention.
- If the skill becomes too procedural, it may need later CLI pushdown; that should be learned from prototype use rather than designed up front.

## Open Questions

Resolved for this prototype:

- `/proto:objective-impl` lives behind a dedicated project-local `.pi/extensions/proto.ts` adapter backed by `ts/packages/pi-extensions/src/proto.ts`, not in the existing `dev` bundle and not under the canonical `/objective:*` surface.
- The wrapper reuses the existing active Objective picker and skill-expansion helper; `objective-stack-impl` remains a separate specialized runner.
- The deterministic test surface is command registration, explicit slug/path routing, skill-expansion fallback, active Objective picker behavior, cancellation/no-active/non-UI paths, changed-Objective suggestions, and separation from `objective:stack-impl`.

Still deferred:

- After prototype dogfooding, decide whether this should graduate to `/objective:impl`, remain `proto-`, or fold into `objective-stack-impl` as a mode.

## Closure

Outcome: completed.

The prototype standing Objective runner shipped as an isolated island, exactly as scoped. `proto-objective-impl` exists as an internal prototype skill (`metadata.internal: true`) documenting the v1 runner contract: explicit Objective resolution, context compaction, autonomy-designed versus human-assisted mode, an upfront preview/confirmation gate before material git work, serial subagent execution, keep/discard/materialization rules, Objective-tracking boundaries, and preview-scoped PR submission via `gt submit --no-interactive`. The opt-in command surface `/proto:objective-impl` lives behind a dedicated project-local `.pi/extensions/proto.ts` adapter backed by `ts/packages/pi-extensions/src/proto.ts`; it accepts an explicit Objective slug/path or falls back to the existing active Objective picker, expands `proto-objective-impl`, and leaves every canonical `/objective:*` command name and behavior unchanged. The isolation boundary held: no Objective file contract, CLI status model, lifecycle semantics, `docs/objective-system.md`, or main Objective command was changed; no daemon, scheduler, sweeper, hidden run ledger, registry, or task database was added.

Evidence: all three `## Work` roadmap rows are `[x]` with shipped/validation evidence captured in `updates/`. `skills/proto-objective-impl/SKILL.md` exists with `.agents`/`.claude` links resolving to the canonical source and a `skills-lock.json` entry; `ts/packages/pi-extensions/test/proto.test.ts` covers registration, explicit slug/path routing, skill-expansion fallback, active picker behavior, cancellation/no-active/non-UI paths, changed-Objective suggestions, and command-surface separation from `objective:stack-impl`. Validation passed at the recorded slices: `just ts-check`, `just ts-test`, `just dprint-check`, and `dprint check skills/proto-objective-impl/SKILL.md skills-lock.json`. Landed-state basis: branch commits `4e1fb987` (skill), `07999ed4` (wrapper + tests), and `e9dd7444` (design brief).

Caveats and follow-ups (all parked, none blocking): real dogfooding of `/proto:objective-impl` on bounded and standing Objectives is the natural next step but was explicitly not required for closure; the three deferred decisions remain parked — graduating the prototype to a main `/objective:impl` surface, promoting standing/autoobjective conventions into `docs/objective-system.md`, and defining a repo-wide `proto-` naming convention. These should graduate into their own future Objective(s) once dogfooding informs them.
