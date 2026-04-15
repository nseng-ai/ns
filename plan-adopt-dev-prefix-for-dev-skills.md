# Adopt `dev-` prefix for dev/prototype skills

## Context

Twerk's `skills/` directory mixes two kinds of skills:

1. **Published features** — skills twerk ships to external consumers via `npx skills add` (the `objective-*` quartet, `pr-address`). These are user-facing products.
2. **Dev skills** — skills used only by twerk contributors. Two sub-flavors:
   - Pure dev helpers (`gh` — GitHub CLI mental model; `fix-just` — `just`-runner)
   - Prototype features being dogfooded before graduating to published (`plan-to-branch`)

Currently there's no visible signal distinguishing the two. `gh` has `metadata.internal: true` in its frontmatter (which hides it from external discovery), but `fix-just` and `plan-to-branch` lack even that flag. A reader scanning `skills/` cannot tell at a glance which skills are products vs contributor tooling.

**Goal:** introduce a `dev-` prefix naming convention for all dev skills so the status is visible in every directory listing. Graduation of a prototype to a published feature = drop the prefix (explicit promotion ritual). Also add the missing `metadata.internal: true` flags for tool-level filtering (belt-and-suspenders).

## Scope

Three skills are renamed:

| Current          | New                  |
| ---------------- | -------------------- |
| `gh`             | `dev-gh`             |
| `fix-just`       | `dev-fix-just`       |
| `plan-to-branch` | `dev-plan-to-branch` |

No behavior changes. No skill content changes beyond identity references (frontmatter `name:`, section headings that cite the skill by name).

## Directory structure (preserved)

Each skill has a three-way structure:

- `.agents/skills/<name>/` — canonical real directory
- `skills/<name>` → symlink to `../.agents/skills/<name>`
- `.claude/skills/<name>` → symlink to `../../.agents/skills/<name>`

All three are renamed in lockstep. The existing symlink topology is preserved (despite `ns-skill-management` documenting the opposite orientation — not addressed here to keep scope tight).

**Symlink policy for dev skills:** keep the `skills/` symlink. Rationale: the `dev-` prefix is the visible dev-marker, and keeping the symlink means `skills/` remains the one-stop directory listing for everything local to twerk. External discovery is still blocked by `metadata.internal: true`.

## Files to modify

### Directory renames (preserve symlink chain)

```
.agents/skills/gh              → .agents/skills/dev-gh
.agents/skills/fix-just        → .agents/skills/dev-fix-just
.agents/skills/plan-to-branch  → .agents/skills/dev-plan-to-branch

skills/gh              (symlink) → skills/dev-gh              → ../.agents/skills/dev-gh
skills/fix-just        (symlink) → skills/dev-fix-just        → ../.agents/skills/dev-fix-just
skills/plan-to-branch  (symlink) → skills/dev-plan-to-branch  → ../.agents/skills/dev-plan-to-branch

.claude/skills/gh              (symlink) → .claude/skills/dev-gh              → ../../.agents/skills/dev-gh
.claude/skills/fix-just        (symlink) → .claude/skills/dev-fix-just        → ../../.agents/skills/dev-fix-just
.claude/skills/plan-to-branch  (symlink) → .claude/skills/dev-plan-to-branch  → ../../.agents/skills/dev-plan-to-branch
```

### SKILL.md frontmatter updates

`.agents/skills/dev-gh/SKILL.md` line 2:

- `name: gh` → `name: dev-gh`
- Keep existing `metadata.internal: true`

`.agents/skills/dev-fix-just/SKILL.md` line 2:

- `name: fix-just` → `name: dev-fix-just`
- Add `metadata:\n  internal: true` to frontmatter

`.agents/skills/dev-plan-to-branch/SKILL.md` line 2:

- `name: plan-to-branch` → `name: dev-plan-to-branch`
- Add `metadata:\n  internal: true` to frontmatter

### SKILL.md body updates (section headings that cite skill name)

`.agents/skills/dev-fix-just/SKILL.md`:

- Line 16: `# fix-just` → `# dev-fix-just`
- Line 68: `## fix-just: SUCCESS` → `## dev-fix-just: SUCCESS`
- Line 82: `## fix-just: STUCK` → `## dev-fix-just: STUCK`

`.agents/skills/dev-plan-to-branch/SKILL.md`:

- Line 18: `# plan-to-branch` → `# dev-plan-to-branch`

`.agents/skills/dev-gh/SKILL.md`: no body headings cite the bare skill name (verify during execution).

### AGENTS.md updates

- Line 36 (GitHub Backend Interactions section): `` `.claude/skills/gh/SKILL.md` `` → `` `.claude/skills/dev-gh/SKILL.md` ``, and `` `gh` skill `` → `` `dev-gh` skill ``.
- Line 49 (Available skills): `fix-just:` entry → `dev-fix-just:`, path → `.claude/skills/dev-fix-just/SKILL.md`.
- Line 57: `plan-to-branch:` entry → `dev-plan-to-branch:`, path → `.claude/skills/dev-plan-to-branch/SKILL.md`.
- (No current entry for `gh` in the Available skills list — consistent with its `internal: true` status. Leave absent.)

**Add a new convention subsection** after line 32 (end of "Vendored Skill Code"), before line 34 ("GitHub Backend Interactions"):

```markdown
### Dev Skill Naming Convention

Skills prefixed with `dev-` are developer-only tooling — either pure contributor helpers (`dev-gh`, `dev-fix-just`) or prototype features being dogfooded before graduation (`dev-plan-to-branch`). Dev skills additionally carry `metadata.internal: true` in their `SKILL.md` frontmatter to hide them from external `npx skills add` discovery. A prototype graduates to a published feature by (1) dropping the `dev-` prefix in all three directory locations and every reference, and (2) removing the `internal: true` frontmatter flag.
```

### skills-lock.json updates

Three key renames + three `source` path updates:

- Lines 9–13: key `"fix-just"` → `"dev-fix-just"`; `source` path `skills/fix-just` → `skills/dev-fix-just`.
- Lines 14–18: key `"gh"` → `"dev-gh"`; `source` path `skills/gh` → `skills/dev-gh`.
- Lines 124–128: key `"plan-to-branch"` → `"dev-plan-to-branch"`; `source` path `skills/plan-to-branch` → `skills/dev-plan-to-branch`.

### .claude/settings.local.json updates

Lines 11–15 are `Bash(cp ...)` permission entries that sync skill content from `/Users/schrockn/code/erk/.claude/skills/gh/...` into twerk's `.agents/skills/gh/...`. The **source** (erk) paths stay as-is (not our repo). The **destination** (twerk) paths change:

- `/Users/schrockn/code/twerk/.agents/skills/gh/` → `/Users/schrockn/code/twerk/.agents/skills/dev-gh/` in all five entries.

## Execution order

1. Rename the three real directories under `.agents/skills/`.
2. Rewrite the six symlinks under `skills/` and `.claude/skills/` to point at new targets with new names.
3. Edit the three `SKILL.md` files: frontmatter `name:` + add `internal: true` (two files) + body section headings (four lines across two files).
4. Edit `AGENTS.md`: three registry/reference updates + add new Dev Skill Naming Convention subsection.
5. Edit `skills-lock.json`: three key renames + three source path updates.
6. Edit `.claude/settings.local.json`: five destination-path updates.

## Verification

- `ls -la skills/ .claude/skills/ .agents/skills/` — confirm all three skills appear as `dev-*` in all three locations, symlinks resolve.
- `readlink skills/dev-gh skills/dev-fix-just skills/dev-plan-to-branch` — confirm targets are `../.agents/skills/dev-*`.
- `readlink .claude/skills/dev-gh .claude/skills/dev-fix-just .claude/skills/dev-plan-to-branch` — confirm targets are `../../.agents/skills/dev-*`.
- `head -10` each renamed `SKILL.md` — confirm `name:` matches directory and `metadata.internal: true` present.
- `grep -rn "plan-to-branch\|fix-just" AGENTS.md skills-lock.json .claude/settings.local.json` — confirm only `dev-` prefixed forms remain (aside from erk-sourced paths in settings.local.json which keep bare names).
- `grep -n "\`gh\` skill\|skills/gh" AGENTS.md`— confirm the remaining`gh`references in AGENTS.md point to`dev-gh`.
- Open a fresh Claude Code session in twerk and check that `/dev-fix-just`, `/dev-plan-to-branch` are recognized.
- Invoke `dev-plan-to-branch` against a trivial plan in a test branch to confirm functional parity with pre-rename behavior.

## Out of scope

- Fixing the inverted symlink orientation (real dirs currently in `.agents/skills/`, symlinks in `skills/`; `ns-skill-management` documents the opposite).
- Renames in the sibling `/Users/schrockn/code/erk/` repo (the erk source paths in `settings.local.json` stay unchanged).
- Any content changes to skill bodies beyond section headings that cite the skill's own name.
