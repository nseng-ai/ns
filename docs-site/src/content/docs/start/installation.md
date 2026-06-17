---
title: Installation
description: Install asdl tools one at a time, or use the umbrella command when a workflow needs it.
sidebar:
  order: 2
---

asdl tools are independently adoptable CLIs. Install the tool you need; you do
not have to adopt the whole suite first.

## Standalone tools

Python package tools can be installed with `uv tool install`:

```bash
uv tool install asdl-slots
uv tool install aretro
```

TypeScript tools are installed from an asdl checkout with source shims. These
require Node 24 or newer:

```bash
just install-objective
just install-pr-address
just install-roaster
```

Each tool provides its own console script, such as `slot`, `objective`,
`pr-address`, or `roaster`.

## Umbrella command

Some environments also expose the plugin umbrella:

```bash
asdl slot --help
asdl brmem --help
```

Use the standalone command in examples unless a page explicitly says the umbrella
form matters. Both forms should follow the same [CLI conventions](/concepts/conventions/).
