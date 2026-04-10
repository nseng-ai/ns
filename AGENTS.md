# Skills

A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used. Each entry includes a name, description, and file path so you can open the source for full instructions when using a specific skill.

### Package Import Rules

- Packages in this repo do **not** publicly re-export symbols from `__init__.py`. Package `__init__.py` files should be empty or contain only a docstring.
- Consumers must import from the canonical source module (e.g., `from clinkr.group import ClinkrGroup`, not `from clinkr import ClinkrGroup`).
- Do not use `__all__` or `import X as X` re-export patterns in `__init__.py` files.

### Fixing Lint and Format Failures

When `just` reports a lint or format failure, do not hand-edit files to satisfy the formatter. Run the corresponding autofix recipe instead:

- `ruff check` failures → `just fix` (runs `ruff check --fix --unsafe-fixes` then `ruff format`)
- `ruff format --check` failures → `just fix`
- `dprint check` failures (Markdown / TOML) → `just dprint-fix` (runs `dprint fmt`)

After autofixing, re-run `just` to confirm the suite is green. Only edit files by hand when the failure is a real lint/type/test bug that the autofixer cannot resolve.

### Vendored Skill Code

- Treat all files under `.agents/skills/` as vendored third-party code.
- Treat `.claude/skills/*` as symlinks into `.agents/skills/`, so the same vendored-code rule applies there.
- For repo-local skills, `.agents/skills/<name>/` is the canonical source — edit files there directly. Public skills additionally have a `skills/<name>` symlink for discoverability via `npx skills add`; editing through the symlink is equivalent.
- Do not apply first-party Python standards or refactoring skills such as `dignified-python`, `fake-driven-testing`, or `fdt-refactor-mock-to-fake` to Python files under these directories unless the user explicitly asks to modify the vendored dependency itself.
- When reviewing or editing the repo, exclude `.agents/skills/**/*.py` from normal linting, typechecking, code review, and cleanup expectations; assume those files should remain as-shipped unless the task is specifically about updating vendored skill code.

### Available skills

- dignified-python: Production Python coding standards with automatic version detection (3.10-3.13). Use when writing, reviewing, or refactoring Python to ensure adherence to modern type syntax, LBYL exception handling, pathlib operations, ABC-based interfaces, and production-tested patterns. (file: /Users/schrockn/code/twerk/.claude/skills/dignified-python/SKILL.md)
- fake-driven-testing: Use when writing tests, fixing bugs, adding features, or modifying the gateway layer. This skill provides guidance on testing architecture, working with fakes, implementing ABC gateway interfaces, and where different types of tests belong. (file: /Users/schrockn/code/twerk/.claude/skills/fake-driven-testing/SKILL.md)
- fdt-refactor-mock-to-fake: Refactor tests that use `unittest.mock.patch` or `MagicMock` into the gateway-based fake pattern. Use when test files patch module-level attributes like `subprocess.run`, `shutil.which`, or `os.environ`, or otherwise need source code made injectable before rewriting the tests. (file: /Users/schrockn/code/twerk/.claude/skills/fdt-refactor-mock-to-fake/SKILL.md)
- fix-just: Run `just` and fix all failures (lint, format, type errors, test failures) by fixing the underlying code — not by deleting or weakening tests. If user input is needed, ask the user. If the current harness is in a planning or read-only mode, present a plan to fix the failures instead of applying changes. (file: /Users/schrockn/code/twerk/.claude/skills/fix-just/SKILL.md)
- graphite: Work with Graphite (`gt`) for stacked PRs, including creating, navigating, and managing PR stacks. Use when the task involves Graphite workflows or stacked-PR operations. (file: /Users/schrockn/code/twerk/.claude/skills/graphite/SKILL.md)
- gt-stackify-branch: Split a single mixed branch into a clean Graphite stack by planning PR slices, preserving the source branch, rebuilding each slice from trunk, validating the stack, and submitting it when requested. Use when the task is to turn one branch into 2+ stacked PRs. (file: /Users/schrockn/code/twerk/.claude/skills/gt-stackify-branch/SKILL.md)
- ns-pytest: Pytest-specific style guide for writing and reviewing tests. Use when deciding between fixtures / context managers / plain helper functions, choosing whether to write a test class or a module-level `test_*` function, using `@pytest.mark.parametrize` / `tmp_path` / `monkeypatch` / `capsys`, structuring `unittest.mock.patch` usage (context manager vs decorator, `autospec`, where to patch), or cleaning up `autouse` fixtures and conftest nesting. Prescribes functional-only style (no `class Test*`), a strict setup hierarchy (plain helpers > context managers > fixtures for expensive shared resources only), and mocking best practice (`monkeypatch` first, then `patch` as a context manager with `autospec`, narrow scope, patch at point of use). For architecture-level questions use `fake-driven-testing`; for mock-to-fake migration use `fdt-refactor-mock-to-fake`. (file: /Users/schrockn/code/twerk/.claude/skills/ns-pytest/SKILL.md)
- twerk-objective-create: Create a GitHub issue for a new twerk objective. Use when the user wants to start an objective, capture a multi-session workstream in GitHub, turn a rough project brief into an issue-backed objective, or create something that should later appear in `twerk objective list`. (file: /Users/schrockn/code/twerk/.claude/skills/twerk-objective-create/SKILL.md)
- twerk-objective-list: Display the user's twerk objectives (GitHub issues labeled `twerk-objective`). Use when the user asks to list, view, or pick from current objectives, or wants details on a specific objective by number. Lists via `twerk objective list` and drills into specific issues with `gh issue view`. Read-only. (file: /Users/schrockn/code/twerk/.claude/skills/twerk-objective-list/SKILL.md)
- twerk-objective-progress: Progress an objective by reading its GitHub issue, assessing the codebase, and implementing the next piece of work. Use when the user wants to make progress on an existing twerk objective, pick up where they left off, or continue a multi-session workstream. (file: /Users/schrockn/code/twerk/.claude/skills/twerk-objective-progress/SKILL.md)
- twerk-objective-reconcile: Reconcile an objective after landing a PR. Auto-detects the PR from the current branch and the objective from Objective: #N trailers in commit messages. Reads the merged PR, updates the objective issue body, and posts a reconciliation comment. (file: /Users/schrockn/code/twerk/.claude/skills/twerk-objective-reconcile/SKILL.md)
- twerk-pr-address: Address PR review comments end-to-end on the current branch's PR. Use when the user says "address PR comments", "fix review feedback", "resolve review threads", or asks to respond to a specific PR's review. Fetches unresolved review threads and discussion comments via `gh`, classifies them with LLM judgment (actionable vs informational, bot noise, pre-existing issues), plans batched execution, implements code changes, commits in batches, and resolves threads. Never pushes — the user pushes manually after reviewing local commits. (file: /Users/schrockn/code/twerk/.claude/skills/twerk-pr-address/SKILL.md)
- skill-creator: Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit or optimize an existing skill, or evaluate skill triggering/performance. (file: /Users/schrockn/code/twerk/.claude/skills/skill-creator/SKILL.md)
- ns-skill-management: Manage skills in nonslop projects with `npx skills`. Use whenever you need to add a new skill (local or from GitHub), edit an existing skill, remove one, update GitHub-sourced skills, inspect what's installed, or publish skills for external consumption. Covers the convention of `skills/<name>/` as the canonical source for local skills, `.agents/skills/` for vendored code, and the canonical `--agent codex claude-code -y` install flag. (file: /Users/schrockn/code/twerk/.claude/skills/ns-skill-management/SKILL.md)

### How to use skills

- Discovery: The list above is the skills available in this repo for Codex sessions. Skill bodies live on disk at the listed paths.
- Trigger rules: If the user names a skill (with `$SkillName` or plain text) OR the task clearly matches a skill's description shown above, you must use that skill for that turn. Multiple mentions mean use them all. Do not carry skills across turns unless re-mentioned.
- Missing/blocked: If a named skill isn't in the list or the path can't be read, say so briefly and continue with the best fallback.
- How to use a skill (progressive disclosure):
  1. After deciding to use a skill, open its `SKILL.md`. Read only enough to follow the workflow.
  2. When `SKILL.md` references relative paths, resolve them relative to the skill directory first.
  3. If `SKILL.md` points to extra folders such as `references/`, load only the specific files needed for the request; don't bulk-load everything.
  4. If `scripts/` exist, prefer running or patching them instead of retyping large code blocks.
  5. If `assets/` or templates exist, reuse them instead of recreating from scratch.
- Coordination and sequencing:
  - If multiple skills apply, choose the minimal set that covers the request and state the order you'll use them.
  - Announce which skill(s) you're using and why in one short line.
  - If you skip an obvious skill, say why.
- Context hygiene:
  - Keep context small: summarize long sections instead of pasting them; only load extra files when needed.
  - Avoid deep reference-chasing: prefer opening only files directly linked from `SKILL.md` unless you're blocked.
  - When variants exist, pick only the relevant reference file(s) and note that choice.
- Safety and fallback: If a skill can't be applied cleanly, state the issue, pick the next-best approach, and continue.

### Managing Skills With `npx skills`

All skill-management procedures — adding, editing, removing, updating, listing, and publishing skills — are documented in the `skill-management` skill at `.agents/skills/skill-management/SKILL.md`. Use that skill whenever you need to install or modify skills rather than running `npx skills` commands freehand. The canonical twerk install flag is `--agent codex claude-code -y`. Local skills live as real directories under `.agents/skills/<name>/`; public skills additionally get a `skills/<name>` symlink for discoverability.
