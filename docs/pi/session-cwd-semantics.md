# Pi Session `cwd` Semantics

This doc captures one important invariant for Pi extension and workflow design in this repo:

> Pi's working directory is **session/runtime-bound**, not shell-command-bound.

That distinction matters for objective widgets, slot switching, and any extension that shells out to repo CLIs.

## Short version

- `ctx.cwd` is the current Pi session's working directory.
- Running a shell command like `cd ../other-worktree && git status` does **not** change Pi's session `cwd`.
- Pi can switch to a different `cwd` only when it replaces the active session/runtime (for example by switching to another session file whose header stores a different `cwd`).
- For cross-worktree flows in this repo, prefer:
  1. resolve or create the target worktree with the repo CLI,
  2. start a **fresh** Pi session rooted at that worktree,
  3. switch Pi to that new session.

## What this means in practice

### Shell `cd` is local to that shell invocation

If Pi runs a bash command such as:

```bash
cd ../other-worktree && git status
```

that affects only that bash process. It does **not** mutate Pi's own session `cwd` for later extension calls.

Extensions that use:

- `ctx.cwd`
- `pi.exec(..., { cwd: ctx.cwd })`

should assume they are operating relative to the active Pi session, not relative to whatever a prior shell snippet happened to `cd` into.

### Session replacement can change `cwd`

Pi rebuilds cwd-bound runtime state when the active session changes. That includes things like:

- project-local settings
- resource discovery
- tools
- extensions
- context files

So if Pi switches to a session whose JSONL header contains:

```json
{"type":"session","cwd":"/path/to/other/worktree"}
```

Pi will come back rooted at that worktree.

## Recommended pattern for this repo

For workflows that intentionally move to another branch/worktree (for example slot-based navigation), use this pattern:

1. Ask the repo CLI to resolve or create the target worktree.
2. Create a **fresh** Pi session file whose header `cwd` is that worktree path.
3. Switch Pi to that session.

This avoids trying to mutate Pi's `cwd` in place and keeps relative paths, objectives, and project-local resources coherent.

## Why fresh sessions are preferred

When moving between worktrees, a fresh session is usually safer than carrying over the existing conversation because it avoids:

- stale relative paths
- stale objective widgets
- old AGENTS/resource context from the previous worktree
- confusion about which checkout the agent is operating on

## Slots-specific guidance

For slot-aware Pi commands in this repo:

- let the `slot` CLI own slot allocation and worktree selection
- consume its `--format json` output rather than reimplementing slot logic in the extension
- switch Pi by creating a fresh session at the returned `worktree_path`

In other words, prefer:

```text
slot checkout <branch> --format json
```

followed by a fresh-session handoff, rather than trying to infer movement from arbitrary shell commands.

## Checked-in project-local extensions

A project-local extension under `.pi/extensions/` is discovered relative to the active session `cwd`.

That means an extension that participates in worktree switching should be:

- checked into the repo, and
- present in the target worktree as well

so it can still be discovered after the session switches.

## Mental model

Use this rule of thumb:

- **bash `cd` does not move Pi**
- **session replacement can move Pi**
