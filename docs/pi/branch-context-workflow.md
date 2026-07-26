# Branch Context Workflow

## Overview

The branch-context workflow turns a reviewed Saved plan into an implementation branch that carries its canonical plan with it.

The workflow has two storage layers:

- **Local plan store**: `$XDG_STATE_HOME/ns/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md` (default `$HOME/.local/state/ns/enriched-plan/...`), owned by `@nseng-ai/plans` and the `enriched-plan` CLI.
- **Attached plan**: Branch Memory namespace `branch-context`, named Markdown key, on the implementation branch, owned by `@nseng-ai/branch-context` and the `branch-context` CLI. From-plan attachments use `<branch-context-slug>.md`; the legacy `plan.md` key is not a supported attached-plan key.

Branch Memory is the lower storage adapter for attached branch context entries. It stores text under explicit namespace/key contracts, but branch-context policy belongs to the planning layer. Branch context is standing context on a branch, not a special branch type; a plan can be the founding entry where one exists.

## Public workflow surface

1. Save a source-branch plan with `/ns:plan:save`, `/ns:plan:grill-and-save`, or `enriched-plan exec save`.
2. Create a branch and attach its branch context with `/ns:branch-context:from-plan` or `ns branch-context exec from-plan`.
3. Attach the plan to Branch Memory namespace `branch-context` under the named Markdown key for that workflow, on the implementation branch.
4. Load and implement with `/ns:branch-context:impl-attached-plan` or `ns branch-context exec load`.

For Pi users, `/ns:branch-context:upstack-impl-from-plan` creates or reuses a branch with attached branch context, checks out the target branch, starts a fresh Pi session, and sends `/ns:branch-context:impl-attached-plan <key>` in that session. It uses Graphite by default, with `--plain-git` as an escape hatch.

## Save a source-branch plan

Pi users run `/ns:plan:save`. The static planning-policy body lives at:

```text
.ns/prompts/plans-write.md
```

For `/ns:plan:save`, the TypeScript Pi extension resolves this file from the current Git root and falls back to its built-in prompt body if Git root discovery, file reading, empty content, or symlink safety checks fail.

The structured grilling variant is `/ns:plan:grill-and-save`. It uses Pi's structured `grill_ask` UI and writes the same Saved plan artifact through `write_saved_plan_file`. The `grill_ask` tool is inactive by default in a fresh session; invoking `/ns:plan:grill-and-save` (or a `/pi:grill-*` command) activates it before the kickoff prompt is sent, and it stays active for the rest of that session rather than depending on global availability. The grill should resolve product/design requirements, not routine validation coverage; ordinary test/check scope is deferred to the downstream implementation agent's project policy and changed-file judgment.

CLI/agent workflows save with:

```text
enriched-plan exec save --slug <saved-plan-slug> [--summary <text>] --stdin|--content-file <path> [--format json]
```

Machine JSON uses the standard Clinkr envelope: successful payload fields are under `data` (for example `data.file_path`, `data.slug`, and `data.source_branch`), and failures use `exit_code: 2`, `error_type`, and `message`.

Saved plans are written to:

```text
$XDG_STATE_HOME/ns/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md
```

When `XDG_STATE_HOME` is unset, the default is `$HOME/.local/state/ns/enriched-plan/...`. Legacy `~/.ns/enriched-plan/...` files are not read, migrated, or dual-written.

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

## Create a branch and attach its branch context

Pi users run `/ns:branch-context:from-plan`. CLI/agent workflows use:

```text
ns branch-context exec from-plan --slug <branch-context-slug> --plan-file <path> [--branch <branch>] [--branch-creation plain-git|graphite] [--summary <text>] [--format json]
```

The branch-context slug is derived from saved plan content by the workflow surface. It drives the default target branch name and the new from-plan attached key `<branch-context-slug>.md`. Passing `--branch <branch>` changes only the target branch, not the attached key.

The CLI default branch creation mode is `plain-git` when `--branch-creation` is omitted. The project-local Pi adapter requests Graphite creation by default.

Attached plan contract:

```text
Namespace: branch-context
Key: <branch-context-slug>.md
Branch: <target-implementation-branch>
```

The attached Branch Memory entry is the implementation branch identity. Branch names captured inside saved-plan provenance are forensic context and can become stale after explicit target-branch overrides, branch reuse, or branch renames; they should not be treated as executor STOP gates by themselves.

## Start or resume implementation in one Pi command

Pi users can run `/ns:branch-context:upstack-impl-from-plan` after saving a plan. The command resolves a Saved plan, creates or reuses a branch with attached branch context, checks out the target branch, starts a new Pi session, and sends `/ns:branch-context:impl-attached-plan`.

```text
Resolve Saved plan from Local plan store
├─ found: create branch and attach branch context as <branch-context-slug>.md
└─ no Saved plan available: verify an existing branch context entry

Selected branch + branch-context entry
→ git checkout <branch>
→ create a new Pi session (/new)
→ send /ns:branch-context:impl-attached-plan [<key>] in that new session
```

The command is for starting implementation from a reviewed Saved plan without manually creating the branch, checking it out, opening a new Pi session, and loading the Attached plan. It also makes the same command safe to rerun when the branch and Attached plan already exist but the original Saved plan is not available from the current source branch's Local plan store.

Useful options:

- `--dry-run`: preview without creating a branch, attaching a plan, checking out, or starting a new session.
- `--branch <name>`: use or verify an explicit target branch.
- `--graphite`: default; stack the target branch on the current branch by creating the local Git branch, then running `gt track`.
- `--plain-git`: create with plain Git only, without Graphite tracking.
- `--yes`, `-y`: compatibility no-op.

## Load and implement an attached plan

Pi users run `/ns:branch-context:impl-attached-plan`. CLI/agent workflows use:

```text
ns branch-context exec load [<key>] [--prompt-file <path>] [--format json]
```

By default, load auto-selects only when the current branch has exactly one supported named Markdown branch-context entry. If multiple supported entries exist, pass an explicit key. An explicit key is treated as an exact Branch Memory key selector rather than a fuzzy slug search. Legacy `plan.md` entries are not supported; reattach those plans under a named Markdown key such as `<slug>.md`.

Agent workflows that need the full implementation prompt should pass `--prompt-file <path>` and then read the returned `data.implementation_prompt_file` from the standard Clinkr JSON envelope. Avoid `--include-content` and `--include-prompt` in normal agent operation because they can print large plan bodies to stdout.

## Branch-context plan contract trial rollback

The code-adjacent rollback note for the trial protocol lives in `ts/packages/incubating/extensions/branch-context/README.md`.

## Branch-context primitives

`ns branch-context exec from-plan` is documented sugar over primitive branch-context operations. The primitive operation set is also available for repair, admin, and non-plan entries:

```text
ns branch-context exec attach --plan <saved-plan-slug> [--branch <branch>] [--format json]
ns branch-context exec attach <key> --file <path> [--branch <branch>] [--format json]
ns branch-context exec list [--branch <branch>] [--format json]
ns branch-context exec check <key> [--branch <branch>] [--format json]
ns branch-context exec delete <key> [--branch <branch>] [--format json]
```

Use `attach --plan` to attach a saved plan as `<saved-plan-slug>.md`. Use `attach <key> --file <path>` only when intentionally creating an arbitrary branch-context entry with an explicit key. Prefer `list` and `check` for read-only diagnostics before falling back to raw Branch Memory commands.

## Mechanics and invariants

### Graphite branch creation

Branch creation policy is selected by the workflow surface. The portable CLI uses `plain-git` when `--branch-creation` is omitted. A wrapper may choose a project-local default; in this repo, the Pi adapter configures `/ns:branch-context:from-plan` and `/ns:branch-context:upstack-impl-from-plan` to request Graphite branch creation unless the user passes `--plain-git`. Direct skill/CLI agent invocations in this repo bypass that Pi adapter option, so they must pass `--branch-creation graphite` unless the user explicitly requests plain Git.

This workflow uses the branch-context Graphite creation method defined in `skills/incubating/branch-context/branch-context/references/lifecycle.md`; it does not call `gt create`, and it is the expected branch setup primitive for autoobjective runners.

This does not switch the current checkout. The plan attachment still passes the target branch to Branch Memory, so storage does not depend on the current checkout.

### `upstack-impl-session` creation and resumption

On the creation path, `/ns:branch-context:upstack-impl-from-plan` resolves a Saved plan from the Local plan store before creating or attaching anything. With no explicit plan path, it prefers the most recent Saved plan created in the current Pi session, then falls back to the newest Markdown file in the current repository/source-branch Local plan store directory.

An explicit plan path may be absolute or current-user home-relative with `~` or `~/`; a leading `@` is accepted and stripped, and the normalized path must be absolute and end in `.md`.

After resolving the Saved plan, the command derives the branch-context slug from the plan content. With Graphite creation, it verifies that the current branch is trunk or Graphite-tracked before creating a branch or attaching a plan. Only after those preconditions pass does it create the target branch and attach the plan in Branch Memory namespace `branch-context` with key `<branch-context-slug>.md`.

On the resumption path, Saved-plan resolution has failed only because no Saved plan is available for the current repository/source branch: the Local plan store directory is missing, or it exists but contains no Markdown plan files. That narrow failure means the command may be running after the branch was already created. Other Saved-plan resolution failures still fail normally.

Resumption verifies candidate branches by listing branch-context entries in Branch Memory namespace `branch-context`. This verification is read-only: it does not create a branch, attach a plan, or write Branch Memory.

Candidate selection order for resumption is:

1. `--branch <name>`: verify that exact branch has one selectable branch-context entry. No other candidates are tried.
2. Current-session branch-context session artifact: verify the single `{ branch, key }` candidate from prior branch-context command output in the current Pi session.
3. Current Git branch: verify the current branch has one selectable branch-context entry. This is useful when you are already checked out on the implementation branch.

Candidates are verified in that order and the first verified candidate wins. If no candidate verifies, the command fails with one message listing every verification failure, including a current branch that could not be resolved.

After either creation or resumption selects a branch/key, the command checks out the exact branch with `git checkout <branch>`, creates a new Pi session, and sends `/ns:branch-context:impl-attached-plan <key>` in that new session. Resumption success and cancellation messages say the branch and Attached plan were reused; they do not claim that a branch was newly created.

Ambiguity is explicit. If the current session contains multiple candidate branches with branch-context output, the command refuses to choose implicitly and asks you to rerun with `--branch <target-branch>`. If a branch-context entry cannot be selected unambiguously on the chosen branch, rerun `/ns:branch-context:impl-attached-plan <key>` manually from that branch or inspect the branch-context keys first.

Recovery examples:

Preview what the command would do:

```text
/ns:branch-context:upstack-impl-from-plan --dry-run
```

Resume from a branch created earlier in the same Pi session after the source branch no longer has a Saved plan in its Local plan store:

```text
/ns:branch-context:upstack-impl-from-plan
```

If resumption reports multiple candidates, choose explicitly:

```text
/ns:branch-context:upstack-impl-from-plan --branch <target-branch>
```

If checkout or new-session launch is cancelled after resumption succeeds, continue from the checked-out branch:

```text
/ns:branch-context:impl-attached-plan
```

### Plan-path normalization

Saved-plan path arguments are normalized before resolution:

- Absolute paths are accepted as-is after normalization.
- Current-user home-relative paths with `~` or `~/` are expanded.
- A leading `@` is stripped before path normalization.
- The normalized path must be absolute and must end in `.md`.

## Recovery and diagnostics

Common recovery paths:

- If no Saved plan is found, run `/ns:plan:save` or pass an explicit saved-plan path.
- If the target branch already exists, choose another branch or inspect the existing branch before retrying.
- If slug validation fails, choose a clearer 3-7 word kebab-case slug from the plan content and retry.
- If the derived branch-context key already exists on the target branch, the workflow refuses to overwrite it.
- If Graphite tracking fails after local branch creation, inspect the created branch manually; no attached plan is stored.
- If loading fails, inspect the `branch-context` namespace on the current branch.

Read-only attached-plan inspection:

```text
ns branch-context exec list --branch <branch> [--format json]
ns branch-context exec check <key> --branch <branch> [--format json]
ns branch-context exec load [<key>] --prompt-file <path> [--format json]
```

Raw Branch Memory inspection is a fallback for diagnostics only:

```text
brmem list --namespace branch-context --branch <branch>
brmem get <key> --namespace branch-context --branch <branch>
```

## Related surfaces

- Pi commands: `/ns:plan:save`, `/ns:plan:grill-and-save`, `/ns:branch-context:from-plan`, `/ns:branch-context:upstack-impl-from-plan`, `/ns:branch-context:impl-attached-plan`.
- CLIs: `enriched-plan`, `branch-context`, and low-level `brmem`.
- Agent skills: `enriched-plan-save`, `branch-context`, `branch-context-from-plan`, and `branch-context-impl`.
