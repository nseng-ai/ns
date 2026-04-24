<!--
REPO-LOCAL CUSTOMIZATION (twerk): this plugin has been adapted from the
packaged default (`skills/brmem-branch-create/default-prompt.md`) to use
Graphite (`gt create`) instead of `git branch`. Twerk uses `gt` as the
default branching tool — see AGENTS.md § "Branch Creation and PR Submission
(Graphite)". Consequence: branches created by this plugin ARE checked out
(unlike the packaged default, which stays on the original branch).
-->

# brmem-branch-create — packaged canonical branch-creation plugin

Packaged starting point for `.twerk/prompts/brmem-branch-create.md`. The invoking skill reads whatever is at that path; copy this file there (manually or via a setup flow) to use the default.

**Scope: branch creation only.** This plugin does not decide what to stash, does not run `brmem put`, and does not push or submit. See the `brmem-branch-create` skill for the full contract split.

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
- create with `gt create <final-branch>` (repo convention — see comment at top of file)
- this DOES check out the new branch (Graphite's default); report that back to the skill so its summary is accurate
- do not push, do not submit

## Default pre-flights

- `git rev-parse HEAD` succeeds — there is a start-point commit.
- `git rev-parse --verify refs/heads/<final-branch>` fails — the branch does not already exist. **If it exists, abort; do not clobber.**

## Output to the invoking skill

- the **final branch name**
- the branch's **start-point SHA**
- whether the flow checked the branch out, if relevant to the user's next step

## Customizing this plugin

Edit the repo-local copy at `.twerk/prompts/brmem-branch-create.md` to teach repo conventions. Common changes:

- **Prefix/normalize names** — e.g. `add-widget-cache` → `feature/add-widget-cache`.
- **Use Graphite** — swap `git branch` for `gt create <final-branch>`.
- **Add branch-creation pre-flights** — e.g. require a clean tree before checkout, or a specific base branch.
- **Switch checkout behavior** — keep no-checkout or use `git switch -c <final-branch>` / `gt create <final-branch>`. Make this explicit so the skill can report accurately.

Do **not** move bundle selection or `brmem put` logic into this plugin — that belongs in the skill.
