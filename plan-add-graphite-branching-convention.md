# Plan: Add Graphite convention note to AGENTS.md

## Context

This repo uses Graphite (`gt`) for branch creation, stacking, and PR submission, but that expectation is only implicit today — `AGENTS.md` lists the `graphite` and `dev-gt-stackify-branch` skills under "Available skills" but never declares that `gt` is the default workflow. As a result, agents sometimes reach for raw `git checkout -b` / `git push` when a `gt create` / `gt submit` would be correct. Adding an explicit convention note makes the repo norm discoverable at the top of `AGENTS.md` so agents pick the right tool by default.

## Change

Add one new `###` section to `/Users/schrockn/code/twerk/AGENTS.md` titled **"Branch Creation and PR Submission (Graphite)"**, inserted immediately **after** the existing `### GitHub Backend Interactions` section and **before** `### CLI Scenario Testing Convention`.

### Exact content to insert

```markdown
### Branch Creation and PR Submission (Graphite)

This repo uses Graphite (`gt`) as the default tool for branch and PR workflow. Prefer `gt` over raw `git` for these operations:

- Creating branches: use `gt create <name> -m "<msg>"` instead of `git checkout -b` + `git commit`.
- Amending the current branch: use `gt modify -m "<msg>"` instead of `git commit --amend`.
- Submitting / updating PRs: use `gt submit --no-interactive` instead of `git push` / `gh pr create`.
- Navigating and reshaping stacks: `gt up` / `gt down` / `gt ls` / `gt restack` / `gt move`.

Fall back to raw `git` only when `gt` cannot express the operation (e.g., surgical `git rebase` during conflict resolution — see the `graphite` skill's "Surgical Rebasing" section). See `.claude/skills/graphite/SKILL.md` for the full workflow and `.claude/skills/dev-gt-stackify-branch/SKILL.md` for splitting a mixed branch into a stack.
```

## File to modify

- `/Users/schrockn/code/twerk/AGENTS.md` — one section insertion; no other edits.

## Why this shape

- **Short convention pointer, not a workflow primer**: the mechanics already live in `.claude/skills/graphite/SKILL.md`. Duplicating them in `AGENTS.md` would rot. This note sets the default tool choice and points at the skill for detail.
- **Placement after "GitHub Backend Interactions"**: groups it with the other git/GitHub workflow conventions so readers encounter both `gh` guidance and `gt` guidance together.
- **Directs agents to prefer `gt` over `git` for branch creation and `git push`**: per the user's clarification, the note names the specific `git` operations that should be replaced by `gt` equivalents.

## Verification

1. `cat AGENTS.md` and confirm the new section is present in the intended location with no adjacent section damaged.
2. Run `just dprint-check` (or `just` at the top of the suite) to confirm Markdown formatting still passes. If dprint reports a diff, run `just dprint-fix` per the "Fixing Lint and Format Failures" convention — do not hand-edit.
3. Re-run `just` to confirm the full suite is green.

## Out of scope

- No edits to `CLAUDE.md`, the `graphite` skill, or any other files.
- No changes to tooling, hooks, settings, or CI.
- No reconciliation of objectives or PR creation — this is a documentation-only change.

## Self-destruct

This plan file is a durable spec for the branch it lives on, not a
permanent artifact. Once the plan is fully implemented, the final
commit of this branch must delete this file (`plan-add-graphite-branching-convention.md`). A
merged PR whose branch still contains its own plan file is evidence
the plan was not fully carried out.
