# Roadmap

## Work

- [~] Confirm compatibility decisions before broad edits: canonical Branch Memory location is namespace `brmem-plans` with key `<slug>.md`; remaining decisions cover old `/create-brmem-plan` behavior, new tool names, legacy entry handling, and prompt-plugin rename/fallback policy.
- [ ] Create `brmem-plans/extract-shared-plan-primitives`: extract reusable slug, temp-file, `brmem` command, JSON parsing, and success/error formatting helpers from `create-brmem-plan.ts` without behavior changes; keep existing tests green.
- [ ] Create `brmem-plans/add-plan-branch-from-file-core`: implement the shared branch-from-plan-file operation with branch preflight, Branch Memory preflight against namespace `brmem-plans`, branch creation/registration, plan stash to key `<slug>.md`, structured result evidence, and partial-failure reporting.
- [ ] Add fake-driven tests for the shared branch-from-plan-file operation, covering success, invalid inputs, existing branch, existing Branch Memory entry, branch creation failure, `brmem put` failure, and returned evidence.
- [ ] Create `brmem-plans/wire-create-plan-branch-command`: add the `create-brmem-plan-branch` Pi extension shim and TypeScript command/tool wiring that writes a temp plan, inspects it, and calls the shared branch-from-plan-file operation.
- [ ] Preserve or intentionally migrate `/create-brmem-plan` and `persist_brmem_plan`; add compatibility tests or clear deprecation documentation for whichever path is chosen.
- [ ] Create `brmem-plans/rename-plan-branch-skills`: migrate `dev-brmem-branch-create` to `brmem-create-plan-branch-from-file` and `dev-brmem-branch-impl` to `brmem-plan-impl`, updating frontmatter, descriptions, references, metadata, and symlink layout.
- [ ] Rename or compatibility-map the repo-local branch policy prompt and packaged default prompt so the new skill/command names do not depend on stale `dev-brmem-branch-create` terminology.
- [ ] Create `brmem-plans/compat-docs-cleanup`: search for old names, update docs/references/changelog material where appropriate, and leave only intentional aliases or migration notes.
- [ ] Run relevant validation for each stack slice, including `cd ts/packages/pi-extensions && bun test && bun run check`, Markdown/TOML formatting checks, and broader `just` checks when appropriate.
- [ ] Prepare the stack for review with clear PR descriptions that explain the semantic boundary of each slice and any remaining open decisions.

## Parked

- [ ] Automatic PR submission for branches created from plans.
- [ ] Branch Memory-backed stack ledgers or recovery automation beyond stashing the plan on the target branch.
- [ ] A general-purpose Branch Memory workflow engine.
- [ ] Live Pi/model end-to-end smoke tests as a prerequisite for initial review.
- [ ] Broader Objective workflow changes unrelated to brmem plan-branch tooling.
