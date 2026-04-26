# Skills

A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Installed skills are discovered natively from the on-disk skill directories and their `SKILL.md` frontmatter. `AGENTS.md` is for project instructions, not a hand-maintained skill index.

### Package Import Rules

- Packages in this repo do **not** publicly re-export symbols from `__init__.py`. Package `__init__.py` files should be empty or contain only a docstring.
- Consumers must import from the canonical source module (e.g., `from twerk_core.clinkr.group import ClinkrGroup`, not `from twerk_core.clinkr import ClinkrGroup`).
- Do not use `__all__` or `import X as X` re-export patterns in `__init__.py` files.
- Do not prefix module filenames with a leading underscore (e.g., `_gateway_access.py`). Because `__init__.py` files are empty, every module's canonical path is already its public path — there is nothing to mark "package-private." `__init__.py` itself is exempt; the rule is about regular `.py` modules.

### Fixing Lint and Format Failures

When `just` reports a lint or format failure, do not hand-edit files to satisfy the formatter. Run the corresponding autofix recipe instead:

- `ruff check` failures → `just fix` (runs `ruff check --fix --unsafe-fixes` then `ruff format`)
- `ruff format --check` failures → `just fix`
- `dprint check` failures (Markdown / TOML) → `just dprint-fix` (runs `dprint fmt`)

After autofixing, re-run `just` to confirm the suite is green. Only edit files by hand when the failure is a real lint/type/test bug that the autofixer cannot resolve.

### Public Skill Authoring — No Internal References

Public skills (those with a `skills/<name>` symlink for external discoverability) are user-facing documents. Do not reference twerk-internal module paths, class names, or implementation details (e.g., `twerk_core.gh.IssueGateway`, `RealIssueGateway.get_reviews`) in their `SKILL.md` files or frontmatter descriptions. Describe _what_ CLI operations to call (e.g., `pr-address exec get-reviews`), not _how_ they are implemented. Implementation details belong in Python source, not in public `SKILL.md` files. Internal skills (no `skills/` symlink) may reference internals freely.

### Vendored Skill Code

- `.agents/skills/<name>/` is either (a) a symlink back to a first-party skill at `skills/<name>/` or (b) a real directory containing vendored third-party code. Treat only real directories there as vendored; symlinked entries resolve to first-party twerk work under `skills/<name>/` and are subject to normal linting, typechecking, and review.
- Treat `.claude/skills/*` as symlinks into `.agents/skills/`; the vendored-vs-first-party distinction follows through the chain to the underlying directory.
- For repo-local skills, `skills/<name>/` is the canonical source — edit files there directly. `.agents/skills/<name>` is a symlink back to that source, and editing through either path is equivalent.
- Do not apply first-party Python standards or refactoring skills such as `ns-dignified-python`, `ns-py-fake-driven-testing`, or `fdt-refactor-mock-to-fake` to Python files inside vendored (real-directory) entries under `.agents/skills/` unless the user explicitly asks to modify the vendored dependency itself.
- When reviewing or editing the repo, exclude vendored entries — real directories under `.agents/skills/**/*.py` — from normal linting, typechecking, code review, and cleanup expectations; assume those files should remain as-shipped unless the task is specifically about updating vendored skill code.

### Dev Skill Naming Convention

Skills prefixed with `dev-` are developer-only tooling — either pure contributor helpers (`dev-gh`, `dev-fix-just`) or prototype features being dogfooded before graduation (`dev-plan-to-branch`). Dev skills additionally carry `metadata.internal: true` in their `SKILL.md` frontmatter to hide them from external `npx skills add` discovery. A prototype graduates to a published feature by (1) dropping the `dev-` prefix in all three directory locations and every reference, and (2) removing the `internal: true` frontmatter flag.

### GitHub Backend Interactions

When adding or editing any code that interacts with the GitHub backend — whether through GraphQL queries, REST API calls, or `gh` CLI commands — always consult the `dev-gh` skill (`.claude/skills/dev-gh/SKILL.md`) and its references first. This ensures correct API selection (REST vs GraphQL), proper rate-limit awareness, and consistency with the existing gateway patterns in `twerk-core`.

### Branch Creation and PR Submission (Graphite)

This repo uses Graphite (`gt`) as the default tool for branch and PR workflow. Whenever you create branches, amend commits, submit or update PRs, or navigate and reshape stacks, always consult the `graphite` skill (`.claude/skills/graphite/SKILL.md`) first. Prefer `gt` over raw `git` for these operations:

- Creating branches: use `gt create <name> -m "<msg>"` instead of `git checkout -b` + `git commit`.
- Amending the current branch: use `gt modify -m "<msg>"` instead of `git commit --amend`.
- Submitting / updating PRs: use `gt submit --no-interactive` instead of `git push` / `gh pr create`.
- Navigating and reshaping stacks: `gt up` / `gt down` / `gt ls` / `gt restack` / `gt move`.

Fall back to raw `git` only when `gt` cannot express the operation (e.g., surgical `git rebase` during conflict resolution — see the `graphite` skill's "Surgical Rebasing" section).

### CLI Scenario Testing Convention

Each CLI package has two entry points: a standalone CLI (e.g., `pr-address`) built by `build_cli()` in `<package>.cli.main`, and a twerk plugin subgroup discovered via `twerk.plugins` entry points. Test them separately:

**Scenario tests** live in their home package (e.g., `packages/twerk-pr-address/tests/scenario/`) and should exhaustively cover every user-facing scenario for that package's standalone CLI via `build_cli()`. This is the user-facing entry point and the right level to test. The fixture should be `cli_group = build_cli()`, not `discover_group(...)` directly. Include `--version` and `-h` tests alongside operation tests in the same file.

**Plugin smoke tests** (`tests/scenario/test_plugins.py` in the top-level twerk package): Verify that each plugin's entry point wires up correctly through `discover_plugins`. One test per plugin that mounts the subgroup and invokes a representative command. These live at the twerk scope because they test the plugin discovery contract.

### Skill-Invoked CLI Commands (exec Subgroups)

CLI commands intended for skill/agent invocation rather than interactive humans MUST be registered under a nested `exec` ClinkrGroup inside the package's outer group — e.g., `pr-address exec get-reviews`, `brmem exec resolve-prompt`, `reviewer exec format-findings-comment`. This keeps user-facing top-level help focused on commands a human would actually type.

- **Visibility:** the `exec` subgroup MUST be `hidden = True`. Users do not discover these commands by reading top-level `--help`; they discover them by reading the skill that drives them. Set `exec_group.hidden = True` after constructing the `ClinkrGroup`, before `outer.add_command(exec_group)`. Hiding only affects help-text rendering, not invocability — `pkg exec <op>` continues to work.
- **Layout:** operation files for exec commands live in `<package>/exec/`, with `exec/group.py` exposing a `build_exec_group()` (or equivalent) that the package's outer `group.py` mounts via `outer.add_command(exec_group)`. `exec/__init__.py` follows the repo's empty-init rule (docstring only, no re-exports).
- **Naming:** prefer noun-or-verb-phrase command names (`resolve-prompt`, `get-reviews`) — the `exec` namespace already implies the actor, so the verb does not need to.
- **Canonical examples:** `packages/twerk-pr-address/src/twerk_pr_address/cli/pr_address/group.py`, `packages/twerk-reviewer/src/twerk_reviewer/cli/reviewer/exec/group.py`, `packages/twerk-core/src/twerk_core/brmem/group.py`.

### How to use skills

- Discovery: Rely on installed skills and their `SKILL.md` frontmatter. Do not maintain a duplicate list in this file.
- Trigger rules: If the user names an installed skill (with `$SkillName` or plain text) OR the task clearly matches an installed skill, you must use that skill for that turn. Multiple mentions mean use them all. Do not carry skills across turns unless re-mentioned.
- Missing/blocked: If a named skill is not installed or its `SKILL.md` cannot be read, say so briefly and continue with the best fallback.
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

All skill-management procedures — adding, editing, removing, updating, listing, and publishing skills — are documented in the `skill-management` skill at `.agents/skills/skill-management/SKILL.md`. Use that skill whenever you need to install or modify skills rather than running `npx skills` commands freehand. The canonical twerk install flag is `--agent codex claude-code -y`. Local skills live as real directories under `skills/<name>/`; `.agents/skills/<name>` is a symlink back to that canonical source, keeping the universal-agent directory populated without duplicating content. GitHub-sourced skills remain real directories under `.agents/skills/<name>/`.
