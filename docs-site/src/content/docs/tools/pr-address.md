---
title: pr-address
description: Fetch and answer pull-request review comments end-to-end.
sidebar:
  order: 3
---

`pr-address` helps agents collect PR review threads, draft responses, post
replies, and resolve conversations.

```bash
pr-address exec get-reviews --format json
```

## Mental model

PR feedback is structured review state, not freeform chat. `pr-address` keeps the
agent-facing operations in a hidden `exec` subgroup so human help stays focused
while skills get stable JSON.

## Install

```bash
uv tool install asdl-pr-address
pr-address --help
```

The standalone `pr-address` CLI is the only invocation surface; `pr-address` is
not mounted under the `asdl` umbrella command.

## Common commands

| Goal                  | Command                                     | Boundary        |
| --------------------- | ------------------------------------------- | --------------- |
| Prepare a review run  | `pr-address exec prepare-run`               | Read-only       |
| Fetch review state    | `pr-address exec get-reviews`               | Read-only       |
| Fetch review comments | `pr-address exec get-review-comments`       | Read-only       |
| Reply to a review     | `pr-address exec reply-to-review`           | GitHub          |
| Reply to a thread     | `pr-address exec add-review-thread-reply`   | GitHub          |
| Resolve with a reply  | `pr-address exec resolve-thread-with-reply` | GitHub          |
| Resolve a thread      | `pr-address exec resolve-thread`            | GitHub          |
| Record batch evidence | `pr-address exec record-batch-checkpoint`   | Local           |
| Finalize run evidence | `pr-address exec finalize-run`              | Local/read-only |
| Reopen a thread       | `pr-address exec unresolve-thread`          | GitHub          |

## Agent interface

Use the paired [pr-address skill](/skills/pr-address/) for the full review
addressing workflow. For output and exit-code expectations, see
[CLI conventions](/concepts/conventions/).

## See also

- [Addressing PR feedback](/guides/addressing-pr-feedback/)
