---
title: Docs overview
description: A starting point for the public asdl documentation portal.
sidebar:
  order: 1
---

asdl is a toolkit for agent-assisted software development. It focuses on durable
context, explicit workflow boundaries, and reviewable artifacts that survive
across branches and sessions.

The MVP portal proves three things:

- Starlight renders polished human-facing docs from repo Markdown.
- `starlight-llms-txt` emits `llms.txt`, `llms-full.txt`, and
  `llms-small.txt` from the rendered docs corpus.
- The site can be built in CI and deployed from Vercel's `docs-site` root.

Start with [Objectives](/concepts/objectives/) for the roadmap model, then read
[Branch Memory](/tools/brmem/) for branch-scoped context storage.
