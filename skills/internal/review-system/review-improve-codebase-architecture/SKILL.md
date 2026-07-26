---
name: review-improve-codebase-architecture
disable-model-invocation: true
description: Invoke the Improve codebase architecture review against a supplied diff or current branch.
---

# Review: Improve codebase architecture

Use `.ns/reviews/improve-codebase-architecture/review.md` as the authoritative review definition. Do not
duplicate or reinterpret the review rules from memory.

If running inside this repository and the ns command face is available, prefer:

    ns reviews review run improve-codebase-architecture

If reviewing inline, first read `.ns/reviews/improve-codebase-architecture/review.md`, then apply that review
definition exactly to the supplied diff or current branch changes. Stay read-only and
keep findings grounded in the diff.

For durable logging or publication, see `.ns/reviews/README.md`.

<!-- Sanctioned duplication: instantiated from the stub template in
docs/conventions/adversarial-reviews.md; edit the template, then re-instantiate. -->
