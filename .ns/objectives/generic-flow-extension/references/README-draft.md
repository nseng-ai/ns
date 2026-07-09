# flow

Graphite-backed branch, submit, and land workflows for the `ns` CLI.

flow owns the everyday loop of stacked-PR development: checkpoint outstanding work,
turn it into Graphite branches, submit stacks with generated PR descriptions, validate
before submitting, and land finished work into trunk. It is an ns extension: its
commands appear under `ns flow ...`, and consuming repositories customize its behavior
through [extension points](../../../docs/guides/points.md) — never by forking flow.

## Requirements

- A git repository managed with [Graphite](https://graphite.dev) (`gt`). flow is
  Graphite-native by design; it does not abstract the stacking tool.
- GitHub as the PR backend.
- The `ns` CLI with the flow extension enabled.

## Commands

| Command                        | What it does                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `ns flow changes`              | Summarize outstanding worktree changes without committing.                                                  |
| `ns flow cp`                   | Create a checkpoint commit for the current diff.                                                            |
| `ns flow autobranch`           | Create a Graphite branch from dirty worktree changes.                                                       |
| `ns flow branch-latest-commit` | Move the latest eligible commit to a new Graphite child branch.                                             |
| `ns flow autoslot`             | Create a Graphite branch from current work, then move it into a managed slot worktree.                      |
| `ns flow validate [gate]`      | Run a named validation gate; with no argument, list defined gates and their installed commands.             |
| `ns flow submit`               | Run the pre-submit validation gate, checkpoint outstanding changes, then submit the current Graphite stack. |
| `ns flow regenerate-pr`        | Regenerate the current branch PR title and description.                                                     |
| `ns flow push`                 | Push the current branch.                                                                                    |
| `ns flow land`                 | Land the current PR or Graphite stack into trunk.                                                           |
| `ns flow pull-trunk`           | Pull the configured Graphite trunk branch without running full `gt sync`.                                   |

Every command is also available in the Pi harness as `/ns:flow:<command>`, delegating
to the CLI.

## Validation gates

A **validation gate** is a named checkpoint where flow runs your repository's checks.
flow defines the gate names; your repository installs the commands to run at them in
the repo-root `ns.toml`:

```toml
[points]
"flow.validation.pre-submit" = ["just"]
```

Defined gates:

| Gate         | Point id                     | When it runs                                               |
| ------------ | ---------------------------- | ---------------------------------------------------------- |
| `pre-submit` | `flow.validation.pre-submit` | Before `ns flow submit` checkpoints and submits the stack. |

Gate execution semantics:

- Each entry is whitespace-split into an argv and executed directly — no shell. Wrap
  pipes or conditionals in a script or `just` recipe.
- Commands run sequentially; the first failure stops the gate and aborts the
  surrounding workflow before any state changes.
- A gate with no installed commands passes trivially.

Run a gate on demand:

```sh
ns flow validate pre-submit   # run the gate now
ns flow validate              # list gates and their installed commands
```

`ns flow submit` runs the `pre-submit` gate automatically; `--no-hooks` skips it (an
execution control for emergencies, not configuration). Gate failures exit with the
failing command's exit code and a deterministic report that begins with a stable
marker line — harnesses key off the marker, not the prose.

The gate set is fixed and versioned with flow; additional gates (for example `test` or
`local-ci`) are added to flow when proven needed, and appear in `ns flow validate`'s
listing and `ns extension points` automatically.

## Validation-failure recovery

When a validation gate fails under an agent harness (Pi), flow sends the agent a
**recovery prompt** so it can fix the root cause and rerun — instead of stopping at a
wall of test output.

The prompt content is the `flow.validation.recovery` extension point (a prompt point):

- **Default**: a generic built-in prompt — diagnose from the failure output, fix the
  root cause, never bypass the gate, rerun the failed command.
- **Override**: install repo-specific guidance either conventionally at
  `.ns/prompts/flow.validation.recovery.md` or explicitly in `ns.toml`:

  ```toml
  [points]
  "flow.validation.recovery" = "docs/prompts/validation-recovery.md"
  ```

  A typical override points the agent at the repository's fix-it skill or runbook.

The recovery message includes the failed command, working directory, exit code, and the
tail of the gate's output. It fires for any flow command whose failure carries the
validation marker (`submit` and `validate` alike). Recovery never runs commands itself;
it only instructs the agent.

## Customizing flow

All customization goes through extension points — see the
[points guide](../../../docs/guides/points.md) for mechanics (`ns extension points`
to inspect, `.ns/prompts/` conventional paths, resolution precedence).

| Point                        | Kind   | What it customizes                                                    |
| ---------------------------- | ------ | --------------------------------------------------------------------- |
| `flow.validation.pre-submit` | hook   | Commands the pre-submit gate runs.                                    |
| `flow.validation.recovery`   | prompt | Agent guidance after a gate failure.                                  |
| `flow.submit.pr-description` | prompt | The prompt used to generate PR titles and descriptions during submit. |

## Open questions

- What must an adopting repository provide for LLM-backed behavior (PR-description
  generation, submit-failure interpretation) — is the model seam injectable today, and
  what should this README promise?
- Do `autobranch`, `autoslot`, `land`, and `pull-trunk` carry undocumented assumptions
  about this repository's conventions (slots, trunk naming, remotes)? Pending the
  repo-specificity audit.
- Should the `validate` no-arg listing show per-gate installed commands (current
  contract) or names only?
