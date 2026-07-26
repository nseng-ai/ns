# ADR 0004: PR Feedback and GitHub Package Boundary

## Status

Accepted

## Context

PR Feedback owns ns workflows for finding pull requests, collecting feedback and checks, and mutating review threads. Those workflows need GitHub protocol machinery, but reusable GraphQL, pagination, normalization, and status-rollup mechanics are not PR Feedback domain policy.

## Decision

`@nseng-ai/pr-feedback` owns the PR Feedback extension, the `ns address exec ...` Command Face, and the curated `@nseng-ai/pr-feedback/api` extension package API.

The package API owns the consumer-facing seam: `PrAddressGithubGateway`, the narrowed Git seam, and the PR lookup, review, discussion-comment, review-thread, mutation, feedback, and check payload vocabulary needed by in-process consumers. Consumers import that vocabulary from `@nseng-ai/pr-feedback/api`, not from command schemas, Pi presentation, private source, or lower GitHub packages.

Reusable GitHub protocol mechanics live below the extension in `@nseng-ai/extension-kit/github/*`, including the canonical provider gateway, real adapter, GraphQL and pagination machinery, normalization, and generic PR-status rollups. PR Feedback may project lower DTOs through its package API, but dependency direction is always PR Feedback → Extension Kit; lower GitHub mechanics never depend on PR Feedback.

This boundary does not create a generic GitHub extension. GitHub is an external protocol used by multiple domains, while PR Feedback owns the domain-specific workflow and seam.

## Consequences

- PR Feedback can evolve its workflow and consumer contract without exposing its command internals.
- Lower GitHub mechanics remain reusable and policy-free.
- Command-facing slices may be added incrementally without requiring a separate binary or generic runtime framework.

## Alternatives

- **Generic GitHub extension:** rejected because no shared GitHub product domain justifies one.
- **PR Feedback seam in lower infrastructure:** rejected because it would strand extension vocabulary below its owner.
- **Consumers importing the lower provider directly:** rejected because it bypasses the curated extension package API.
- **Compatibility binaries, shims, or legacy runtime fallbacks:** rejected; the pre-public system uses one current package and Command Face.
