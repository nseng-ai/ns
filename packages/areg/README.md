# areg

AI-native project scaffolding and skill management helpers.

## The idea

The new way to bootstrap projects is **skills**. Instead of language-specific scaffolding tools, you start with a skills-ready project and compose what you need. Skills are universal -- they work across any project, any language, and any AI coding agent.

## Quick start

From this workspace:

```bash
uv run areg create-project my-project
```

Once published, the same CLI can be run as a tool:

```bash
uvx areg create-project my-project
```

Creates a new `my-project/` directory in the current working directory, pre-wired with skill infrastructure. Default skills are installed from `dagster-io/asdl-tools`:

- **ns-install** -- install local project skill infrastructure
- **ns-skill-management** -- manage persistent skills with `npx skills`
- **ns-skillx** -- invoke any skill ephemerally from a GitHub repo, like `npx` for skills
- **nsx** -- shorthand for fetching asdl `ns-*` skills from the default source

## Example: creating a Python project

From your new project, invoke `skillx` to scaffold a Python package:

In **Claude Code**:

```text
/ns-skillx dagster-io/asdl-tools --skill ns-create-pypackage-project
```

In **Codex**:

```text
$ns-skillx dagster-io/asdl-tools --skill ns-create-pypackage-project
```

For lower-level agent workflows, `areg` also exposes hidden exec helpers:

```bash
uv run areg exec skillx parse "dagster-io/asdl-tools --skill ns-create-pypackage-project"
uv run areg exec skillx list --repo dagster-io/asdl-tools
uv run areg exec skillx fetch --repo dagster-io/asdl-tools --skill ns-create-pypackage-project
```

The skill is fetched, executed, and discarded -- your project gets the Python scaffolding without permanently installing anything.

## What you get

After `create-project`, your project has:

```text
my-project/
├── .agents/skills/         # installed skills (universal agent directory)
├── .claude/                # Claude Code config + skill symlinks
├── AGENTS.md               # project instructions for agents
├── CLAUDE.md               # project instructions
├── areg.json               # agents this project targets
├── skills-lock.json        # installed skill metadata
└── .gitignore
```

## Development

```bash
uv sync
just check
```
