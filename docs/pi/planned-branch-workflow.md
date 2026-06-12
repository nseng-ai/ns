# Planned Branch Workflow

## Overview

The planned-branch workflow turns a reviewed implementation plan into an
implementation branch that carries its canonical plan with it. Saved-plan store
primitives live in the `@asdl/plans` package and its `plans` inspection bin;
branch creation, Branch Memory attachment, and implementation loading live in
the `@asdl/planned-branch` package and its `planned-branch` bin. Pi commands and
installed agent skills are thin workflow surfaces over those CLI contracts. The
`planned-branch` umbrella/reference skill is the shared agent-skill reference
root for the bundled step skills.

Branch Memory is the lower storage adapter for the attached plan. It stores plan
text under an explicit namespace/key contract, but it does not own
planned-branch policy.

The public workflow surface is:

1. `/plans:write` in Pi, `/plans:grill-and-write`
   in Pi, or the `plans-write` skill saves a reviewed plan in
   the local plan store.
2. `/planned-branch:create` in Pi, or the `planned-branch-create` skill,
   selects a saved plan, chooses a planned-branch slug, creates the
   implementation branch, and attaches the plan.
3. The attachment is written to Branch Memory namespace `planned-branch` with
   key `<planned-branch-slug>.md` on the implementation branch.
4. `/planned-branch:impl [key-or-slug]` in Pi, or the `planned-branch-impl`
   skill, loads the canonical attached plan and starts implementation.

For Pi users, `/planned-branch:upstack-impl-session` stacks the planned branch on the
current branch with Graphite by default everywhere, with `--plain-git` as an
escape hatch, then combines `git checkout <branch>`, a fresh Pi session, and
`/planned-branch:impl` after a plan has been written. If the Saved plan is no
longer available in the current source branch's Local plan store but an existing
Planned branch already has an Attached plan, the command can reuse that branch
instead of trying to create or attach anything again.

The agent skills form a bundled planned-branch skill family: the `planned-branch`
umbrella/reference skill plus write-plan, create, and implement step entrypoints.

The deterministic planned-branch CLI operations are hidden under
`planned-branch exec` so agents can share one branch-workflow contract without
duplicating implementation details. The human-facing `plans list` command
inspects the local saved-plan store.

## Command Flow

### Save a source-branch plan

Pi users run `/plans:write`. The Pi command injects its command
header and user steering dynamically, then resolves the static planning-policy
body from the checked-in repo prompt file:

```text
.asdl/prompts/plans-write.md
```

Resolution goes through the deterministic root CLI operation:

```text
asdl exec resolve-prompt plans-write --format json
```

Editing this repo-local prompt customizes future write-plan content policy only.
The embedded fallback defaults, saved-plan storage mechanics, branch creation,
and Branch Memory attachment contracts are unchanged.

Other agents use the `plans-write` skill, which shells out to:

```text
plans exec write --slug <saved-plan-slug> [--summary <text>] --stdin|--content-file <path> [--format json]
```

The saved plan is written by saved-plan store primitives to:

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

Pi derives the saved-plan filename slug inside the planning turn. Agent skills
derive the slug in the skill layer before calling the CLI, because the shared CLI
operation intentionally receives an explicit slug.

#### Pi structured grilling variant

Pi users can run `/plans:grill-and-write` when they want the planning
turn to challenge requirements before saving. This command uses an embedded Pi
prompt, not `.asdl/prompts/plans-write.md`, and requires the
`grill_ask` structured UI tool. If structured UI is unavailable, the turn does
not save a plan.

The grilled variant produces the same local Saved plan artifact through
`write_saved_plan_file`. The resulting plan remains compatible with
`plans exec resolve`, `/planned-branch:create`, and the installed
planned-branch create/implement skills. There is no current standalone CLI or
skill counterpart for the grilled interaction itself; this is intentional Pi-only
structured UI orchestration while storage remains shared.

### Resolve or inspect saved plans

Agents can resolve either an explicit plan path or the latest local saved plan
for the current repo/source branch:

```text
plans exec resolve [absolute-or-home-plan-file.md] [--format json]
```

With no explicit file path, resolution finds the newest Markdown plan in the
current repo/source-branch local plan store directory. Explicit paths may be
absolute or current-user home-relative and must point to Markdown files.

Humans can inspect saved plans for the current repository across all stored
branch-key directories with:

```text
plans list [--format json] [--plan-store-root <path>]
```

Default text output includes each saved plan's slug, encoded branch key,
modified time, and path. It intentionally displays the existing encoded
`branchKey` rather than trying to recover exact original branch names. Saved
plans are Markdown `.md` files.

### Create a planned branch

Pi users run `/planned-branch:create`. Other agents use the
`planned-branch-create` skill, which shells out to:

```text
planned-branch exec create --slug <planned-branch-slug> --plan-file <path> [--branch <branch>] [--branch-creation plain-git|graphite] [--summary <text>] [--format json]
```

The planned-branch slug is derived from the saved plan content by the workflow
surface. It drives the default target branch and the attached-plan key. An
explicit `--branch` overrides only the target branch name; the Branch Memory key
remains derived from `--slug`.

The CLI default branch-creation mode is `plain-git` when `--branch-creation` is
omitted. The CLI also supports `graphite`; pass `--branch-creation graphite`
when the user or workflow explicitly requires Graphite stack tracking. In this
repo, the project-local Pi adapter owns a different `/planned-branch:create`
default and requests Graphite creation for Pi users.

The attached plan contract is:

```text
Namespace: planned-branch
Key: <planned-branch-slug>.md
Branch: <target-implementation-branch>
```

### Start or resume implementation in one Pi command

Pi users in this repo can run `/planned-branch:upstack-impl-session` after
`/plans:write` to create or resume a Planned branch and start implementation in
a fresh Pi session. The command has one user-facing workflow: find the Planned
branch and Attached plan to implement, check out that branch, create a new Pi
session, and run `/planned-branch:impl <attached-plan-key>` there.

```text
Resolve Saved plan from Local plan store
├─ found: create Planned branch and attach plan
└─ no Saved plan available: verify an existing Planned branch with an Attached plan

Selected Planned branch + Attached plan key
→ git checkout <branch>
→ create a new Pi session (/new)
→ send /planned-branch:impl <attached-plan-key> in that new session
```

The command is for starting implementation from a reviewed Saved plan without
manually creating the Planned branch, checking it out, opening a new Pi session,
and loading the Attached plan. It also makes the same command safe to rerun when
the Planned branch and Attached plan already exist but the original Saved plan is
not available from the current source branch's Local plan store.

#### Creation and resumption

On the creation path, the command resolves a Saved plan from the Local plan
store. With no explicit plan path, it prefers the most recent Saved plan created
in the current Pi session, then falls back to the newest Markdown file in the
current repository/source-branch Local plan store directory. An explicit plan
path may be absolute or current-user home-relative with `~` or `~/`; a leading
`@` is accepted and stripped, and the normalized path must be absolute and end
in `.md`.

After resolving the Saved plan, the command derives the planned-branch slug from
the plan content, creates the target Planned branch, and attaches the plan in
Branch Memory namespace `planned-branch` with key `<planned-branch-slug>.md`.

On the resumption path, Saved-plan resolution has failed only because no Saved
plan is available for the current repository/source branch: the Local plan store
directory is missing, or it exists but contains no Markdown plan files. That
narrow failure means the command may be running after the Planned branch was
already created. Other Saved-plan resolution failures still fail normally.

Resumption verifies candidate branches by listing Attached plans in Branch Memory
namespace `planned-branch`. This verification is read-only: it does not create a
branch, attach a plan, or write Branch Memory.

Candidate selection order for resumption is:

1. `--branch <name>`: verify that exact branch has one selectable Attached plan.
   No other candidates are tried.
2. Current-session `planned-branch-output`: verify the single `{ branch, key }`
   candidate from prior planned-branch command output in the current Pi session.
3. Current Git branch: verify the current branch has one selectable Attached
   plan. This is useful when you are already checked out on the Planned branch.

Candidates are verified in that order and the first verified candidate wins. If
no candidate verifies, the command fails with one message listing every
verification failure, including a current branch that could not be resolved.

After either creation or resumption selects a branch/key, the command checks out
the exact branch with `git checkout <branch>`, creates a new Pi session, and
sends `/planned-branch:impl <key>` in that new session. Resumption success and
cancellation messages say the branch and Attached plan were reused; they do not
claim that a branch was newly created.

By default this command stacks newly-created target branches on the current
branch with Graphite regardless of extension options. The current branch must be
trunk or a Graphite-tracked branch for creation; otherwise the command fails
before creating a branch or attaching a plan. Pass `--plain-git` to use plain Git
branch creation instead; that branch will not be part of a Graphite stack.

Ambiguity is explicit. If the current session contains multiple candidate
Planned branches, the command refuses to choose implicitly and asks you to rerun
with `--branch <target-branch>`. If an Attached plan cannot be selected
unambiguously on the chosen branch, rerun `/planned-branch:impl <key>` manually
from that branch or inspect the attached-plan keys first.

#### Options

```text
/planned-branch:upstack-impl-session [options] [absolute-or-home-plan-file.md]
```

- `--dry-run`: preview the selected plan and follow-up flow without mutating. On
  both paths, no branch would be created, no plan would be attached, no checkout
  would happen, no new session would be created, and no implementation prompt
  would be sent.
- `--branch <name>`: on the creation path, use an explicit target branch name
  while keeping the Attached plan key derived from the planned-branch slug. On
  the resumption path, verify and reuse that exact existing branch.
- `--graphite`: default creation behavior; stack the target branch on the
  current branch with Graphite.
- `--plain-git`: create with plain Git instead; no Graphite tracking is added.
- `--yes`, `-y`: compatibility no-op. Resolved planned branches create without
  an extra confirmation prompt.
- `--help`, `-h`: show command help.

#### Recovery examples

Preview what the command would do:

```text
/planned-branch:upstack-impl-session --dry-run
```

Resume from a branch created earlier in the same Pi session after the source
branch no longer has a Saved plan in its Local plan store:

```text
/planned-branch:upstack-impl-session
```

If resumption reports multiple candidates, choose explicitly:

```text
/planned-branch:upstack-impl-session --branch <target-branch>
```

If checkout or new-session launch is cancelled after resumption succeeds,
continue from the checked-out Planned branch with the reported key:

```text
/planned-branch:impl <attached-plan-key>
```

### Load and implement an attached plan

Pi users run `/planned-branch:impl [key-or-slug]`. Other agents use the
`planned-branch-impl` skill, which shells out to:

```text
planned-branch exec load-plan [key-or-slug] [--prompt-file <path>] [--format json]
```

The command reads the current branch, refuses detached HEAD and trunk/default
branches, lists canonical `planned-branch` entries on the current branch,
selects the requested key when one is provided, or otherwise selects the
branch-final segment match when possible. If multiple attached plans are present
and no key is obvious, the workflow should ask the user to choose a key or slug.

JSON output is bounded metadata by default. Agent workflows that need the full
implementation prompt should pass `--prompt-file <path>` and read the returned
`implementation_prompt_file` from disk, rather than asking the shell command to
print the full plan into stdout. The explicit `--include-content` and
`--include-prompt` flags are for callers that can safely accept large stdout.

After loading the selected plan, the workflow starts an implementation turn with
that attached plan as the authoritative plan text.

## Storage Model

The workflow has two storage locations with different jobs:

- **Local plan store:**
  `~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<slug>.md` stores
  reviewed plans before an implementation branch exists. Here `<slug>` is the
  saved-plan filename slug. `@asdl/plans` owns these saved-plan store primitives;
  `plans list` provides human inspection.

  Breaking TypeScript API note: saved-plan store and selection helpers moved
  from `@asdl/planned-branch` to `@asdl/plans`; new consumers should import
  saved-plan APIs from `@asdl/plans`. `@asdl/planned-branch` now owns branch
  creation, Branch Memory attachment, and implementation loading.
- **Attached plan:** Branch Memory namespace `planned-branch`, key
  `<planned-branch-slug>.md`, on the implementation branch stores the canonical
  plan that implementation should follow. `@asdl/planned-branch` owns branch
  creation and attached-plan loading.

The planning layer owns saved plans and attached plans. Branch Memory only stores
the attached plan content under the namespace/key contract, so other Branch
Memory use remains generic branch-scoped text storage.

## Cross-harness Flow

Pi commands and installed agent skills interoperate through the same filesystem
and Branch Memory contracts:

- A plan saved by `/plans:write` or
  `/plans:grill-and-write` can be resolved by
  `plans exec resolve` or used by the `planned-branch-create`
  skill.
- A plan saved by `plans-write` can be passed to
  `/planned-branch:create <path>`.
- A branch created by either Pi or an installed agent skill stores the attached
  plan in namespace `planned-branch`, so `/planned-branch:impl` and
  `planned-branch-impl` can both load it.

No compatibility aliases or alternate storage namespaces are part of the active
contract.

## Branch Creation Policy

Branch creation policy is selected by the workflow surface. The portable CLI
uses `plain-git` when `--branch-creation` is omitted. A wrapper may choose a
project-local default; in this repo, the Pi adapter configures
`/planned-branch:create` to request Graphite branch creation and to use the
planned-branch slug as the target branch name unless the user passes an explicit
branch.

Graphite creation still creates the local Git branch first:

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

For saved-plan store inspection, use:

```text
plans list [--format json]
```

For read-only attached-plan inspection, use:

```text
brmem list --namespace planned-branch --branch <branch>
brmem get <key> --namespace planned-branch --branch <branch>
```

## Validation and Related Surfaces

The portable packages expose the `plans` and `planned-branch` bins. Pi commands
and installed agent skills should treat the hidden `planned-branch exec` commands
as the shared branch-workflow contract rather than duplicating package internals.
Use `plans list` for human saved-plan store inspection.

Related public surfaces:

- Pi commands: `/plans:write`,
  `/plans:grill-and-write`, `/planned-branch:create`,
  `/planned-branch:upstack-impl-session`, and `/planned-branch:impl`.
- Agent skills: `planned-branch` umbrella/reference skill, plus
  `plans-write`, `planned-branch-create`, and
  `planned-branch-impl` step skills.
- Branch Memory documentation: `packages/brmem/README.md` for the generic
  storage CLI that planned-branch uses for attached plans.

For docs-only changes, run `just dprint-check` or `dprint check`. If TypeScript
behavior changes, validate with `just ts-check` and `just ts-test`. The
`justfile` remains the source of truth for these validation commands and now
delegates TypeScript package-manager work through the `ts/` pnpm workspace.
