# @sdl/roaster Context

Roaster is the package and CLI that runs configured read-only PR-diff checks and emits structured findings.

## Glossary

### Roaster

The package/tool that runs configured read-only PR-diff checks and emits structured findings.

Avoid: describing Roaster runs as remediation workflows or as agents that edit code.

### Review definition

A Markdown catalog entry under `reviews/<key>.md` with frontmatter and instructions that defines what Roaster should check.

Avoid: calling review definitions GitHub PR reviews, or treating the catalog key as a GitHub review identity.

### Tripwire

A quick Roaster review definition (`model_profile: quick`) intended to cheaply flag likely issues. It produces findings only; it does not prove the issue exhaustively or resolve it.

Avoid: using Tripwire for all Roaster runs, using Tripwire as a formal schema `kind`, or implying it edits/remediates.

### Deep review

A Roaster review definition with `model_profile: deep`, intended for higher-context judgment and stronger recommendations. It still emits findings through Roaster, but it is not the cheap Tripwire UX category.

Avoid: implying deep reviews can mutate state or resolve findings.

### Finding

A structured issue reported by a Roaster run, with path, line, severity, summary, and details.

Avoid: using finding for Objective evidence, review-thread state, or generic GitHub comments.

### Findings comment

The summary PR discussion comment managed by Roaster for one review key.

Avoid: confusing it with GitHub PR review comments or review threads.

### Inline finding

An inline PR review comment for a finding that can be placed on a changed line.

Avoid: treating every finding as inline-commentable.

### Review log

A Branch Memory record of a Roaster run under the `roaster` namespace and `reviews/<review-key>/...` key path.

Avoid: calling review logs durable Objective updates or changing the namespace/key path when changing user-facing terminology.
