# Create Plan Branch Command Wired

## Summary

The third implementation slice wired the shared branch-from-plan-file core into the Pi extension surface. The project-local shim and TypeScript package now expose `/create-brmem-plan-branch` and the `create_brmem_plan_branch_from_file` tool, and the old `/create-brmem-plan` / `persist_brmem_plan` command-tool surface is no longer registered by the Pi extension.

Verification passed:

- `cd ts/packages/pi-extensions && bun test test/create-brmem-plan-branch.test.ts test/brmem-plan-branch.test.ts`
- `cd ts/packages/pi-extensions && bun run check`

## Objective Impact

This completes the command/tool wiring row and the no-alias command/tool rename row for the TypeScript Pi extension. The command prompt now instructs the parent agent to write and inspect a temp plan outside the repository, choose a semantic slug, optionally pass a policy-driven branch name, and call the shared branch-from-plan-file operation.

Skill and prompt-plugin renames are still intentionally separate: old skill directories, the repo-local branch policy prompt, installer references, and documentation references remain to be migrated in later slices.

## Follow-Ups

- Migrate `dev-brmem-branch-create` to `brmem-create-plan-branch-from-file` and `dev-brmem-branch-impl` to `brmem-plan-impl`.
- Rename `.brmem/prompts/dev-brmem-branch-create.md` and packaged default prompt references to `create-brmem-plan-branch`.
- Remove remaining old-name references and any dead legacy helper code during cleanup.
