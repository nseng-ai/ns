---
title: Branch retrospective skill
description: Turn deterministic branch/session evidence into concise recommendations.
sidebar:
  order: 1
---

The Branch Retrospective skill helps answer a focused question: what would have
made this branch faster, smaller, or higher quality?

It starts by collecting deterministic evidence with:

```text
aretro exec collect-evidence
```

That command reports compact observations such as tool usage counts, repeated
file reads, failed tool results, and large-output events. The skill then applies
semantic judgment to decide whether the evidence supports a recommendation.

## Recommendation policy

A good retrospective is not a dump of every observation. It weighs quality,
wall-time, token spend, maintenance cost, and drift risk.

The best result may be:

- no recommendation;
- a small routing note;
- a measured follow-up;
- a CLI affordance that automates repeated mechanical work; or
- a documentation change when the future reader and update trigger are clear.

That keeps retrospectives useful without turning every branch into permanent
process overhead.
