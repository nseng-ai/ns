# Dispatch Context namespace adopted

## Summary

The Branch Memory namespace for dispatch-owned context is named `dispatch-context`, replacing the earlier proposed `dispatch-input` name.

`dispatch-context` reflects the durable model: the namespace may contain plans and future typed context under a Dispatch ID prefix, rather than representing only one input artifact. The current convention remains:

```text
<dispatch-id>/plan/<plan-slug>.md
```

There is still no manifest in this version.

This update supersedes only the namespace terminology in the earlier local-autorun and Dispatch ID updates. Those Semantic Updates remain immutable historical evidence; their identity, context-layout, provenance, and autorun decisions are unchanged.

## Objective Impact

- Durable Objective, roadmap, and README prose now specify the `dispatch-context` namespace.
- Implementation and tests should use `dispatch-context` as the exact workflow-owned Branch Memory Namespace.
- The reserved `branch-context` Namespace remains unrelated and must not be reused for dispatch delivery.

## Follow-Ups

- Pin `dispatch-context` in locator validation, fake-driven scenarios, help, machine output, and anchor-PR provenance tests.
- Treat any future namespace migration as a public storage-contract decision rather than an incidental rename.
