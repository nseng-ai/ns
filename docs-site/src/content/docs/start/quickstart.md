---
title: Quickstart
description: A numbered first run through asdl using slot as the first standalone tool.
sidebar:
  order: 1
---

Start with one tool. `slot` is the fastest way to feel the asdl pattern: a small
CLI with predictable human output, optional machine output, and no hidden state.

## 1. Install slot

From an asdl checkout, install the TypeScript source shim:

```bash
just install-slot
```

Run `just ts-install` or `pnpm --dir ts install` first if the checkout is missing
TypeScript workspace dependencies.

## 2. Create a pool of worktrees

```bash
slot init --size 3
```

`slot` creates ordinary Git worktrees under `~/.slots/repos/<repo>/worktrees/`.

## 3. Put a branch in a slot

```bash
slot checkout feature-x
```

The command prints a `cd` target. Change into that directory and work normally.

## 4. Inspect the pool

```bash
slot list
```

Every row is derived from `git worktree list`: assigned slots have a branch;
available slots are detached at trunk and ready to reuse.

## 5. Learn the shared grammar

When you are ready to script or hand work to an agent, read
[CLI conventions](/concepts/conventions/) for `--format json`, exit codes, and
hidden `exec` subgroups.
