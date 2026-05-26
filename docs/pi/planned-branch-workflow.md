# Planned Branch Workflow

## Overview

The planned-branch workflow is a Pi/planning-layer workflow for turning a
reviewed implementation plan into a branch that carries its canonical plan with
it. The planning layer owns the workflow concepts: saved plans, planned
branches, and attached plans.

Branch Memory is used as the lower storage Adapter for the attached plan. It
stores plan text under an explicit namespace/key contract, but it does not own
planned-branch policy.

The public command surface is:

1. `/write-plan` saves a reviewed plan in the local plan store.
2. `/create-planned-branch` creates the implementation branch and attaches the
   plan.
3. The attachment is written to Branch Memory namespace `brmem-plans` with key
   `<slug>.md` on the implementation branch.
4. `/impl-planned-branch [key-or-slug]` loads the canonical attached plan and
   starts implementation.

## Command Flow

### `/write-plan`

`/write-plan` asks the agent to produce a reviewed Markdown implementation plan
and save it in the local plan store:

```text
~/.asdl/plans/<repo>/<encoded-source-branch>/<slug>.md
```

The saved plan is scoped to the repository and the source branch where planning
happened. Branch slashes in `<encoded-source-branch>` are encoded as a
filesystem-safe path segment, and `<slug>` is the semantic kebab-case plan slug.

This command creates no implementation branch, writes no Branch Memory, and
checks in no plan artifact. The local plan store is the pre-branch handoff point
between planning and branch creation.

### `/create-planned-branch`

`/create-planned-branch` selects a saved plan, creates the target implementation
branch, and attaches that plan to the target branch in Branch Memory.

With no explicit file path, the command prefers the most recent valid saved plan
from the current Pi session, then falls back to the newest Markdown plan in the
current repo/source-branch local plan store directory. An explicit saved plan
path must be absolute.

In this repo, planned branches default to the plan slug itself (`<slug>`). Branch
creation defaults to Graphite through the project-local extension configuration,
while command flags can still select plain Git or Graphite behavior explicitly.

The attached plan contract is:

```text
Namespace: brmem-plans
Key: <slug>.md
Branch: <target-implementation-branch>
```

### `/impl-planned-branch`

`/impl-planned-branch [key-or-slug]` is the public implementation workflow. Run it
from the implementation branch after the plan has been attached.

The command reads the current branch, refuses detached HEAD and trunk/default
branches, lists canonical `brmem-plans` entries on the current branch, selects
the requested key when one is provided, or otherwise selects the branch-final
segment match when possible. If multiple attached plans are present and no key is
obvious, it asks the user to choose by running `/impl-planned-branch <key>`.

After loading the selected plan, the command starts an implementation turn with
that attached plan as the authoritative plan text.

## Storage Model

The workflow has two storage locations with different jobs:

- **Local plan store:** `~/.asdl/plans/<repo>/<encoded-source-branch>/<slug>.md`
  stores reviewed plans before an implementation branch exists.
- **Attached plan:** Branch Memory namespace `brmem-plans`, key `<slug>.md`, on
  the implementation branch stores the canonical plan that implementation should
  follow.

The planning layer owns saved plans and attached plans. Branch Memory only stores
the attached plan content under the namespace/key contract, so other Branch
Memory use remains generic branch-scoped text storage.

## Branch Creation Policy

Branch creation is repo-specific Pi extension policy. In this repo, the
project-local shim at `.pi/extensions/planned-branch.ts` configures the
planned-branch workflow to default to Graphite branch creation and to use the plan
slug as the target branch name unless the user passes an explicit branch.

Graphite creation creates the local Git branch first:

```text
git branch <target> HEAD
```

Then it registers the branch with Graphite using the current branch as parent:

```text
gt track <target> --parent <current-branch> --no-interactive
```

This does not switch the current checkout. The plan attachment still passes
`--branch <target-branch>` to Branch Memory, so storage does not depend on the
current checkout.

## Recovery and Diagnostics

The commands present planning-level status first and include lower-level Branch
Memory evidence for recovery:

- branch name and branch creation method
- namespace and key
- Branch Memory ref and commit for successful attachments
- selected key, ref, and byte count for loaded plans

Common recovery paths:

- If `/create-planned-branch` cannot find a saved plan, run `/write-plan` first
  or pass an explicit absolute saved-plan path.
- If the target branch already exists, choose another target branch or inspect
  the existing branch before retrying.
- If the target Branch Memory entry already exists, the workflow refuses to
  overwrite it; inspect the existing `brmem-plans/<slug>.md` entry before
  deciding what to do next.
- If Graphite tracking fails after local branch creation, no attached plan is
  stored and no cleanup is attempted; inspect the created branch manually.
- If `/impl-planned-branch` reports multiple attached plans, rerun it with the
  desired key or slug.

For read-only inspection, use:

```text
brmem list --namespace brmem-plans --branch <branch>
brmem get <key> --namespace brmem-plans --branch <branch>
```

## Validation and Related Files

Implementation lives in the engineered Pi extension package under
`ts/packages/pi-extensions/`. The checked-in project-local discovery shim is
`.pi/extensions/planned-branch.ts`.

Useful related files:

- `ts/packages/pi-extensions/src/planned-branch-extension.ts`: command wiring for
  `/write-plan`, `/create-planned-branch`, and `/impl-planned-branch`.
- `ts/packages/pi-extensions/src/planned-branch/`: planned-branch storage, branch
  creation, saved-plan, and attached-plan helpers.
- `ts/packages/pi-extensions/src/planned-branch/prompts/impl-planned-branch.md`:
  implementation prompt text injected by `/impl-planned-branch`.
- `packages/brmem/README.md`: generic Branch Memory CLI documentation with a
  pointer back to this workflow.

For docs-only changes, run `just dprint-check`. If TypeScript behavior changes,
validate the extension package with `just ts-check` and `just ts-test`. The
`justfile` remains the source of truth for the underlying Bun invocation.
