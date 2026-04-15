# Flip skill-directory orientation to match `ns-skill-management`

## Context

Twerk inherited erk's **inverted** skill-directory orientation: `.agents/skills/<name>/` is the real canonical directory for local skills, with `skills/<name>` as a symlink pointing back at it. The upstream `ns-skill-management` skill documents the opposite: `skills/<name>/` is canonical, `.agents/skills/<name>` is the symlink.

This deviation produces three concrete problems:

1. **AGENTS.md §"Vendored Skill Code" is a lie.** The rule "treat all files under `.agents/skills/` as vendored third-party code" and "exclude `.agents/skills/**/*.py` from normal linting/review" applies broadly — but twerk-authored skills live there too, so first-party code silently escapes review.
2. **Re-bootstrap is destructive.** `npx skills add ./skills/<name>` calls `cleanAndCreateDirectory` on `.agents/skills/<name>` unconditionally — which under the current orientation **wipes the canonical source**. Under the ns convention the same command only clobbers a symlink that gets recreated.
3. **Every upstream workflow needs twerk-specific adaptation** (rename, add, peer-repo). The previous commit on this branch (plan `plan-adopt-dev-prefix-for-dev-skills.md`) listed this as explicit out-of-scope; this plan resolves it.

Additionally, the user identified that `gt-stackify-branch` lacks a `skills/` entry (pre-existing inconsistency vs. other local skills) AND should carry the `dev-` prefix under the convention introduced in the prior commit on this branch. Both are folded into the flip since they touch the same directory.

Intended outcome: twerk skill layout matches `ns-skill-management`'s documented convention verbatim, upstream workflows become drop-in, lint/review scope becomes correct, and `gt-stackify-branch` joins the dev-prefix + internal-metadata convention alongside `dev-gh` / `dev-fix-just` / `dev-plan-to-branch`.

## Scope

**9 local skills** (per `skills-lock.json` `sourceType: "local"`) move from real-dir-in-`.agents/skills/` to real-dir-in-`skills/`:

| Current real dir | New real dir | Existing `skills/` symlink? |
|---|---|---|
| `.agents/skills/dev-fix-just/` | `skills/dev-fix-just/` | yes (replace) |
| `.agents/skills/dev-gh/` | `skills/dev-gh/` | yes (replace) |
| `.agents/skills/dev-plan-to-branch/` | `skills/dev-plan-to-branch/` | yes (replace) |
| `.agents/skills/objective-create/` | `skills/objective-create/` | yes (replace) |
| `.agents/skills/objective-list/` | `skills/objective-list/` | yes (replace) |
| `.agents/skills/objective-progress/` | `skills/objective-progress/` | yes (replace) |
| `.agents/skills/objective-reconcile/` | `skills/objective-reconcile/` | yes (replace) |
| `.agents/skills/pr-address/` | `skills/pr-address/` | yes (replace) |
| `.agents/skills/gt-stackify-branch/` | `skills/dev-gt-stackify-branch/` | **no** (adds one; also renames to dev- prefix) |

**GitHub-sourced skills unchanged** (stay as real dirs under `.agents/skills/`): `fdt-refactor-mock-to-fake`, `graphite`, `ns-*` (×13), `nsx`, `skill-creator`.

**`.claude/skills/<name>` symlinks unchanged** — they continue to point at `../../.agents/skills/<name>` and resolve transitively through the new two-hop chain. Only the `gt-stackify-branch` → `dev-gt-stackify-branch` symlink gets renamed.

## Post-flip shape (per local skill)

```
skills/<name>/              (real dir, canonical, git-tracked)
.agents/skills/<name>       → ../../skills/<name>        (symlink)
.claude/skills/<name>       → ../../.agents/skills/<name> (symlink, unchanged)
```

For `dev-gt-stackify-branch` specifically: rename + flip in one `git mv`.

## Files to modify

### Directory moves (real dir from `.agents/skills/` → `skills/`)

For each of the 8 non-renaming skills (preserves git history via `git mv` on subtree):

```
git rm skills/<name>                               # drop the old symlink
git mv .agents/skills/<name> skills/<name>          # move the real dir
ln -s ../../skills/<name> .agents/skills/<name>     # create the new symlink
git add .agents/skills/<name>
```

For `gt-stackify-branch` (rename + flip):

```
rm .claude/skills/gt-stackify-branch
git mv .agents/skills/gt-stackify-branch skills/dev-gt-stackify-branch
ln -s ../../skills/dev-gt-stackify-branch .agents/skills/dev-gt-stackify-branch
ln -s ../../.agents/skills/dev-gt-stackify-branch .claude/skills/dev-gt-stackify-branch
git add .agents/skills/dev-gt-stackify-branch .claude/skills/dev-gt-stackify-branch
```

### `skills/dev-gt-stackify-branch/SKILL.md` (rename content)

- Frontmatter: `name: gt-stackify-branch` → `name: dev-gt-stackify-branch`
- Add `metadata:\n  internal: true` to frontmatter (matches `dev-fix-just` / `dev-plan-to-branch`)
- Body headings that cite the bare skill name (e.g. `# gt-stackify-branch`, `## gt-stackify-branch: ...`) → `dev-gt-stackify-branch`. Grep the file to find them during execution.

### `tests/integration/test_skills_management.py` (invert two tests)

This file is the enforcement backbone — it will fail loudly unless inverted:

- **`test_local_skills_are_real_directories` (lines 161–183)** — currently asserts `.agents/skills/<name>` is a real directory for local skills. Invert to `test_local_skills_are_symlinks_in_agents_dir`: assert `.agents/skills/<name>` is a symlink with `Path.readlink().as_posix() == "../../skills/<name>"`. Rewrite the error message to reference the new topology.
- **`test_public_skills_have_symlink` (lines 186–210)** — currently iterates `LOCAL_SKILLS_DIR` and asserts each entry is a symlink with target `../.agents/skills/<name>`. Invert to `test_local_skills_have_real_dir_in_skills`: iterate `_lock_skills()` filtered by `sourceType == "local"`, assert `skills/<name>/` exists as a real directory (not a symlink) and contains `SKILL.md`. This also **naturally enforces** that every local skill has a `skills/<name>` entry — catching future regressions of the `gt-stackify-branch` class.
- `test_claude_skills_are_symlinks_into_agents` (lines 134–149) — **no change**. Expected target stays `../../.agents/skills/<name>`.
- `test_agents_skills_dirs_match_lock` (lines 106–117) — **no change**. Uses `_dir_children` which enumerates entries by name; symlinks appear as entries.

### `AGENTS.md`

- **§"Vendored Skill Code" (lines 27–32)** — rewrite to scope the vendored-code rule to real directories only: "`.agents/skills/<name>/` is either (a) a symlink back to a first-party skill at `skills/<name>/` or (b) a real directory containing vendored third-party code. Treat only real directories there as vendored; symlinked entries resolve to first-party twerk work under `skills/<name>/` and are subject to normal linting, typechecking, and review."
- **§"Managing Skills With `npx skills`" (line 89)** — flip the topology description: "Local skills live as real directories under `skills/<name>/`; `.agents/skills/<name>` is a symlink back to that canonical source, keeping the universal-agent directory populated without duplicating content. GitHub-sourced skills remain real directories under `.agents/skills/<name>/`."
- **§"Available skills" (line 51)** — rename `gt-stackify-branch:` entry → `dev-gt-stackify-branch:`, update path to `.claude/skills/dev-gt-stackify-branch/SKILL.md`. Keep the line (consistent with `dev-fix-just` / `dev-plan-to-branch` retaining registry entries despite `internal: true`).

### `skills-lock.json`

- For the 8 non-renaming local skills: `source` paths already say `skills/<name>` — **no change needed**. The `source` field is a logical reference to the canonical directory, which is now accurate under the new orientation.
- For `gt-stackify-branch`: rename key to `dev-gt-stackify-branch`, update `source` path from `/Users/schrockn/code/twerk/skills/gt-stackify-branch` → `/Users/schrockn/code/twerk/skills/dev-gt-stackify-branch`. Re-sort keys alphabetically so `dev-gt-stackify-branch` sits with the other `dev-*` entries.

### `pyproject.toml` (verify no change needed)

`exclude = [".claude/", ".agents/skills/"]` (ruff, line 60) and `exclude = [".agents/skills/", ".claude/skills/"]` (ty, line 77) are path-pattern based. Under the new orientation:

- `.agents/skills/<name>` for local skills is now a symlink — ruff/ty don't follow symlinks into excluded directories, and the pattern match is by literal path prefix. Excluded as before.
- `skills/<name>/` contains real first-party files — **not excluded**. Ruff and ty will now see them. Verify this is acceptable (likely yes — these are already ns-authored Markdown-dominant skills; any `.py` files should have been passing lint under erk already, where they had the same orientation).

If this surfaces issues, add `"skills/"` to the exclude list as a follow-up — but prefer to fix any actual lint failures rather than re-hide the directory.

## Execution order

1. **Pre-flight**: clean git tree (`git status --porcelain` empty).
2. **Bulk orientation flip** for the 8 non-renaming skills. For each: `git rm skills/<name>`, `git mv .agents/skills/<name> skills/<name>`, `ln -s ../../skills/<name> .agents/skills/<name>`, `git add .agents/skills/<name>`. Do all 8 before moving on, so the tests file update lands on a consistent shape.
3. **`gt-stackify-branch` rename + flip**: remove `.claude/skills/gt-stackify-branch`, `git mv .agents/skills/gt-stackify-branch skills/dev-gt-stackify-branch`, create both new symlinks, `git add` them.
4. **Edit `skills/dev-gt-stackify-branch/SKILL.md`**: frontmatter `name:`, add `metadata.internal: true`, rename any body headings that cite the bare name.
5. **Edit `tests/integration/test_skills_management.py`**: invert the two tests per the spec above.
6. **Edit `AGENTS.md`**: three sections per the spec above.
7. **Edit `skills-lock.json`**: rename `gt-stackify-branch` key/source; re-sort alphabetically. (No other edits needed — existing `source` paths for local skills already say `skills/<name>`.)
8. **Run `just`** — confirm green. Address any new lint/ty hits exposed in `skills/` (expected to be zero; if nonzero, fix the underlying file per the `dev-fix-just` convention).

## Verification

End-to-end checks:

- `ls -la skills/` — all 9 local skills appear as **real directories** (no `l` permission bit).
- `ls -la .agents/skills/` — the 9 local skill entries appear as **symlinks** (`l` permission bit); the 18 GitHub-sourced entries remain real directories.
- `readlink .agents/skills/dev-gh` → `../../skills/dev-gh`. Same form for all 9 local skills.
- `readlink .claude/skills/dev-gh` → `../../.agents/skills/dev-gh`. Same form for all 9.
- `cat .claude/skills/dev-gh/SKILL.md` — content resolves through two-hop chain.
- `cat skills-lock.json | jq '.skills | keys[]' | grep gt-stackify` — prints `dev-gt-stackify-branch` only, no bare name.
- `grep -n gt-stackify-branch AGENTS.md` — no bare occurrences, only `dev-gt-stackify-branch`.
- `just` — green. `just test` runs `tests/integration/test_skills_management.py` with the inverted invariants.
- Fresh Claude Code session in twerk: `/dev-gt-stackify-branch` is recognized.

## Out of scope

- Pointing `.claude/skills/<name>` directly at `skills/<name>` to collapse the two-hop chain. The ns convention keeps the two-hop; changing it would diverge again.
- Updating the local-clone of `ns-skill-management`'s SKILL.md at `.agents/skills/ns-skill-management/SKILL.md`. That's vendored third-party code and any upstream improvements should land in the `nseng-ai/nonslop` repo, not here.
- The sibling erk repo's orientation. Out of scope; erk uses the inverted orientation too, and changing it is a separate decision.
