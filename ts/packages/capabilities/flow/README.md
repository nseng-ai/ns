# @nseng-ai/flow

Graphite-backed branch, submit, and land workflows for the `ns` CLI.

Flow owns the everyday loop of stacked-PR development: summarize and checkpoint
outstanding work, turn it into Graphite branches, submit stacks with generated PR
descriptions and repository-defined pre-submit checks, and land finished work into
trunk. It is an ns extension: its commands appear under `ns flow ...`, and consuming
repositories customize its behavior through
[extension points](../../../../docs/guides/points.md), never by forking Flow.

## Requirements

- A Git repository managed with [Graphite](https://graphite.dev) (`gt`). Flow is
  Graphite-native by design; it does not abstract the stacking tool.
- GitHub as the PR backend.
- The `ns` CLI with the Flow extension enabled.
- The `gt` and `gh` CLIs available on `PATH`; commands that read or mutate pull
  requests require an authenticated GitHub session.
- A configured Graphite trunk that `gt trunk --no-interactive` can resolve.
  Checkpoint safety fails closed when that lookup fails, including on clean
  worktrees and checkpoint dry runs.
- For `pull-trunk`, the local configured-trunk branch must have a Git upstream.
  Flow uses that upstream's exact remote and remote ref; it does not assume
  `origin` or a same-named remote branch.

## Commands

Each command depends on a distinct slice of the underlying technology stack:

| Command                        | What it does                                                                                   | git | Graphite (`gt`) | GitHub (`gh`) | slots | LLM |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | :-: | :-------------: | :-----------: | :---: | :-: |
| `ns flow changes`              | Summarize outstanding worktree changes without committing.                                     |  ✓  |                 |               |       |  ✓  |
| `ns flow cp`                   | Create a checkpoint commit for the current diff.                                               |  ✓  |        ✓        |               |       |  ✓  |
| `ns flow autobranch`           | Create a Graphite branch from dirty worktree changes.                                          |  ✓  |        ✓        |               |       |  ✓  |
| `ns flow branch-latest-commit` | Move the latest eligible commit to a new Graphite branch.                                      |  ✓  |        ✓        |               |       |  ✓  |
| `ns flow autoslot`             | Create a Graphite branch from current work, then move it into a managed slot worktree.         |  ✓  |        ✓        |               |   ✓   |  ✓  |
| `ns flow submit`               | Submit the current/downstack Graphite branches; `--minimal` selects the clean-tree cheap path. |  ✓  |        ✓        |       ✓       |       |  ✓  |
| `ns flow regenerate-pr`        | Regenerate the current PR title and ns-managed body region.                                    |  ✓  |                 |       ✓       |       |  ✓  |
| `ns flow push`                 | Push committed non-Graphite branch work with `git push`.                                       |  ✓  |                 |               |       |     |
| `ns flow land`                 | Land the current PR or Graphite stack into trunk.                                              |  ✓  |        ✓        |       ✓       |   ✓   |     |
| `ns flow pull-trunk`           | Refresh the configured Graphite trunk from its configured Git upstream.                        |  ✓  |        ✓        |               |       |     |
| `ns flow squash-stack`         | Squash every branch in the current Graphite stack to one commit, then restore the tip branch.  |  ✓  |        ✓        |               |       |     |

Every command is also available in the Pi harness as `/ns:flow:<command>`, delegating
to the CLI. Pi is optional; the CLI commands do not require the Pi host.

### Latest-commit extraction policy

`ns flow branch-latest-commit` and clean-worktree `ns flow autoslot` share this
policy: the worktree must be clean, and `HEAD` must be a latest single-parent
commit. Relationship checks use only local tracking refs; they never implicitly
fetch.

| Relationship to the locally known upstream         | Result   |
| -------------------------------------------------- | -------- |
| No upstream                                        | Eligible |
| Locally ahead                                      | Eligible |
| Exactly synchronized, on a non-trunk source branch | Eligible |
| Remote-ahead or diverged                           | Refused  |
| Exactly synchronized, on configured Graphite trunk | Refused  |

Existing Graphite children, root commits, and merge commits are also refused.
The split mutates local refs only: it never fetches, pushes, submits, or updates
PRs. On synchronized success, the upstream remains at the original commit until
the user explicitly runs `ns flow submit` from the new child to publish the
reshaped stack.

### What each column means

- **git** — plain `git` subprocess calls for status, commit, push, fetch, and merge
  mechanics.
- **Graphite (`gt`)** — the Graphite CLI for stack topology and mutation. Flow is
  Graphite-native by design.
- **GitHub (`gh`)** — the GitHub CLI for PR reads and edits, including PR lookup,
  title and description updates, and merge state.
- **slots** — ns managed worktree slots: `autoslot` checks branches out into a slot;
  `land` cleans up managed slots that held landed branches.
- **LLM** — injected text generation for change summaries, checkpoint messages,
  branch-name slugs, and PR titles and descriptions.

### Command-scoped integrations

- `cp` and submit's checkpoint step compare the current branch with Graphite's
  configured trunk. If Graphite cannot resolve that identity, they stop before
  checkpoint-message generation or Git mutation; branch names such as `main` and
  `master` receive no special treatment unless one is the configured trunk.
- `pull-trunk` inspects the configured trunk's Git upstream before worktree
  inspection and refresh mutation. A missing or unreadable upstream is a
  non-mutating refusal; Flow never creates or rewrites upstream configuration
  automatically.
- `autoslot` composes the ns Slots capability to move the new branch into a managed
  slot. Other branch and submit commands do not require using managed slots. When
  `land` runs from or encounters a managed-slot worktree, it can perform targeted
  slot cleanup; ordinary worktrees remain ordinary Git worktrees.
- `land` uses GitHub squash merge and requires `gh` authentication with permission
  to merge the target PRs. The repository must allow squash merges. Other merge
  strategies are not part of the current land contract.
- The hidden agent-facing exec surface has one operation:
  `ns flow exec read-graphite-branch-metadata`, which reads Graphite's branch
  metadata database through a controlled `sqlite3` query.

## Model-backed workflows

The ns runtime supplies Flow's text-generation service; Flow does not configure a
provider client of its own. The selected provider and model must therefore be
available to the ns runtime. Model-backed commands select model refs with these
environment variables:

| Environment variable          | Used by                                                              |
| ----------------------------- | -------------------------------------------------------------------- |
| `NS_CHANGES_MODEL`            | `changes` summaries                                                  |
| `NS_CHECKPOINT_MODEL`         | `cp`, `autobranch`, and submit checkpoint messages                   |
| `NS_SLUG_MODEL`               | `autobranch` and `branch-latest-commit` generated branch slugs       |
| `NS_DEV_PR_DESCRIPTION_MODEL` | `submit` and `regenerate-pr` PR titles and descriptions              |
| `NS_SUBMIT_FAILURE_MODEL`     | Interpretation of submit failures without deterministic presentation |

Unset selectors currently default to `openai-codex/gpt-5.6-luna`. Set the relevant
variable when that model is unavailable or a repository wants a different model.
`NS_CHECKPOINT_MODEL` retains `NS_DEV_CHECKPOINT_MODEL` as a legacy fallback, and
`NS_CHANGES_MODEL` retains `PI_DRAFT_MODEL` as a legacy fallback.

Prompt content is configured separately from model identity through the prompt points
documented below.

## Minimal submit

`ns flow submit --minimal` is the staged clean-tree cheap-submit path. It reads
structured Graphite metadata to identify the current branch and its non-trunk
downstack ancestors, refuses dirty or drifting source state, checks submit readiness,
automatically runs `gt restack --downstack --no-interactive` when required, rechecks
readiness, runs `gt submit --no-stack`, and verifies the current PR.

Minimal mode deliberately runs no `flow.submit.pre` hooks, checkpoint, metadata
prewrite, PR-description generation, or model calls. `--no-checks` is accepted but
redundant. `--regenerate-descriptions` conflicts with `--minimal`. Graphite `--force`
is omitted by default; the Flow CLI's explicit `--force` retains its existing opt-in
meaning.

This flag stages the decided cheap-submit engine without changing default
`ns flow submit`. Moving the default and implementing `ns flow ship` remain open under
the Prod Submit Objective; no live publication claim is implied by this documentation.

## Pre-submit checks

Before ordinary `ns flow submit` checkpoints and submits the stack, it runs the repository's
**pre-submit checks**: commands installed at the `flow.submit.pre` extension point in
the repository-root `ns.toml`:

```toml
[points]
"flow.submit.pre" = ["just"]
```

Execution semantics:

- Each entry is whitespace-split into an argv and executed directly—no shell. Wrap
  pipes or conditionals in a script or `just` recipe.
- Commands run sequentially; the first failure stops the checks and aborts the submit
  before any state changes.
- With no installed commands, the checks pass trivially.
- `--no-checks` skips them. This is an execution control for emergencies, not
  configuration.

Inspect installed checks through the generic point catalog:

```sh
ns extension points
ns extension point flow.submit.pre
```

### Failure marker (harness contract)

When a pre-submit check fails, Flow returns a deterministic failure whose message
begins with the exact marker `NS_FLOW_SUBMIT_CHECK_FAILURE`. The marker string is
exported from `@nseng-ai/flow/api` as `FLOW_SUBMIT_CHECK_FAILURE_MARKER` and is part
of Flow's public contract.

The failing check's exit code follows Clinkr's coarse process-exit contract. Check exit
`1` produces a negative process exit `1`, whose exact first human stderr line is the
raw marker. Every other nonzero check exit produces a failure process exit `2`;
Clinkr prefixes that human-rendered failure, making its exact first stderr line:

```text
error: NS_FLOW_SUBMIT_CHECK_FAILURE
```

Harnesses and tooling should match the complete line for either Clinkr outcome—the raw
marker for a negative result or `error:` followed by the marker for a failure result—
never the surrounding failure prose. The original mapped check code remains available
as structured failure data in `data.exitCode`.

## Pre-submit check recovery

When ordinary `ns flow submit`'s pre-submit checks fail under Pi, Flow sends the agent a
**recovery prompt** so it can fix the root cause and rerun instead of stopping at a
wall of test output. Recovery fires only for `ns flow submit` pre-check failures,
detected through the failure marker above.

The prompt content comes from the `flow.submit.pre.recovery` prompt point:

- **Default:** a generic built-in prompt tells the agent to diagnose the failure, fix
  its root cause, never bypass the checks, rerun the failing check command to confirm
  it is green, and then rerun `ns flow submit`.
- **Override:** install repository-specific guidance conventionally at
  `.ns/prompts/flow.submit.pre.recovery.md` or explicitly in `ns.toml`:

  ```toml
  [points]
  "flow.submit.pre.recovery" = "docs/prompts/submit-check-recovery.md"
  ```

  A typical override points the agent at the repository's fix-it skill or runbook.

The recovery message includes the failed command, working directory, exit code, and
the tail of the check's output. Recovery never runs commands itself; it only instructs
the agent.

## Customizing Flow

All customization goes through extension points. See the
[points guide](../../../../docs/guides/points.md) for point mechanics, conventional
`.ns/prompts/` paths, and resolution precedence. Use `ns extension points` to inspect
the active catalog.

| Point                        | Kind   | What it customizes                                                     |
| ---------------------------- | ------ | ---------------------------------------------------------------------- |
| `flow.submit.pre`            | hook   | Commands run as pre-submit checks.                                     |
| `flow.submit.pre.recovery`   | prompt | Agent guidance after a pre-submit check failure.                       |
| `flow.submit.pr-description` | prompt | PR title and description generation during submit and `regenerate-pr`. |
