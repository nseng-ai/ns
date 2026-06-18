---
title: Installation
description: Install asdl tools one at a time, or use the umbrella command when a workflow needs it.
sidebar:
  order: 2
---

asdl tools are independently adoptable CLIs. Install the tool you need; you do
not have to adopt the whole suite first.

## Standalone tools

TypeScript tools are installed from an asdl checkout with source shims. These
require Node 24 or newer and workspace dependencies installed with `just ts-install`
or `pnpm --dir ts install` when needed:

```bash
just install-slot
just install-objective
just install-pr-address
just install-roaster
```

Python package tools can be installed with `uv tool install`:

```bash
uv tool install aretro
```

Each tool provides its own console script, such as `slot`, `objective`,
`pr-address`, `roaster`, or `aretro`.

## Umbrella command

Some environments also expose the plugin umbrella for plugin-backed tools:

```bash
asdl brmem --help
```

Use the standalone command in examples unless a page explicitly says the umbrella
form matters. Both forms should follow the same [CLI conventions](/concepts/conventions/).
