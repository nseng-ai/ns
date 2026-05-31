---
title: brmem skill
description: Agent guidance for reading and writing branch-scoped memory.
sidebar:
  order: 2
---

The `brmem` skill tells agents when Branch Memory is the right storage layer and
which `brmem` command to call.

```bash
brmem get plan.md
```

Use it for branch-scoped plans, handoffs, and other context that should stay off
commits and out of the working tree. Mutating commands such as `put`, `copy`, and
`delete` are deliberate workflow actions, not casual scratch writes.

See [brmem](/tools/brmem/) and [CLI conventions](/concepts/conventions/).
