---
name: project-setup
disable-model-invocation: true
description: "Bootstrap and scaffold new projects and their tooling: create a Bun-centric TypeScript project or set up dprint formatting and its GitHub Actions CI. Use when the user wants to scaffold a repo, initialize project structure, or add one of these one-shot tooling setups to a project."
allowed-tools:
  - "Bash(bun *)"
  - "Bash(bunx *)"
  - "Bash(mkdir *)"
  - "Bash(dprint *)"
  - "Bash(which dprint)"
  - "Bash(brew install dprint)"
  - "Bash(cargo install dprint)"
  - "Bash(ls *)"
  - "Bash(git remote *)"
  - "Bash(git branch *)"
  - "Bash(git symbolic-ref *)"
---

# project-setup

Route one-shot project bootstrap and tooling setup work to the internal playbooks
below. Read the selected reference directly and follow it as the active
playbook. Python-family scaffolding (package/`-dev` CLI creation, Python CI, PyPI
publishing) lives in the `nseng-ai/ns-python` repo, not here.

## Routes

| Request                         | Playbook                                                                       | Scope contract                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a Bun TypeScript project | [Create a Bun TypeScript project](references/create-bun-typescript-project.md) | Scaffold `package.json` with no build step, strict ESM `tsconfig.json`, oxlint + oxfmt via ultracite, `bun test`, `bunfig.toml`, source files, and tests. |
| Add local dprint setup          | [Set up dprint](references/setup-dprint.md)                                    | Configure Markdown and TOML formatting plus build-system check/fix integration. Does not add GitHub CI.                                                   |
| Add dprint GitHub Actions CI    | [Set up dprint GitHub Actions CI](references/setup-dprint-gh-ci.md)            | Add a workflow that runs `dprint check` on pushes and PRs. Requires `dprint.json` or `.dprint.json` first.                                                |

## Routing and dependency order

- Match the request to the narrowest route and read its linked playbook before
  changing files.
- For a Bun scaffold, preserve the playbook's git-repository and Bun
  preconditions, collect all required project information, use every applicable
  template under `templates/create-bun-typescript-project/`, and validate in the
  documented order.
- For dprint local setup, preserve existing configuration values and perform
  only the documented additive operations. Use `assets/dprint-default.json` as
  the default configuration source and
  `references/dprint-plugin-catalog.md` for plugin rationale.
- For dprint CI, require both an existing dprint configuration and a GitHub
  remote, detect or ask for the default branch, and do not overwrite an existing
  workflow without confirmation. Use `assets/dprint-ci.yml` as the template.
- When the request includes local dprint setup and CI, follow
  `references/setup-dprint.md` first, then
  `references/setup-dprint-gh-ci.md`. Never let the CI route create the local
  dprint configuration.

## Boundary

This family is for one-shot project **bootstrap and scaffold** work: standing a
new project up, or adding a tooling setup to a project once. It is not for
day-to-day operation of the tools involved—routine dprint runs, ordinary CI
edits, or other ongoing workflows.
