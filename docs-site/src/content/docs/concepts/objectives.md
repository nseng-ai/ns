---
title: Objectives
description: Durable roadmap records for coordinating multi-session, multi-branch work.
sidebar:
  order: 1
---

An **Objective** is a checked-in **Durable Narrative Roadmap Record** for
multi-session, multi-branch, or multi-PR work. It preserves human-readable
context, ordered guidance, decisions, findings, blockers, and completion
evidence.

Objectives are intentionally simple Markdown records. They are not workflow
controllers, task databases, hidden agent stores, or state machines.

## What an objective contains

A normal active objective contains:

```text
.asdl/objectives/<slug>/
  objective.md
  roadmap.md
  updates/
  closed.md        # optional; existence means closed
```

- `objective.md` explains the thesis, scope, non-goals, completion criteria,
  assumptions, risks, and open questions.
- `roadmap.md` keeps ordered work guidance with lightweight checkbox states.
- `updates/` stores semantic updates: decisions, findings, blockers,
  completion evidence, and changed plans.

## Why it matters

Objectives make long-running agent work legible to humans. The important state
lives in committed Markdown instead of being scattered across chat transcripts,
tool outputs, or ad-hoc scratch files.

When a future session resumes the work, it can read the durable narrative first
and then decide what branch, PR, or command should move next.
