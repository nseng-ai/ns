# asdl-pr-address

CLI operations that back the `pr-address` skill in any supported harness -
fetch PR feedback from GitHub and execute resolution mutations.

## Get started

Install the skill into your project:

For Codex:

```bash
npx skills add dagster-io/asdl@pr-address --agent codex -y
```

For Claude Code:

```bash
npx skills add dagster-io/asdl@pr-address --agent claude-code -y
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

The invocation surface is harness-specific. Installed/prod skill use still
falls back to the pinned Python package via `uvx`, so no local asdl clone is
required. Local checkouts now route through the TypeScript scaffold first while
unported operations delegate to this package for compatibility.

## CLI surface

This package currently provides the legacy compatibility implementation for:

- Standalone CLI fallback: `pr-address` console script (declared in `pyproject.toml`).
- ASDL plugin: `asdl pr-address …` (via the `asdl.plugins` entry point).
- Operation groups:
  - `pr-address exec ...` for normal CLI usage; pass `--format json` for
    machine-readable output

Run `pr-address exec --help` for the full operation list.

## Developer docs

For wrapper dispatch details, pin management, local development, and the full
operation inventory, see:

- `packages/asdl-pr-address/docs/development.md`
