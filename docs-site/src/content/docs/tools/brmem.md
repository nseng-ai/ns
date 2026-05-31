---
title: Branch Memory
description: Branch-scoped storage for plans, handoffs, and other agent workflow context.
sidebar:
  order: 1
---

`brmem` gives skills and agents a place to keep branch-local context without
putting that context in commits, PR comments, GitHub issues, or working-tree
files.

Use Branch Memory when context should stay attached to a branch until a tool
explicitly reads, copies, updates, or deletes it.

## Mental model

Branch Memory has five core concepts:

- **Branch Memory System**: the `brmem` CLI and Git-ref storage layer.
- **Branch Memory**: entries attached to one branch, either in the base
  namespace or in a named namespace.
- **Entry**: a small UTF-8 text blob stored under a path-like key.
- **Entry Key**: the key for an entry, such as `plan.md` or
  `handoff/session.md`.
- **Namespace**: a workflow-owned bucket for entries with a shared lifecycle.

## Common commands

| Goal                                | Command        | Writes to     |
| ----------------------------------- | -------------- | ------------- |
| Store context on the current branch | `brmem put`    | Branch Memory |
| Read a stored entry                 | `brmem get`    | Nothing       |
| Check whether an entry exists       | `brmem check`  | Nothing       |
| List stored entries                 | `brmem list`   | Nothing       |
| Export entries to files             | `brmem export` | Filesystem    |
| Remove an entry                     | `brmem delete` | Branch Memory |
| Copy entries to another branch      | `brmem copy`   | Branch Memory |

The write boundary is explicit. Read-only commands are safe for inspection;
mutating commands are deliberate workflow actions.
