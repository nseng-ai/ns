# twerk-pr-address

CLI operations that back the `pr-address` skill in any supported harness -
fetch PR feedback from GitHub and execute resolution mutations.

## Get started

Install the skill into your project:

For Codex:

```bash
npx skills add dagster-io/twerk@pr-address --agent codex -y
```

For Claude Code:

```bash
npx skills add dagster-io/twerk@pr-address --agent claude-code -y
```

For Pi (OpenClaw):

```bash
npx skills add dagster-io/twerk@pr-address --agent openclaw -y
```

Requires:

- `uv` on `PATH` (see [uv install](https://docs.astral.sh/uv/getting-started/installation/));
  the canonical one-liner is:
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
- `gh` on `PATH` (see [gh install](https://cli.github.com/manual/installation)).
- `gh` authenticated (`gh auth status`, then `gh auth login` if needed).

## Typical workflow

1. Create or update your branch with the code changes you want reviewed.
2. Open (or update) a pull request for that branch.
3. Wait for review feedback (inline threads, review summaries, discussion comments).
4. In your harness, explicitly invoke the `pr-address` skill.
5. Review the local commits it creates, then push manually when ready.

The invocation surface is harness-specific, but the skill dispatches to `uvx`
under the hood, so no local twerk clone is required.

## CLI surface

This package provides:

- Standalone CLI: `pr-address` console script (declared in `pyproject.toml`).
- Twerk plugin: `twerk pr-address …` (via the `twerk.plugins` entry point).
- Operation groups:
  - `pr-address exec ...` for normal CLI usage
  - `pr-address exec json ...` for JSON-over-stdin automation

Run `pr-address exec --help` for the full operation list.

## Developer docs

For wrapper dispatch details, pin management, local development, and the full
operation inventory, see:

- `packages/twerk-pr-address/docs/development.md`
