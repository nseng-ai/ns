---
name: nsx
description: "Run any skill from nseng-ai/nonslop without installing it. Shorthand for skillx against the nonslop repo. Pass a skill name to run it, or no arguments to list available skills."
allowed-tools:
  - "Bash(uvx --from *nonslop* nonslop exec nsx *)"
---

# nsx

Run any skill from `nseng-ai/nonslop` without installing it into your project.
Shorthand for `skillx` hardcoded to the nonslop repo.

## When to use

Use nsx when the user wants to run a nonslop skill from GitHub without
permanently adding it. Typical triggers:

- `nsx ns-create-pypackage-project`
- `nsx` (no arguments -- list available skills)
- "run the ns-setup-dprint skill from nonslop"

Do NOT use nsx when the user wants to permanently install a skill --
use `ns-skill-management` for that.

Do NOT use nsx when the user specifies a different repo --
use `ns-skillx` for that.

## CLI prefix

All commands use this prefix (always runs latest from master):

```
uvx --from "git+https://github.com/nseng-ai/nonslop" nonslop exec nsx
```

## Step 1: Parse the request

The only input is an optional **skill name**. The repo is always
`nseng-ai/nonslop`.

- If the user provided a skill name, save it.
- If no skill name was provided, proceed to list available skills.

Also extract the **task**: whatever the user actually wants done with the
skill (the rest of their message beyond the nsx invocation).

## Step 2: List or fetch

**If no skill name was provided**, list available skills and stop:

```bash
uvx --from "git+https://github.com/nseng-ai/nonslop" nonslop exec nsx list
```

Returns JSON: `{"success": true, "repo": "nseng-ai/nonslop", "skills": [...]}`.
Report the list to the user and stop.

**If a skill name was provided**, proceed to Step 3.

## Step 3: Fetch the skill

```bash
uvx --from "git+https://github.com/nseng-ai/nonslop" nonslop exec nsx fetch --skill <skill-name>
```

Returns JSON with `tmp_dir`, `skill_dir`, `skill_md`, and `files`.
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
uvx --from "git+https://github.com/nseng-ai/nonslop" nonslop exec nsx cleanup --dir <tmp_dir>
```

## What nsx does NOT do

- Does NOT modify `skills-lock.json` in the real project
- Does NOT create symlinks in `.agents/skills/` or `.claude/skills/`
- Does NOT add entries to `AGENTS.md`
- Does NOT cache anything -- every invocation is a fresh fetch
