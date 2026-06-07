# Cmux Command and Control

## Thesis

The repo-specific command/control behavior currently spread across `@asdl/pi-extensions`, project-local `.pi/extensions`, `@asdl/planned-branch`, and `asdl-dev` should become a coherent private TypeScript layer named **CCC — Cmux Command and Control**.

CCC is the highly opinionated orchestration module for this repository. It is not cmux itself, and it is not every Pi extension. CCC owns the workflows that turn an agent or human work intent into a branch, worktree slot, cmux workspace or tab, child Pi launch, Graphite stack action, and workspace status/presentation. Lower-level packages keep their generic or domain-specific primitives: Branch Memory storage, planned-branch plan persistence and attachment, handoff artifact identity, Objective records, checkpoint primitives, pending-worktree snapshots, command runtime helpers, and runner-subagent mechanics.

The desired outcome is a clean dependency direction and a name future agents can use: **CCC composes lower-level capabilities; lower-level capabilities do not import CCC.** Public command families such as `/code:*`, `/planned-branch:*`, `/handoff-tab`, and `/objective:stack-impl` stay stable; the CCC workspace/sidebar suite uses the `/ccc:*` prefix so the `ccc` namespace names the orchestration layer while `cmux` is reserved for the external workspace tool. The implementation boundary is explicit and testable.

This Objective should be specified enough that `objective-stack-impl` can implement it as a small Graphite stack without another design session.

## Scope

This Objective covers creating and wiring a coherent CCC implementation layer for the existing repo-opinionated Pi workflow stack.

In scope:

- Introduce a private TypeScript workspace package, tentatively `ts/packages/ccc/` with package name `@asdl/ccc`, or an equivalent first slice that can be promoted without changing public command behavior.
- Keep `.pi/extensions/*.ts` as thin project-local discovery adapters. The adapters should import registration functions from engineered packages rather than contain behavior.
- Move or wrap the current workspace-opening and sidebar implementation from `ts/packages/pi-extensions/src/cmux.ts` and `ts/packages/pi-extensions/src/cmux/**` into CCC. The CCC workspace/sidebar command surface uses `/ccc:*`; the earlier `/cmux:*` prefix rename is recorded in the 2026-06-07 rename update.
  - `/ccc:workspace:dispatch-plan`
  - `/ccc:workspace:dispatch-prompt`
  - `/ccc:workspace:open-branch`
  - `/ccc:sidebar:pr-summary`
  - `/ccc:sidebar:objective-summary`
  - slot checkout plus `cmux new-workspace` orchestration
  - focused cmux terminal tab/surface helpers when used by CCC launch flows
  - child Pi launch command construction that preserves model/thinking choices
- Move the handoff tab launch orchestration into CCC while leaving handoff artifact identity, namespace, create/pickup/list/delete/gc lifecycle, and storage semantics with the handoff modules and CLI.
- Move `/planned-branch:up-and-impl` orchestration into CCC while leaving `/planned-branch:write-plan`, `/planned-branch:create`, `/planned-branch:impl`, local plan store rules, attached-plan rules, and planned-branch gateways in `@asdl/planned-branch`.
- Move Objective stack implementation orchestration into CCC, or expose it through the Objective Pi adapter as a CCC-owned workflow, while leaving Objective records, list/current/update/next/close/archive semantics with the Objective package and skills.
- Move `/code:autobranch`, `/code:land`, and `/code:land-stack` orchestration into CCC because they encode repository Graphite/GitHub/slot policy.
- Split `worktree-status.ts` enough to move operational CCC status facts and presentation into CCC while keeping generic Pi footer/session lifecycle plumbing outside CCC when that separation is useful.
- Extract or introduce neutral shared runtime/session-artifact modules when needed to avoid inverted dependencies. In particular:
  - `planned-branch-output` should be a neutral Pi session artifact contract consumed by both planned-branch and CCC, not CCC-owned.
  - `command-runtime.ts`, `machine-envelope.ts`, and terminal presentation helpers should remain below CCC or be moved to a neutral runtime package/module, not hidden inside CCC.
- Update TypeScript package manifests, workspace wiring, imports, tests, and project-local extension adapters to preserve current public command behavior while moving implementation ownership.
- Update durable domain context (`ts/packages/pi-extensions/CONTEXT.md`, `CONTEXT-MAP.md`, and any new `ts/packages/ccc/CONTEXT.md`) so future agents can distinguish Project-local Pi extension surfaces, Engineered Pi extension package behavior, CCC orchestration, planned-branch primitives, asdl-dev primitives, and neutral runtime/session-artifact utilities.

Implementation areas discovered during planning:

- Project-local Pi discovery adapters should stay thin while engineered packages own behavior.
- CCC should own repo-opinionated cmux workspace/sidebar orchestration, handoff-tab launch, planned-branch up-and-impl, Objective stack implementation orchestration, autobranch, landing, and CCC-specific worktree observability.
- Lower packages should retain reusable domain primitives: planned-branch persistence/attachment, handoff lifecycle and storage, Objective records, Branch Memory semantics, runner-subagent machinery, command runtime helpers, machine envelopes, and source-control gateway primitives.
- The roadmap carries the current implementation inventory, progress evidence, and remaining migration slices so this Objective body can stay focused on ownership boundaries rather than file-by-file state.

Planning evidence used for this Objective:

- A read-only architecture audit classified capabilities as portable primitives, mixed workflows, and highly opinionated orchestration. The top recommendation was to name the high-level orchestration layer explicitly.
- A focused deep move audit concluded that `@asdl/ccc` should own cmux workspace/sidebar orchestration, handoff-tab launch, planned-branch up-and-impl, Objective stack implementation orchestration, autobranch, and landing stack behavior.
- The same audit recommended that `planned-branch-output` and command/machine-envelope helpers become neutral lower modules rather than CCC-owned, to avoid making planned-branch depend on CCC.
- Installed Pi extension documentation was consulted locally. Relevant facts: project-local `.pi/extensions/*.ts` files are auto-discovered; extension commands are registered with `pi.registerCommand`; custom messages can use `pi.sendMessage` plus `registerMessageRenderer`; command handlers receive `ctx.waitForIdle`, `ctx.newSession`, `ctx.sessionManager`, `ctx.ui`, model/thinking controls, and `pi.exec`; replacement-session callbacks must use the new `withSession` context rather than captured stale objects.
- Existing repo instructions require TypeScript work to follow the `typescript-style` skill: erasable TypeScript, explicit dependency seams, planning/execution split for side-effectful workflows, errors as values for expected system failures, and no unnecessary public barrels.

## Non-Goals

This Objective does not include:

- Further renaming public slash commands beyond the adopted CCC workspace/sidebar `/ccc:*` suite. Existing command families should keep working unless an explicit future user decision chooses aliases or renamed surfaces.
- Making CCC a published, stable, general-purpose package. CCC is private and repo-opinionated.
- Moving Branch Memory storage semantics, `brmem` refs, Branch Memory namespace rules, or `brmem` CLI behavior into CCC.
- Moving planned-branch core semantics into CCC. Local plan store, saved-plan path safety, planned-branch slug validation, Branch Memory attachment namespace/key rules, and attached-plan loading stay with `@asdl/planned-branch`.
- Moving handoff artifact identity, `handoff` namespace, create/pickup/list/delete/gc lifecycle, or handoff CLI behavior into CCC.
- Moving Objective record storage, Objective list/current/update/next/close/archive semantics, or Objective Markdown parsing into CCC.
- Moving reusable `asdl-dev` primitives such as pending-worktree snapshots, checkpoint-message validation, command runners, Vercel preview URL lookup, or gateway adapters into CCC.
- Moving runner-subagent core machinery into CCC. CCC may use runner subagents for Objective stack orchestration, but runner-subagent remains a lower reusable capability.
- Moving grill UI, roast, generic command-output rendering, generic terminal presentation, or pure `/code:changes` summary logic into CCC unless they become part of workspace command/control.
- Creating Branch Memory ledgers, hidden CCC state, YAML registries, task databases, or durable stack schemas.
- Submitting PRs, landing stacks, or mutating external systems automatically during this Objective's implementation unless the user explicitly confirms that execution scope at run time.

## Completion Criteria

This Objective can close when all of the following are true:

- CCC is a named engineered TypeScript module/package with a clear interface and ownership statement. Prefer `ts/packages/ccc/` and `@asdl/ccc`; if a staged internal subtree is used first, it must have a clear path to package extraction.
- Project-local `.pi/extensions/*` files remain thin discovery adapters and no longer obscure where the repo-opinionated orchestration lives.
- CCC owns the implementation of the workspace/sidebar command suite under the `/ccc:*` prefix with tested behavior.
- CCC owns handoff-tab launch orchestration, but handoff lifecycle/storage semantics remain outside CCC.
- CCC owns `/planned-branch:up-and-impl` orchestration, but planned-branch write/create/impl and the deterministic planned-branch CLI/core remain outside CCC.
- CCC owns Objective stack implementation orchestration or an equivalent Objective adapter calls into CCC for that orchestration, while Objective record/list/update semantics remain outside CCC.
- CCC owns `/code:autobranch`, `/code:land`, and `/code:land-stack` orchestration, while lower `asdl-dev` primitives and adapters remain below CCC.
- `planned-branch-output` is not CCC-owned; it is neutralized so planned-branch producers and CCC consumers can share it without inverted dependency direction.
- Command runtime, machine-envelope parsing, and terminal presentation helpers needed by multiple packages are either left in a lower module or extracted to a neutral runtime module. CCC may depend on them but does not become their owner.
- `worktree-status.ts` is split enough that CCC-specific operational branch/brmem/Graphite status is distinguished from generic Pi footer/session lifecycle plumbing.
- TypeScript package manifests and workspace wiring represent the dependency direction: lower packages do not import CCC; CCC imports lower primitives/adapters.
- Durable context docs define **Cmux Command and Control (CCC)** and update the relationship map so future agents know what is generalizable versus repo-opinionated.
- Focused TypeScript tests are moved or added for each migrated slice, preserving behavior and exact command names where intended.
- Relevant validation passes, at minimum `just ts-check`, `just ts-test`, and `just dprint-check`, or any unrelated blockers are recorded in an Objective update.
- The Objective remains open for user inspection after implementation unless the user explicitly asks for closure.

## Definition of Progress

Progress is keepable when it makes CCC more explicit without breaking lower-layer ownership or public workflow behavior.

Keepable progress includes:

- Moving one coherent orchestration slice into CCC while preserving public command behavior and tests.
- Introducing a lower neutral session-artifact or runtime seam that prevents planned-branch, handoff, Objective, or asdl-dev code from depending on CCC.
- Updating package manifests, imports, and tests to express the intended dependency direction.
- Updating context docs to make CCC vocabulary durable.
- Splitting a mixed file so CCC-specific behavior and lower generic behavior are separate, even if only one side moves in that slice.

Do not keep changes that:

- Make `@asdl/planned-branch`, `asdl-dev`, handoff, Objective, or brmem code import CCC.
- Hide generic command runtime, machine-envelope parsing, terminal presentation, planned-branch storage, Objective record semantics, handoff storage, or Branch Memory semantics inside CCC.
- Rename public slash commands without an explicit user-confirmed scope change.
- Replace working behavior with a broad package move that lacks focused tests for the moved slice.
- Add hidden state, Branch Memory ledgers, YAML registries, task databases, or durable stack schemas to track CCC migration.

Useful evidence includes:

- Before/after import direction showing CCC depends down and lower packages do not depend up.
- Focused tests for moved commands and parsers passing in their new package/module homes.
- `rg` evidence that public command names remain stable and stale import paths are gone.
- Context docs containing the CCC term and relationship map updates.
- Relevant TypeScript checks/tests and dprint checks passing.

## Runner Policy

This Objective is execution-friendly for `objective-stack-impl` after the parent agent presents and receives confirmation for a small Graphite stack preview.

Direct execution is allowed when:

- The parent agent has selected this Objective explicitly by slug or path.
- The latest execution preview names 1 to 3 Graphite branches/PR slices, each with one clear thesis.
- The worktree is safe for branch creation and one-at-a-time runner subagent use.
- The slice changes are limited to repository files, package manifests, tests, and docs needed for the CCC migration.

Steer or ask first when:

- A slice would rename user-facing slash commands or remove an existing command.
- A slice would introduce a new public package API beyond private workspace usage.
- A lower package would need to import CCC to make the design work.
- A validation failure suggests product/design ambiguity rather than a mechanical bug.
- The implementation discovers an existing Objective that appears to own the same active scope and would make this Objective a duplicate rather than the canonical tracking record.

How work may change files and be left:

- It may introduce or extend a private CCC package/module, package wiring, imports, tests, and thin project-local Pi extension adapters.
- It may move coherent orchestration slices while preserving public command behavior and retaining compatibility shims during transition.
- It may update durable context docs so the CCC boundary and lower-package ownership remain discoverable.
- It should leave PR submission undone unless explicitly requested.

Validation before keeping work:

- Run focused package tests for touched packages when possible.
- For TypeScript changes, run `just ts-check` and `just ts-test` or the equivalent package-local `bun test` / `bun run check` commands when a narrower check is appropriate for the slice.
- For Markdown/TOML/package metadata changes, run `just dprint-check`; use `just dprint-fix` for dprint failures rather than hand-formatting.
- Use `git diff --check` for move-heavy slices.

External systems, PR submission, publishing, deployment, and GitHub mutation are out of scope unless the user explicitly confirms them in the execution preview or in a later request.

## Assumptions and Risks

Assumptions:

- `ccc-command-and-control` is the right durable Objective slug because it names the new architectural layer rather than one of the older command families.
- A private `@asdl/ccc` workspace package is preferable to an internal `src/ccc/**` subtree because the desired architecture is a higher-level package that composes lower-level packages.
- The public `/ccc:*` namespace is adopted for the CCC workspace/sidebar suite, and `cmux` wording is reserved for the external workspace tool/domain.
- The existing tests in `ts/packages/pi-extensions/test/` are the best starting coverage for behavior-preserving moves. They should move with implementation slices or be adapted to test through the same public command behavior.
- `@asdl/planned-branch` is already close to the desired lower primitive shape: its CLI/core expose saved-plan, create, and load operations, and Graphite is explicit as `branchCreation` rather than a hidden default.
- `asdl-dev` contains useful lower primitives and CLI commands; CCC should wrap or depend on those primitives rather than absorbing the whole package.
- The closed `cmux-extension-consolidation` Objective completed in-place cmux cleanup. This Objective is broader: naming and extracting the repo-opinionated command/control layer across cmux, planned branches, handoff-tab, Objective stack implementation, autobranch, and landing.
- Pi extension docs support this architecture: project-local adapters can remain thin, engineered packages can own behavior, commands/tools can inject custom messages and child sessions, and command handlers can safely orchestrate session/workspace changes after `ctx.waitForIdle`.

Risks:

- Move-heavy TypeScript refactors can create import churn and test fixture churn. Mitigate by moving one coherent slice per branch and preserving compatibility shims.
- Creating `@asdl/ccc` before extracting neutral runtime/session-artifact modules may tempt generic helpers into CCC. Mitigate by explicitly parking helpers in neutral modules or leaving them lower until a second consumer forces extraction.
- Moving `/planned-branch:up-and-impl` can blur planned-branch adapter ownership. Mitigate by keeping write/create/impl in planned-branch and moving only the orchestration that checks out or starts sessions.
- Moving handoff-tab launch can blur handoff lifecycle ownership. Mitigate by keeping identity/storage/listing in handoff and moving only cmux/Pi launch orchestration.
- Moving Objective stack implementation can blur Objective record ownership. Mitigate by keeping Objective selection/list/read/update mechanics below CCC and giving CCC only the orchestration entrypoint.
- `worktree-status.ts` is large and mixed. Moving it wholesale would likely be wrong; split first.
- A new package may require TypeScript workspace/package-manager plumbing that is easy to miss. Include package manifest and workspace checks in the first slice.
- Some package names or command names may have test assumptions. Preserve public command names initially and let tests catch accidental user-visible rename.

## Settled Defaults and Remaining Decisions

- Prefer a private `@asdl/ccc` package because the migration needs a coherent higher-level package boundary, not another internal pi-extensions subtree.
- Keep neutral runtime/session-artifact helpers below CCC; name or extract additional neutral modules only when a second consumer forces that seam.
- Leave `asdl-dev submit` as a lower CLI mirror by default; CCC should own command-suite placement only if deeper stack policy needs orchestration.
- Split `worktree-status` before moving it, and move only operational facts/presentation that represent CCC observability.
- The public `/ccc:*` namespace is adopted for the CCC workspace/sidebar suite; see the 2026-06-07 rename update for the landed rename inventory and shim-removal details. `ccc` names the orchestration layer's command surface while `cmux` is reserved for the external workspace tool. Other public command families (`/code:*`, `/planned-branch:*`, `/handoff-tab`, `/objective:stack-impl`) remain stable.
