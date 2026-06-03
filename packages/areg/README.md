# areg

Initialize existing Git projects for agent-resource and skill workflows.

## The idea

Create or scaffold projects with the tool or skill appropriate to the project. Then run `areg init` at the Git repository root to install the baseline skill infrastructure agents need to discover and manage skills.

`areg init` does not replace `npx skills add`. It bootstraps a repo so agents can discover and use skills. Use `npx skills` to install more persistent skills after initialization.

## Quick start

Create or scaffold a project first, however you prefer, then initialize it:

```bash
cd my-project
uv run areg init
```

Once published, the same CLI can be run as a tool:

```bash
cd my-project
uvx areg init
```

To initialize a different existing Git root:

```bash
uv run areg init path/to/repo
```

## What init installs

`areg init` installs the default bootstrap skills from `dagster-io/asdl-tools`:

- **skill-management** -- manage persistent skills with `npx skills`
- **skillx** -- invoke any skill ephemerally from a GitHub repo, like `npx` for skills

It also records the target agents in `asdl.toml` under `[areg].agents`. By default, skills are installed for `codex` and `claude-code`; use repeatable `--agent` flags to select different targets.

## Installing more persistent skills

Use `npx skills add` after initialization:

```bash
npx skills add dagster-io/asdl-tools --skill pytest --agent codex claude-code -y
```

Use the installed `skill-management` skill for add, update, remove, list, and publish workflows.
`areg update-skills` reads agents from `asdl.toml` first, then falls back to legacy `areg.json` when `[areg].agents` is not configured.

## Running transient skills

Use the installed `skillx` skill when you want to run a skill from GitHub without permanently installing it. For lower-level agent workflows, `areg` exposes hidden exec helpers:

```bash
uv run areg exec skillx parse "dagster-io/asdl-tools --skill create-python-package"
uv run areg exec skillx list --repo dagster-io/asdl-tools
uv run areg exec skillx fetch --repo dagster-io/asdl-tools --skill create-python-package
```

The skill is fetched, executed, and discarded.

## What you get

After `areg init`, your existing Git project has:

```text
my-project/
├── .agents/skills/         # installed skills (universal agent directory)
├── .claude/                # Claude Code config + skill symlinks
├── AGENTS.md               # project instructions for agents
├── CLAUDE.md               # Claude-specific project instructions
├── asdl.toml               # asdl project config, including target agents
└── skills-lock.json        # installed skill metadata
```

`areg init` does not create project language files, package files, or `.gitignore`.

## Development

```bash
uv sync
just check
```
