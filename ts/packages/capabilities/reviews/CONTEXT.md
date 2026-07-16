# @nseng-ai/reviews Context

Reviews is an ns Capability for configured PR-diff reviews. Its Domain Core runs read-only checks, records structured findings, and owns guarded publication; it is not a remediation workflow.

## Glossary

### Reviews

The ns Capability that runs configured read-only PR-diff checks and emits structured findings.

Avoid: describing Reviews runs as remediation workflows or as agents that edit code.

### Reviews Domain Core

Reviews-owned gateway-injected logic for the review catalog, local-diff review execution, review-log storage, finding schemas, and publication behavior.

Avoid: putting Reviews domain behavior in the ns SDK, Pi host, or generic infrastructure packages.

### ns Command Face

The canonical user-facing command surface for Reviews: `ns reviews ...`, including `ns reviews list`, `ns reviews ls`, `ns reviews run <key>`, `ns reviews log`, and hidden automation leaves under `ns reviews exec ...`.

Avoid: teaching the removed standalone `reviews` binary as an active compatibility surface or canonical invocation path.

### Reviews Capability API

The curated in-process consumer API exported as `@nseng-ai/reviews/api` for packages that need Reviews behavior without shelling out.

Avoid: importing private `@nseng-ai/reviews/src/...` modules or treating the broad package root as the Capability API.

### Review roster run

A return-only Reviews Capability API operation over one confirmed Git revision range and one complete, ordered selection roster. It loads the range diff once, executes selected Reviews sequentially, and reports review-local gaps without turning Reviews into a remediation workflow.

Avoid: implying the roster run confirms user choices, persists checkpoints or Review logs, publishes findings, clusters findings, or edits the checkout.

### Review definition

A Markdown catalog entry at `.ns/reviews/<key>/review.md`, where `<key>` is a direct review folder name, with frontmatter and instructions that define what Reviews should check. Sibling assets under that folder are not separate Review definitions.

Avoid: calling review definitions GitHub PR reviews, or treating the catalog key as a GitHub review identity.

### Tripwire

A Reviews review definition using the global `fast` model alias (`model_profile: fast`) intended to cheaply flag likely issues. It produces findings only; it does not prove the issue exhaustively or resolve it.

Avoid: using Tripwire for all Reviews runs, using Tripwire as a formal schema `kind`, or implying it edits/remediates.

### Deep review

A Reviews review definition using any global model alias other than `fast` (commonly `model_profile: deep`), intended for higher-context judgment and stronger recommendations. It still emits findings through Reviews, but it is not the cheap Tripwire UX category.

Avoid: implying deep reviews can mutate state or resolve findings.

### Finding

A structured issue reported by a Reviews run, with path, line, severity, summary, and details.

Avoid: using finding for Objective evidence, review-thread state, or generic GitHub comments.

### Findings comment

The summary PR discussion comment managed by Reviews for one review key.

Avoid: confusing it with GitHub PR review comments or review threads.

### Inline finding

An inline PR review comment for a finding that can be placed on a changed line.

Avoid: treating every finding as inline-commentable.

### Prior-findings context

The bounded set of previously surfaced Findings for one review key on a PR, each with its review-thread resolution status, supplied to a review run as optional prompt input so the model avoids re-raising already-surfaced work.

Avoid: Publication ledger, Review cache, full comment transcript, mandatory input for local runs.

### Last-reviewed head

The head commit (and reviewed base ref) recorded machine-readably in the Findings comment when a review publishes, used by later runs to distinguish regions changed since the last round from already-reviewed ones.

Avoid: cache key, input filter (review input stays whole-diff), base SHA alone.

### Review log

A Branch Memory record of a Reviews run under the `reviews` namespace and `reviews/<review-key>/...` key path.

Avoid: calling review logs durable Objective updates or changing the namespace/key path when changing user-facing terminology.

### GitHub publication boundary

The explicit guarded write boundary that publishes Reviews findings to GitHub, currently exposed through `ns reviews exec publish-findings` for automation.

Avoid: implying ordinary review runs publish comments, or performing live publication validation without explicit confirmation.
