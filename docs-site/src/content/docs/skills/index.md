---
title: What are skills?
description: How public agent skills pair with asdl tools.
sidebar:
  order: 1
---

Skills are agent-facing instructions that call asdl CLIs in a repeatable way.
They explain when to use a tool, which commands to call, and how to interpret the
result.

```bash
pr-address exec get-reviews --format json
```

## Tool to skill map

| Tool         | Skill page                            | Purpose                        |
| ------------ | ------------------------------------- | ------------------------------ |
| `brmem`      | [brmem](/skills/brmem/)               | Branch-local context storage.  |
| `pr-address` | [pr-address](/skills/pr-address/)     | PR review addressing.          |
| `aretro`     | [branch-retro](/skills/branch-retro/) | Branch/session retrospectives. |
| `objective`  | [objective](/skills/objective/)       | Durable objective workflows.   |

Skills should call hidden `exec` subgroups when the operation is for agents, and
humans should read the paired tool page for the public CLI surface.
