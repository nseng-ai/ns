---
name: ns-skill-management
description: "Manage skills in nonslop projects with `npx skills`: add, edit, remove, rename, update, list, or publish skills (local or GitHub). Covers `skills/<name>/` and `.agents/skills/` conventions, the `--agent codex claude-code -y` flag, and `-a`/`--copy` gotchas."
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

## Core rules

- **Canonical source for local skills is `skills/<name>/`.**
  Edit files there directly. The `.agents/skills/<name>` symlink and
  `.claude/skills/<name>` symlink chain resolve to the same place.
- **Committed local `skills-lock.json` entries must use**
  `"source": "skills/<name>"`. If `npx skills add` captures an
  absolute local path, rewrite it to the repo-relative form before
  committing.
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
- **Do not maintain a duplicate skill index in `AGENTS.md`.**
  Installed skills are discovered natively from the on-disk install and
  the `SKILL.md` frontmatter.

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
    "source": "skills/<name>",
    "sourceType": "local",
    "computedHash": "<sha256>"
  }
}
```

`sourceType` is `"local"` for local skills and `"github"` for
`<owner>/<repo>` sources. In nonslop, committed local entries always use
the repo-relative `skills/<name>` form even if `npx skills add` wrote an
absolute path during bootstrap. `computedHash` is captured at install
time and is **not** auto-refreshed -- `npx skills check` only checks
remote sources. A stale hash for a local skill is normal and harmless.

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
# 5. Normalize the committed lockfile entry if the CLI captured an absolute path
#    "source": "/abs/path/to/skills/<name>"  ->  "source": "skills/<name>"
# 6. Verify
ls -la .agents/skills/<name>     # expect: l... -> ../../skills/<name>
ls -la .claude/skills/<name>     # expect: l... -> ../../.agents/skills/<name>
cat .claude/skills/<name>/SKILL.md  # expect: content visible through chain
npx skills list                  # expect: agents include Claude Code, Codex, Cursor
# 7. Stage and commit
git add skills/<name>/ .agents/skills/<name> .claude/skills/<name> skills-lock.json
```

### 2. Add a new skill from GitHub

```bash
npx skills add <owner>/<repo> --agent codex claude-code -y
# Optional: --skill <name1> <name2> to pick specific skills from a multi-skill repo
#   e.g. npx skills add dagster-io/fake-driven-testing --skill fake-driven-testing fdt-refactor-mock-to-fake --agent codex claude-code -y
git add .agents/skills/<name>/ .claude/skills/<name> skills-lock.json
```

GitHub-sourced skills live as real directories under `.agents/skills/<name>/`
(vendored code). Do **not** create a `skills/<name>` entry for them.

### 3. Edit an existing local skill

Edit `skills/<name>/SKILL.md` (or any file under `skills/<name>/`)
directly. Changes propagate live through the `.agents/skills/<name>`
and `.claude/skills/<name>` symlink chain -- no command needed.

### 4. Update a GitHub-sourced skill

```bash
uvx nonslop update-skills              # refresh every github skill in the lockfile
uvx nonslop update-skills --dry-run    # preview which skills would be refreshed
uvx nonslop update-skills --skill <name>    # refresh one skill
uvx nonslop update-skills --source <owner>/<repo>    # limit to one source
git add -A .agents/skills/ skills-lock.json
git diff --cached                      # review the vendored-content changes
```

`nonslop update-skills` walks `skills-lock.json` and runs
`npx skills add <source> --skill <name>` once per entry. This is the
only known-safe refresh path: it touches only skills already in the
lockfile and preserves the curated skill set. Local skills
(`sourceType: "local"`) are skipped -- they are edited in-place.

**Do not use `npx skills update` directly.** The upstream command
interprets each lockfile `source` as "install every skill from that
repo", so a 5-skill lockfile pointing at `nseng-ai/nonslop` balloons
to the full nonslop catalog and silently adds skills the project
never asked for. Tracked upstream at
[vercel-labs/skills#915](https://github.com/vercel-labs/skills/issues/915).
Use `uvx nonslop update-skills` until that is fixed -- the command will
be removed once the upstream bug is resolved.

### 5. Remove a skill

```bash
npx skills remove <name> --agent codex claude-code -y
# For a local skill, also remove the canonical source
rm -rf skills/<name>
git add -u skills/ .agents/skills/ .claude/skills/ skills-lock.json
```

### 6. Rename a local skill

`npx skills` has no rename command. Perform the rename manually:

```bash
# 1. Move the canonical source (preserves git history)
git mv skills/<old> skills/<new>

# 2. Update skills/<new>/SKILL.md frontmatter and heading
#    - name: <old>  →  name: <new>
#    - # <old>      →  # <new>

# 3. Fix symlinks
rm .agents/skills/<old>
ln -s ../../skills/<new> .agents/skills/<new>
rm .claude/skills/<old>
ln -s ../../.agents/skills/<new> .claude/skills/<new>

# 4. Update skills-lock.json
#    - Rename the key from "<old>" to "<new>"
#    - Update "source" from "skills/<old>" to "skills/<new>"

# 5. Update cross-references -- any other skill that mentions the old name
grep -r "<old>" .agents/skills/ skills-lock.json
#    Fix hits in other skills' SKILL.md or reference files.

# 6. Check .claude/settings.local.json for skill-specific permission entries
#    e.g. Skill(<old>) → Skill(<new>)

# 7. Verify
ls -la .agents/skills/<new>     # expect: l... -> ../../skills/<new>
ls -la .claude/skills/<new>     # expect: l... -> ../../.agents/skills/<new>
test ! -e .agents/skills/<old>  # old symlink gone
test ! -e .claude/skills/<old>  # old symlink gone

# 8. Stage and commit
git add skills/<new>/ .agents/skills/<new> .claude/skills/<new> \
  skills-lock.json
git add -u skills/<old> .agents/skills/<old> .claude/skills/<old>
```

GitHub-sourced skills cannot be renamed -- remove and re-add instead
(workflow sections 2 and 5).

### 7. Inspect and troubleshoot

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

**Known CLI quirk:** `npx skills add` may also record an absolute local
path in `skills-lock.json` for a local skill. In nonslop that value must
be normalized back to `skills/<name>` before commit; `nonslop check`
enforces the repo-relative form.

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
- Maintaining a duplicate skill index in `AGENTS.md` -- installed
  skills are discovered natively from on-disk state and frontmatter.
- Leaving `.agents/skills/<name>` as a real directory for a local skill
  after bootstrap -- replace it with a symlink to `../../skills/<name>`.
- Committing an absolute machine-specific local path in
  `skills-lock.json` for a local skill -- normalize it to
  `skills/<name>`.
- Assuming `npx skills check` will catch stale local-skill state --
  it only checks remote sources.
- Deleting `skills/<name>/` without also running `npx skills remove`
  -- leaves dangling lockfile entries and broken symlinks.
- Renaming a local skill by only moving `skills/<old>` without fixing
  the `.agents/skills/` and `.claude/skills/` symlinks, `skills-lock.json`,
  and cross-references -- leaves dangling symlinks and stale references.
