---
title: Installation
description: Install asdl tools one at a time, or use the umbrella command when a workflow needs it.
sidebar:
  order: 2
---

asdl tools are independently adoptable. Install the tool you need; you do not
have to adopt the whole suite first.

## Standalone tools

Most standalone tools are Python CLIs installed with `uv`:

```bash
uv tool install asdl-slots
uv tool install brmem
uv tool install aretro
uv tool install asdl-objectives
uv tool install roaster
```

`pr-address` is installed from an asdl checkout as a TypeScript shim:

```bash
just install-pr-address
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
