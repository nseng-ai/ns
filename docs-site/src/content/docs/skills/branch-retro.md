---
title: branch-retro skill
description: Turn deterministic branch/session evidence into concise recommendations.
sidebar:
  order: 4
---

The `/aretro:branch-retro` Pi command answers one question: what would have made
this branch faster, smaller, or higher quality?

The portable backing skill is still named `branch-retro`. It collects evidence
through the standalone `aretro` CLI:

```bash
aretro exec collect-evidence --format json
```

The evidence command reports compact observations such as tool usage counts,
repeated file reads, failed tool results, and large-output events. The skill then
applies semantic judgment and may recommend no change, a small routing note, a
follow-up, a CLI affordance, or a documentation update.

See [aretro](/tools/aretro/) and [CLI conventions](/concepts/conventions/).
