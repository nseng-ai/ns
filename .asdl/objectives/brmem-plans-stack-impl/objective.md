# Brmem Plans Stack Implementation

## Thesis

The brmem plan-branch tooling should become a small, reviewable stack centered on a shared `brmem-plans` implementation boundary rather than a single broad PR that mixes Pi extension behavior, Branch Memory writes, branch creation policy, and skill renames.

The desired product shape is:

- a `brmem-plans` Pi-extension/tooling area for plan creation and branch-from-plan workflows;
- a renamed `/create-brmem-plan-branch` flow that creates a branch from a completed plan file and stashes that plan into the new branch's Branch Memory;
- a reusable branch-from-plan-file operation shared by the Pi command/tool and the renamed skill flow;
- renamed skills that describe the user-facing workflows clearly: `brmem-create-plan-branch-from-file` for parking a plan on a new branch, and `brmem-plan-impl` for loading and implementing a branch-stashed plan;
- explicit migration and compatibility decisions for existing names such as `create-brmem-plan`, `persist_brmem_plan`, `dev-brmem-branch-create`, `dev-brmem-branch-impl`, and `.brmem/prompts/dev-brmem-branch-create.md`.

The implementation should prefer more, smaller PRs. Each PR should have a narrow semantic boundary, pass independently, and leave the repo in a coherent state. The most important design goal is to avoid duplicating branch creation and `brmem put` behavior across prompt text, skill prose, and TypeScript extension code.

## Scope

This Objective covers the stack implementation for the brmem plan-branch tooling refactor.

In scope:

- Review the existing Branch Memory plan and current code paths:
  - `.pi/extensions/create-brmem-plan.ts`
  - `ts/packages/pi-extensions/src/create-brmem-plan.ts`
  - `ts/packages/pi-extensions/test/create-brmem-plan.test.ts`
  - `skills/dev-brmem-branch-create/SKILL.md`
  - `skills/dev-brmem-branch-create/default-prompt.md`
  - `skills/dev-brmem-branch-impl/SKILL.md`
  - `.brmem/prompts/dev-brmem-branch-create.md`
- Split the work into a Graphite stack whose PRs are independently reviewable.
- Extract reusable plan/Branch Memory primitives from the existing `create-brmem-plan` implementation without changing behavior in the first PR.
- Add a shared branch-from-plan-file core operation that can:
  - accept an absolute Markdown plan file path;
  - derive or validate a semantic slug;
  - resolve the target branch name under repo policy;
  - preflight branch and Branch Memory targets;
  - create or register the target branch;
  - stash the plan to Branch Memory on the target branch;
  - return explicit branch, ref, commit, source-file, and failure evidence.
- Encode the durable storage contract for branch-stashed plans: the canonical entry lives in Branch Memory namespace `brmem-plans` with key `<slug>.md`, written to the target implementation branch. Compatibility reads or aliases for older base `plans/<slug>.md` and namespace `plans` entries must be explicit rather than accidental.
- Rename or add Pi extension discovery shims so the branch-creating flow is available as `create-brmem-plan-branch`.
- Preserve, deprecate, or remove the old `/create-brmem-plan` behavior deliberately rather than incidentally.
- Rename and move the skills into the intended repo-local shape:
  - `dev-brmem-branch-create` → `brmem-create-plan-branch-from-file`
  - `dev-brmem-branch-impl` → `brmem-plan-impl`
- Update prompt-plugin names and references consistently, including the repo-local `.brmem/prompts/...` policy file and packaged default prompt if retained.
- Ensure public-facing skill text avoids inappropriate implementation internals while still documenting exact CLI or command operations agents should call.
- Add or update fake-driven TypeScript tests for the shared core, command/tool registration, branch creation preflights, brmem check/put behavior, failure cases, and legacy compatibility.
- Add or update skill and scenario/manual verification notes where appropriate.
- Run the relevant TypeScript, formatting, and repository checks, using the repo's autofix recipes when lint/format tools request mechanical fixes.

Recommended stack shape:

1. `brmem-plans/extract-shared-plan-primitives`
   - behavior-preserving extraction from `create-brmem-plan.ts` into reusable helpers or modules.
2. `brmem-plans/add-plan-branch-from-file-core`
   - shared branch-from-plan-file operation and tests, with a clear Branch Memory storage contract.
3. `brmem-plans/wire-create-plan-branch-command`
   - Pi extension command/tool/shim wiring for `create-brmem-plan-branch`, plus compatibility for the old command if chosen.
4. `brmem-plans/rename-plan-branch-skills`
   - skill directory/name/reference migration to `brmem-create-plan-branch-from-file` and `brmem-plan-impl`.
5. `brmem-plans/compat-docs-cleanup`
   - final compatibility aliases, docs, changelog/references, and cleanup of old names.

## Non-Goals

This Objective does not include:

- Implementing the actual feature as one large all-in-one PR.
- Building a general Branch Memory workflow engine or durable stack ledger.
- Changing core `brmem` storage semantics beyond what is necessary for this plan-branch workflow.
- Adding automatic PR submission or publishing behavior to plan creation.
- Requiring live Pi model calls or live Graphite submissions as the primary test strategy.
- Moving ordinary repository fact discovery from git into Graphite-only runtime dependencies unless the user-facing command explicitly names Graphite or requires Graphite stack metadata.
- Rewriting unrelated Pi extensions or unrelated skills while performing the rename.
- Storing generated plans as checked-in files; plan artifacts should remain temp files before being persisted into Branch Memory.
- Creating hidden Objective metadata, Branch Memory ledgers, or side-channel registries for this Objective.

## Completion Criteria

The Objective is ready for user inspection when:

- The work is split into the agreed Graphite stack, or an explicitly documented equivalent stack, with each branch passing relevant checks independently.
- Existing `create-brmem-plan` behavior is either preserved with tests or intentionally migrated with clear compatibility/deprecation notes.
- Shared plan persistence primitives are separated from command-specific orchestration, and tests prove the extraction did not change the old behavior.
- A shared branch-from-plan-file operation exists and is the single implementation path used by both the Pi command/tool flow and the skill-invoked flow, or a narrower shared boundary is documented with a rationale.
- The branch-from-plan operation has tests for success, branch-name adaptation, branch already exists, brmem entry already exists, invalid slug/path, brmem command failure, and partial-failure reporting.
- Branch-stashed plans are written canonically with `brmem put <slug>.md --namespace brmem-plans --branch <target-branch> --file <temp-plan>`, and any support for legacy base `plans/<slug>.md` or namespace `plans` entries is documented and tested as compatibility behavior.
- `create-brmem-plan-branch` is discoverable through the project-local Pi extension shim and the engineered TypeScript package.
- The command prompt/tool contract tells the parent agent to write and inspect a temp Markdown plan outside the repo before asking the shared operation to create the branch and stash the plan.
- The final branch name, start-point SHA, Branch Memory key, ref, commit, and source file are reported clearly after success.
- The renamed skills exist with correct frontmatter names, descriptions, references, symlink layout, and internal/public metadata decisions.
- References to `dev-brmem-branch-create`, `dev-brmem-branch-impl`, `create-brmem-plan`, `persist_brmem_plan`, and `.brmem/prompts/dev-brmem-branch-create.md` are either migrated or left behind only as intentional compatibility aliases with tests or documentation.
- The repo-local branch policy prompt is renamed or compatibility-mapped consistently with the new skill names.
- Relevant tests and checks pass, including the TypeScript package tests/checks and Markdown/TOML formatting checks touched by the work.
- Any unresolved compatibility or storage-contract decision is documented before merge rather than left implicit in code.

## Assumptions and Risks

Assumptions:

- The existing Branch Memory plan correctly identifies work that is too broad for one PR and should be implemented as a stack.
- The current `create-brmem-plan` implementation already contains useful primitives for slug validation, temp-file validation, `brmem` command discovery, `brmem check`, `brmem put`, and JSON parsing; those can be extracted before behavior changes.
- The branch-creating flow should stash a plan into the newly created branch, not the current branch, because the plan is meant to travel with the implementation branch.
- A shared TypeScript operation is preferable to duplicating branch/stash behavior in skill prose and prompt instructions.
- Graphite is the contributor workflow for this repo, but runtime code should depend on plain git unless the command's user-facing contract explicitly names Graphite or requires Graphite-specific stack metadata.
- The skill rename can be handled as a repo-local skill migration without changing the broader Objective system.
- Existing fake-driven TypeScript tests are sufficient for most behavior; manual verification can cover skill invocation and Pi discovery edge cases.

Risks:

- The storage-contract risk is partially de-risked by the decision that canonical branch-stashed plans use namespace `brmem-plans` with key `<slug>.md`. Remaining migration risk: old workflows may still have written base `plans/<slug>.md` or namespace `plans` entries, so readers and compatibility aliases must handle or reject those shapes deliberately.
- Renaming commands, tools, skills, and prompt plugins together can break hidden references. The cleanup PR must search the repo and preserve intentional aliases where useful.
- Branch creation policy is partly prompt/plugin driven today. Moving too much policy into TypeScript could make repo-specific adaptation harder; leaving too much in prose could keep behavior duplicated and under-tested.
- Graphite integration is tempting for branch creation, but generic runtime helpers should not depend on Graphite unless the command contract says so. The stack must respect the repo's Graphite workflow without violating the runtime Graphite dependency boundary.
- A compatibility alias for old names may reduce migration pain but can also prolong ambiguity. The stack should make an explicit keep/deprecate/remove decision.
- Partial failures are possible: a branch may be created before a `brmem put` fails. The operation must report this state precisely rather than attempting unsafe cleanup.
- Empty `updates/` directories are not durable in git by themselves. If the Objective needs updates later, `objective-update` should create semantic update files; no initial update file is created here.

## Open Questions

- Resolved: canonical branch-stashed plan entries live in Branch Memory namespace `brmem-plans` with key `<slug>.md`. Remaining decision: should migration support read legacy base `plans/<slug>.md` and namespace `plans` entries, write compatibility aliases, or only document a manual migration path?
- Should `/create-brmem-plan` remain as a non-branching command, become an alias to `/create-brmem-plan-branch`, or be removed after a compatibility window?
- Should the old tool name `persist_brmem_plan` remain for non-branching persistence, or should the branch-creating flow introduce a new tool name such as `create_brmem_plan_branch_from_file`?
- Should the renamed branch policy prompt be `.brmem/prompts/brmem-create-plan-branch-from-file.md`, `.brmem/prompts/create-brmem-plan-branch.md`, or should the old `.brmem/prompts/dev-brmem-branch-create.md` remain as a compatibility fallback?
- Should `brmem-plan-impl` load all Branch Memory entries on a branch exactly as `dev-brmem-branch-impl` does today, or should it prefer the canonical `plans/<slug>.md` entry when multiple entries exist?
- How much legacy-name compatibility should be tested versus documented as a manual migration note?
