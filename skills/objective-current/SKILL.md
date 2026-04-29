---
name: objective-current
description: 'Read-only orientation view for the current branch. Shows the claimed objective, PR, branch snapshot freshness, brmem entries, and the trunk-relation row.'
allowed-tools:
  - "Bash(objective exec current *)"
---

# objective-current

Read-only orientation view for the branch you just landed on. The CLI does
all the work — the skill simply runs the command and prints the output.

> For shared concepts — vocabulary, storage model, content anatomy, lifecycle,
> carry-forward semantics, and mutation contracts — see
> `../objective/SKILL.md`.

## Goal

After stepping away from a branch for a while, returning means re-deriving
which branch you're on, what objective is claimed there, whether the
snapshot is stale, what brmem context has been parked, and whether there's
a PR. `objective-current` answers that operational reentry question in one
shot. It is scoped to the current branch plus its trunk relation; it does
not walk downstack ancestry or upstack children. It is the orientation
sibling of `objective-next` (slice planning for one objective on the
current branch) and `objective-digest` (objective-level dossier for one
workstream).

## Inputs

None. The skill operates on the current working directory only.

## Related Objective Views

| Need                                           | Use                       |
| ---------------------------------------------- | ------------------------- |
| "What branch am I on and what is around me?"   | `objective-current`       |
| "What is this objective trying to accomplish?" | `objective-digest <slug>` |
| "What should I work on next?"                  | `objective-next <slug>`   |

## How it works

`objective exec current` does all the deterministic work and emits the
final Markdown directly: header (objective + freshness + PR + brmem),
optional brmem entry listing, a short ASCII stack map showing the current
branch and its trunk relation, and any warnings. There is no JSON to
parse, no template to fill, and no prose to write.

## Workflow

1. Run:

   ```bash
   objective exec current
   ```

2. **If the command exits non-zero**, surface its stderr message
   verbatim.

3. **If the command succeeds**, print stdout verbatim — no commentary
   above or below.

## Public Invariants

- Single header `# On \`<branch>\``(or`# Detached HEAD` for detached
  HEAD).
- Sections in order: header rows, optional `## Current Branch Context`,
  `## Stack Map`, optional `## Next Orientation Step`, optional
  warnings.
- No objective-content analysis — never summarize prose, compute
  progress, or recommend a "next slice".
- Print to stdout only.
