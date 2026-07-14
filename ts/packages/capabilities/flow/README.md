# @nseng-ai/flow

Graphite-backed branch, submit, and land workflows for the `ns` CLI.

Flow owns the everyday loop of stacked-PR development: summarize and checkpoint
outstanding work, turn it into Graphite branches, submit stacks with generated PR
descriptions, and land finished work into trunk. Its commands appear under
`ns flow ...`, and each is mirrored in the Pi harness as `/ns:flow:<command>`.

## Commands

Each command depends on a distinct slice of the underlying technology stack:

| Command                        | What it does                                                                           | git | Graphite (`gt`) | GitHub (`gh`) | slots | LLM |
| ------------------------------ | -------------------------------------------------------------------------------------- | :-: | :-------------: | :-----------: | :---: | :-: |
| `ns flow changes`              | Summarize outstanding worktree changes without committing.                             |  ✓  |                 |               |       |  ✓  |
| `ns flow cp`                   | Create a checkpoint commit for the current diff.                                       |  ✓  |        ✓        |               |       |  ✓  |
| `ns flow autobranch`           | Create a Graphite branch from dirty worktree changes.                                  |  ✓  |        ✓        |               |       |  ✓  |
| `ns flow branch-latest-commit` | Move the latest eligible commit to a new Graphite branch.                              |  ✓  |        ✓        |               |       |  ✓  |
| `ns flow autoslot`             | Create a Graphite branch from current work, then move it into a managed slot worktree. |  ✓  |        ✓        |               |   ✓   |  ✓  |
| `ns flow submit`               | Checkpoint pending changes, then submit the Graphite stack with `gt submit`.           |  ✓  |        ✓        |       ✓       |       |  ✓  |
| `ns flow regenerate-pr`        | Regenerate the PR title and ns-managed body region.                                    |  ✓  |                 |       ✓       |       |  ✓  |
| `ns flow push`                 | Push committed non-Graphite branch work with `git push`.                               |  ✓  |                 |               |       |     |
| `ns flow land`                 | Land the current PR or Graphite stack into trunk.                                      |  ✓  |        ✓        |       ✓       |   ✓   |     |
| `ns flow pull-trunk`           | Refresh the configured Graphite trunk from its configured Git upstream.                |  ✓  |        ✓        |               |       |     |
| `ns flow squash-stack`         | Squash every branch in the current Graphite stack to one commit.                       |  ✓  |        ✓        |               |       |     |

### What each column means

- **git** — plain `git` subprocess calls (status, commit, push, fetch, merge
  mechanics).
- **Graphite (`gt`)** — the [Graphite](https://graphite.dev) CLI for stack
  topology and mutation (`gt create`, `gt submit`, restack/maintenance). Flow is
  Graphite-native by design; it does not abstract the stacking tool.
- **GitHub (`gh`)** — the GitHub CLI for PR reads and edits (PR lookup, title
  and description updates, merge state).
- **slots** — ns managed worktree slots (`@nseng-ai/slots`): `autoslot` checks
  branches out into a slot; `land` cleans up managed slots that held landed
  branches.
- **LLM** — injected text generation: change summaries (`changes`), checkpoint
  commit messages (`cp`, `autobranch`, `autoslot`), branch-name slugs
  (`autobranch`, `branch-latest-commit`, `autoslot`), and PR titles/descriptions
  (`submit`, `regenerate-pr`).

### Additional dependencies

- Checkpoint safety in `ns flow cp` and submit's checkpoint step resolves the
  configured trunk with `gt trunk --no-interactive`. If Graphite cannot return a
  trunk, checkpointing stops before model generation, staging, or committing.
- `ns flow pull-trunk` requires the configured Graphite trunk's local Git branch
  to have an upstream. It refreshes from that upstream's exact remote and remote
  ref; it does not fall back to `origin` or a same-named remote branch.
- `ns flow submit` also runs repo-configured pre-submit hook commands installed
  at the `flow.submit.pre` extension point in the repo-root `ns.toml` (for
  example `just`); the first failing hook aborts the submit.
- The hidden agent-facing exec surface has one operation:
  `ns flow exec read-graphite-branch-metadata`, which reads Graphite's branch
  metadata database through a controlled `sqlite3` query.
