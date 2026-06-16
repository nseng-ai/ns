---
title: roaster
description: A CI PR-diff findings runner for running and posting reviewer output.
sidebar:
  order: 6
---

`roaster` runs CI PR-diff findings reviews from Markdown configuration and formats the
results for humans, agents, and PR comments.

```bash
roaster exec format-findings-comment --format md
```

## Mental model

CI reviewers are most useful when the review prompt, PR diff input, and posted
output are explicit artifacts. `roaster` keeps the mechanical publication surfaces in
`exec` commands that automation can call repeatably.

## Install

From an asdl checkout, install the TypeScript source shim:

```bash
just install-roaster
roaster --help
```

For local development without installing the shim, use `pnpm --dir ts exec roaster ...`.

## Common commands

| Goal                    | Command                                | Boundary                   |
| ----------------------- | -------------------------------------- | -------------------------- |
| List CI review keys     | `roaster review list`                  | Read-only                  |
| Run one CI review       | `roaster review run <key>`             | Invokes Claude Code        |
| Format review findings  | `roaster exec format-findings-comment` | Read-only                  |
| Publish PR comments     | `roaster exec post-findings-comment`   | Mutates PR comments        |
| Publish inline comments | `roaster exec post-inline-findings`    | Mutates PR review comments |

## Agent interface

Use `roaster exec` operations from skills or automation. See
[CLI conventions](/concepts/conventions/) for output and exit-code expectations.
