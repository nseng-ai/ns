# Skill docs and templates reconciled with repo conventions

## Summary

The migrated skill docs/template remediation slice is complete in the current working-tree evidence. The edited slice was limited to the planned local skills and directly contradictory lockfile guidance.

`create-python-dev-cli` now scaffolds its Click group from the canonical `src/<DEV_PACKAGE_NAME>/cli/main.py` module. Its package `cli/__init__.py` is empty, generated imports use `from <DEV_PACKAGE_NAME>.cli.main import cli`, the project script points directly at `<DEV_PACKAGE_NAME>.cli.main:cli`, and tests no longer import the CLI through a package init file or create `tests/__init__.py`.

`python-fake-driven-test-layout` no longer recommends gateway-domain package re-exports. Gateway domain `__init__.py` files, when present, are empty/docstring-only, and callers import from canonical `gateway.py`, `real.py`, or `fake.py` modules.

`setup-python-gh-ci` now uses one workflow contract: `.github/workflows/ci.yml` with `name: ci`. The generic workflow template no longer hardcodes `main`; the skill detects and confirms the repository default branch, substitutes `<DEFAULT_BRANCH>`, and uses local `origin/HEAD` metadata as the primary non-network discovery path.

`create-python-package` no longer scaffolds `tests/__init__.py`, while preserving the source package `__init__.py`. The Step 6-8 nested README and bash fences were manually balanced after editing.

`skill-management` lockfile docs now say committed local lockfile hashes are generated metadata that must be real 64-character lowercase hex values, not placeholders such as `PENDING_REGEN`. `skills-lock.json` was refreshed only for the edited local skills and sources were normalized back to `skills/<name>`.

Evidence basis: committed branch diff on `reconcile-skill-docs-templates-conventions` against Graphite parent `typed-skills-lockfile-validation`, via commit `1cdb6f69` (`[cp] Align skill docs with repo conventions`). PR #908 corroborates the same file set and completion evidence.

Verification: `just dprint-check`, `uv run areg check --path .`, and `uv run pytest tests/integration/test_skills_management.py -q` passed.

## Objective Impact

- Roadmap Work item #5 moved from `[ ]` to `[x]`: the named migrated skill docs/templates and directly contradictory lockfile docs now align with repo import, pytest layout, CI default-branch, generated hash, and Markdown fence expectations.
- Completion criterion "Skill templates/docs no longer contradict repo import rules or generated CI expectations" is now satisfied for the scoped migrated-skill slice.
- The final strict-review rerun remains open as Work item #6.

## Follow-Ups

- Re-run the strict review against the remediated branch and capture any remaining intentional deferrals under Work item #6.
