# Branch Context Workflow

## Overview

The branch-context workflow turns a reviewed Saved plan into an implementation branch that carries its canonical plan with it.

The workflow has two storage layers:

- **Local plan store**: `~/.asdl/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md`, owned by `@asdl/plans` and the `enriched-plan` CLI.
- **Attached plan**: Branch Memory namespace `branch-context`, key `plan.md`, on the implementation branch, owned by `@asdl/branch-context` and the `branch-context` CLI.

Branch Memory is the lower storage adapter for attached branch context entries. It stores text under explicit namespace/key contracts, but branch-context policy belongs to the planning layer.

## Public workflow surface

1. Save a source-branch plan with `/enriched-plan:save`, `/enriched-plan:grill-and-save`, or `enriched-plan exec save`.
2. Create a branch context with `/branch-context:from-plan` or `branch-context exec from-plan`.
3. Attach the plan to Branch Memory namespace `branch-context`, key `plan.md`, on the implementation branch.
4. Load and implement with `/branch-context:impl` or `branch-context exec load`.

For Pi users, `/branch-context:upstack-impl-session` creates or reuses a branch context, checks out the target branch, starts a fresh Pi session, and sends `/branch-context:impl` in that session. It uses Graphite by default, with `--plain-git` as an escape hatch.

## Save a source-branch plan

Pi users run `/enriched-plan:save`. The static planning-policy body lives at:

```text
.asdl/prompts/plans-write.md
```

It is resolved through:

```text
asdl exec resolve-prompt plans-write --format json
```

The structured grilling variant is `/enriched-plan:grill-and-save`. It uses Pi's structured `grill_ask` UI and writes the same Saved plan artifact through `write_saved_plan_file`.

CLI/agent workflows save with:

```text
enriched-plan exec save --slug <saved-plan-slug> [--summary <text>] --stdin|--content-file <path> [--format json]
```

Saved plans are written to:

```text
~/.asdl/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md
```

Saving a plan creates no implementation branch, writes no Branch Memory, and checks in no plan artifact.

## Resolve or inspect saved plans

Resolve a specific saved plan, or the latest saved plan for the current repo/source branch:

```text
enriched-plan exec resolve [absolute-or-home-plan-file.md] [--format json]
```

Inspect saved plans for the current repository:

```text
enriched-plan list [--format json] [--plan-store-root <path>]
```

## Create a branch context

Pi users run `/branch-context:from-plan`. CLI/agent workflows use:

```text
branch-context exec from-plan --slug <branch-context-slug> --plan-file <path> [--branch <branch>] [--branch-creation plain-git|graphite] [--summary <text>] [--format json]
```

The branch-context slug is derived from saved plan content by the workflow surface. It drives the default target branch name. The attached plan key is always `plan.md`; it is not slug-derived.

The CLI default branch creation mode is `plain-git` when `--branch-creation` is omitted. The project-local Pi adapter requests Graphite creation by default.

Attached plan contract:

```text
Namespace: branch-context
Key: plan.md
Branch: <target-implementation-branch>
```

## Start or resume implementation in one Pi command

Pi users can run `/branch-context:upstack-impl-session` after saving a plan. The command resolves a Saved plan, creates or reuses a branch context, checks out the target branch, starts a new Pi session, and sends `/branch-context:impl`.

```text
Resolve Saved plan from Local plan store
├─ found: create Branch context and attach plan.md
└─ no Saved plan available: verify an existing Branch context with plan.md

Selected Branch context
→ git checkout <branch>
→ create a new Pi session (/new)
→ send /branch-context:impl in that new session
```

Useful options:

- `--dry-run`: preview without creating a branch, attaching a plan, checking out, or starting a new session.
- `--branch <name>`: use or verify an explicit target branch.
- `--graphite`: default; stack the target branch on the current branch with Graphite.
- `--plain-git`: create with plain Git instead.
- `--yes`, `-y`: compatibility no-op.

## Load and implement an attached plan

Pi users run `/branch-context:impl`. CLI/agent workflows use:

```text
branch-context exec load [--prompt-file <path>] [--format json]
```

By default, load selects the exact attached plan entry `plan.md` from the current branch. An explicit key, when supported by the caller, is treated as an exact Branch Memory key selector rather than a fuzzy slug search.

Agent workflows that need the full implementation prompt should pass `--prompt-file <path>` and then read the returned `implementation_prompt_file` from disk. Avoid `--include-content` and `--include-prompt` in normal agent operation because they can print large plan bodies to stdout.

## Recovery and diagnostics

Common recovery paths:

- If no Saved plan is found, run `/enriched-plan:save` or pass an explicit saved-plan path.
- If the target branch already exists, choose another branch or inspect the existing branch before retrying.
- If slug validation fails, choose a clearer 3-7 word kebab-case slug from the plan content and retry.
- If `branch-context/plan.md` already exists on the target branch, the workflow refuses to overwrite it.
- If Graphite tracking fails after local branch creation, inspect the created branch manually; no attached plan is stored.
- If loading fails, inspect the `branch-context` namespace on the current branch.

Read-only attached-plan inspection:

```text
brmem list --namespace branch-context --branch <branch>
brmem get plan.md --namespace branch-context --branch <branch>
```

## Related surfaces

- Pi commands: `/enriched-plan:save`, `/enriched-plan:grill-and-save`, `/branch-context:from-plan`, `/branch-context:upstack-impl-session`, `/branch-context:impl`.
- CLIs: `enriched-plan`, `branch-context`, and low-level `brmem`.
- Agent skills: `enriched-plan-save`, `branch-context`, `branch-context-create`, and `branch-context-impl`.
