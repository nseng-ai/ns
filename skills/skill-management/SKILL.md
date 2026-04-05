---
name: skill-management
description: "Manage twerk skills with `npx skills`. Use whenever you need to add a new skill (local or from GitHub), edit an existing skill, remove one, update GitHub-sourced skills, inspect what's installed, fix a stale install, or migrate a legacy copied local skill into the symlink-based single-source-of-truth layout that twerk uses. Covers the twerk convention of authoring local skills in `skills/<name>/`, bootstrapping with `npx skills add ./skills/<name> --agent codex claude-code -y`, and replacing the copied `.agents/skills/<name>` directory with a manual symlink back to `../../skills/<name>` so the repo has zero duplicated skill content. Also covers the hard-won gotchas: never rerun `add` on a symlinked local skill, never omit `-a` (installs Windsurf), and never use `--copy`."
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

Manage twerk skills with `npx skills` using the repo's single-source-of-truth
symlink layout. This skill is the canonical reference for every
skill-management operation: adding, editing, removing, updating, inspecting,
and migrating skills.

`npx skills` is a CLI from vercel-labs that installs agent skill packages
into a project. By default it copies skill content into `.agents/skills/<name>/`
(its "canonical cache") and symlinks agent-specific directories like
`.claude/skills/<name>` back to that cache. For GitHub-sourced skills this is
fine — the cache is vendored third-party code. For **local** skills authored
in this repo, the default behavior produces two copies of the same content
(`skills/<name>/` and `.agents/skills/<name>/`), which bloats the repo and
doubles every PR diff.

Twerk fixes this by replacing the copied `.agents/skills/<name>` directory
with a manual symlink to `../../skills/<name>`. After that, the chain
`skills/<name>/ ← .agents/skills/<name> ← .claude/skills/<name>` is all
symlinks pointing at one real copy, and edits to `skills/<name>/SKILL.md`
propagate live.

## Goal

For every skill-management operation, produce an end state that has:

- a single source of truth on disk (no duplicated content for local skills)
- a working `.claude/skills/<name>` entry that Claude Code can read
- a working universal-cache entry at `.agents/skills/<name>` that Codex,
  Cursor, Amp, and other universal agents can read
- a correct `skills-lock.json` entry recording the source
- a registry entry in AGENTS.md's "Available skills" list
- no `.windsurf/` directory created as a side effect

## Core rules

- **Canonical source for local skills lives in `skills/<name>/`.** Never
  edit files under `.agents/skills/<name>/` or `.claude/skills/<name>/`
  for a local skill — those paths are symlinks that resolve back to the
  source, and editing them through the chain is confusing.
- **Always install with `--agent codex claude-code -y`.** Never
  `--agent claude-code` alone (it only creates the `.claude/skills/`
  symlink without populating `.agents/skills/`, breaking the chain for
  Codex and every other universal agent). Never omit `-a` entirely —
  the CLI auto-detects Windsurf via `~/.codeium/windsurf` and will
  silently create `.windsurf/skills/<name>`.
- **For every local skill, `.agents/skills/<name>` must be a symlink**
  to `../../skills/<name>`. Not a directory. Check with
  `ls -la .agents/skills/<name>` — the mode column must start with `l`.
- **Never rerun `npx skills add ./skills/<name>` after the initial
  bootstrap.** The CLI unconditionally calls `cleanAndCreateDirectory`
  + `copyDirectory` on the canonical dir, which deletes the symlink
  and replaces it with a copied directory. To refresh a local skill
  after edits, no command is needed — changes flow through the
  symlink chain live. If you accidentally clobber the symlink, use
  Workflow 6 to restore it.
- **Never use `--copy`.** It forces the CLI into copy-only mode, which
  defeats the `.claude/skills/ → .agents/skills/` symlink that the rest
  of the flow depends on.
- **Every new skill must be registered** in AGENTS.md's "Available
  skills" list (alphabetical, one-line entry with description and file
  path). Unregistered skills are invisible to Codex sessions.

## Mental model

```
skills/<name>/                  ← source of truth (tracked, editable)
     ▲
     │ symlink: ../../skills/<name>       (manual, one-time bootstrap)
     │
.agents/skills/<name>           ← universal cache, read by Codex, Cursor,
     ▲                            Amp, Antigravity, Cline, OpenClaw, +others
     │ symlink: ../../.agents/skills/<name>   (created by npx skills add)
     │
.claude/skills/<name>           ← Claude Code's dedicated dir
```

For **GitHub-sourced** skills (`dignified-python`, `graphite`, etc.),
`.agents/skills/<name>` is legitimately a directory of vendored
third-party content — it gets committed as-is and is refreshed with
`npx skills update`. Do not symlink it; there is no `skills/<name>/`
source to point at.

For **local** skills (authored in this repo), `.agents/skills/<name>`
is a symlink to `../../skills/<name>`, and the real content lives at
`skills/<name>/`. Both `objective-create` and `skill-management` follow
this pattern.

### `skills-lock.json`

Records one entry per installed skill:

```json
{
  "<name>": {
    "source": "/Users/schrockn/code/twerk/skills/<name>",
    "sourceType": "local",
    "computedHash": "<sha256>"
  }
}
```

`sourceType` is `"local"` for `skills/<name>/` paths and `"github"` for
`<owner>/<repo>` sources. `computedHash` is captured at install time and
is **not** auto-refreshed — `npx skills check` only checks remote
sources. A stale hash for a local skill is normal and harmless; the
real content is whatever is at `skills/<name>/` right now.

## Workflow

### 1. Add a new local skill

```bash
# 1. Create the source layout
mkdir -p skills/<name>/references
# 2. Author skills/<name>/SKILL.md (use skills/objective-create/SKILL.md as a template)
# 3. Bootstrap the install — this is the ONLY time you run `skills add` for this skill
cd /Users/schrockn/code/twerk
npx skills add ./skills/<name> --agent codex claude-code -y
# 4. Replace the copied canonical dir with a symlink to the source
rm -rf .agents/skills/<name>
ln -s ../../skills/<name> .agents/skills/<name>
# 5. Verify the chain
ls -la .agents/skills/<name>     # expect: l... -> ../../skills/<name>
ls -la .claude/skills/<name>     # expect: l... -> ../../.agents/skills/<name>
readlink .agents/skills/<name>   # expect: ../../skills/<name>
readlink .claude/skills/<name>   # expect: ../../.agents/skills/<name>
# 6. Register in AGENTS.md (Available skills list, alphabetical)
# 7. Stage and commit everything
git add skills/<name>/ .agents/skills/<name> .claude/skills/<name> skills-lock.json AGENTS.md
git status
git diff --stat --cached
```

The `git diff --stat --cached` for a well-formed local-skill commit shows:
the real content once under `skills/<name>/`, two one-line symlinks under
`.agents/skills/<name>` and `.claude/skills/<name>` (mode `120000`), a
`skills-lock.json` addition, and the AGENTS.md registry line. No duplicated
content anywhere.

### 2. Add a new skill from GitHub

```bash
npx skills add <owner>/<repo> --agent codex claude-code -y
# Optional: --skill <name1> <name2> to pick specific skills from a multi-skill repo
#   e.g. npx skills add dagster-io/fake-driven-testing --skill fake-driven-testing fdt-refactor-mock-to-fake --agent codex claude-code -y
# Register each installed skill in AGENTS.md
git add .agents/skills/<name>/ .claude/skills/<name> skills-lock.json AGENTS.md
```

GitHub-sourced skills live as real directories under `.agents/skills/<name>/`
(vendored code) — do **not** symlink them, there is no `skills/<name>/`
source.

### 3. Edit an existing local skill

Just edit `skills/<name>/SKILL.md` (or any file under `skills/<name>/`)
directly. Because `.agents/skills/<name>` is a symlink to the source,
changes propagate through the chain live. **Do not rerun
`npx skills add ./skills/<name>`** — it will clobber the symlink and
reintroduce a copied directory.

Verify the edit is visible through the chain:

```bash
head -5 .claude/skills/<name>/SKILL.md    # should show your new content
```

If you see stale content, the symlink chain is broken — go to Workflow 6.

### 4. Update a GitHub-sourced skill

```bash
npx skills check             # shows which remote skills have updates
npx skills update            # pulls latest for all updatable skills
git add -A .agents/skills/ skills-lock.json
git diff --cached            # review the vendored-content changes
```

`check` and `update` only touch skills with `sourceType: "github"` (or
similar remote types). Local skills are never modified by these commands.

### 5. Remove a skill

```bash
npx skills remove <name> --agent codex claude-code -y
# For a local skill, also delete the source
git rm -r skills/<name>/         # only if local
# Remove the AGENTS.md registry entry (manually)
git add -u .agents/skills/ .claude/skills/ skills-lock.json AGENTS.md
```

Note: if the skill's `.agents/skills/<name>` was a manual symlink to
`skills/<name>/`, `npx skills remove` will delete the symlink (not the
source). You still need `git rm -r skills/<name>/` to delete the source.

### 6. Migrate a legacy copied local skill to symlinked

For local skills that were installed before this convention, or that
were clobbered by an accidental `npx skills add` rerun:

```bash
# Check the current state
ls -la .agents/skills/<name>     # if mode starts with 'd', it's a copied directory
# Replace the directory with a symlink
git rm -rf .agents/skills/<name>
ln -s ../../skills/<name> .agents/skills/<name>
git add .agents/skills/<name>
# Verify and commit
ls -la .agents/skills/<name>     # mode must now start with 'l'
git diff --stat --cached         # expect net -N / +1 (one symlink added, N file lines removed)
git commit -m "Replace .agents/skills/<name> copy with symlink"
```

The `.claude/skills/<name>` symlink is already correct — it points at
`.agents/skills/<name>`, which now resolves through to `skills/<name>/`.

### 7. Inspect and troubleshoot

```bash
npx skills list                  # project skills, one block per skill
npx skills list --json           # machine-readable
npx skills list -g               # global (user-level) skills
cat skills-lock.json             # authoritative source + sourceType + hash
grep -A3 '"<name>"' skills-lock.json
ls -la .agents/skills/           # see which entries are directories vs symlinks
```

**Known CLI quirk:** after you replace `.agents/skills/<name>` with a
manual symlink, `npx skills list` shows reduced agent info for that
skill (typically just "OpenClaw" in the agents line). This is a
cosmetic CLI accounting issue — the runtime resolution still works
because Claude Code and all universal agents follow symlinks
transparently. Verify functional state with `ls -la` and `readlink`
rather than trusting `skills list`'s agent column for manually
symlinked skills.

**Known CLI quirk:** `npx skills check` and `npx skills update` do
**not** detect stale local-skill state. If you believe a local skill's
cache is out of date, verify the symlink chain first with `readlink`.
If the chain is intact, there is nothing to refresh — the source is
the cache.

**Known CLI quirk:** `npx skills add` without `-a` auto-detects every
installed agent on the machine, including Windsurf (via
`~/.codeium/windsurf`). Always pass `--agent codex claude-code -y`.

## Anti-patterns

- Rerunning `npx skills add ./skills/<name>` on a symlinked local skill
  "to refresh it" — clobbers the symlink and reintroduces duplication.
- Passing `--copy` — defeats the symlink flow entirely.
- Passing `--agent claude-code` alone — only creates the
  `.claude/skills/` symlink without populating `.agents/skills/`,
  breaking the universal-cache chain.
- Omitting `-a` entirely — installs `.windsurf/skills/<name>` as a
  side effect, which you then have to clean up.
- Editing files under `.agents/skills/<name>/` or `.claude/skills/<name>/`
  for a local skill — they resolve through symlinks; edit
  `skills/<name>/` instead.
- Creating a new local skill without registering it in AGENTS.md's
  "Available skills" list — it becomes invisible to Codex sessions.
- Committing a local-skill PR without first verifying
  `ls -la .agents/skills/<name>` shows mode `l` — the PR will ship
  duplicated content.
- Assuming `npx skills check` will catch stale local-skill state —
  it only checks remote sources.
- Deleting `skills/<name>/` without also running `npx skills remove`
  and updating AGENTS.md — leaves dangling lockfile entries and
  broken symlinks.
