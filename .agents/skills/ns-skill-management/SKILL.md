---
name: ns-skill-management
description: "Manage skills in nonslop projects with `npx skills`. Use whenever you need to add a new skill (local or from GitHub), edit an existing skill, remove one, update GitHub-sourced skills, inspect what's installed, or publish skills for external consumption. Covers the convention of `skills/<name>/` as the canonical source for local skills, `.agents/skills/` for vendored code, and the canonical `--agent codex claude-code -y` install flag. Also covers the hard-won gotchas: never omit `-a` (installs unwanted artifacts sometimes), and never use `--copy`."
allowed-tools:
  - "Bash(npx skills *)"
  - "Bash(ln *)"
  - "Bash(rm -rf .agents/skills/*)"
  - "Bash(rm -rf skills/*)"
  - "Bash(rm skills/*)"
  - "Bash(mv *)"
  - "Bash(mkdir *)"
  - "Bash(ls *)"
  - "Bash(readlink *)"
  - "Bash(cat skills-lock.json)"
  - "Bash(grep *)"
  - "Bash(git *)"
---

# ns-skill-management

Manage skills in nonslop projects with `npx skills`. This skill is the canonical reference
for every skill-management operation: adding, editing, removing, updating,
inspecting, and publishing skills.

`npx skills` is a CLI from vercel-labs that installs agent skill packages
into a project. It copies skill content into `.agents/skills/<name>/`
(the universal cache) and symlinks agent-specific directories like
`.claude/skills/<name>` back to that cache.

In nonslop, **all local skills live as real directories under
`skills/<name>/`** -- separate from GitHub-sourced skills which are
vendored into `.agents/skills/<name>/`. For local skills,
`.agents/skills/<name>` is a symlink back to `../../skills/<name>`,
so all agents (Claude Code, Codex, Cursor, etc.) can still discover
them. Edits to local skills are made directly in `skills/<name>/` and
propagate live through the symlink chain.

This separation means you can lint, typecheck, or review everything
under `skills/` as first-party code without touching vendored content.

## Goal

For every skill-management operation, produce an end state that has:

- a single source of truth on disk (no duplicated content)
- a working `.claude/skills/<name>` entry that Claude Code can read
- a working entry at `.agents/skills/<name>` that Codex, Cursor, Amp,
  and other universal agents can read
- a correct `skills-lock.json` entry recording the source
- a registry entry in AGENTS.md's "Available skills" list

## Core rules

- **Canonical source for local skills is `skills/<name>/`.**
  Edit files there directly. The `.agents/skills/<name>` symlink and
  `.claude/skills/<name>` symlink chain resolve to the same place.
- **Always install with `--agent codex claude-code -y`.** Never
  `--agent claude-code` alone (it only creates the `.claude/skills/`
  symlink without populating `.agents/skills/`). Never omit `-a` entirely --
  the CLI auto-detects Windsurf via `~/.codeium/windsurf` and will
  silently create `.windsurf/skills/<name>`.
- **For every local skill, `.agents/skills/<name>` must be a symlink**
  pointing to `../../skills/<name>`. This keeps vendored and local
  content cleanly separated while ensuring all agents can discover
  the skill.
- **Never use `--copy`.** It forces the CLI into copy-only mode, which
  defeats the `.claude/skills/ -> .agents/skills/` symlink that the rest
  of the flow depends on.
- **Every new skill must be registered** in AGENTS.md's "Available
  skills" list (alphabetical, one-line entry with description and file
  path). Unregistered skills are invisible to Codex sessions.

## Mental model

For **local** skills (authored in this repo):

```
skills/<name>/                  <- canonical source (real directory, editable)
     ^                            first-party code -- lintable, reviewable
     |
     | symlink: ../../skills/<name>
     |
.agents/skills/<name>           <- universal agent directory
     ^                            read by Codex, Cursor, Amp, Cline, OpenClaw, +others
     |
     | symlink: ../../.agents/skills/<name>   (created by npx skills add)
     |
.claude/skills/<name>           <- Claude Code's dedicated dir
```

For **GitHub-sourced** skills (`dignified-python`, `graphite`, etc.):

```
.agents/skills/<name>/          <- vendored third-party content (real directory)
     ^                            refreshed with npx skills update
     |
     | symlink: ../../.agents/skills/<name>   (created by npx skills add)
     |
.claude/skills/<name>           <- Claude Code's dedicated dir
```

GitHub-sourced skills do NOT get a `skills/<name>` entry.

### `skills-lock.json`

Records one entry per installed skill:

```json
{
  "<name>": {
    "source": "<path-or-repo>",
    "sourceType": "local",
    "computedHash": "<sha256>"
  }
}
```

`sourceType` is `"local"` for local skills and `"github"` for
`<owner>/<repo>` sources. `computedHash` is captured at install time and
is **not** auto-refreshed -- `npx skills check` only checks remote
sources. A stale hash for a local skill is normal and harmless.

## Workflow

### 1. Add a new local skill

```bash
# 1. Create the skill in its permanent home
mkdir -p skills/<name>/references
# 2. Author skills/<name>/SKILL.md (use skills/ns-skill-management/SKILL.md as a template)
# 3. Bootstrap the install -- this creates .agents/skills/<name>/ (real dir) and .claude/skills/<name>
npx skills add ./skills/<name> --agent codex claude-code -y
# 4. Replace the CLI's copy with a symlink back to the canonical source
rm -rf .agents/skills/<name>
ln -s ../../skills/<name> .agents/skills/<name>
# 5. Verify
ls -la .agents/skills/<name>     # expect: l... -> ../../skills/<name>
ls -la .claude/skills/<name>     # expect: l... -> ../../.agents/skills/<name>
cat .claude/skills/<name>/SKILL.md  # expect: content visible through chain
npx skills list                  # expect: agents include Claude Code, Codex, Cursor
# 6. Register in AGENTS.md (Available skills list, alphabetical)
# 7. Stage and commit
git add skills/<name>/ .agents/skills/<name> .claude/skills/<name> skills-lock.json AGENTS.md
```

### 2. Add a new skill from GitHub

```bash
npx skills add <owner>/<repo> --agent codex claude-code -y
# Optional: --skill <name1> <name2> to pick specific skills from a multi-skill repo
#   e.g. npx skills add dagster-io/fake-driven-testing --skill fake-driven-testing fdt-refactor-mock-to-fake --agent codex claude-code -y
# Register each installed skill in AGENTS.md
git add .agents/skills/<name>/ .claude/skills/<name> skills-lock.json AGENTS.md
```

GitHub-sourced skills live as real directories under `.agents/skills/<name>/`
(vendored code). Do **not** create a `skills/<name>` entry for them.

### 3. Edit an existing local skill

Edit `skills/<name>/SKILL.md` (or any file under `skills/<name>/`)
directly. Changes propagate live through the `.agents/skills/<name>`
and `.claude/skills/<name>` symlink chain -- no command needed.

### 4. Update a GitHub-sourced skill

```bash
npx skills check             # shows which remote skills have updates
npx skills update            # pulls latest for all updatable skills
git add -A .agents/skills/ skills-lock.json
git diff --cached            # review the vendored-content changes
```

`check` and `update` only touch skills with `sourceType: "github"`.
Local skills are never modified by these commands.

### 5. Remove a skill

```bash
npx skills remove <name> --agent codex claude-code -y
# For a local skill, also remove the canonical source
rm -rf skills/<name>
# Remove the AGENTS.md registry entry (manually)
git add -u skills/ .agents/skills/ .claude/skills/ skills-lock.json AGENTS.md
```

### 6. Inspect and troubleshoot

```bash
npx skills list                  # project skills, one block per skill
npx skills list --json           # machine-readable
npx skills list -g               # global (user-level) skills
cat skills-lock.json             # authoritative source + sourceType + hash
ls -la .agents/skills/           # local skills: symlinks; vendored: real dirs
ls -la skills/                   # all local skills (real directories)
```

**Known CLI quirk:** `npx skills check` and `npx skills update` do
**not** detect stale local-skill state. Local skills are edited in-place
and never need refreshing.

**Known CLI quirk:** `npx skills add` without `-a` auto-detects every
installed agent on the machine, including Windsurf (via
`~/.codeium/windsurf`). Always pass `--agent codex claude-code -y`.

**Known CLI quirk:** `npx skills add` is destructive on
`.agents/skills/<name>` -- it calls `cleanAndCreateDirectory` then
`copyDirectory` unconditionally. For local skills this replaces the
symlink at `.agents/skills/<name>` with a real directory (a copy of the
content from `skills/<name>/`). The canonical content in `skills/<name>/`
is safe -- just re-create the symlink:

```bash
rm -rf .agents/skills/<name>
ln -s ../../skills/<name> .agents/skills/<name>
```

## Skill visibility

All local skills live in `skills/` and are discoverable by external
consumers via `npx skills add <owner>/<repo>`. To hide a skill from
external discovery, add `metadata.internal: true` to the SKILL.md
frontmatter:

```yaml
---
name: my-internal-skill
description: An internal skill not shown by default
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

**Current classification:**

| Skill                 | Visibility | `metadata.internal`? |
| --------------------- | ---------- | -------------------- |
| `ns-skill-management` | public     | no                   |

## Anti-patterns

- Passing `--copy` -- defeats the symlink flow entirely.
- Passing `--agent claude-code` alone -- only creates the
  `.claude/skills/` symlink without populating `.agents/skills/`,
  breaking the universal-cache chain.
- Omitting `-a` entirely -- installs `.windsurf/skills/<name>` as a
  side effect, which you then have to clean up.
- Creating a new local skill without registering it in AGENTS.md's
  "Available skills" list -- it becomes invisible to Codex sessions.
- Leaving `.agents/skills/<name>` as a real directory for a local skill
  after bootstrap -- replace it with a symlink to `../../skills/<name>`.
- Assuming `npx skills check` will catch stale local-skill state --
  it only checks remote sources.
- Deleting `skills/<name>/` without also running `npx skills remove`
  and updating AGENTS.md -- leaves dangling lockfile entries and broken
  symlinks.
