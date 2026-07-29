# Outcome and Rendering Reconciliation Approved

## Summary

The outcome-and-rendering reconciliation cluster is approved. Clinkr will own one command/outcome model spanning `resultSchema`, `negativeSchema`, `failureSchema`, and `usageErrorSchema`. That model will drive handler outcome types, runtime validation, machine-envelope construction, and the composed discriminated schema published by `--json-schema`.

Configured outcome data will be validated in Clinkr before rendering or envelope emission. Schema violations are programmer errors that propagate to application crash policy. Omitting a status schema makes that outcome bodyless; `z.any()` remains the explicit intentionally untyped escape hatch.

Rendering will be command-level only. Per-exit human and Markdown overrides will be removed after the SDK adapter and direct callers represent branch-dependent presentation through typed outcome data and stable command renderers.

## Objective Impact

The audit dispositions for outcome schemas, runtime validation, and render overrides are now approved rather than discussion-gated. The migration order is explicit: extend SDK and caller outcome data first, delegate all configured-status validation and rendering to Clinkr, remove SDK-only success parsing and render synthesis, migrate remaining direct override callers, and then delete Clinkr's per-exit override surface.

The README draft now states that all four schemas form one Clinkr-owned contract and tells adapters not to reconstruct partial policy. No TypeScript implementation occurred in this decision slice.

## Follow-Ups

- Settle raw Commander mounting, app-level completion-error policy, `ClinkrFailure` removal, and the exact filesystem bootstrap API before implementation reaches those surfaces.
- During reconciliation, preserve bodyless JSON status envelopes while omitting `data` and human result text.
- Audit every SDK and direct per-exit override caller before deleting the override surface; move presentation distinctions into typed outcome data rather than dropping behavior mechanically.
