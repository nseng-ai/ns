# ADR 0002: Singular Handoff Namespace

## Status

Accepted

## Context

Handoff Artifact is directed, durable baton for future session. Distinct from Saved Plan and from standing Branch Context, though all three may use Markdown and Handoffs use Branch Memory for storage. Multiple storage names would make Handoff creation, pickup, listing, deletion, garbage collection ambiguous.

## Decision

Canonical Handoff Namespace is singular Branch Memory namespace `handoff`.

Each Handoff Artifact uses flat Handoff Key:

```text
<semantic-slug>.md
```

Normal Handoff flows read and write only `handoff`. They do not dual-read or normalize legacy `handoffs` namespace or session-artifact paths. Moving legacy local entries, when needed, is explicit one-off operation, not compatibility policy.

## Consequences

- Handoff Technical Locator is its branch, namespace `handoff`, flat Markdown key.
- Handoff workflows have one unambiguous storage contract.
- Old local entries stay invisible until explicitly moved.
- This decision does not make Handoffs Branch Context: Handoff is one-shot continuation context, Branch Context is standing branch-scoped context.

## Alternatives

- **Silent fallback or normalization:** rejected; creates permanent hidden storage behavior and ambiguous listings.
- **Plural canonical namespace:** rejected in favor of domain's singular workflow-owned namespace.
