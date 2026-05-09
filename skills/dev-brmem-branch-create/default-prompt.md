# dev-brmem-branch-create — packaged canonical branch-creation plugin

Packaged starting point. Copy this file to one of:

- `<repo-root>/.brmem/prompts/dev-brmem-branch-create.md` — repo-specific override
- `~/.brmem/prompts/dev-brmem-branch-create.md` — global default

The skill's `brmem exec resolve-prompt` step prefers the project-local file; if absent, it reads the global file. `just install-tools` initializes the global path non-destructively.

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
- create with `git branch <final-branch> HEAD` (keeps current worktree in place)
- do not check out, do not push

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
