# @ns/roaster Context

Roaster is a ji Capability for configured PR-diff reviews. Its Domain Core runs read-only checks, records structured findings, and owns guarded publication; it is not a remediation workflow.

## Glossary

### Roaster

The ji Capability that runs configured read-only PR-diff checks and emits structured findings.

Avoid: describing Roaster runs as remediation workflows or as agents that edit code.

### Roaster Domain Core

Roaster-owned gateway-injected logic for the review catalog, local-diff review execution, review-log storage, finding schemas, and publication behavior.

Avoid: putting Roaster domain behavior in the ji kernel, Pi host, or generic infrastructure packages.

### ji Command Face

The canonical user-facing command surface for Roaster: `ns roaster ...`, including `ns roaster review list`, `ns roaster review run <key>`, `ns roaster review log`, `ns roaster roast list`, and hidden automation leaves under `ns roaster exec ...`.

Avoid: teaching the removed standalone `roaster` binary as an active compatibility surface or canonical invocation path.

### Roaster Capability API

The curated in-process consumer API exported as `@ns/roaster/api` for packages that need Roaster behavior without shelling out.

Avoid: importing private `@ns/roaster/src/...` modules or treating the broad package root as the Capability API.

### Review definition

A Markdown catalog entry at `.ns/reviews/<key>/review.md`, where `<key>` is a direct review folder name, with frontmatter and instructions that define what Roaster should check. Sibling assets under that folder are not separate Review definitions.

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

### GitHub publication boundary

The explicit guarded write boundary that publishes Roaster findings to GitHub, currently exposed through `ns roaster exec publish-findings` for automation.

Avoid: implying ordinary review runs publish comments, or performing live publication validation without explicit confirmation.
