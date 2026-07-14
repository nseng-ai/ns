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
| `ns flow pull-trunk`           | Pull the configured Graphite trunk branch without running full `gt sync`.                      |

Every command is also available in the Pi harness as `/ns:flow:<command>`, delegating
to the CLI.

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

When a pre-submit check fails, `ns flow submit` exits with the failing command's exit
code and a deterministic failure report on stderr that begins with a **stable marker
line**. The marker string is exported from the flow package as
`FLOW_SUBMIT_CHECK_FAILURE_MARKER` and is part of flow's public contract: harnesses
and tooling should key off the marker, never the surrounding prose, to detect
pre-submit check failures.

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

## Open questions

- What must an adopting repository provide for LLM-backed behavior (PR-description
  generation, submit-failure interpretation) — is the model seam injectable today, and
  what should this README promise?
- Do `autobranch`, `autoslot`, `land`, and `pull-trunk` carry undocumented assumptions
  about this repository's conventions (slots, trunk naming, remotes)? Pending the
  repo-specificity audit.
