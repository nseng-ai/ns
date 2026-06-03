---
title: roaster
description: A markdown-driven review harness for running and posting reviewer output.
sidebar:
  order: 6
---

`roaster` runs review workflows from Markdown configuration and formats the
results for humans, agents, and PR comments.

```bash
roaster exec format-findings-comment --format md
```

## Mental model

Review harnesses are most useful when the review prompt, inputs, and posted
output are explicit artifacts. `roaster` keeps the mechanical review surfaces in
`exec` commands that skills can call repeatably.

## Install

```bash
uv tool install roaster
roaster --help
asdl roaster --help
```

## Common commands

| Goal                                   | Command                                | Boundary                          |
| -------------------------------------- | -------------------------------------- | --------------------------------- |
| Format review findings                 | `roaster exec format-findings-comment` | Read-only                         |
| List changed-path-matching review keys | `roaster review list-matching`         | Read-only                         |
| Run one review                         | `roaster review run <key>`             | Depends on reviewer configuration |
| Run review workflow                    | `roaster exec ...`                     | Depends on reviewer configuration |

## Agent interface

Use `roaster exec` operations from skills or automation. See
[CLI conventions](/concepts/conventions/) for output and exit-code expectations.
