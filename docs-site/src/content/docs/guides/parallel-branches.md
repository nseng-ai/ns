---
title: Parallel branches with slot
description: Use slot to keep multiple branches open without stashing or re-checking out.
sidebar:
  order: 1
---

This guide will become the end-to-end slot workflow. For now, start with the core
loop:

```bash
slot init --size 3
slot checkout feature-x
slot list
slot free -n 1
```

Use it when code review, hotfixes, and feature work need to stay open at the same
time. The full guide will expand this into shell integration, cleanup, and
Graphite-aware stack navigation.

See [slot](/tools/slot/) for the complete command reference.
