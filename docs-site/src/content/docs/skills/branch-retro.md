---
title: branch-retro skill
description: Turn deterministic branch/session evidence into concise recommendations.
sidebar:
  order: 4
---

The `branch-retro` skill answers one question: what would have made this branch
faster, smaller, or higher quality?

```bash
aretro exec collect-evidence --format json
```

The command reports compact observations such as tool usage counts, repeated file
reads, failed tool results, and large-output events. The skill then applies
semantic judgment and may recommend no change, a small routing note, a follow-up,
a CLI affordance, or a documentation update.

See [aretro](/tools/aretro/) and [CLI conventions](/concepts/conventions/).
