# ADR 0048: Required skill-backed workflows fail closed

## Status

Accepted

## Context

First-party Pi commands use canonical `SKILL.md` files as workflow instructions. Some command paths nevertheless continued when that skill content could not be loaded: shared helpers accepted optional skill blocks, repo-backed invocation could substitute a skill already advertised by Pi, and individual commands carried abbreviated handwritten fallback prompts.

Those substitutes created a second, weaker copy of the workflow contract. They could drift from the canonical skill while still starting a model turn, and preparatory work such as selection, editor use, Git inspection, recipe execution, or tool activation could occur before the command discovered that its required instructions were unavailable.

Command-backed skills are provisioned repo resources. Their absence, unreadability, or malformed content is a broken runtime invariant to report, not a condition from which prompt prose should recover. These failures occur at different lifecycle points: absence can be established without reading content, while readability and validity matter only when a model path actually needs the instructions.

## Decision

Every first-party skill-backed workflow verifies that its canonical `SKILL.md` path exists before command-specific work begins, then loads its content immediately before the model path needs it.

- A loaded-skill invocation requires Pi to advertise and successfully expand that exact skill when invoked.
- A repo-backed invocation requires the canonical repo-local skill path. A skill command already loaded by Pi is not an alternative source.
- Handwritten, abbreviated, name-only, or otherwise substitute workflow prompts are not permitted when required skill content is unavailable.
- Repo skill path resolution is an LBYL existence preflight before selection, editor use, Git or recipe execution, launch preflight, tool activation, prompt delivery, or other command-specific workflow work.
- Reading, frontmatter parsing, and block expansion are deferred until the workflow has selected a model path and needs the instructions. Deterministic success paths do not read or parse skill content.
- Consumers may resolve and load together when content is required immediately after existence preflight; they need not perform duplicate lookup work.
- Lookup failures at preflight and read or frontmatter failures at actual load are wrapped in a contextual error naming the required skill and preserving the underlying failure as `cause`.
- The command family's existing presentation boundary reports that error, and no model turn starts.

A synchronous command acknowledgement may precede skill preflight. It confirms receipt only and is not workflow execution.

This decision does not prohibit fallbacks unrelated to required skill instructions, such as rendering fallbacks, saved-plan selection, generated-slug recovery, or ordinary default error text.

## Considered options

### Keep short handwritten fallback prompts

Rejected. A second prose implementation can drift silently and cannot preserve the complete workflow, safety, and validation contract of the canonical skill.

### Use a skill already loaded by Pi when repo-local expansion fails

Rejected for repo-backed commands. Loaded commands depend on harness discovery and exposure policy and may refer to a different source. The checked-out or provisioned repo-local skill is the command's required authority.

### Load and parse skill content before any preparatory work

Rejected. Existence is the atomic provisioning invariant needed before preparatory work. Reading and parsing content eagerly adds unnecessary I/O to deterministic success paths and prevents useful deterministic preparation for a model path that may never be selected.

### Warn and invoke the workflow by skill name only

Rejected. A name is not workflow content and gives the model neither the canonical process nor its safety constraints.

## Consequences

- Commands that previously continued with degraded instructions now refuse to start when the canonical skill is absent, and refuse to start a model turn when its content cannot be loaded.
- Prompt builders and delivery callbacks model required skill content as concrete rather than optional.
- Tests assert existence-failure atomicity before command-specific preparation, and load-failure atomicity at model delivery. They do not claim unreadable or malformed content prevents earlier deterministic or preparatory work.
- Deterministic success paths can complete without reading or parsing skill content.
- Repo-backed helper behavior is independent of Pi's loaded command inventory.
- Adding a skill-backed workflow requires provisioning its canonical skill and an actionable failure boundary; copying fallback workflow prose is not an acceptable compatibility mechanism.
