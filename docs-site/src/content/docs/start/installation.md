---
title: Installation
description: Install asdl tools one at a time, or use the umbrella command when a workflow needs it.
sidebar:
  order: 2
---

asdl tools are independently adoptable Python CLIs. Install the tool you need;
you do not have to adopt the whole suite first.

## Standalone tools

```bash
uv tool install asdl-slots
uv tool install brmem
uv tool install asdl-pr-address
uv tool install aretro
uv tool install asdl-objectives
uv tool install roaster
```

Each package provides its own console script, such as `slot`, `brmem`, or
`pr-address`.

## Umbrella command

Some environments also expose the plugin umbrella:

```bash
asdl slot --help
asdl brmem --help
```

Use the standalone command in examples unless a page explicitly says the umbrella
form matters. Both forms should follow the same [CLI conventions](/concepts/conventions/).
