---
name: roast-dry-but-not-too-dry
disable-model-invocation: true
description: Invoke the DRY but not too DRY Roaster review against a supplied diff or current branch.
---

# Roast: DRY but not too DRY

Use `.ns/reviews/dry-but-not-too-dry/review.md` as the authoritative review definition. Do not duplicate or reinterpret the review rules from memory.

First read `.ns/reviews/dry-but-not-too-dry/review.md`, then apply that review definition exactly to the supplied diff or current branch changes in this same session. Stay read-only and keep findings grounded in the diff.

Use explicit automation only when the user asks for isolated runner execution or automatic review logs:

```bash
ns roaster review run dry-but-not-too-dry
```

In Pi-hosted sessions, use this skill's same review instructions or the same ns command face above; no separate Roaster runner alias is required.

For durable logging or publication after a same-session review, convert findings to `{ "findings": [...] }` and run:

```bash
ns roaster exec record-findings --review-key dry-but-not-too-dry --format json < findings.json
```

Pipe that JSON envelope to `ns roaster exec publish-findings` when publishing to GitHub.
