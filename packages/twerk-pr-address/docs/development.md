# twerk-pr-address development notes

Developer-facing implementation details for the `twerk-pr-address` package.

## Runtime dispatch

The installed skill ships a wrapper at `<skill-dir>/scripts/pr-address-run`
that selects how `pr-address` runs. `<skill-dir>` is the directory containing
the installed `SKILL.md`; common locations are `skills/pr-address/` in a repo
checkout and `.agents/skills/pr-address/` in an installed skill mirror.

- inside a twerk checkout (auto-detected via
  `packages/twerk-pr-address/pyproject.toml`) →
  `uv run --project <repo> pr-address`
- otherwise → `uvx` installs a pinned `twerk-pr-address` release from PyPI,
  with `twerk-core` resolved automatically as a declared dependency

uv caches the resolved PyPI wheel, so the first call downloads and subsequent
calls are near-instant.

Override with `TWERK_PR_ADDRESS_MODE=local` or `TWERK_PR_ADDRESS_MODE=prod`
when you want to force a specific path.

## Updating the pinned version

To roll out new `twerk-pr-address` code to skill consumers, first publish the
new release to PyPI (outside the scope of this skill), then bump
`TWERK_VERSION` in the wrapper and commit the change. From a twerk checkout:

```bash
sed -i '' 's/^TWERK_VERSION=.*/TWERK_VERSION="0.2.0"/' \
  skills/pr-address/scripts/pr-address-run
```

Then commit and push. Skill consumers pick up the new version the next time
they invoke the `pr-address` skill.

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

## Operation inventory

The current operation set, by category:

- **Feedback fetch / composite**: `get-feedback`, `prepare-run`,
  `get-pr-for-branch`, `get-reviews`, `get-review-comments`,
  `get-discussion-comments`
- **Thread mutations**: `resolve-thread`, `resolve-thread-with-reply`,
  `unresolve-thread`, `add-review-thread-reply`
- **Replies / comments / reactions**: `reply-to-review`,
  `reply-to-discussion`, `add-issue-comment`, `add-reaction`

## Relationship to the `pr-address` skill

- The skill (`skills/pr-address/SKILL.md`) provides LLM-driven
  classification, batching, and orchestration.
- This package provides deterministic, testable operations that the skill
  invokes.
- The skill never pushes; this package never pushes.

## See also

- Skill source: `skills/pr-address/SKILL.md`
- clinkr (the dual-mode CLI framework used by every operation):
  `packages/twerk-core/src/twerk_core/clinkr/README.md`
