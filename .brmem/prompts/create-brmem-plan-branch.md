<!--
REPO-LOCAL POLICY (asdl): this prompt customizes the canonical
create-brmem-plan-branch workflow for this repository. It provides policy only;
the invoking skill or command still writes and reviews the temp plan file, and
create_brmem_plan_branch_from_file performs branch creation and Branch Memory
storage.
-->

# create-brmem-plan-branch — asdl policy prompt

Use this policy when creating Branch Memory plan branches in the asdl-tools
repository.

## Scope

This prompt provides policy guidance only. It must not create branches, run
`git`, run `gt`, run `brmem put`, submit PRs, or publish anything. The shared
tool `create_brmem_plan_branch_from_file` owns all mutations for this workflow:
branch creation and Branch Memory storage. The tool may use Graphite when
`branchCreation: "graphite"` is passed.

## Branch creation policy

This repository uses Graphite for contributor branch workflows.

When calling `create_brmem_plan_branch_from_file`:

- pass `branchCreation: "graphite"`
- pass `branchName: brmem-plans/<slug>` unless the user supplied a different
  explicit branch name
- keep the Branch Memory namespace `brmem-plans`
- keep the Branch Memory key `<slug>.md`
- do not run `gt create`, `gt track`, `git branch`, or `brmem put` yourself; the
  tool owns mutations

## ASDL branch and storage policy

- Derive a semantic kebab-case slug from the final reviewed plan content.
- Name implementation branches for this workflow `brmem-plans/<slug>` unless the
  user supplies a different explicit branch name.
- Pass that branch name as `branchName: brmem-plans/<slug>` to
  `create_brmem_plan_branch_from_file`.
- Keep the Branch Memory namespace `brmem-plans`.
- Keep the Branch Memory key `<slug>.md`, even when the branch name has the
  `brmem-plans/` prefix.
- Keep the source plan as an absolute temp Markdown file outside the repository.
- Do not create a checked-in plan file.

## Plan review expectations

Before invoking the tool, read the temp plan file back and confirm it includes:

- the goal and non-goals
- concrete implementation steps
- files or areas likely to change
- validation commands or manual checks
- risks, assumptions, or open questions when relevant

If the plan is incomplete, update the temp file and review it again before
calling the tool.
