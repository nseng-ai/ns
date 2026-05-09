<!--
REPO-LOCAL CUSTOMIZATION (asdl): this plugin has been adapted from the
packaged default (`skills/dev-brmem-branch-create/default-prompt.md`) to
register the new branch with Graphite without checking it out. ASDL uses
`gt` as the default branching tool — see AGENTS.md § "Branch Creation and
PR Submission (Graphite)". Consequence: the new branch is created at HEAD
and tracked in the Graphite stack with the current branch as its parent;
the worktree stays on the original branch (matches packaged-default
no-checkout semantics while keeping Graphite awareness).
-->

# dev-brmem-branch-create — packaged canonical branch-creation plugin

Packaged starting point for `.brmem/prompts/dev-brmem-branch-create.md`. The invoking skill reads whatever is at that path; copy this file there (manually or via a setup flow) to use the default.

**Scope: branch creation only.** This plugin does not decide what to stash, does not run `brmem put`, and does not push or submit. See the `dev-brmem-branch-create` skill for the full contract split.

## Input from the invoking skill

- a **suggested slug**
- current repo context, with `HEAD` as the branch start-point candidate

## Contract

Given the suggested slug:

1. apply any repo-specific branch naming conventions to produce the **final branch name** (must be knowable before the skill's `brmem put` calls)
2. run branch-creation-only pre-flights
3. create the branch
4. report the final branch name + start-point SHA back to the skill

## Default behavior

- keep the suggested slug unchanged as the final branch name
- capture the original branch name first: `git rev-parse --abbrev-ref HEAD`
- create the ref without moving HEAD: `git branch <final-branch> HEAD`
- register the new branch in the Graphite stack: `gt track <final-branch> --parent <original-branch>`
- do NOT check out the new branch; the worktree stays on the original branch (report that back to the skill so its summary is accurate)
- do not push, do not submit

## Default pre-flights

- `git rev-parse HEAD` succeeds — there is a start-point commit.
- `git rev-parse --verify refs/heads/<final-branch>` fails — the branch does not already exist. **If it exists, abort; do not clobber.**

## Output to the invoking skill

- the **final branch name**
- the branch's **start-point SHA**
- whether the flow checked the branch out, if relevant to the user's next step

## Customizing this plugin

Edit the repo-local copy at `.brmem/prompts/dev-brmem-branch-create.md` to teach repo conventions. Common changes:

- **Prefix/normalize names** — e.g. `add-widget-cache` → `feature/add-widget-cache`.
- **Use Graphite** — swap `git branch` for `gt create <final-branch>`.
- **Add branch-creation pre-flights** — e.g. require a clean tree before checkout, or a specific base branch.
- **Switch checkout behavior** — keep no-checkout or use `git switch -c <final-branch>` / `gt create <final-branch>`. Make this explicit so the skill can report accurately.

Do **not** move bundle selection or `brmem put` logic into this plugin — that belongs in the skill.
