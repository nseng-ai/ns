# ADR 0002: Singular Handoff Namespace

## Status

Accepted

## Context

A Handoff Artifact is a directed, durable baton for a future session. It is distinct from a Saved Plan and from standing Branch Context, even though all three may use Markdown and Handoffs use Branch Memory for storage. Multiple storage names would make Handoff creation, pickup, listing, deletion, and garbage collection ambiguous.

## Decision

The canonical Handoff Namespace is the singular Branch Memory namespace `handoff`.

Each Handoff Artifact uses a flat Handoff Key:

```text
<semantic-slug>.md
```

Normal Handoff flows read and write only `handoff`. They do not dual-read or normalize the legacy `handoffs` namespace or session-artifact paths. Moving legacy local entries, when needed, is an explicit one-off operation rather than compatibility policy.

## Consequences

- A Handoff Technical Locator consists of its branch, namespace `handoff`, and flat Markdown key.
- Handoff workflows have one unambiguous storage contract.
- Old local entries remain invisible until explicitly moved.
- This decision does not make Handoffs Branch Context: a Handoff is one-shot continuation context, while Branch Context is standing branch-scoped context.

## Alternatives

- **Silent fallback or normalization:** rejected because it creates permanent hidden storage behavior and ambiguous listings.
- **Plural canonical namespace:** rejected in favor of the domain's singular workflow-owned namespace.
