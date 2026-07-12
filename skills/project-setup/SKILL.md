---
name: project-setup
disable-model-invocation: true
description: "Bootstrap and scaffold new projects and their tooling: create a Python package, a Python `-dev` CLI, or a Bun-centric TypeScript project; set up dprint formatting, GitHub Actions CI for dprint or for Python (uv + just), PyPI publishing with uv, or agentic Graphite (gt). Use when the user wants to scaffold a repo, initialize project structure, or add one of these one-shot tooling setups to a project."
---

# project-setup

User-invoked router for the one-shot project bootstrap and scaffold family —
summon it by name. The leaf skills below are **unlisted**: they carry no harness
registration anywhere (no harness-injected description on Claude Code, Codex, or
Pi, and no `/skill` typeahead entry), so they are reached through this router (or
`areg skill find`). Match the user's request to a route, then read that leaf's
`SKILL.md` directly as the active playbook.

## Skill family

The family covers two kinds of one-shot work — scaffolding a new project, and
adding a single piece of tooling to an existing one:

- `create-python-package` — scaffold a new Python package.
- `create-python-dev-cli` — add a `-dev` CLI workspace package to an existing Python project.
- `create-bun-typescript-project` — scaffold a new Bun-centric TypeScript project.
- `setup-dprint` — add dprint formatting locally.
- `setup-dprint-gh-ci` — add dprint CI to an existing dprint setup.
- `setup-python-gh-ci` — add GitHub Actions CI for a Python project.
- `setup-pypi-publish` — add PyPI publishing with uv.
- `setup-graphite` — configure a repo for agentic Graphite (gt).

## Routes

| Route                           | Scope contract                                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create-python-package`         | Scaffold a well-structured Python package: pyproject.toml (uv + hatchling), src layout, ruff, ty, pytest + pytest-xdist, justfile, .gitignore.       |
| `create-python-dev-cli`         | Scaffold a `-dev` CLI workspace package (`packages/<project>-dev/`) with a click CLI, output routing, a starter command, and uv-workspace wiring.    |
| `create-bun-typescript-project` | Scaffold a Bun-centric TypeScript project: package.json (no build step), strict ESM tsconfig, oxlint + oxfmt via ultracite, bun test, bunfig.toml.   |
| `setup-dprint`                  | Set up dprint formatting for Markdown and TOML locally, with build-system integration. Does not add GitHub CI — use `setup-dprint-gh-ci` for that.   |
| `setup-dprint-gh-ci`            | Add a GitHub Actions workflow that runs `dprint check` on pushes and PRs. Requires dprint.json to already exist (run `setup-dprint` first).          |
| `setup-python-gh-ci`            | Generate a GitHub Actions CI workflow for Python projects using uv and just: lint, format-check, ty, and test with a Python version matrix.          |
| `setup-pypi-publish`            | Set up PyPI publishing using `uv build` and `uvx uv-publish`: auth, build/publish justfile recipes, and fixing uv publish auth problems.             |
| `setup-graphite`                | Configure a repo for agentic use of Graphite (gt): install the graphite skill and add a branching/PR convention to AGENTS.md. Assumes `gt init` ran. |

## Routing

- Match the user's request to one route above. If the intent spans several
  (e.g. "scaffold a Python package with CI and publishing"), run the scaffold
  route first, then the setup routes it depends on, in dependency order.
- Read the mapped `skills/<name>/SKILL.md` directly and follow it as the active
  playbook; the leaf is self-contained for its own happy path. If a leaf is not
  resolvable at that path, fall back to `areg skill find <name> --format json`
  and read the returned preferred `SKILL.md`.
- These leaves are unlisted, so they do not appear in any harness typeahead
  (Claude Code `/name`, Codex `$name`, Pi `/skill:name`) and cannot be invoked
  by name — always enter them through this router. `areg skill list` still
  shows them, with kind `unlisted`.

## Boundary

This family is for one-shot project **bootstrap and scaffold** work: standing a
new project up, or adding a single tooling setup to a project once. It is not for
day-to-day operation of the tools involved — routine dprint runs, everyday
Graphite branch/PR workflow, ordinary CI edits, or repeat publishing — which have
their own ambient skills and CLIs. Route here only when the task is the initial
setup itself.
