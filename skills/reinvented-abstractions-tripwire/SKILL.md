---
name: reinvented-abstractions-tripwire
disable-model-invocation: true
description: Invoke the Reinvented Abstractions Tripwire against a supplied diff or current branch.
---

# Review: Reinvented Abstractions Tripwire

Use `.ns/reviews/reinvented-abstractions-tripwire/review.md` as the authoritative review definition. Do not
duplicate or reinterpret the review rules from memory.

If running inside this repository and the ns command face is available, prefer:

    ns reviews review run reinvented-abstractions-tripwire

If reviewing inline, first read `.ns/reviews/reinvented-abstractions-tripwire/review.md`, then apply that review
definition exactly to the supplied diff or current branch changes. Stay read-only and
keep findings grounded in the diff.

For durable logging or publication, see `.ns/reviews/README.md`.

<!-- Sanctioned duplication: instantiated from the stub template in
docs/conventions/adversarial-reviews.md; edit the template, then re-instantiate. -->
