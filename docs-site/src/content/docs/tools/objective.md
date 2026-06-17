---
title: objective
description: Durable, checked-in objectives for multi-session development work.
sidebar:
  order: 5
---

`objective` manages narrative roadmap records for work that should remain legible
across sessions, branches, and PRs.

```bash
objective list
```

## Mental model

An objective is checked-in Markdown, not hidden state. It gives a future human or
agent the thesis, scope, roadmap, decisions, blockers, and completion evidence
before they choose the next command.

## Install

`objective` is installed from an asdl checkout with a TypeScript source shim.
This requires Node 24 or newer.

```bash
just install-objective
objective --help
objective --runtime
```

## Common commands

| Goal                   | Command                                | Boundary     |
| ---------------------- | -------------------------------------- | ------------ |
| List objective records | `objective list`                       | Read-only    |
| Archive an objective   | `objective archive`                    | Working tree |
| Read objective details | `objective exec read-objective`        | Read-only    |
| Summarize runner usage | `objective exec runner-subagent-usage` | Read-only    |

## Agent interface

Objective skills use the CLI to keep multi-session work grounded in checked-in
records. See the [objective skill](/skills/objective/) and
[Objectives concept](/concepts/objectives/).
