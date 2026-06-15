---
name: skillx
# Full description commented out to save tokens (coding agents inject skill descriptions into every session):
# "Run any skill from a GitHub repo without installing it. Like npx for skills -- fetches into a temp dir, reads the SKILL.md, follows its instructions, then discards. No project pollution. Accepts: owner/repo --skill name (or -s), GitHub URLs, or natural language."
description: "Command: skillx"
allowed-tools:
  - "Bash(areg exec skillx *)"
  - "Bash(node ts/packages/areg/src/cli.ts exec skillx *)"
---

# skillx

Run any skill from a GitHub repo without installing it into your project. Like
`npx` for packages -- fetch, use, discard. Zero project pollution.

## When to use

Use skillx when the user wants to **use** a skill from a GitHub repo without
permanently adding it to this project. Typical triggers:

- `skillx owner/repo --skill skill-name`
- `skillx owner/repo -s skill-name`
- `skillx https://github.com/owner/repo/blob/master/skills/skill-name`
- "use the X skill from owner/repo without installing it"

Do NOT use skillx when the user wants to permanently install a skill -- use
`skill-management` for that.

## CLI prefix

Prefer the installed/shimmed command:

```bash
areg exec skillx
```

If `areg` is only available from a checkout, run the same command through the
TypeScript source CLI:

```bash
node ts/packages/areg/src/cli.ts exec skillx
```

All hidden skillx commands must use `--format json`. The TypeScript CLI returns
a Clinkr JSON envelope: on success, read fields from `data`; if `exit_code` is
nonzero, read the top-level `message` and any `data.error` details.

## Step 1: Parse the request

Run the parse command with the user's raw input:

```bash
areg exec skillx parse "<user-input>" --format json
```

Returns a Clinkr envelope such as
`{"exit_code": 0, "data": {"success": true, "repo": "owner/repo", "skill": "name-or-null", "format": "..."}}`.
Use `data.repo`, `data.skill`, and `data.format`.

If parsing fails, extract `repo` and `skill` from context using your judgment.
The CLI handles URLs, `-s`/`--skill` flags, and plain `owner/repo [skill]` --
natural language stays with you.

Also extract the **task**: whatever the user actually wants done with the skill
(the rest of their message beyond the skillx invocation).

## Step 2: List or fetch

**If no skill name**, list available skills and stop:

```bash
areg exec skillx list --repo <owner/repo> --format json
```

Returns a Clinkr envelope with `data.success`, `data.repo`, and `data.skills`.
Report the list to the user and stop.

**If skill name is known**, proceed to Step 3.

## Step 3: Fetch the skill

```bash
areg exec skillx fetch --repo <owner/repo> --skill <skill-name> --format json
```

Returns a Clinkr envelope whose `data` object includes `tmp_dir`, `skill_dir`,
`skill_md`, and `files`. If `data.needs_selection` is true, show
`data.available_skills` and ask which to use. If the command fails
(`exit_code != 0` or `data.success === false`), report the top-level message or
`data.error` and stop.

## Step 4: Read and follow the SKILL.md

Read the `skill_md` path from the fetch result using the Read tool.

Act as if the fetched SKILL.md is your active skill for this turn. Follow its
instructions to accomplish the user's task.

**Relative path resolution.** Resolve relative paths against `skill_dir`.

**Work in the real project.** The skill's instructions apply to the user's
actual project (the current working directory), NOT to the temp directory. The
temp directory is only for reading the skill's definition and reference files.

**Tool permissions.** The fetched skill's `allowed-tools` are NOT automatically
granted. The user will see normal permission prompts.

## Step 5: Clean up

After the skill's work is complete (or if any step fails):

```bash
areg exec skillx cleanup --dir <tmp_dir> --format json
```

## What skillx does NOT do

- Does NOT modify `skills-lock.json` in the real project
- Does NOT create symlinks in `.agents/skills/` or `.claude/skills/`
- Does NOT add entries to `AGENTS.md`
- Does NOT cache anything -- every invocation is a fresh fetch
