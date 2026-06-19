---
title: aretro
description: Deterministic branch retrospectives from session and branch evidence.
sidebar:
  order: 4
---

`aretro` collects compact evidence about what happened on a branch so a skill can
turn it into a focused retrospective recommendation.

```bash
aretro exec collect-evidence --format json
```

## Mental model

Evidence collection should be deterministic and cheap. Judgment about what would
have made the branch faster, smaller, or higher quality belongs in the paired
skill, not in a raw log dump.

## Install

Install the TypeScript source shim from an asdl checkout:

```bash
just install-aretro
aretro --help
```

## Common commands

| Goal                    | Command                        | Boundary  |
| ----------------------- | ------------------------------ | --------- |
| Collect branch evidence | `aretro exec collect-evidence` | Read-only |
| Format recommendations  | paired `branch-retro` skill    | Read-only |

## Agent interface

Use the [branch-retro skill](/skills/branch-retro/) to interpret evidence and
keep recommendations semantic. See [CLI conventions](/concepts/conventions/) for
`exec` command behavior.
