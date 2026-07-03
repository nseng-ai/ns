# Branch Memory Storage Abstraction

## Thesis

ASDL has multiple TypeScript workflows that interact with Branch Memory through `brmem` command execution. This Objective established that the useful abstraction boundary is a deliberately small TypeScript CLI-mechanics helper in `@asdl/core/brmem-cli`: shared `check` presence handling and `put --format json` parsing/expected-field validation. Workflow-owned concepts such as attached plans, dispatch payloads, handoff artifacts, branch creation order, collision policy, and user-facing wording stay in their owner packages.

## Scope

- Inventory TypeScript and Python callers that shell out to `brmem` or parse Branch Memory command output.
- Identify which behavior is genuinely neutral storage mechanics versus namespace-specific workflow policy.
- Design a small storage contract for common operations such as check and put when the inventory justifies it.
- Preserve owner-specific concepts such as attached plans, handoff artifacts, CCC dispatch payloads, and worktree-status presentation.
- Propose and implement incremental migrations only where the abstraction is smaller than the duplicated code it replaces.

## Non-Goals

- Do not change the `brmem` CLI storage format or Branch Memory ref layout.
- Do not collapse branch-context, handoff, CCC dispatch, or worktree-status user models into a generic Branch Memory user model.
- Do not introduce CCC dependencies into lower packages.
- Do not require all existing brmem callers to migrate in one broad churn commit.

## Completion Criteria

- There is an evidence-backed inventory of current Branch Memory callers and duplicated mechanics.
- The repo has a deliberately small shared storage abstraction with at least two migrated callers.
- Namespace-specific workflows still own their public semantics and validation.
- Relevant tests cover the neutral contract and migrated namespace-specific callers.

## Assumptions and Risks

Assumptions:

- Inventory showed the strongest repeated TypeScript mechanics are `check` presence handling and `put` execution, machine-envelope parsing, expected-field validation, unavailable-command handling, and display-command evidence.
- The useful abstraction lives below CCC in `@asdl/core/brmem-cli` and does not import Pi-extension runtime.

Risks:

- Over-abstracting Branch Memory was avoided by leaving `list`, `get`, delete, namespace constants, collision behavior, and workflow wording local for this slice.
- Namespace-specific behavior remains protected by existing branch-context and CCC tests that still exercise exact `brmem check` / `brmem put` command protocols and workflow collision/storage behavior.
- Cross-language Python callers are intentionally parked; this Objective did not introduce a parallel Python abstraction.

## Open Questions

- Later work may decide whether typed `list` / `get` helpers are worthwhile after the `check` / `put` boundary proves useful.
- Later work may decide whether Python Branch Memory callers need a parallel abstraction after the TypeScript boundary is understood.

## Closure

Completed by the local branch diff against Graphite parent `add-branch-memory-storage-inventory`: `@asdl/core/brmem-cli` now owns neutral `checkBrmemEntry` and `putBrmemEntryFromFile` helpers, branch-context and CCC dispatch prompt delegate their duplicated `check` / `put` mechanics to those helpers, and workflow-owned semantics remain local. Verification: focused package tests/checks for `@asdl/core`, `@asdl/branch-context`, and `@asdl/ccc` passed; full TypeScript workspace `pnpm --dir ts run check` and `pnpm --dir ts run test` passed. Parked follow-up: consider Python or broader `list` / `get` cleanup only in a later Objective or slice.
