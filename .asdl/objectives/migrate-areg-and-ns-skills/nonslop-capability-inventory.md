# Nonslop Capability Inventory

Seed inventory for `/Users/schrockn/code/nonslop`. This is a whole-repo capability catalog, not an `areg`-only list. Implementation must turn each `TBD` disposition into `migrate`, `rewrite`, `fold`, `retire`, or `ignore` with rationale before deletion readiness is claimed.

Discovery scope used for this seed: tracked files and bounded checkout inspection excluding `.git`, `.venv`, caches, `dist`, and `__pycache__` output. Local-only symlinked skills and empty/skeletal directories are listed because they are capabilities visible in the checkout even when not tracked as first-party source.

## Product and Package Surface

- `pyproject.toml` — Python package named `areg`, script entry point `areg = areg.cli:main`, package build metadata, dependency group, ruff/ty/pytest config. Disposition: TBD.
- `README.md` — public/product narrative for AI-native project scaffolding and `uvx areg create-project`. Disposition: TBD.
- `LICENSE` — MIT license for the source package. Disposition: TBD.
- `uv.lock` — locked package/dependency state. Disposition: TBD.
- `.gitignore`, `dprint.json`, `justfile` — repo development, formatting, build, publish, and cleanup surface. Disposition: TBD.

## `areg` Runtime Capabilities

- `src/areg/cli.py` — top-level Click CLI mounting `create-project`, `check`, `update-skills`, and hidden `exec` groups. Disposition: TBD.
- `src/areg/create_project.py` and `src/areg/_templates/*` — skills-ready project scaffolding: installs default skills, writes `areg.json`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`, and Claude settings. Disposition: TBD.
- `src/areg/check/*` — skill-layout checker: lockfile parsing, local vs GitHub skill structure checks, orphan checks, AGENTS/CLAUDE pairing checks, and SKILL.md frontmatter/description validation. Disposition: TBD.
- `src/areg/update_skills.py` — curated lockfile-preserving `npx skills add --skill ...` update workaround for upstream `npx skills update` behavior. Disposition: TBD.
- `src/areg/skillx.py` — generic `exec skillx` parse/list/fetch/cleanup for transient GitHub skill use, plus hardcoded `exec nsx` shorthand. Disposition: TBD.
- `src/areg/gateways/gh/*` — real/fake GitHub CLI directory-listing gateway and error types. Disposition: TBD.
- `src/areg/gateways/npx_skills/*` — real/fake `npx skills` install gateway and invocation capture. Disposition: TBD.
- `src/areg/preconditions.py`, `src/areg/context.py` — CLI precondition checks and gateway container. Disposition: TBD.

## `areg` Tests

- `tests/unit/test_areg.py`, `test_frontmatter.py`, `test_pairing.py`, `test_skillx.py` — package metadata, parser, frontmatter, and pairing behavior. Disposition: TBD.
- `tests/scenario/test_create_project.py`, `test_skillx_cli.py`, `test_update_skills.py`, `test_cli_preconditions.py` — end-to-end Click command behavior with fake gateways and precondition patching. Disposition: TBD.
- `tests/integration/test_check.py` — skill checker integration coverage for project layouts and edge cases. Disposition: TBD.
- `tests/gateways/test_fakes.py`, `test_real_gateways.py` — gateway fake behavior and real-command invocation shape. Disposition: TBD.

## First-Party `ns-*` Skills

Exact nonslop catalog under `skills/`, all with tracked `.agents/skills/<name>` and `.claude/skills/<name>` symlinks unless separately noted:

- `ns-changelog-update` — changelog update workflow with commit-fetching/categorization references. Disposition: TBD.
- `ns-create-bun-ts-project` — Bun/TypeScript project scaffolding skill with package/tsconfig/oxc/source templates. Disposition: TBD.
- `ns-create-py-dev-cli` — Python developer CLI scaffolding skill with pyproject/source/test/starter templates. Disposition: TBD.
- `ns-create-pypackage-project` — Python package project scaffolding skill with pyproject/source/justfile/gitignore templates. Disposition: TBD.
- `ns-dignified-python` — Python production standards skill with core, CLI, subprocess, version, module-design, checklist, and advanced references. Disposition: TBD.
- `ns-fake-driven-test-layout` — test directory layout guidance for fake-driven projects. Disposition: TBD.
- `ns-install` — permanent install shortcut for one skill from the old nonslop catalog. Disposition: rewrite or fold; exact final disposition TBD.
- `ns-py-fake-driven-testing` — fake-driven Python testing architecture with gateway/testing references. Disposition: TBD.
- `ns-pytest` — pytest style guidance with fixtures reference. Disposition: TBD.
- `ns-refac-cli-push-down` — move deterministic prompt work into tested CLI commands. Disposition: TBD.
- `ns-refactor-swarm` — parallel file-local refactor workflow. Disposition: TBD.
- `ns-resolve-merge-conflicts` — intelligent rebase conflict resolution workflow. Disposition: TBD.
- `ns-setup-dprint` — dprint setup workflow with plugin catalog reference. Disposition: TBD.
- `ns-setup-dprint-gh-ci` — dprint GitHub Actions workflow setup with workflow template. Disposition: TBD.
- `ns-setup-pypi-publish` — PyPI publishing setup workflow. Disposition: TBD.
- `ns-setup-python-gh-ci` — Python GitHub Actions CI setup with composite-action and workflow templates. Disposition: TBD.
- `ns-setup-repo-to-use-gt` — Graphite repo onboarding skill. Disposition: TBD.
- `ns-skill-audit` — skill audit/improvement workflow. Disposition: TBD.
- `ns-skill-management` — canonical `npx skills` management guidance and commands reference. Disposition: rewrite source names/commands; exact final disposition TBD.
- `ns-skillx` — generic transient GitHub skill invocation wrapper around `areg exec skillx`/old `uvx nonslop exec skillx`. Disposition: rewrite; exact final disposition TBD.
- `nsx` — transient nonslop-catalog skill invocation wrapper. Disposition: rewrite to new `dagster-io/asdl-tools` source or fold; exact final disposition TBD.

## Skill Authoring and Skill-Sync Support

- `docs/skill-standards.md` — first-party skill standards: task-invoked vs explicit command skills, frontmatter, README guidance, references/templates, and allowed-tools guidance. Disposition: TBD.
- `scripts/sync_dignified_python.py` — syncs `ns-dignified-python` from `dagster-io/skills`. Disposition: TBD.
- `scripts/clean_dagster_refs.md` — LLM cleanup instructions after syncing `ns-dignified-python`. Disposition: TBD.
- `skills-lock.json` — nonslop local-skill lockfile for the 21 `ns-*` skills. Disposition: TBD.

## CI, Automation, and Development Recipes

- `.github/actions/setup-python-uv/action.yml` — reusable action installing Python/uv and syncing dependencies. Disposition: TBD.
- `.github/workflows/python-ci.yml` — lint, format, ty, and test matrix for Python 3.11–3.14. Disposition: TBD.
- `.github/workflows/ns-ci.yml` — skill checks and dprint checks. Disposition: TBD.
- `justfile` — local QA/build/publish/clean tasks: `qa`, `check`, `check-skills`, `lint`, `format-check`, `dprint-check`, `fix`, `dprint-fix`, `ty`, `test`, `build`, `publish`, `clean`. Disposition: TBD.
- `local.just` — checkout-local twerk editable install/linking helper. Disposition: likely retire or local-only ignore; exact final disposition TBD.

## Agent Configuration and Installed Skill Links

- `AGENTS.md`, `CLAUDE.md` — project agent instructions and Claude forwarding. Disposition: TBD.
- `.claude/settings.local.json` — Claude local allowlist including `npx skills`, `just`, build, and web-fetch permissions. Disposition: likely local-only or rewrite; exact final disposition TBD.
- `.codex/config.toml` — Codex developer instruction that `gh` commands must run on host. Disposition: likely local-only or rewrite; exact final disposition TBD.
- `.agents/skills/*` and `.claude/skills/*` for the 21 `ns-*` skills — tracked symlink installation surface for first-party skills. Disposition: migrate via asdl-tools local-skill symlink convention.
- Checkout-local `.agents`/`.claude` symlinks to `/Users/schrockn/code/twerk` skills (`fix-just`, `twerk-objective-create`, `twerk-objective-progress`, `twerk-objective-reconcile`) — installed local development capabilities not represented in `skills-lock.json`. Disposition: likely local-only ignore or separate migration if still needed; exact final disposition TBD.

## Empty or Skeletal Package Areas

- `packages/nonslop-dev/src/nonslop_dev/...` and `packages/nonslop-dev/tests` — checkout-visible empty/skeletal package directory tree with no files found in bounded inventory. Disposition: likely ignore/retire unless implementation discovers untracked content or intended future use.

## Excluded Non-Capability Output

- `.git`, `.venv`, `.pytest_cache`, `.ruff_cache`, `dist`, `__pycache__`, `.deepeval` with no discovered source files — cache/build/environment output or empty local state. Disposition: ignore.
