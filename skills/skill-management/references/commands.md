# `npx skills` command reference

Detailed reference for `npx skills` subcommands, flags, and known quirks. Load
this from `SKILL.md` only when you need deeper command detail than the workflow
sections provide.

## Subcommands

### `add <source>` (alias: `a`)

Install one or more skills. `<source>` can be:

- a GitHub shorthand: `vercel-labs/agent-skills`, `dagster-io/asdl-tools`;
- a full GitHub URL;
- a local path: `./skills/skill-management`;
- a git URL or GitLab URL.

For local skills, the install source may be `./skills/<name>` during bootstrap,
but the committed `skills-lock.json` entry is normalized to
`source: "skills/<name>"`.

Flags:

| Flag                     | Description                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `-g`, `--global`         | Install user-level skills instead of project-level skills.                                                                     |
| `-a`, `--agent <agents>` | Space-separated list of agents to install to. Use `*` for all detected agents. Use `--agent codex claude-code` in this layout. |
| `-s`, `--skill <skills>` | Pick specific skills from a multi-skill repo. Space-separated. Use `*` for all.                                                |
| `-l`, `--list`           | List available skills in the source repository without installing.                                                             |
| `-y`, `--yes`            | Skip all confirmation prompts.                                                                                                 |
| `--copy`                 | Force copy mode for agent-specific dirs instead of symlinks. Do not use with this layout.                                      |
| `--all`                  | Shorthand for `--skill '*' --agent '*' -y`.                                                                                    |
| `--full-depth`           | Search all subdirectories even when a root `SKILL.md` exists.                                                                  |

Examples:

```bash
# Local skill bootstrap (one-time per skill, then replace .agents copy with symlink)
npx skills add ./skills/skill-management --agent codex claude-code -y
rm -rf .agents/skills/skill-management
ln -s ../../skills/skill-management .agents/skills/skill-management

# Internal local skill bootstrap
INSTALL_INTERNAL_SKILLS=1 npx skills add ./skills/internal-pr-stack-address --agent codex claude-code -y
rm -rf .agents/skills/internal-pr-stack-address
ln -s ../../skills/internal-pr-stack-address .agents/skills/internal-pr-stack-address
rm -rf .claude/skills/internal-pr-stack-address
ln -s ../../.agents/skills/internal-pr-stack-address .claude/skills/internal-pr-stack-address

# Single GitHub skill
npx skills add withgraphite/agent-skills --skill graphite --agent codex claude-code -y

# Multi-skill GitHub repo
npx skills add dagster-io/fake-driven-testing \
  --skill fake-driven-testing fdt-refactor-mock-to-fake \
  --agent codex claude-code -y
```

### `remove [skills]` (alias: `rm`)

Remove one or more installed skills.

| Flag                     | Description                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `-g`, `--global`         | Remove from global scope.                                                                                    |
| `-a`, `--agent <agents>` | Remove only from specific agents, e.g. `-a windsurf` removes that agent's symlink but leaves other surfaces. |
| `-s`, `--skill <skills>` | Specify skills to remove.                                                                                    |
| `-y`, `--yes`            | Skip confirmation prompts.                                                                                   |
| `--all`                  | Shorthand for `--skill '*' --agent '*' -y`; destructive, use with care.                                      |

```bash
npx skills remove skill-management --agent codex claude-code -y
npx skills remove skill-management -a windsurf -y
```

### `list` (alias: `ls`)

List installed skills.

| Flag                     | Description                                      |
| ------------------------ | ------------------------------------------------ |
| `-g`, `--global`         | List global skills instead of project skills.    |
| `-a`, `--agent <agents>` | Filter by specific agents.                       |
| `--json`                 | Machine-readable JSON output with no ANSI codes. |

For a simple presence check, prefer plain output plus `rg`:

```bash
INSTALL_INTERNAL_SKILLS=1 npx skills list | rg '<name>'
```

```bash
npx skills list
npx skills list --json
npx skills list -g
npx skills list -a claude-code
```

### `find [query]`

Interactive search. With a keyword, filters by name and description.

```bash
npx skills find
npx skills find typescript
```

### `check`

Check for available updates. Only inspects remote sources (`sourceType:
"github"` and friends). Local skills are never checked.

```bash
npx skills check
```

### `update`

Updates all skills with remote sources. Avoid this for curated project lockfiles;
use `areg update-skills` instead so the update is constrained to the exact skills
already recorded in `skills-lock.json`.

### `init [name]`

Scaffold a starter skill. In this repo layout, copying an existing local skill's
shape is usually a better starting point than the generic starter.

### `experimental_install`

Restore all skills from `skills-lock.json`. Useful on a fresh clone if installed
skill directories are not committed. Less useful when `.agents/skills/` symlinks
and vendored remote skills are checked in.

### `experimental_sync`

Sync skills from `node_modules` into agent directories. Only relevant when skills
are installed as npm packages.

## Agent classification

### Universal agents (read `.agents/skills/`)

These agents read the shared `.agents/skills/` directory directly. In the install
summary, they show under `universal:`. Passing `--agent codex ...` populates this
directory and makes the skill available to every universal agent.

Partial list: **Codex**, Cursor, Amp, Antigravity, Cline, OpenClaw, Zed, and
others.

### Dedicated-dir agents (get their own skills directory)

These agents each have their own skills path. `npx skills add` creates a symlink
from the dedicated dir back to `.agents/skills/<name>`.

| Agent           | Dedicated dir       | Detected via                 |
| --------------- | ------------------- | ---------------------------- |
| **Claude Code** | `.claude/skills/`   | Always enabled.              |
| Windsurf        | `.windsurf/skills/` | `~/.codeium/windsurf` exists |
| Roo             | `.roo/skills/`      | Roo install state            |
| Trae            | `.trae/skills/`     | Trae install state           |
| Zencoder        | `.zencoder/skills/` | Zencoder install state       |

**Windsurf auto-detection gotcha:** if `~/.codeium/windsurf` exists, running
`npx skills add` without `-a` may create `.windsurf/skills/<name>`. The standard
`--agent codex claude-code -y` flag avoids unwanted agent-specific directories.

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
"skill-management": {
  "source": "skills/skill-management",
  "sourceType": "local",
  "computedHash": "..."
}
```

`source` is a path captured at install time. `computedHash` is also captured at
install time and is not refreshed by `skills check`/`update`. Committed local
entries should use the repo-relative `skills/<name>` form. A stale local hash is
harmless because the real content is whatever is currently at `skills/<name>/`.

**GitHub skill:**

```json
"graphite": {
  "source": "withgraphite/agent-skills",
  "sourceType": "github",
  "computedHash": "..."
}
```

`source` is an `<owner>/<repo>` shorthand. `computedHash` is the hash of the
fetched content and is refreshed by remote updates.

## Known CLI quirks

1. **`check`/`update` ignore local skills.** Local skills are edited in place and
   never need refreshing.
2. **`add` auto-detects agents at install time.** Always pass
   `--agent codex claude-code -y` to avoid unwanted agent directories.
3. **`add` is destructive on `.agents/skills/<name>`.** For local skills, it
   replaces the `.agents` symlink with a copy. Recreate the symlink afterward:
   `rm -rf .agents/skills/<name> && ln -s ../../skills/<name> .agents/skills/<name>`.
4. **`remove` cleans up symlinks but not source content.** For a local skill,
   also remove `skills/<name>/` and the lockfile entry.
5. **Internal skills are hidden unless `INSTALL_INTERNAL_SKILLS=1` is set.** If
   `npx skills add` reports `No skills found` for a valid local internal skill,
   rerun the install with `INSTALL_INTERNAL_SKILLS=1`.
6. **Local installs may capture absolute paths in `skills-lock.json`.** Normalize
   committed local entries to `source: "skills/<name>"`.
7. **Review `skills-lock.json` churn before committing.** If the CLI rewrites or
   reorders unrelated entries while adding one skill, minimize the diff unless
   those changes are intentional.

## Skill visibility (internal skills)

To hide a local skill from external discovery, add `metadata.internal: true` to
`SKILL.md` frontmatter:

```yaml
---
name: my-internal-skill
description: An internal skill
metadata:
  internal: true
---
```

Internal skills are hidden from `npx skills add --list` and public discovery.
Consumers must set `INSTALL_INTERNAL_SKILLS=1` to see and install them:

```bash
INSTALL_INTERNAL_SKILLS=1 npx skills add <owner>/<repo> --list
INSTALL_INTERNAL_SKILLS=1 npx skills add <owner>/<repo> --skill <name> --agent codex claude-code -y
```

## Reference: install flag

The canonical install flag is:

```text
--agent codex claude-code -y
```

| Argument      | Purpose                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `codex`       | A universal agent. Including it causes the CLI to populate `.agents/skills/<name>`, readable by other universal agents.          |
| `claude-code` | A dedicated-dir agent. Including it causes the CLI to create the `.claude/skills/<name> -> ../../.agents/skills/<name>` symlink. |
| `-y`          | Skip confirmation prompts. Makes the command scriptable.                                                                         |

Use exactly these flags for project installs so diffs stay predictable.
