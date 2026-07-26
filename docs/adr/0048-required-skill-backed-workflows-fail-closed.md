# ADR 0048: Required skill-backed workflows fail closed

## Status

Accepted

## Context

First-party Pi commands use canonical `SKILL.md` files as workflow instructions. Some command paths nevertheless continued when that skill content could not be loaded: shared helpers accepted optional skill blocks, repo-backed invocation could substitute a skill already advertised by Pi, and individual commands carried abbreviated handwritten fallback prompts.

Those substitutes created a second, weaker copy of the workflow contract. They could drift from the canonical skill while still starting a model turn, and preparatory work such as selection, editor use, Git inspection, recipe execution, or tool activation could occur before the command discovered that its required instructions were unavailable.

Command-backed skills are provisioned repo resources. Their absence, unreadability, or malformed content is a broken runtime invariant to report, not a condition from which prompt prose should recover.

## Decision

Every first-party skill-backed workflow requires its canonical `SKILL.md` content before command-specific work begins.

- A loaded-skill invocation requires Pi to advertise and successfully expand that exact skill.
- A repo-backed invocation requires successful expansion of the repo-local skill. A skill command already loaded by Pi is not an alternative source.
- Handwritten, abbreviated, name-only, or otherwise substitute workflow prompts are not permitted when required skill content is unavailable.
- Skill expansion is an LBYL preflight before selection, editor use, Git or recipe execution, launch preflight, tool activation, prompt delivery, or other command-specific workflow work.
- Lookup, read, and frontmatter failures are wrapped in a contextual error naming the required skill and preserving the underlying failure as `cause`.
- The command family's existing presentation boundary reports that error, and no model turn starts.

A synchronous command acknowledgement may precede skill preflight. It confirms receipt only and is not workflow execution.

This decision does not prohibit fallbacks unrelated to required skill instructions, such as rendering fallbacks, saved-plan selection, generated-slug recovery, or ordinary default error text.

## Considered options

### Keep short handwritten fallback prompts

Rejected. A second prose implementation can drift silently and cannot preserve the complete workflow, safety, and validation contract of the canonical skill.

### Use a skill already loaded by Pi when repo-local expansion fails

Rejected for repo-backed commands. Loaded commands depend on harness discovery and exposure policy and may refer to a different source. The checked-out or provisioned repo-local skill is the command's required authority.

### Defer skill loading until a prompt is needed

Rejected. Preparatory actions can be consequential or expensive and should not run for a workflow that cannot proceed correctly. Required resources are checked before command-specific work.

### Warn and invoke the workflow by skill name only

Rejected. A name is not workflow content and gives the model neither the canonical process nor its safety constraints.

## Consequences

- Commands that previously continued with degraded instructions now refuse to run until skill provisioning or content is repaired.
- Prompt builders and delivery callbacks model required skill content as concrete rather than optional.
- Tests assert both failure and atomicity: no model prompt and no command-specific preparatory action after failed preflight.
- Repo-backed helper behavior is independent of Pi's loaded command inventory.
- Adding a skill-backed workflow requires provisioning its canonical skill and an actionable failure boundary; copying fallback workflow prose is not an acceptable compatibility mechanism.
