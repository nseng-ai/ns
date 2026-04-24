# brmem-branch-create — packaged canonical branch-creation plugin

This file is the **packaged canonical plugin** for the
`brmem-branch-create` skill. The skill itself reads whatever is at
`.twerk/prompts/brmem-branch-create.md`; this packaged file is a
starting point that a separate setup flow can copy there.

The invoking skill owns all of the following:

- resolving what from the session to stash
- choosing the `brmem` namespace / key bundle
- generating the suggested slug
- running every `brmem check` / `brmem put`
- reporting the stashed entries

This plugin owns only **branch creation**.

Keep this file narrow: it is a branch-policy prompt, not a stash
workflow.

## Expected input from the invoking skill

The invoking skill provides:

- a **suggested slug**
- the current repo context
- the current `HEAD` commit as the branch start-point candidate

## Contract for this plugin

Given the invoking skill's suggested slug:

1. apply any repo-specific branch naming conventions
2. determine the **final branch name**
3. run branch-creation-only pre-flights
4. create the branch
5. report the final branch name and start-point SHA back to the
   invoking skill

This plugin must **not**:

- decide what gets stashed
- decide the `brmem` key layout
- run `brmem put`
- push, submit, or publish the branch

## Default behavior

The shipped default is intentionally simple:

- keep the suggested slug unchanged as the final branch name
- create the branch with raw `git branch <final-branch> HEAD`
- do not check it out
- do not push it

That makes this plugin a minimal local branch creator that the skill can
reuse safely.

## Branch-name rule

Unless you customize this prompt, use the invoking skill's suggested
slug unchanged.

If a repo needs conventions like a prefix (`feature/`, `bugfix/`), a
normalized separator policy, or some other local naming rule, apply
that transformation here and treat the result as the **final branch
name**.

The final branch name must be knowable before the skill starts its
`brmem put` calls.

## Pre-flight probes

Run only branch-creation-related checks here. The invoking skill owns
all `brmem` checks.

Default pre-flights:

- `git rev-parse HEAD` must succeed so there is a start-point commit.
- `git rev-parse --verify refs/heads/<final-branch>` must fail. If the
  branch already exists, abort; do not clobber it.

You may add repo-specific branch-creation checks here if needed (for
example, requiring a clean tree before a checkout-based flow, or
checking Graphite state before `gt create`).

## Create the branch

Default command:

```
git branch <final-branch> HEAD
```

Notes:

- This default keeps the current worktree where it is.
- A repo-specific plugin may choose a different command, including a
  checkout-based flow such as `git switch -c <final-branch>` or
  `gt create <final-branch>`, if that is the repo's standard branch
  creation mechanism.
- If you use a checkout-based flow, make that explicit so the invoking
  skill can report it accurately.

## Required output to the invoking skill

After branch creation succeeds, the plugin should leave the invoking
skill with:

- the **final branch name**
- the branch's **start-point SHA**
- whether the branch-creation flow checked the branch out, if that is
  relevant to the user's next step

The invoking skill will then run its own `brmem` operations against that
final branch.

## Customizing this plugin

Edit the repo-local copy at `.twerk/prompts/brmem-branch-create.md` to
teach repo conventions. Common customizations:

- **Prefix or normalize names.** Turn `add-widget-cache` into something
  like `feature/add-widget-cache`.
- **Use Graphite for branch creation.** Replace raw `git branch` with
  `gt create` if the repo wants branch creation to go through Graphite.
- **Add branch-creation pre-flights.** For example, require a clean
  tree before checkout, or require a specific base branch to be current.
- **Switch checkout behavior.** Keep the default no-checkout behavior or
  choose an explicit checkout flow.

Do **not** move bundle selection or `brmem put` logic into this plugin.
That belongs in the skill.
