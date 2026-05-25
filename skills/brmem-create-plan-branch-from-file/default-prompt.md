# create-brmem-plan-branch — packaged default policy prompt

Copy this file when you want a repo or user-level policy prompt for the
canonical plan-branch workflow:

- `<repo-root>/.brmem/prompts/create-brmem-plan-branch.md` — repo-specific policy
- `~/.brmem/prompts/create-brmem-plan-branch.md` — global policy

## Scope

This prompt provides policy guidance only. It may advise naming conventions,
slug constraints, or extra review checks before tool invocation. It must not
create branches, run `git`, run `gt`, run `brmem put`, publish work, or perform
any other mutation.

The invoking skill remains responsible for creating and reviewing the temporary
plan file, selecting the slug, and calling `create_brmem_plan_branch_from_file`
with any policy-requested tool parameters. The tool creates the local branch and
stores the plan. Markdown policy may instruct the caller to pass
`branchCreation: "graphite"`; the Markdown itself does not run Graphite.

## Default behavior

- Use the slug as the target branch name unless the caller's repo policy
  requires an explicit `branchName`.
- Use the default branch creation backend, `plain-git`, unless repo/user policy
  explicitly instructs the caller to pass `branchCreation: "graphite"`.
- Let `create_brmem_plan_branch_from_file` create the branch and store the plan.
- Store the plan in Branch Memory namespace `brmem-plans` with key `<slug>.md`.
- Require the source plan to be an absolute temp Markdown file outside the repo.
- Do not run `git`, `gt`, `brmem put`, push, submit, or open a PR.

## Customization examples

- **Prefix target branches** — for example, tell the caller to pass
  `branchName: brmem-plans/<slug>` while keeping the Branch Memory key
  `<slug>.md`.
- **Use Graphite branch creation** — tell the caller to pass
  `branchCreation: "graphite"` when the repo's workflow requires Graphite
  metadata; the tool still owns the `gt create` invocation.
- **Enforce naming conventions** — require lowercase kebab-case, a maximum slug
  length, or approved branch prefixes.
- **Add plan review checks** — require the temp plan to include validation steps,
  risk notes, or explicitly named files before the tool is invoked.
- **Constrain start-point policy** — require the user to create plans only from a
  trunk or stack parent branch, but leave branch creation to the tool.

## Non-goals

- Do not select the plan content or rewrite it.
- Do not perform branch creation directly.
- Do not write Branch Memory directly.
- Do not publish branches or PRs.
