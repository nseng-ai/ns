---
name: ns-skillx
# Full description commented out to save tokens (coding agents inject skill descriptions into every session):
# "Run any skill from a GitHub repo without installing it. Like npx for skills -- fetches into a temp dir, reads the SKILL.md, follows its instructions, then discards. No project pollution. Accepts: owner/repo --skill name (or -s), GitHub URLs, or natural language."
description: "Command: ns-skillx"
allowed-tools:
  - "Bash(uvx nonslop exec skillx *)"
---

# skillx

Run any skill from a GitHub repo without installing it into your project.
Like `npx` for packages -- fetch, use, discard. Zero project pollution.

## When to use

Use skillx when the user wants to **use** a skill from a GitHub repo
without permanently adding it to this project. Typical triggers:

- `skillx owner/repo --skill skill-name`
- `skillx owner/repo -s skill-name`
- `skillx https://github.com/owner/repo/blob/master/skills/skill-name`
- "use the X skill from owner/repo without installing it"

Do NOT use skillx when the user wants to permanently install a skill --
use `ns-skill-management` for that.

## CLI prefix

All commands use this prefix (uses the latest released `nonslop` from PyPI;
run `uv tool upgrade nonslop` or `uvx nonslop@latest ...` to refresh):

```
uvx nonslop exec skillx
```

## Step 1: Parse the request

Run the parse command with the user's raw input:

```bash
uvx nonslop exec skillx parse "<user-input>"
```

Returns JSON: `{"success": true, "repo": "owner/repo", "skill": "name-or-null", "format": "..."}`.

If parsing fails, extract `repo` and `skill` from context using your
judgment. The CLI handles URLs, `-s`/`--skill` flags, and plain
`owner/repo [skill]` -- natural language stays with you.

Also extract the **task**: whatever the user actually wants done with the
skill (the rest of their message beyond the skillx invocation).

## Step 2: List or fetch

**If no skill name**, list available skills and stop:

```bash
uvx nonslop exec skillx list --repo <owner/repo>
```

Returns JSON: `{"success": true, "repo": "...", "skills": [...]}`.
Report the list to the user and stop.

**If skill name is known**, proceed to Step 3.

## Step 3: Fetch the skill

```bash
uvx nonslop exec skillx fetch --repo <owner/repo> --skill <skill-name>
```

Returns JSON with `tmp_dir`, `skill_dir`, `skill_md`, and `files`.
If `needs_selection` is true, show `available_skills` and ask which to use.
If the command fails (`success: false`), report the error and stop.

## Step 4: Read and follow the SKILL.md

Read the `skill_md` path from the fetch result using the Read tool.

Act as if the fetched SKILL.md is your active skill for this turn.
Follow its instructions to accomplish the user's task.

**Relative path resolution.** Resolve relative paths against `skill_dir`.

**Work in the real project.** The skill's instructions apply to the
user's actual project (the current working directory), NOT to the temp
directory. The temp directory is only for reading the skill's definition
and reference files.

**Tool permissions.** The fetched skill's `allowed-tools` are NOT
automatically granted. The user will see normal permission prompts.

## Step 5: Clean up

After the skill's work is complete (or if any step fails):

```bash
uvx nonslop exec skillx cleanup --dir <tmp_dir>
```

## What skillx does NOT do

- Does NOT modify `skills-lock.json` in the real project
- Does NOT create symlinks in `.agents/skills/` or `.claude/skills/`
- Does NOT add entries to `AGENTS.md`
- Does NOT cache anything -- every invocation is a fresh fetch
