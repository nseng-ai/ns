# Planned Branch Workflow

## Overview

The planned-branch workflow turns a reviewed implementation plan into an
implementation branch that carries its canonical plan with it. The portable core
is the `@asdl/planned-branch` TypeScript package and its `planned-branch` bin;
Pi and Claude skills are thin workflow surfaces over that CLI contract.

Branch Memory is the lower storage adapter for the attached plan. It stores plan
text under an explicit namespace/key contract, but it does not own
planned-branch policy.

The public workflow surface is:

1. `/planned-branch:write-plan` in Pi, or the `planned-branch-write-plan` skill
   in Claude Code, saves a reviewed plan in the local plan store.
2. `/planned-branch:create` in Pi, or the `planned-branch-create` skill in
   Claude Code, selects a saved plan, chooses a planned-branch slug, creates the
   implementation branch, and attaches the plan.
3. The attachment is written to Branch Memory namespace `planned-branch` with
   key `<planned-branch-slug>.md` on the implementation branch.
4. `/planned-branch:impl [key-or-slug]` in Pi, or the `planned-branch-impl`
   skill in Claude Code, loads the canonical attached plan and starts
   implementation.

The deterministic CLI operations are hidden under `planned-branch exec` so
agents can share one package contract without duplicating TypeScript internals.

## Pi Extension Boundary

Do not edit Pi core for this repo's planned-branch workflow. Keep Pi-facing
behavior in project-owned extension code under `ts/packages/pi-extensions/` and
the project-local `.pi/extensions/` adapter. If a change appears to require
modifying the installed Pi package or local Pi monorepo, treat that as an
upstream follow-up and prefer an extension-local workaround for this repo.

## Command Flow

### Save a source-branch plan

Pi users run `/planned-branch:write-plan`. Claude Code users use the
`planned-branch-write-plan` skill, which shells out to:

```text
planned-branch exec write-plan-file --slug <saved-plan-slug> [--summary <text>] --stdin|--content-file <path> [--format json]
```

The saved plan is written to:

```text
~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<slug>.md
```

The saved plan is scoped to the repository and the source branch where planning
happened. Branch slashes in `<encoded-source-branch>` are encoded as a
filesystem-safe path segment, and `<slug>` is the semantic kebab-case saved-plan
filename slug. That filename slug is a local locator; it is not necessarily the
later planned-branch slug.

Saving a source-branch plan creates no implementation branch, writes no Branch
Memory, and checks in no plan artifact. The local plan store is the pre-branch
handoff point between planning and branch creation.

Pi derives the saved-plan filename slug inside the planning turn. Claude skills
derive the slug in the skill layer before calling the CLI, because the shared CLI
operation intentionally receives an explicit slug.

### Resolve a saved plan

Agents can resolve either an explicit plan path or the latest local saved plan
for the current repo/source branch:

```text
planned-branch exec resolve-plan [absolute-or-home-plan-file.md] [--format json]
```

With no explicit file path, resolution finds the newest Markdown plan in the
current repo/source-branch local plan store directory. Explicit paths may be
absolute or current-user home-relative and must point to Markdown files.

### Create a planned branch

Pi users run `/planned-branch:create`. Claude Code users use the
`planned-branch-create` skill, which shells out to:

```text
planned-branch exec create --slug <planned-branch-slug> --plan-file <path> [--branch <branch>] [--branch-creation plain-git|graphite] [--summary <text>] [--format json]
```

The planned-branch slug is derived from the saved plan content by the workflow
surface. It drives the default target branch and the attached-plan key. An
explicit `--branch` overrides only the target branch name; the Branch Memory key
remains derived from `--slug`.

In this repo, Pi defaults branch creation to Graphite through the project-local
extension configuration. The CLI supports both `plain-git` and `graphite`, and
Claude skills should pass `--branch-creation` when the user or workflow requires
a specific mode.

The attached plan contract is:

```text
Namespace: planned-branch
Key: <planned-branch-slug>.md
Branch: <target-implementation-branch>
```

### Load and implement an attached plan

Pi users run `/planned-branch:impl [key-or-slug]`. Claude Code users use the
`planned-branch-impl` skill, which shells out to:

```text
planned-branch exec load-plan [key-or-slug] [--format json]
```

The command reads the current branch, refuses detached HEAD and trunk/default
branches, lists canonical `planned-branch` entries on the current branch,
selects the requested key when one is provided, or otherwise selects the
branch-final segment match when possible. If multiple attached plans are present
and no key is obvious, the workflow should ask the user to choose a key or slug.

After loading the selected plan, the workflow starts an implementation turn with
that attached plan as the authoritative plan text.

## Storage Model

The workflow has two storage locations with different jobs:

- **Local plan store:**
  `~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<slug>.md` stores
  reviewed plans before an implementation branch exists. Here `<slug>` is the
  saved-plan filename slug.
- **Attached plan:** Branch Memory namespace `planned-branch`, key
  `<planned-branch-slug>.md`, on the implementation branch stores the canonical
  plan that implementation should follow.

The planning layer owns saved plans and attached plans. Branch Memory only stores
the attached plan content under the namespace/key contract, so other Branch
Memory use remains generic branch-scoped text storage.

## Cross-harness Flow

Pi and Claude Code interoperate through the same filesystem and Branch Memory
contracts:

- A plan saved by `/planned-branch:write-plan` can be resolved by
  `planned-branch exec resolve-plan` or used by the `planned-branch-create`
  skill.
- A plan saved by `planned-branch-write-plan` can be passed to
  `/planned-branch:create <path>`.
- A branch created by either Pi or Claude Code stores the attached plan in
  namespace `planned-branch`, so `/planned-branch:impl` and
  `planned-branch-impl` can both load it.

No compatibility aliases or alternate storage namespaces are part of the active
contract.

## Branch Creation Policy

Branch creation policy is selected by the workflow surface. In this repo, the
project-local Pi adapter configures `/planned-branch:create` to default to
Graphite branch creation and to use the planned-branch slug as the target branch
name unless the user passes an explicit branch.

Graphite creation creates the local Git branch first:

```text
git branch <target> HEAD
```

Then it registers the branch with Graphite using the current branch as parent:

```text
gt track <target> --parent <current-branch> --no-interactive
```

This does not switch the current checkout. The plan attachment still passes the
target branch to Branch Memory, so storage does not depend on the current
checkout.

## Recovery and Diagnostics

The commands present planning-level status first and include lower-level Branch
Memory evidence for recovery:

- saved-plan file path/stem, planned-branch slug, branch name, and branch
  creation method
- namespace and key
- Branch Memory ref and commit for successful attachments
- selected key, ref, and byte count for loaded plans

Common recovery paths:

- If plan resolution cannot find a saved plan, run the write-plan workflow first
  or pass an explicit absolute or current-user home-relative saved-plan path.
- If the target branch already exists, choose another target branch or inspect
  the existing branch before retrying.
- If slug validation fails, choose a clearer 3-7 word kebab-case slug from the
  plan content and retry.
- If the target Branch Memory entry already exists, the workflow refuses to
  overwrite it; inspect the existing `planned-branch/<slug>.md` entry before
  deciding what to do next.
- If Graphite tracking fails after local branch creation, no attached plan is
  stored and no cleanup is attempted; inspect the created branch manually.
- If loading reports multiple attached plans, rerun with the desired key or slug.

For read-only inspection, use:

```text
brmem list --namespace planned-branch --branch <branch>
brmem get <key> --namespace planned-branch --branch <branch>
```

## Validation and Related Files

The portable package lives under `ts/packages/planned-branch/` and exposes the
`planned-branch` bin. Pi wiring lives in the engineered Pi extension package
under `ts/packages/pi-extensions/`; the checked-in project-local discovery
adapter is `.pi/extensions/planned-branch.ts`.

Useful related files:

- `ts/packages/planned-branch/src/cli.ts`: `planned-branch exec` operation
  parsing and JSON output.
- `ts/packages/planned-branch/src/`: local plan store, branch creation, and
  attached-plan helpers.
- `ts/packages/planned-branch/src/prompts/planned-branch-impl.md`:
  implementation prompt text returned by `planned-branch exec load-plan`.
- `ts/packages/pi-extensions/src/planned-branch-extension.ts`: Pi command and
  tool wiring for `/planned-branch:write-plan`, `/planned-branch:create`, and
  `/planned-branch:impl`.
- `skills/planned-branch-write-plan/SKILL.md`,
  `skills/planned-branch-create/SKILL.md`, and
  `skills/planned-branch-impl/SKILL.md`: Claude Code public workflow skills.
- `packages/brmem/README.md`: generic Branch Memory CLI documentation with a
  pointer back to this workflow.

For docs-only changes, run `just dprint-check` or `dprint check`. If TypeScript
behavior changes, validate with `just ts-check` and `just ts-test`. The
`justfile` remains the source of truth for the underlying Bun invocation.
