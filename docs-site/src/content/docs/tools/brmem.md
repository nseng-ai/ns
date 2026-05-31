---
title: brmem
description: Branch-scoped memory for plans, handoffs, and other agent workflow context.
sidebar:
  order: 2
---

`brmem` stores small text entries on a branch without committing them or leaving
files in your working tree.

```bash
brmem get plan.md
```

## Mental model

Branch Memory is branch-scoped text storage. Entries live in namespaces, have
path-like keys, and are read by tools or skills when a future session needs the
context.

## Install

```bash
uv tool install brmem
brmem --help
asdl brmem --help
```

## Common commands

| Goal               | Command        | Boundary      |
| ------------------ | -------------- | ------------- |
| Store context      | `brmem put`    | Branch Memory |
| Read context       | `brmem get`    | Read-only     |
| Check for an entry | `brmem check`  | Read-only     |
| List entries       | `brmem list`   | Read-only     |
| Export entries     | `brmem export` | Filesystem    |
| Remove an entry    | `brmem delete` | Branch Memory |
| Copy entries       | `brmem copy`   | Branch Memory |

## Agent interface

Skills use `brmem` to keep plans and handoffs attached to the branch that owns
them. See the [brmem skill](/skills/brmem/) and [CLI conventions](/concepts/conventions/).

## See also

- [Context across sessions](/guides/context-across-sessions/)
- [The asdl umbrella](/concepts/umbrella/)
