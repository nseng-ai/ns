# twerk-pr-address

CLI operations that back the `pr-address` skill in any supported harness -
fetch PR feedback from GitHub and execute resolution mutations.

## Get started

Install the skill into your project:

```bash
npx skills add dagster-io/twerk@pr-address --agent codex claude-code -y
```

Requires:

- `uv` on `PATH` (see [uv install](https://docs.astral.sh/uv/getting-started/installation/));
  the canonical one-liner is:
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
- `gh` authenticated (`gh auth status`).

Then, in your harness of choice, explicitly invoke the `pr-address` skill on a
branch with an open PR. The invocation surface is harness-specific, but the
skill dispatches to `uvx` under the hood, so no local twerk clone is required.

## How it works

The installed skill ships a wrapper at `<skill-dir>/scripts/pr-address-run`
that selects how `pr-address` runs. `<skill-dir>` is the directory containing
the installed `SKILL.md`; common locations are `skills/pr-address/` in a repo
checkout and `.agents/skills/pr-address/` in an installed skill mirror.

- inside a twerk checkout (auto-detected via
  `packages/twerk-pr-address/pyproject.toml`) → `uv run --project <repo> pr-address`
- otherwise → `uvx` builds `twerk-pr-address` from a pinned commit on
  GitHub, with `twerk-core` injected via `--with` from the same SHA. See
  the wrapper source for the exact invocation.

The pinned SHA is a 40-char commit hash, which uv treats as immutable and
caches aggressively — first call builds, subsequent calls are near-instant.

Override with `TWERK_PR_ADDRESS_MODE=local` or `TWERK_PR_ADDRESS_MODE=prod`
when you want to force a specific path.

## Updating the pinned commit

To roll out new `twerk-pr-address` code to skill consumers, bump
`TWERK_PIN` in the wrapper to the desired commit on `master` and commit
the change. From a twerk checkout:

```bash
sha="$(git rev-parse origin/master)"
sed -i '' "s/^TWERK_PIN=.*/TWERK_PIN=\"$sha\"/" skills/pr-address/scripts/pr-address-run
```

Then commit and push. Skill consumers pick up the new pin the next time they
invoke the `pr-address` skill.

## Local development

For working on this package itself:

```bash
git clone https://github.com/dagster-io/twerk
cd twerk
uv sync
```

The wrapper auto-detects the checkout, so editing
`packages/twerk-pr-address/` and re-invoking the skill picks up changes
immediately. To run tests for just this package:

```bash
uv run pytest packages/twerk-pr-address
```

Or run the full suite from the repo root with `just`.

## What it provides

- Standalone CLI: `pr-address` console script (declared in `pyproject.toml`).
- Twerk plugin: `twerk pr-address …` (via the `twerk.plugins` entry point).
- All operations live under the `exec` subgroup. Run
  `pr-address exec --help` for the full list. Each operation also has a
  JSON-over-stdin variant under `pr-address exec json …`.

The current operation set, by category:

- **Feedback fetch / composite**: `get-feedback`, `prepare-run`,
  `get-pr-for-branch`, `get-reviews`, `get-review-comments`,
  `get-discussion-comments`
- **Thread mutations**: `resolve-thread`, `resolve-thread-with-reply`,
  `unresolve-thread`, `add-review-thread-reply`
- **Replies / comments / reactions**: `reply-to-review`,
  `reply-to-discussion`, `add-issue-comment`, `add-reaction`

## Relationship to the `pr-address` skill

- The skill (`skills/pr-address/SKILL.md`) provides the
  LLM-driven classification, batching, and code-change orchestration.
- This package provides the deterministic, testable operations the
  skill invokes.
- The skill never pushes; this package never pushes.

## See also

- Skill source: `skills/pr-address/SKILL.md`
- clinkr (the dual-mode CLI framework used by every operation):
  `packages/twerk-core/src/twerk_core/clinkr/README.md`
