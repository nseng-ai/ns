# ADR 0004: PR Feedback and GitHub Package Boundary

## Status

Accepted

## Context

PR Feedback owns ns workflows for finding pull requests, collecting feedback and checks, mutating review threads. Those workflows need GitHub protocol machinery; reusable GraphQL, pagination, normalization, status-rollup mechanics are not PR Feedback domain policy.

## Decision

`@nseng-ai/pr-feedback` owns PR Feedback extension, `ns address exec ...` Command Face, curated `@nseng-ai/pr-feedback/api` extension package API.

Package API owns consumer-facing seam: `PrAddressGithubGateway`, narrowed Git seam, and PR lookup, review, discussion-comment, review-thread, mutation, feedback, check payload vocabulary needed by in-process consumers. Consumers import that vocabulary from `@nseng-ai/pr-feedback/api`, not from command schemas, Pi presentation, private source, or lower GitHub packages.

Reusable GitHub protocol mechanics live below extension in `@nseng-ai/extension-kit/github/*`, including canonical provider gateway, real adapter, GraphQL and pagination machinery, normalization, generic PR-status rollups. PR Feedback may project lower DTOs through its package API. Dependency direction is always PR Feedback to Extension Kit; lower GitHub mechanics never depend on PR Feedback.

This boundary does not create generic GitHub extension. GitHub is external protocol used by multiple domains; PR Feedback owns domain-specific workflow and seam.

## Consequences

- PR Feedback can evolve its workflow and consumer contract without exposing command internals.
- Lower GitHub mechanics stay reusable and policy-free.
- Command-facing slices may be added incrementally, no separate binary or generic runtime framework needed.

## Alternatives

- **Generic GitHub extension:** rejected; no shared GitHub product domain justifies one.
- **PR Feedback seam in lower infrastructure:** rejected; would strand extension vocabulary below its owner.
- **Consumers importing the lower provider directly:** rejected; bypasses curated extension package API.
- **Compatibility binaries, shims, or legacy runtime fallbacks:** rejected; pre-public system uses one current package and Command Face.
