---
title: pr-address
description: Fetch and answer pull-request review comments end-to-end.
sidebar:
  order: 3
---

`pr-address` helps agents collect PR review threads, draft responses, post
replies, and resolve conversations.

```bash
pr-address exec get-feedback --format json
```

## Mental model

PR feedback is structured review state, not freeform chat. `pr-address` keeps the
agent-facing operations in a hidden `exec` subgroup so human help stays focused
while skills get stable JSON.

## Install

```bash
just install-pr-address
pr-address --help
```

## Common commands

| Goal                         | Command                                     | Boundary        |
| ---------------------------- | ------------------------------------------- | --------------- |
| Prepare a review run         | `pr-address exec prepare-run`               | Read-only/local |
| Fetch review state           | `pr-address exec get-feedback`              | Read-only       |
| Read saved feedback details  | `pr-address exec read-feedback-details`     | Local           |
| Plan feedback batches        | `pr-address exec plan-feedback`             | Local           |
| Reply to a review            | `pr-address exec reply-to-review`           | GitHub          |
| Reply to a discussion        | `pr-address exec reply-to-discussion`       | GitHub          |
| Resolve with a reply         | `pr-address exec resolve-thread-with-reply` | GitHub          |
| Resolve a thread batch       | `pr-address exec resolve-thread-batch`      | GitHub          |
| Record batch evidence        | `pr-address exec record-batch-checkpoint`   | Local           |
| Finalize run evidence        | `pr-address exec finalize-run`              | Local/read-only |
| Summarize remaining feedback | `pr-address exec summarize-feedback`        | Local/read-only |

## Agent interface

Use the paired [pr-address skill](/skills/pr-address/) for the full review
addressing workflow. For output and exit-code expectations, see
[CLI conventions](/concepts/conventions/).

## See also

- [Addressing PR feedback](/guides/addressing-pr-feedback/)
