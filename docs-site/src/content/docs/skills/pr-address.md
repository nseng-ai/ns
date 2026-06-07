---
title: pr-address skill
description: Agent guidance for collecting and responding to PR review feedback.
sidebar:
  order: 3
---

The `pr-address` skill drives review-addressing sessions with stable CLI calls
instead of ad-hoc GitHub scraping.

```bash
pr-address exec get-reviews --format json
```

Use it when an agent needs to fetch review comments, prepare responses, post
thread replies, resolve conversations, record compact batch checkpoint evidence,
or finalize unresolved/skipped run evidence. The skill is the user-facing
workflow; the hidden `exec` subgroup is the machine interface.

See [pr-address](/tools/pr-address/) and [Addressing PR feedback](/guides/addressing-pr-feedback/).
