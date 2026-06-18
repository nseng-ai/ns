---
title: The asdl umbrella
description: How standalone asdl tools optionally compose under one command.
sidebar:
  order: 1
---

`asdl` is an optional umbrella command for a suite of standalone tools. The core
product rule is that each tool must make sense on its own first.

## Standalone first

```bash
slot list
brmem get plan.md
pr-address exec get-reviews
```

Standalone commands are the canonical surface in most docs because they keep each
tool independently adoptable.

## Umbrella form

```bash
asdl brmem get plan.md
```

The umbrella discovers plugin subcommands and gives teams one entry point when
that is more convenient. It should not be required to understand or use a single
tool. The TypeScript `slot` CLI is standalone-only and is invoked as `slot`.
