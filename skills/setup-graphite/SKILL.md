---
name: setup-graphite
# Full description commented out to save tokens (coding agents inject skill descriptions into every session):
# "Configure a repo for agentic use of Graphite (gt). Installs the official graphite skill via `npx skills` and adds a branching / PR convention admonition to AGENTS.md (or CLAUDE.md). Assumes gt is already installed, authenticated, and the repo has been initialized with `gt init`. Use when onboarding a project to gt-based workflows or enabling agents to prefer gt over raw git by default."
description: "Command: setup-graphite"
allowed-tools:
  - "Bash(which gt)"
  - "Bash(gt --version)"
  - "Bash(gt log short)"
  - "Bash(npx skills *)"
  - "Bash(ls *)"
  - "Bash(cat *)"
  - "Bash(test *)"
  - "Bash(grep *)"
---

# setup-graphite

Configure the current repo for agentic use of [Graphite](https://graphite.dev)
(`gt`). Installs the official `graphite` skill from `withgraphite/agent-skills`
so agents know the stacked-PR workflow, then adds a short convention
admonition to the project's agent instructions telling agents to prefer `gt`
over raw `git` for branch creation, amending, and PR submission.

This skill does NOT install the `gt` CLI, authenticate with Graphite, or run
`gt init`. It assumes those are already done. If any precondition is missing,
Step 1 stops with instructions.

## Step 1: Check preconditions

Verify `gt` is on PATH:

```bash
which gt
gt --version
```

If `gt` is not found, stop and tell the user to install it and authenticate
before re-running this skill:

- **macOS:** `brew install withgraphite/tap/graphite`
- **Cross-platform (npm):** `npm install -g @withgraphite/graphite-cli`
- Then: `gt auth` (authenticate with the Graphite web app).

Verify the repo has been initialized for Graphite:

```bash
test -f .graphite_repo_config && echo ok || echo missing
```

If missing, stop and tell the user to run `gt init` from the repo root.

## Step 2: Check whether the graphite skill is already installed

```bash
test -f .agents/skills/graphite/SKILL.md && echo installed || echo absent
grep -q '"graphite"' skills-lock.json 2>/dev/null && echo locked || echo unlocked
```

If both checks report the skill is present, **skip Step 3**. Continue to Step 4.

## Step 3: Install the official graphite skill

```bash
npx skills add withgraphite/agent-skills --skill graphite --agent codex claude-code -y
```

This vendors the skill into `.agents/skills/graphite/` (real directory),
symlinks `.claude/skills/graphite` to the universal cache, and records the
source in `skills-lock.json`.

Verify:

```bash
ls -la .agents/skills/graphite
ls -la .claude/skills/graphite
```

The `.claude/skills/graphite` entry should be a symlink ending in
`../../.agents/skills/graphite`.

## Step 4: Pick the admonition target file

Check, in order:

1. If `AGENTS.md` exists in the repo root → use it.
2. Else if `CLAUDE.md` exists in the repo root → use it.
3. Else create a new `AGENTS.md` in the repo root with a `# Agent Instructions`
   top-level heading, then use it.

## Step 5: Check for existing admonition (idempotency)

```bash
grep -n "Branch Creation and PR Submission (Graphite)" <target-file>
```

If the heading already exists, **skip Step 6 and Step 7**. Report "admonition
already present" and continue to Step 8 (verify).

## Step 6: Detect heading convention

Read the target file and look at the section headings around the place you
plan to insert:

- If existing sections use `###` (nested under a higher-level heading), use
  `###` for the new admonition.
- If existing sections use `##`, use `##`.
- For a brand-new file (created in Step 4), use `##`.

## Step 7: Insert the admonition

Pick a sensible location using your judgment: adjacent to existing
git / GitHub / PR guidance when the target file has such a section,
otherwise appended at the end of the file. Keep one blank line before and
after the inserted block.

Insert this block verbatim (adjusting the heading depth per Step 6 —
replace `##` with `###` if needed):

```markdown
## Branch Creation and PR Submission (Graphite)

This repo uses Graphite (`gt`) as the default tool for branch and PR workflow.
Prefer `gt` over raw `git` for these operations:

- Creating branches: use `gt create <name> -m "<msg>"` instead of
  `git checkout -b` + `git commit`.
- Amending the current branch: use `gt modify -m "<msg>"` instead of
  `git commit --amend`.
- Submitting / updating PRs: use `gt submit --no-interactive` instead of
  `git push` / `gh pr create`.
- Navigating and reshaping stacks: `gt up` / `gt down` / `gt ls` /
  `gt restack` / `gt move`.

Fall back to raw `git` only when `gt` cannot express the operation (e.g.,
surgical `git rebase` during conflict resolution — see the `graphite` skill's
"Surgical Rebasing" section). See `.agents/skills/graphite/SKILL.md` for the
full workflow.
```

## Step 8: Verify and report

Confirm the end state:

```bash
gt log short
npx skills list
grep -n "Graphite" <target-file>
```

Tell the user:

- Which target file was updated (or created).
- Whether the graphite skill was installed fresh or was already present.
- Which files changed and should be reviewed / committed. Typical set:
  `.agents/skills/graphite/`, `.claude/skills/graphite`, `skills-lock.json`,
  and the AGENTS.md / CLAUDE.md target.

## Idempotency

Re-running this skill in an already-configured repo is a no-op:

- Step 2 skips the install if graphite is already present.
- Step 5 skips the admonition insertion if the heading already exists.
- Step 4 does not overwrite an existing AGENTS.md or CLAUDE.md.
