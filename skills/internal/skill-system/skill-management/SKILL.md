---
name: skill-management
disable-model-invocation: true
description: "Manage skills with `npx skills`: add, edit, remove, rename, update, or list skills (local or GitHub), and the nested `skills/<disposition>/.../<name>/` / flat `.agents/skills/` layout conventions."
allowed-tools:
  - "Bash(npx skills *)"
  - "Bash(ln -s *)"
  - "Bash(rm -rf .agents/skills/$IDENTITY)"
  - "Bash(rm .agents/skills/$IDENTITY)"
  - "Bash(rm .claude/skills/$IDENTITY)"
  - "Bash(mkdir -p skills/*)"
  - "Bash(ls *)"
  - "Bash(readlink *)"
  - "Bash(cat skills-lock.json)"
  - "Bash(cat .claude/skills/*)"
  - "Bash(rg *)"
  - "Bash(npx skills check)"
  - "Bash(ns skill-exposure check *)"
  - "Bash(git add *)"
  - "Bash(git mv *)"
  - "Bash(git rm -r -- skills/public/*)"
  - "Bash(git rm -r -- skills/incubating/*)"
  - "Bash(git rm -r -- skills/internal/*)"
  - "Bash(git diff *)"
---

# skill-management

Manage project skills with `npx skills`. This skill covers repo-local first-party
skills, third-party GitHub-sourced vendored skills, their flat harness overlays,
and `skills-lock.json`.

`npx skills` owns acquisition, listing, update, removal, and lock state. It does
not own first-party npm-module-bundled provisioning (`ns skills` / `ns update`)
or Skill Exposure Policy. Manage exposure only with `ns skill-exposure` on
explicit paths; do not hand-edit its frontmatter or harness sidecars.

The authoritative topology contract lives in `skills/README.md`. Use its
approved destination rules; never infer a first-party destination from its
identity, current package owner, or exposure policy.

## Required operation inputs

Before adding, renaming, promoting, or demoting a first-party skill, obtain an
explicitly approved **canonical destination**:

- normal shape: `skills/<disposition>/<family>/<identity>/`;
- approved product exception: `skills/<disposition>/<identity>/`.

`<disposition>` is exactly `public`, `incubating`, or `internal`. Family and
disposition are management-time source topology; harness identity remains flat.
A promotion or demotion changes the canonical destination but does not rename
the skill. A rename requires both an approved new identity and an approved full
destination. Stop rather than guessing any of these values.

In commands below, set:

```text
IDENTITY=<flat skill identity>
DEST=skills/<explicitly-approved-destination-to-identity>
```

Use the literal approved path in actual commands; do not leave placeholders.

## Invariants

- First-party content has one real canonical directory at `$DEST`.
- `.agents/skills/$IDENTITY` is a symlink to the canonical directory. Because
  the overlay is two path components below the repository root, its target is
  always `../../$DEST` (for example,
  `../../skills/internal/skill-system/skill-management`).
- `.claude/skills/$IDENTITY` remains flat and points to
  `../../.agents/skills/$IDENTITY`.
- A first-party local lock entry uses the exact repo-relative approved path:
  `"source": "$DEST"`; never a flat fallback or absolute path.
- A local `computedHash` is a real 64-character lowercase hexadecimal hash,
  regenerated through supported `npx skills` behavior, never a placeholder.
- GitHub-sourced skills remain real vendored directories at
  `.agents/skills/<identity>/`; they have no first-party canonical directory.
- Always install with `--agent codex claude-code -y`. Do not use `--copy` and
  do not omit the explicit agents.
- Disposition is not exposure, `metadata.internal`, or npm provisioning.
  Preserve those boundaries and use `ns skill-exposure` only when policy work
  is separately intended.

## Mental model

```text
skills/<disposition>/<family>/<identity>/  <- usual first-party canonical source
skills/<disposition>/<identity>/           <- explicitly approved exception only
                    ^
                    | .agents target: ../../<exact canonical path>
.agents/skills/<identity>                   <- flat universal overlay
                    ^
                    | target: ../../.agents/skills/<identity>
.claude/skills/<identity>                   <- flat dedicated overlay
```

For a GitHub-sourced skill, `.agents/skills/<identity>/` is instead the real
vendored source and the Claude symlink still points to the flat overlay.

When designing an umbrella family, read `references/umbrella-families.md`.

## Workflows

### Add a first-party skill

1. Confirm the identity and full canonical destination are explicitly approved.
2. Create and author that destination.
3. Bootstrap it with `npx skills`.
4. Replace only the bootstrap copy for this identity with the flat symlink.
   Do not use a glob and do not touch another overlay entry.
5. Normalize only this lock entry's source to the exact canonical destination.
6. Verify both symlink targets, lock entry, listing, and exposure if declared.

```bash
mkdir -p "$DEST/references"
# Author "$DEST/SKILL.md"
npx skills add "./$DEST" --agent codex claude-code -y
# After confirming this identity is the bootstrap copy, remove that exact copy.
rm -rf ".agents/skills/$IDENTITY"
ln -s "../../$DEST" ".agents/skills/$IDENTITY"
readlink ".agents/skills/$IDENTITY"   # expect ../../$DEST
readlink ".claude/skills/$IDENTITY"   # expect ../../.agents/skills/$IDENTITY
cat ".claude/skills/$IDENTITY/SKILL.md"
npx skills list
```

For a skill hidden by `metadata.internal: true`, prefix add/list with
`INSTALL_INTERNAL_SKILLS=1`. If bootstrap did not create the Claude link,
create only `.claude/skills/$IDENTITY` with target
`../../.agents/skills/$IDENTITY`.

Inspect `git diff -- skills-lock.json`; reject unrelated churn, normalize an
absolute source to `$DEST`, and regenerate rather than inventing a hash. Stage
only the explicit destination, the two identity overlays, and the lockfile:

```bash
git add "$DEST/" ".agents/skills/$IDENTITY" \
  ".claude/skills/$IDENTITY" skills-lock.json
```

### Add or update a GitHub-sourced skill

```bash
npx skills add <owner>/<repo> --skill <identity> --agent codex claude-code -y
git add ".agents/skills/<identity>/" ".claude/skills/<identity>" skills-lock.json
```

Before an update, inspect the lockfile and preserve its curated skill selection.
Do not install every skill from a source unless explicitly intended. Never
create a canonical `skills/...` directory for vendored content.

### Edit a first-party skill

Resolve `.agents/skills/<identity>` with `readlink`, confirm it reaches the
approved nested canonical source, and edit that source directly. No install
command is needed. Do not assume `skills/<identity>` exists.

### Remove a skill

Run `npx skills remove <identity> --agent codex claude-code -y`. For a
first-party skill, resolve and confirm its exact canonical source from the lock
entry and symlink, then remove only that identity's approved canonical
directory. Never use `skills/<disposition>/*`, `skills/*`, or an overlay-wide
glob.

```bash
git rm -r -- "$DEST"
git add -u -- ".agents/skills/$IDENTITY" \
  ".claude/skills/$IDENTITY" skills-lock.json
```

### Rename, promote, or demote a first-party skill

Confirm the current lock source and symlink target first. Obtain the explicitly
approved final destination; for rename, also obtain the approved final identity.
Then move the canonical directory directly from the old exact path to the new
exact path, replace only the affected flat overlay links, and update only the
affected lock key/source and live cross-references.

For a disposition-only change, the flat identity and both overlay names remain
unchanged. For a rename, remove only the old identity links and create the new
flat links. The `.agents` target is always `../../<new exact destination>`; the
Claude target is always `../../.agents/skills/<new-identity>`.

```bash
git mv -- "$OLD_DEST" "$NEW_DEST"
# For a rename only, remove the two exact old-identity links.
# Remove the exact current links before recreating them for either operation.
ln -s "../../$NEW_DEST" ".agents/skills/$NEW_IDENTITY"
ln -s "../../.agents/skills/$NEW_IDENTITY" ".claude/skills/$NEW_IDENTITY"
# Update only the affected lock key/source and SKILL.md identity when renamed.
```

Verify:

```bash
readlink ".agents/skills/<new-identity>"
readlink ".claude/skills/<new-identity>"
INSTALL_INTERNAL_SKILLS=1 npx skills list | rg '<new-identity>'
rg -n '<old-identity-or-old-canonical-path>' skills .agents .claude .pi docs skills-lock.json
```

Classify every remaining match as live (fix it), package-local/upstream, or
historical. If exposure policy is declared, check its old and new explicit
paths. Do not claim completion with unexplained matches.

## Inspect and troubleshoot

```bash
npx skills list
INSTALL_INTERNAL_SKILLS=1 npx skills list | rg '<identity>'
readlink ".agents/skills/<identity>"
readlink ".claude/skills/<identity>"
cat skills-lock.json
```

See `references/commands.md` for detailed `npx skills` behavior.

- Absolute or flat local lock source: replace it with the exact approved nested
  repo-relative destination, then regenerate/check through supported tooling.
- Real directory at a first-party `.agents` entry: after confirming it is the
  bootstrap copy, replace that identity only with `../../<canonical-path>`.
- Missing internal skill in plain output: rerun with
  `INSTALL_INTERNAL_SKILLS=1`.
- Large lock diff: retain only deliberately managed entries.
