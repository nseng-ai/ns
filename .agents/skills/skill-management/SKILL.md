---
name: skill-management
description: "Manage twerk skills with `npx skills`. Use whenever you need to add a new skill (local or from GitHub), edit an existing skill, remove one, update GitHub-sourced skills, inspect what's installed, or publish skills for external consumption. Covers the twerk convention of `.agents/skills/<name>/` as the canonical source for local skills, the `skills/` directory as the public interface for publishing, and the canonical `--agent codex claude-code -y` install flag. Also covers the hard-won gotchas: never omit `-a` (installs Windsurf), and never use `--copy`."
allowed-tools:
  - "Bash(npx skills *)"
  - "Bash(ln *)"
  - "Bash(rm -rf .agents/skills/*)"
  - "Bash(mkdir *)"
  - "Bash(ls *)"
  - "Bash(readlink *)"
  - "Bash(cat skills-lock.json)"
  - "Bash(grep *)"
  - "Bash(git *)"
---

# skill-management

Manage twerk skills with `npx skills`. This skill is the canonical reference
for every skill-management operation: adding, editing, removing, updating,
inspecting, and publishing skills.

`npx skills` is a CLI from vercel-labs that installs agent skill packages
into a project. It copies skill content into `.agents/skills/<name>/`
(the universal cache) and symlinks agent-specific directories like
`.claude/skills/<name>` back to that cache.

In twerk, **all local skills live as real directories under
`.agents/skills/<name>/`** — the same location where GitHub-sourced skills
are vendored. This means `npx skills list` correctly detects all agents
(Claude Code, Codex, Cursor, etc.) for every skill. Edits to local skills
are made directly in `.agents/skills/<name>/` and propagate live through
the `.claude/skills/<name>` symlink.

## Goal

For every skill-management operation, produce an end state that has:

- a single source of truth on disk (no duplicated content)
- a working `.claude/skills/<name>` entry that Claude Code can read
- a working entry at `.agents/skills/<name>` that Codex, Cursor, Amp,
  and other universal agents can read
- a correct `skills-lock.json` entry recording the source
- a registry entry in AGENTS.md's "Available skills" list
- no `.windsurf/` directory created as a side effect

## Core rules

- **Canonical source for local skills is `.agents/skills/<name>/`.**
  Edit files there directly. For public skills, the `skills/<name>`
  symlink resolves to the same place, so editing through it is equivalent.
- **Always install with `--agent codex claude-code -y`.** Never
  `--agent claude-code` alone (it only creates the `.claude/skills/`
  symlink without populating `.agents/skills/`). Never omit `-a` entirely —
  the CLI auto-detects Windsurf via `~/.codeium/windsurf` and will
  silently create `.windsurf/skills/<name>`.
- **For every local skill, `.agents/skills/<name>` must be a real
  directory** (not a symlink). This ensures `npx skills list` correctly
  detects all agents.
- **Never use `--copy`.** It forces the CLI into copy-only mode, which
  defeats the `.claude/skills/ → .agents/skills/` symlink that the rest
  of the flow depends on.
- **Every new skill must be registered** in AGENTS.md's "Available
  skills" list (alphabetical, one-line entry with description and file
  path). Unregistered skills are invisible to Codex sessions.

## Mental model

```
.agents/skills/<name>/          ← canonical source (real directory, editable)
     ▲                            read by Codex, Cursor, Amp, Cline, OpenClaw, +others
     │
     │ symlink: ../../.agents/skills/<name>   (created by npx skills add)
     │
.claude/skills/<name>           ← Claude Code's dedicated dir
```

For **public** skills only (those intended for external installation):

```
skills/<name>                   ← symlink to ../.agents/skills/<name>
                                  the repo's public interface for `npx skills add`
```

For **GitHub-sourced** skills (`dignified-python`, `graphite`, etc.),
`.agents/skills/<name>` is a directory of vendored third-party content —
it gets committed as-is and is refreshed with `npx skills update`.

For **local** skills (authored in this repo), `.agents/skills/<name>`
is also a real directory, but the content is authored and maintained
in-repo rather than vendored.

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
is **not** auto-refreshed — `npx skills check` only checks remote
sources. A stale hash for a local skill is normal and harmless.

## Workflow

### 1. Add a new local skill

```bash
# 1. Create the skill in a staging directory
mkdir -p skills/<name>/references
# 2. Author skills/<name>/SKILL.md (use .agents/skills/twerk-objective-create/SKILL.md as a template)
# 3. Bootstrap the install — this creates .agents/skills/<name>/ and .claude/skills/<name>
npx skills add ./skills/<name> --agent codex claude-code -y
# 4. Remove the staging directory (content now lives in .agents/skills/<name>/)
rm -rf skills/<name>
# 5. If the skill is PUBLIC, create a symlink for discoverability:
ln -s ../.agents/skills/<name> skills/<name>
# 6. Verify
ls -la .agents/skills/<name>/    # expect: d... (real directory)
ls -la .claude/skills/<name>     # expect: l... -> ../../.agents/skills/<name>
npx skills list                  # expect: agents include Claude Code, Codex, Cursor
# 7. Register in AGENTS.md (Available skills list, alphabetical)
# 8. Stage and commit
git add .agents/skills/<name>/ .claude/skills/<name> skills-lock.json AGENTS.md
# If public: also git add skills/<name>
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

Edit `.agents/skills/<name>/SKILL.md` (or any file under
`.agents/skills/<name>/`) directly. For public skills, editing through
the `skills/<name>` symlink is equivalent. Changes propagate live through
the `.claude/skills/<name>` symlink — no command needed.

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
# For a public local skill, also remove the symlink
git rm skills/<name>             # only if public
# Remove the AGENTS.md registry entry (manually)
git add -u .agents/skills/ .claude/skills/ skills-lock.json AGENTS.md
```

### 6. Inspect and troubleshoot

```bash
npx skills list                  # project skills, one block per skill
npx skills list --json           # machine-readable
npx skills list -g               # global (user-level) skills
cat skills-lock.json             # authoritative source + sourceType + hash
ls -la .agents/skills/           # all entries should be real directories (mode 'd')
```

**Known CLI quirk:** `npx skills check` and `npx skills update` do
**not** detect stale local-skill state. Local skills are edited in-place
and never need refreshing.

**Known CLI quirk:** `npx skills add` without `-a` auto-detects every
installed agent on the machine, including Windsurf (via
`~/.codeium/windsurf`). Always pass `--agent codex claude-code -y`.

**Known CLI quirk:** `npx skills add` is destructive on
`.agents/skills/<name>` — it calls `cleanAndCreateDirectory` then
`copyDirectory` unconditionally. For local skills where
`.agents/skills/<name>` IS the canonical content, rerunning `add` would
destroy the real content. Treat `add` as a one-time bootstrap.

## Publishing skills to skills.sh

The `skills/` directory is the **public interface** for this repo. When
someone runs `npx skills add <owner>/<repo>`, the CLI scans the repo
for `SKILL.md` files at the root level. A `skills/<name>` symlink makes
a local skill discoverable by external consumers without duplicating
content.

**To make a local skill public:**

```bash
# The skill must already exist at .agents/skills/<name>/
ln -s ../.agents/skills/<name> skills/<name>
git add skills/<name>
```

**To keep a skill internal (not publishable):**

Simply don't create a `skills/<name>` entry. The skill still works for
all agents via `.agents/skills/<name>/` and `.claude/skills/<name>` —
it's just not discoverable when someone installs from this repo.

**Current classification:**

| Skill | Visibility | `skills/` entry? |
|-------|-----------|-----------------|
| `twerk-objective-create` | public | yes (symlink) |
| `twerk-objective-progress` | public | yes (symlink) |
| `gt-stackify-branch` | internal | no |
| `skill-management` | internal | no |

## Anti-patterns

- Passing `--copy` — defeats the symlink flow entirely.
- Passing `--agent claude-code` alone — only creates the
  `.claude/skills/` symlink without populating `.agents/skills/`,
  breaking the universal-cache chain.
- Omitting `-a` entirely — installs `.windsurf/skills/<name>` as a
  side effect, which you then have to clean up.
- Creating a new local skill without registering it in AGENTS.md's
  "Available skills" list — it becomes invisible to Codex sessions.
- Rerunning `npx skills add` on an existing local skill — destroys
  the canonical content at `.agents/skills/<name>/`.
- Assuming `npx skills check` will catch stale local-skill state —
  it only checks remote sources.
- Deleting `.agents/skills/<name>/` without also running
  `npx skills remove` and updating AGENTS.md — leaves dangling
  lockfile entries and broken `.claude/skills/` symlinks.
