---
name: skill-management
disable-model-invocation: true
description: "Manage skills with `npx skills`: add, edit, remove, rename, update, or list skills (local or GitHub), and the `skills/<name>/` / `.agents/skills/` layout conventions."
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

# skill-management

Manage project skills with `npx skills`. This skill is the canonical reference
for adding, editing, removing, updating, and inspecting skills in a repo that
uses the ns local-skill layout.

`npx skills` installs skill packages into `.agents/skills/<name>/` and symlinks
agent-specific directories back to it; for first-party local skills the
canonical source is `skills/<name>/` (see **Mental model**).

## Positioning: which tool manages what

This skill covers the `npx skills` channels: repo-local first-party skills
(`skills/<name>/` + the symlink layout + `skills-lock.json`) and third-party
GitHub-sourced vendored skills. Out of scope: first-party npm-module-bundled
provisioning (`ns skills` / `ns update` territory), and invocation kinds /
harness overlays, which are managed by `areg skill apply` — not by `npx skills`
or by hand-editing `disable-model-invocation`, `agents/openai.yaml`, or Pi
skill exclusions.

## Goal

For every skill-management operation, produce an end state with:

- one source of truth on disk (no duplicated first-party content);
- a working `.agents/skills/<name>` entry for Codex, Cursor, Amp, and other
  universal agents;
- a working `.claude/skills/<name>` symlink for Claude Code;
- a correct `skills-lock.json` entry recording the source.

## Core rules

- **Canonical source for local skills is `skills/<name>/`.** Edit files there
  directly (see **Mental model** for the symlink chain).
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
- **Skill bodies that name model tiers must give concrete examples for both
  OpenAI and Anthropic harnesses**, each labeled, while keeping the default
  guidance harness-neutral.

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

For an internal local skill (`metadata.internal: true` in `SKILL.md`), the same
flow with three deltas: prefix the `npx skills add` and `npx skills list`
commands with `INSTALL_INTERNAL_SKILLS=1` (without it the CLI misleadingly
reports `No skills found`); in step 4 also replace `.claude/skills/<name>` with
the `../../.agents/skills/<name>` symlink; verify with
`readlink .agents/skills/<name>` and `readlink .claude/skills/<name>` plus
`INSTALL_INTERNAL_SKILLS=1 npx skills list | rg "<name>"`.

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

Use `npx skills add` for targeted GitHub refreshes, and preserve the curated
lockfile selection manually:

```bash
npx skills add <owner>/<repo> --skill <name> --agent codex claude-code -y
# Repeat --skill for each installed skill from the source that should be refreshed.
```

Before updating, read `skills-lock.json` and identify the exact GitHub-sourced
entries to refresh. Do not run a broad source update that installs every skill
from a repository unless that is the intended lockfile state. Local skills
(`sourceType: "local"`) are edited in place and do not need an update command.

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

See `references/commands.md` for command details.

- `No skills found` for a valid `SKILL.md` with `metadata.internal: true`: rerun with `INSTALL_INTERNAL_SKILLS=1 npx skills add ...`.
- `skills-lock.json` contains `/Users/.../skills/<name>`: normalize the entry to `source: "skills/<name>"` before committing.
- Large unrelated `skills-lock.json` diff: minimize the diff to the intended skill entry unless those changes are deliberate.
- `.agents/skills/<name>` is a real directory after bootstrap: replace it with `ln -s ../../skills/<name> .agents/skills/<name>`.
- Internal skill does not appear in a plain list check: verify with `INSTALL_INTERNAL_SKILLS=1 npx skills list | rg "<name>"`.
