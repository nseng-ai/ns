---
name: project-setup
disable-model-invocation: true
description: "Bootstrap and scaffold new projects and their tooling: create a Bun-centric TypeScript project; set up dprint formatting, GitHub Actions CI for dprint, or agentic Graphite (gt). Use when the user wants to scaffold a repo, initialize project structure, or add one of these one-shot tooling setups to a project."
---

# project-setup

User-invoked router for the one-shot project bootstrap and scaffold family —
summon it by name. The family covers two kinds of one-shot work — scaffolding a
new project, and adding a single piece of tooling to an existing one. The leaf
skills below are **unlisted**, so they are reached through this router (or
`areg skill find`). Match the user's request to a route, then read that leaf's
`SKILL.md` directly as the active playbook.

Python-family scaffolding (package/`-dev` CLI creation, Python CI, PyPI publishing)
lives in the `nseng-ai/ns-python` repo, not here.

## Routes

| Route                           | Scope contract                                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create-bun-typescript-project` | Scaffold a Bun-centric TypeScript project: package.json (no build step), strict ESM tsconfig, oxlint + oxfmt via ultracite, bun test, bunfig.toml. |
| `setup-dprint`                  | Set up dprint formatting for Markdown and TOML locally, with build-system integration. Does not add GitHub CI — use `setup-dprint-gh-ci` for that. |
| `setup-dprint-gh-ci`            | Add a GitHub Actions workflow that runs `dprint check` on pushes and PRs. Requires dprint.json to already exist (run `setup-dprint` first).        |

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
