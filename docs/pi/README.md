# Pi in This Repo

Repo-specific notes for using and extending Pi in `asdl`.

## Project-local Pi extensions

Checked-in project-local Pi extensions live in:

```text
.pi/extensions/
```

Use project-local extensions when the behavior is specific to this repo's workflows, CLIs, slots, or contributor conventions.

## Extension message linkification

For clickable PR/issue links in custom Pi extension output, keep message content plain, carry URLs in `message.details`, and linkify in the registered renderer.

See [Extension message linkification](./extension-message-linkification.md).

## Checked-in extensions and worktrees

If a project-local extension participates in worktree switching, it must be present in the target worktree too.

In practice, that means the extension should be:

- checked into the repo, and
- loaded from a path that exists in every worktree for that checkout

A local untracked extension in one checkout is not sufficient for a flow that switches Pi to another worktree.

## `/reload`

After editing project-local Pi resources, use:

```text
/reload
```

This reloads:

- extensions
- skills
- prompt templates
- themes
- context files

Use `/reload` after changing files under `.pi/extensions/`.

## Project-local vs global extensions

### Prefer project-local extensions when

- the behavior is specific to this repo
- the extension shells out to repo CLIs like `slot`
- the extension depends on repo conventions or checked-in files
- you want the behavior to travel with the repository

### Prefer global extensions when

- the behavior is editor- or terminal-wide rather than repo-specific
- you want it in all repositories
- the extension must remain available across cwd/session switches into projects that may not carry the same checked-in extension

Global extensions live under:

```text
~/.pi/agent/extensions/
```

## Session `cwd` semantics

Pi's working directory is **session-bound**, not shell-command-bound.

That means:

- `ctx.cwd` reflects the active Pi session/runtime
- shell commands like `cd ../other-worktree && git status` do **not** change Pi's session `cwd`
- Pi can move to another `cwd` when it replaces the active session/runtime

For details, see:

- [Session `cwd` semantics](./session-cwd-semantics.md)

## Recommended cross-worktree pattern

For repo workflows that intentionally move to another worktree:

1. resolve or create the target worktree using the repo CLI
2. create a **fresh** Pi session rooted at that worktree
3. switch Pi to that session

Do not try to infer a durable Pi cwd change from arbitrary shell `cd` commands.
