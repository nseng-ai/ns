# Skills
A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used. Each entry includes a name, description, and file path so you can open the source for full instructions when using a specific skill.

### Vendored Skill Code
- Treat all files under `.agents/skills/` as vendored third-party code.
- Treat `.claude/skills/*` as symlinks into `.agents/skills/`, so the same vendored-code rule applies there.
- For repo-local skills installed from `skills/<name>/`, treat the copy under `.agents/skills/<name>/` as generated install output. Edit the canonical source in `skills/<name>/` and reinstall it with `npx skills add ./skills/<name> --agent codex claude-code -y` instead of editing the installed copy.
- Do not apply first-party Python standards or refactoring skills such as `dignified-python`, `fake-driven-testing`, or `fdt-refactor-mock-to-fake` to Python files under these directories unless the user explicitly asks to modify the vendored dependency itself.
- When reviewing or editing the repo, exclude `.agents/skills/**/*.py` from normal linting, typechecking, code review, and cleanup expectations; assume those files should remain as-shipped unless the task is specifically about updating vendored skill code.

### Available skills
- dignified-python: Production Python coding standards with automatic version detection (3.10-3.13). Use when writing, reviewing, or refactoring Python to ensure adherence to modern type syntax, LBYL exception handling, pathlib operations, ABC-based interfaces, and production-tested patterns. (file: /Users/schrockn/code/twerk/.claude/skills/dignified-python/SKILL.md)
- fake-driven-testing: Use when writing tests, fixing bugs, adding features, or modifying the gateway layer. This skill provides guidance on testing architecture, working with fakes, implementing ABC gateway interfaces, and where different types of tests belong. (file: /Users/schrockn/code/twerk/.claude/skills/fake-driven-testing/SKILL.md)
- fdt-refactor-mock-to-fake: Refactor tests that use `unittest.mock.patch` or `MagicMock` into the gateway-based fake pattern. Use when test files patch module-level attributes like `subprocess.run`, `shutil.which`, or `os.environ`, or otherwise need source code made injectable before rewriting the tests. (file: /Users/schrockn/code/twerk/.claude/skills/fdt-refactor-mock-to-fake/SKILL.md)
- graphite: Work with Graphite (`gt`) for stacked PRs, including creating, navigating, and managing PR stacks. Use when the task involves Graphite workflows or stacked-PR operations. (file: /Users/schrockn/code/twerk/.claude/skills/graphite/SKILL.md)
- gt-stackify-branch: Split a single mixed branch into a clean Graphite stack by planning PR slices, preserving the source branch, rebuilding each slice from trunk, validating the stack, and submitting it when requested. Use when the task is to turn one branch into 2+ stacked PRs. (file: /Users/schrockn/code/twerk/skills/gt-stackify-branch/SKILL.md)
- skill-creator: Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit or optimize an existing skill, or evaluate skill triggering/performance. (file: /Users/schrockn/code/twerk/.claude/skills/skill-creator/SKILL.md)

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
- Prefer `npx skills` over moving skill directories by hand.
- Inspect installed project skills with `npx skills list --json`. Use `npx skills ls -g --json` for global installs and `npx skills --help` for flag details.
- Use `skills-lock.json` as the source of truth for mapping a skill name to its GitHub source before reinstalling or migrating it.
- To migrate a skill that only exists in `.claude/skills` into the shared project layout, reinstall it with both `codex` and `claude-code`: `npx skills add <owner>/<repo> --skill <skill-name> --agent codex claude-code -y`
- If a repo contains multiple skills, pass all of them after `--skill`: `npx skills add dagster-io/fake-driven-testing --skill fake-driven-testing fdt-refactor-mock-to-fake --agent codex claude-code -y`
- Do not use `--agent claude-code` by itself for this migration. That recopies files into `.claude/skills` instead of creating `.agents/skills/<name>` plus a `.claude/skills/<name>` symlink.
- For repo-local skills under development, keep the canonical source in `skills/<name>/SKILL.md` and install it with a local path: `npx skills add ./skills/<name> --agent codex claude-code -y`
- For repo-local skills under development, do not pass `--copy`. The default install creates a managed copy in `.agents/skills/<name>` and a `.claude/skills/<name>` symlink that points at that managed copy.
- After editing a repo-local skill in `skills/<name>/`, rerun `npx skills add ./skills/<name> --agent codex claude-code -y` to refresh the installed copy. `skills-lock.json` records the local-path source.
- Expected result after a successful migration:
  `.agents/skills/<name>` contains the real skill files.
  `.claude/skills/<name>` is a symlink to `../../.agents/skills/<name>`.
  `git status` shows the old tracked `.claude/skills/<name>` files as deleted and the new symlink plus `.agents/` content as untracked until committed.
- Use project scope by default. Add `-g` only when you explicitly want a user-level install.
