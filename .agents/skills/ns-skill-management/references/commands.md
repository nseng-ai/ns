# `npx skills` command reference

Detailed reference for every `npx skills` subcommand, flag, and known
quirk. Loaded from `SKILL.md` only when you need deeper detail than the
workflow sections provide. For the nonslop workflow, the main `SKILL.md`
is the canonical source.

## Subcommands

### `add <source>` (alias: `a`)

Install one or more skills. `<source>` can be:

- a GitHub shorthand: `vercel-labs/agent-skills`, `dagster-io/skills`
- a full GitHub URL: `https://github.com/vercel-labs/agent-skills`
- a local path: `./skills/ns-skill-management` (permanent directory for local skills)
- a git URL or GitLab URL

Flags:

| Flag                     | Description                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `-g`, `--global`         | Install user-level (into `~/.claude/skills/`, `~/.codeium/windsurf/skills/`, etc.) instead of project-level                           |
| `-a`, `--agent <agents>` | Space-separated list of agents to install to. Use `*` for all detected agents. **nonslop always passes `--agent codex claude-code`.** |
| `-s`, `--skill <skills>` | Pick specific skills from a multi-skill repo. Space-separated. Use `*` for all.                                                       |
| `-l`, `--list`           | List available skills in the source repository without installing                                                                     |
| `-y`, `--yes`            | Skip all confirmation prompts                                                                                                         |
| `--copy`                 | Force copy mode for agent-specific dirs instead of symlinks. **Do not use in nonslop.**                                               |
| `--all`                  | Shorthand for `--skill '*' --agent '*' -y`                                                                                            |
| `--full-depth`           | Search all subdirectories even when a root `SKILL.md` exists                                                                          |

nonslop examples:

```bash
# Local skill bootstrap (one-time per skill, then replace .agents/ copy with symlink)
npx skills add ./skills/ns-skill-management --agent codex claude-code -y
# Post-install: replace the CLI's copy with a symlink to the canonical source
rm -rf .agents/skills/ns-skill-management
ln -s ../../skills/ns-skill-management .agents/skills/ns-skill-management

# Single GitHub skill
npx skills add withgraphite/agent-skills --skill graphite --agent codex claude-code -y

# Multi-skill GitHub repo
npx skills add dagster-io/fake-driven-testing \
  --skill fake-driven-testing fdt-refactor-mock-to-fake \
  --agent codex claude-code -y
```

### `remove [skills]` (alias: `rm`)

Remove one or more installed skills.

Flags:

| Flag                     | Description                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `-g`, `--global`         | Remove from global scope                                                                                                       |
| `-a`, `--agent <agents>` | Remove only from specific agents (e.g. `-a windsurf` removes the `.windsurf/skills/<name>` symlink but leaves everything else) |
| `-s`, `--skill <skills>` | Specify skills to remove                                                                                                       |
| `-y`, `--yes`            | Skip confirmation prompts                                                                                                      |
| `--all`                  | Shorthand for `--skill '*' --agent '*' -y` -- removes everything. **Destructive; use with care.**                              |

nonslop examples:

```bash
# Remove a skill from the project entirely
npx skills remove ns-skill-management --agent codex claude-code -y

# Clean up a single agent's symlink (e.g. if Windsurf got auto-installed)
npx skills remove ns-skill-management -a windsurf -y
```

### `list` (alias: `ls`)

List installed skills.

| Flag                     | Description                                               |
| ------------------------ | --------------------------------------------------------- |
| `-g`, `--global`         | List global (user-level) skills instead of project skills |
| `-a`, `--agent <agents>` | Filter by specific agents                                 |
| `--json`                 | Machine-readable JSON output with no ANSI codes           |

```bash
npx skills list                       # project skills
npx skills list --json                # for scripting
npx skills list -g                    # global installs
npx skills list -a claude-code        # only skills installed for Claude Code
```

### `find [query]`

Interactive search. With a keyword, filters by name and description.

```bash
npx skills find                       # interactive
npx skills find typescript            # keyword
```

### `check`

Check for available updates. Only inspects **remote** sources
(`sourceType: "github"` and friends). Local skills are never checked.

```bash
npx skills check
```

### `update`

Update all skills with remote sources to their latest versions. Modifies
the `.agents/skills/<name>/` vendored content and bumps `computedHash`
in `skills-lock.json`.

```bash
npx skills update
```

### `init [name]`

Scaffold a new skill: creates `<name>/SKILL.md` or `./SKILL.md` with a
starter template. **Not typically used in nonslop** -- we prefer to copy
`skills/ns-skill-management/SKILL.md` as a template to stay
consistent with repo style.

### `experimental_install`

Restore all skills from `skills-lock.json`. Useful on a fresh clone
when `.agents/skills/` hasn't been committed (not applicable in nonslop
since the repo does commit `.agents/skills/`).

### `experimental_sync`

Sync skills from `node_modules` into agent directories. Only relevant
when skills are installed as npm packages. Not used in nonslop.

## Agent classification

`npx skills` supports ~45 agents. They split into two categories based
on how they read skills.

### Universal agents (read `.agents/skills/`)

These agents read the shared `.agents/skills/` directory directly. In
the install summary, they show under `universal:`. nonslop installs
populate this directory via `--agent codex ...`, which makes the skill
available to every universal agent for free.

Partial list: **Codex**, Cursor, Amp, Antigravity, Cline, OpenClaw,
Zed, and others. Any universal agent in the list will read the skills
at `.agents/skills/<name>/`.

### Dedicated-dir agents (get their own skills directory)

These agents each have their own skills path. `npx skills add` creates
a symlink from the dedicated dir back to `.agents/skills/<name>`. In
the install summary, they show under `symlink ->`.

| Agent           | Dedicated dir       | Detected via                 |
| --------------- | ------------------- | ---------------------------- |
| **Claude Code** | `.claude/skills/`   | (always enabled)             |
| Windsurf        | `.windsurf/skills/` | `~/.codeium/windsurf` exists |
| Roo             | `.roo/skills/`      | Roo install state            |
| Trae            | `.trae/skills/`     | Trae install state           |
| Zencoder        | `.zencoder/skills/` | Zencoder install state       |

**Windsurf auto-detection gotcha:** the CLI checks
`existsSync(join(home, ".codeium/windsurf"))` at install time. If
that path exists on your machine (it does on the author's), then
`npx skills add` without `-a` will silently create
`.windsurf/skills/<name>` every time. The nonslop convention of
`--agent codex claude-code -y` avoids this entirely -- Windsurf is
not in the agent list, so the CLI skips it.

## `skills-lock.json` schema

```json
{
  "version": 1,
  "skills": {
    "<skill-name>": {
      "source": "<source-identifier>",
      "sourceType": "github" | "local" | "git" | "gitlab",
      "computedHash": "<sha256>"
    }
  }
}
```

### Example entries

**Local skill:**

```json
"ns-skill-management": {
  "source": "skills/ns-skill-management",
  "sourceType": "local",
  "computedHash": "..."
}
```

`source` is a path captured at install time. `computedHash`
is also captured at install time and is **not** refreshed by
`skills check`/`update`. A stale hash is harmless -- the real content
is whatever is at `skills/<name>/` right now.

**GitHub skill:**

```json
"graphite": {
  "source": "withgraphite/agent-skills",
  "sourceType": "github",
  "computedHash": "..."
}
```

`source` is an `<owner>/<repo>` shorthand. `computedHash` is the hash
of the fetched content and is refreshed by `skills update`.

## Known CLI quirks

1. **`check`/`update` ignore local skills.** These commands only
   look at `sourceType: "github"` and similar remote types. Local
   skills are edited in-place and never need refreshing.

2. **`add` auto-detects agents at install time.** If you don't pass
   `-a`, the CLI installs to every detected agent, including ones
   you may not want (Windsurf, Roo, Trae, Zencoder depending on your
   machine). Always pass `--agent codex claude-code -y` in nonslop.

3. **`add` is destructive on `.agents/skills/<name>`.** The CLI calls
   `cleanAndCreateDirectory(canonicalDir)` followed by
   `copyDirectory(skill.path, canonicalDir)` unconditionally. For
   local skills, this replaces the symlink at `.agents/skills/<name>`
   with a real directory (a copy). The canonical content in
   `skills/<name>/` is safe -- just re-create the symlink afterward:
   `rm -rf .agents/skills/<name> && ln -s ../../skills/<name> .agents/skills/<name>`

4. **`remove` cleans up symlinks but not source content.** Running
   `npx skills remove` deletes the `.agents/skills/<name>` symlink
   and `.claude/skills/<name>` symlink, but does not touch
   `skills/<name>/` (the canonical source for local skills). Clean
   that up manually with `rm -rf skills/<name>`.

## Skill visibility (internal skills)

To hide a local skill from external discovery, add `metadata.internal: true`
to the SKILL.md frontmatter:

```yaml
---
name: my-internal-skill
description: An internal skill
metadata:
  internal: true
---
```

Internal skills are hidden from `npx skills add --list` and the
skills.sh leaderboard. Consumers must set `INSTALL_INTERNAL_SKILLS=1`
to see and install them:

```bash
INSTALL_INTERNAL_SKILLS=1 npx skills add <owner>/<repo> --list
INSTALL_INTERNAL_SKILLS=1 npx skills add <owner>/<repo> --skill <name> --agent codex claude-code -y
```

## Reference: nonslop's install flag

The canonical nonslop install flag is:

```
--agent codex claude-code -y
```

| Argument      | Purpose                                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codex`       | A universal agent. Including it causes the CLI to populate `.agents/skills/<name>`, which is readable by every other universal agent (Cursor, Amp, Antigravity, Cline, OpenClaw, ...) for free. |
| `claude-code` | A dedicated-dir agent. Including it causes the CLI to create the `.claude/skills/<name> -> ../../.agents/skills/<name>` symlink.                                                                |
| `-y`          | Skip confirmation prompts. Makes the command scriptable.                                                                                                                                        |

Do not substitute other agents for `codex`. The nonslop convention is to
use exactly these two so that install commands are uniform across the
repo and PR reviewers know what to expect in the diff.
