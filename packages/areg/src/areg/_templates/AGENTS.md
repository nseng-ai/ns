# Skills

A skill is a set of local instructions to follow that is stored in a
`SKILL.md` file. Installed skills are discovered natively from the
on-disk skill directories and their `SKILL.md` frontmatter. `AGENTS.md`
is for project instructions, not a hand-maintained skill index.

### Skill Directory Layout

- **`skills/`** contains all locally-authored skills as real directories. This is first-party code -- apply normal linting, typechecking, and code-review standards here. Edit files under `skills/<name>/` directly.
- **`.agents/skills/`** is the universal agent directory. It contains:
  - Symlinks to `../../skills/<name>` for each local skill
  - Real directories of vendored third-party code for GitHub-sourced skills
- **`.claude/skills/`** contains symlinks into `.agents/skills/` for Claude Code. Do not modify these directly.
- For vendored (GitHub-sourced) skills, do not apply first-party coding standards or refactoring to files under `.agents/skills/<name>/` unless the user explicitly asks to modify the vendored dependency itself. Exclude `.agents/skills/` from normal linting, typechecking, and code-review expectations.

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

All skill-management procedures -- adding, editing, removing, updating, listing, and publishing skills -- are documented in the `ns-skill-management` skill at `.agents/skills/ns-skill-management/SKILL.md`. Use that skill whenever you need to install or modify skills rather than running `npx skills` commands freehand. The canonical areg install flag is `--agent codex claude-code -y`. Local skills live as real directories under `skills/<name>/`; `.agents/skills/<name>` is a symlink to them for universal agent discovery.
