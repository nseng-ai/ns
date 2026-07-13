# flow

Graphite-backed branch, submit, and land workflows for the `ns` CLI.

flow owns the everyday loop of stacked-PR development: checkpoint outstanding work,
turn it into Graphite branches, submit stacks with generated PR descriptions and
repo-defined pre-submit checks, and land finished work into trunk. It is an ns
extension: its commands appear under `ns flow ...`, and consuming repositories
customize its behavior through [extension points](../../../docs/guides/points.md) —
never by forking flow.

## Requirements

- A git repository managed with [Graphite](https://graphite.dev) (`gt`). flow is
  Graphite-native by design; it does not abstract the stacking tool.
- GitHub as the PR backend.
- The `ns` CLI with the flow extension enabled.
- The `gt` and `gh` CLIs available on `PATH`; commands that read or mutate pull
  requests require an authenticated GitHub session.
- A configured Graphite trunk that `gt trunk --no-interactive` can resolve.
  Checkpoint safety fails closed when that lookup fails, including on clean
  worktrees and checkpoint dry runs.
- For `pull-trunk`, the local configured-trunk branch must have a Git upstream.
  flow uses that upstream's exact remote and remote ref; it does not assume
  `origin` or a same-named remote branch.

## Commands

| Command                        | What it does                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `ns flow changes`              | Summarize outstanding worktree changes without committing.                                     |
| `ns flow cp`                   | Create a checkpoint commit for the current diff.                                               |
| `ns flow autobranch`           | Create a Graphite branch from dirty worktree changes.                                          |
| `ns flow branch-latest-commit` | Move the latest eligible commit to a new Graphite child branch.                                |
| `ns flow autoslot`             | Create a Graphite branch from current work, then move it into a managed slot worktree.         |
| `ns flow submit`               | Run pre-submit checks, checkpoint outstanding changes, then submit the current Graphite stack. |
| `ns flow regenerate-pr`        | Regenerate the current branch PR title and description.                                        |
| `ns flow push`                 | Push the current branch.                                                                       |
| `ns flow land`                 | Land the current PR or Graphite stack into trunk.                                              |
| `ns flow pull-trunk`           | Refresh the configured Graphite trunk from its configured Git upstream.                        |
| `ns flow squash-stack`         | Squash every branch in the current Graphite stack to one commit, then restore the tip branch.  |

Every command is also available in the Pi harness as `/ns:flow:<command>`, delegating
to the CLI. Pi is optional; the CLI commands do not require the Pi host.

### Command-scoped integrations

- `cp` and submit's checkpoint step compare the current branch with Graphite's
  configured trunk. If Graphite cannot resolve that identity, they stop before
  checkpoint-message generation or Git mutation; branch names such as `main`
  and `master` receive no special treatment unless one is the configured trunk.
- `pull-trunk` inspects the configured trunk's Git upstream before worktrees and
  refresh mutation. A missing or unreadable upstream is a non-mutating refusal;
  flow never creates or rewrites upstream configuration automatically.
- `autoslot` composes the ns Slots capability to move the new branch into a
  managed slot. Other branch and submit commands do not require using managed
  slots. When `land` runs from or encounters a managed-slot worktree, it can
  perform targeted slot cleanup; ordinary worktrees remain ordinary Git
  worktrees.
- `land` uses GitHub squash merge and requires `gh` authentication with permission
  to merge the target PRs. The repository must allow squash merges. Other merge
  strategies are not part of the current land contract.

## Model-backed workflows

The ns runtime supplies Flow's text-generation service; Flow does not configure a
provider client of its own. The selected provider/model must therefore be available
to the ns runtime. Model-backed commands select model refs with these environment
variables:

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

Prompt content is configured separately from model identity through the prompt
points documented below.

## Pre-submit checks

Before `ns flow submit` checkpoints and submits the stack, it runs your repository's
**pre-submit checks**: commands installed at the `flow.submit.pre` extension point in
the repo-root `ns.toml`:

```toml
[points]
"flow.submit.pre" = ["just"]
```

Execution semantics:

- Each entry is whitespace-split into an argv and executed directly — no shell. Wrap
  pipes or conditionals in a script or `just` recipe.
- Commands run sequentially; the first failure stops the checks and aborts the submit
  before any state changes.
- With no installed commands, the checks pass trivially.
- `--no-checks` skips them (an execution control for emergencies, not configuration).

To inspect which checks are installed, use the generic point catalog:

```sh
ns extension points                      # all defined points and installations
ns extension point flow.submit.pre       # just the pre-submit checks
```

### Failure marker (harness contract)

When a pre-submit check fails, flow returns a deterministic failure whose message begins
with the exact marker `NS_FLOW_SUBMIT_CHECK_FAILURE`. The marker string is exported from
`@nseng-ai/flow/api` as `FLOW_SUBMIT_CHECK_FAILURE_MARKER` and is part of flow's public
contract.

The failing check's exit code follows Clinkr's coarse process-exit contract. Check exit
`1` produces a negative process exit `1`, whose exact first human stderr line is the raw
marker. Every other nonzero check exit produces a failure process exit `2`; Clinkr prefixes
that human-rendered failure, making its exact first stderr line:

```text
error: NS_FLOW_SUBMIT_CHECK_FAILURE
```

Harnesses and tooling should match the complete line for either Clinkr outcome — the raw
marker for a negative result or `error:` followed by the marker for a failure result —
never the surrounding failure prose. The original mapped check code remains available as
structured failure data in `data.exitCode`.

## Pre-submit check recovery

When `ns flow submit`'s pre-submit checks fail under an agent harness (Pi), flow sends
the agent a **recovery prompt** so it can fix the root cause and rerun — instead of
stopping at a wall of test output. Recovery fires only for `ns flow submit` pre-check
failures, detected via the failure marker above.

The prompt content is the `flow.submit.pre.recovery` extension point (a prompt point):

- **Default**: a generic built-in prompt — diagnose from the failure output, fix the
  root cause, never bypass the checks, rerun the failing check command to confirm it
  is green, then rerun `ns flow submit` to complete the submit.
- **Override**: install repo-specific guidance either conventionally at
  `.ns/prompts/flow.submit.pre.recovery.md` or explicitly in `ns.toml`:

  ```toml
  [points]
  "flow.submit.pre.recovery" = "docs/prompts/submit-check-recovery.md"
  ```

  A typical override points the agent at the repository's fix-it skill or runbook.

The recovery message includes the failed command, working directory, exit code, and
the tail of the check's output. Recovery never runs commands itself; it only instructs
the agent.

## Customizing flow

All customization goes through extension points — see the
[points guide](../../../docs/guides/points.md) for mechanics (`ns extension points`
to inspect, `.ns/prompts/` conventional paths, resolution precedence).

| Point                        | Kind   | What it customizes                                                    |
| ---------------------------- | ------ | --------------------------------------------------------------------- |
| `flow.submit.pre`            | hook   | Commands the pre-submit checks run.                                   |
| `flow.submit.pre.recovery`   | prompt | Agent guidance after a pre-submit check failure.                      |
| `flow.submit.pr-description` | prompt | The prompt used to generate PR titles and descriptions during submit. |
