---
name: skill-management
description: "Manage skills with `npx skills`: add, edit, remove, rename, update, list, or publish skills (local or GitHub). Covers `skills/<name>/` and `.agents/skills/` conventions, the `--agent codex claude-code -y` flag, and `-a`/`--copy` gotchas."
allowed-tools:
  - "Bash(npx skills *)"
  - "Bash(areg update-skills *)"
  - "Bash(uv run areg update-skills *)"
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

# skill-management

Manage project skills with `npx skills`. This skill is the canonical reference
for adding, editing, removing, updating, inspecting, and publishing skills in a
repo that uses the asdl-tools local-skill layout.

`npx skills` installs agent skill packages into `.agents/skills/<name>/` (the
universal cache) and symlinks agent-specific directories like
`.claude/skills/<name>` back to that cache.

For first-party local skills, **the canonical source is `skills/<name>/`**.
The installed `.agents/skills/<name>` entry is a symlink back to that source,
so all agents can discover the skill without duplicating content.

## Goal

For every skill-management operation, produce an end state with:

- one source of truth on disk (no duplicated first-party content);
- a working `.agents/skills/<name>` entry for Codex, Cursor, Amp, and other
  universal agents;
- a working `.claude/skills/<name>` symlink for Claude Code;
- a correct `skills-lock.json` entry recording the source.

## Core rules

- **Canonical source for local skills is `skills/<name>/`.** Edit files there
  directly. The `.agents/skills/<name>` and `.claude/skills/<name>` symlink
  chain resolves to the same content.
- **Committed local `skills-lock.json` entries must use**
  `"source": "skills/<name>"`. If `npx skills add` captures an absolute local
  path, rewrite it to the repo-relative form before committing.
- **Committed `computedHash` values must be real 64-character lowercase hex
  hashes.** Do not leave `PENDING_REGEN`, shortened hashes, or other
  placeholders in the lockfile; `areg check` rejects them.
- **Always install with `--agent codex claude-code -y`.** Never use
  `--agent claude-code` alone; it creates the Claude symlink without ensuring
  `.agents/skills/` is populated. Never omit `-a`; the CLI may auto-detect
  extra agents and create unwanted directories.
- **For every local skill, `.agents/skills/<name>` must be a symlink** pointing
  to `../../skills/<name>`.
- **Never use `--copy`.** It forces copy-only mode and defeats the symlink
  layout.
- **Do not maintain a duplicate skill index in `AGENTS.md`.** Installed skills
  are discovered from the on-disk install and `SKILL.md` frontmatter.
- **Skill bodies that name model tiers must give concrete examples for both
  OpenAI and Anthropic** (e.g. `openai-codex/gpt-5.4-mini`,
  `claude-haiku-4-5`), each labeled with its harness, while keeping the default
  guidance harness-neutral. See `AGENTS.md` "Skill Model Examples".

## Mental model

For **local** skills authored in this repo:

```text
skills/<name>/                  <- canonical source (real directory, editable)
     ^
     | symlink: ../../skills/<name>
     |
.agents/skills/<name>           <- universal agent directory
     ^
     | symlink: ../../.agents/skills/<name>
     |
.claude/skills/<name>           <- Claude Code's dedicated dir
```

For **GitHub-sourced** skills:

```text
.agents/skills/<name>/          <- vendored third-party content (real directory)
     ^
     | symlink: ../../.agents/skills/<name>
     |
.claude/skills/<name>           <- Claude Code's dedicated dir
```

GitHub-sourced skills do NOT get a `skills/<name>` entry.

## Umbrella skill families

Use an umbrella skill family when one capability has several explicit workflow
steps that share terminology, storage contracts, safety rules, or diagnostics.
The umbrella is compact agent-facing documentation; step skills remain the
invocable entrypoints.

Split content by what is cross-cutting vs per-operation:

- **Shared, cross-cutting model and edge flows → umbrella references.** The
  terminology and storage contracts every step can confuse, plus the repair,
  admin, and diagnostics flows owned by no single step.
- **Per-operation procedure → the step skill that owns it.** Each step's command
  invocation, argument/slug derivation rules, step-specific recovery, and success
  evidence live in that step skill, not in a shared reference.

Do not pull per-operation command contracts up into a shared umbrella reference.
That is the most common over-abstraction: the contract duplicates whatever the
step skills already carry, and it forces a reference hop to run a single command.

Umbrella skill:

- Lives at `skills/<capability>/` and is installed like any other public local
  skill.
- Triggers only on explicit capability/reference/admin terms, not generic step
  words.
- Keeps `SKILL.md` as a concise reference root that routes to bundled
  `references/` files for the shared model (lifecycle, terminology, storage),
  safety posture, and diagnostics/admin — not per-operation commands.
- Contains enough shipped context for external agents to operate the capability
  without relying on internal repo docs.

Step skills:

- Stay installed and discoverable for explicit workflow-step requests.
- Say they are part of the family and instruct agents to use the umbrella skill
  first by skill name, not by relative filesystem path.
- Are self-contained for their own happy path: the step's command, derivation
  rules, step-specific recovery, boundaries, and success evidence inline, so the
  common path runs with no reference hop. This self-containment is what keeps the
  step portable across harnesses.
- Route to the umbrella for the shared model; do not restate cross-cutting
  lifecycle/terminology or another step's procedure.

When step skills mirror an external command surface (e.g. Pi slash commands),
treat them as independent parallel entrypoints over the same underlying CLI, not
a dispatch chain — which is why each step must stand alone.

Avoid:

- broad triggers like generic "write a plan" or "create a branch";
- per-operation command contracts that live only in a shared umbrella reference;
- hidden installation dependencies where a step references an uninstalled
  umbrella;
- public skill prose that requires internal docs or implementation details.

## Workflow

### 1. Add a new local skill

For a public local skill, use the standard bootstrap flow:

```bash
# 1. Create the skill in its permanent home
mkdir -p skills/<name>/references
# 2. Author skills/<name>/SKILL.md
# 3. Bootstrap the install
npx skills add ./skills/<name> --agent codex claude-code -y
# 4. Replace the CLI's copy with a symlink back to the canonical source
rm -rf .agents/skills/<name>
ln -s ../../skills/<name> .agents/skills/<name>
# 5. Normalize skills-lock.json if needed: source -> "skills/<name>"
# 6. Verify
ls -la .agents/skills/<name>     # expect: -> ../../skills/<name>
ls -la .claude/skills/<name>     # expect: -> ../../.agents/skills/<name>
cat .claude/skills/<name>/SKILL.md
npx skills list
# 7. Stage and commit
git add skills/<name>/ .agents/skills/<name> .claude/skills/<name> skills-lock.json
```

For an internal local skill, add `metadata.internal: true` to `SKILL.md` and enable internal discovery during install and verification. Without it, `npx skills add` can misleadingly report `No skills found`.

```bash
# 1. Create the skill in its permanent home
mkdir -p skills/<name>/references
# 2. Author skills/<name>/SKILL.md with metadata.internal: true
# 3. Bootstrap the install with internal discovery enabled
INSTALL_INTERNAL_SKILLS=1 npx skills add ./skills/<name> --agent codex claude-code -y
# 4. Replace the CLI's copy with symlinks back to the canonical source
rm -rf .agents/skills/<name>
ln -s ../../skills/<name> .agents/skills/<name>
rm -rf .claude/skills/<name>
ln -s ../../.agents/skills/<name> .claude/skills/<name>
# 5. Normalize skills-lock.json if needed: source -> "skills/<name>"
# 6. Verify
readlink .agents/skills/<name>    # expect: ../../skills/<name>
readlink .claude/skills/<name>    # expect: ../../.agents/skills/<name>
INSTALL_INTERNAL_SKILLS=1 npx skills list | rg "<name>"
cat .claude/skills/<name>/SKILL.md
# 7. Stage and commit
git add skills/<name>/ .agents/skills/<name> .claude/skills/<name> skills-lock.json
```

After `npx skills add`, inspect `git diff -- skills-lock.json` and minimize unrelated churn before committing. If the CLI wrote an absolute local path, rewrite the entry to `"source": "skills/<name>"`.

### 2. Add a new skill from GitHub

```bash
npx skills add <owner>/<repo> --agent codex claude-code -y
# Optional: --skill <name1> <name2> to pick specific skills from a multi-skill repo
git add .agents/skills/<name>/ .claude/skills/<name> skills-lock.json
```

GitHub-sourced skills live as real directories under `.agents/skills/<name>/`.
Do **not** create a `skills/<name>` entry for them.

### 3. Edit an existing local skill

Edit `skills/<name>/SKILL.md` or another file under `skills/<name>/` directly.
Changes propagate through the symlink chain; no install command is needed.

### 4. Update GitHub-sourced skills

Use the curated lockfile-preserving updater instead of `npx skills update`:

```bash
areg update-skills              # refresh every github skill in the lockfile
areg update-skills --dry-run    # preview which skills would be refreshed
areg update-skills --skill <name>
areg update-skills --source <owner>/<repo>
```

If `areg` is only available from the checkout, use `uv run areg update-skills ...`.

The updater walks `skills-lock.json` and calls `npx skills add <source> --skill
<name>` once per GitHub-sourced entry. Local skills (`sourceType: "local"`) are
skipped because they are edited in place.

**Do not use `npx skills update` directly.** The upstream command interprets a
lockfile source as "install every skill from that repo", which can add skills
the project never asked for. Use `areg update-skills` until the upstream
behavior is safe for curated lockfiles.

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
git mv skills/<old> skills/<new>
# Update name/heading in skills/<new>/SKILL.md
rm .agents/skills/<old>
ln -s ../../skills/<new> .agents/skills/<new>
rm .claude/skills/<old>
ln -s ../../.agents/skills/<new> .claude/skills/<new>
# Update skills-lock.json key and source
# Update cross-references and settings allowlists
git add skills/<new>/ .agents/skills/<new> .claude/skills/<new> skills-lock.json
git add -u skills/<old> .agents/skills/<old> .claude/skills/<old>
```

## Inspect and troubleshoot

```bash
npx skills list
INSTALL_INTERNAL_SKILLS=1 npx skills list | rg "<internal-skill-name>"
readlink .agents/skills/<name>
readlink .claude/skills/<name>
cat skills-lock.json
ls -la .agents/skills/
ls -la skills/
```

See `references/commands.md` for command details and known CLI quirks.

- `No skills found` for a valid `SKILL.md` with `metadata.internal: true`: rerun with `INSTALL_INTERNAL_SKILLS=1 npx skills add ...`.
- `skills-lock.json` contains `/Users/.../skills/<name>`: normalize the entry to `source: "skills/<name>"` before committing.
- Large unrelated `skills-lock.json` diff: minimize the diff to the intended skill entry unless those changes are deliberate.
- `.agents/skills/<name>` is a real directory after bootstrap: replace it with `ln -s ../../skills/<name> .agents/skills/<name>`.
- Internal skill does not appear in a plain list check: verify with `INSTALL_INTERNAL_SKILLS=1 npx skills list | rg "<name>"`.

## Skill visibility

To hide a local skill from external discovery, add `metadata.internal: true` to
its `SKILL.md` frontmatter. See `references/commands.md` for the frontmatter
shape and the `INSTALL_INTERNAL_SKILLS=1` consumer flow.

## Anti-patterns

- Leaving `.agents/skills/<name>` as a real directory for a local skill after
  bootstrap.
- Committing an absolute machine-specific local path in `skills-lock.json` for
  a local skill.
- Assuming `npx skills check` will catch stale local-skill state; it only checks
  remote sources.
- Deleting `skills/<name>/` without also removing `.agents/skills/<name>`,
  `.claude/skills/<name>`, and the lockfile entry.
- Renaming a local skill without fixing the symlink chain, `skills-lock.json`,
  and cross-references.
