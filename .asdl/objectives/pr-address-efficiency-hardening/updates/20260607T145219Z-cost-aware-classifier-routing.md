# Cost-Aware Classifier Routing

## Summary

The Objective now explicitly includes cost-aware model routing for bounded `pr-address` classification. The safe default should be a cheap/fast model for initial classifier launches when the model is reading compact feedback plus payload locators, applying the finite `feedback-classifier` rules, emitting strict JSON, and relying on deterministic validation afterward.

That default is conditional, not absolute. Validator failures, omitted items, schema errors, unusually ambiguous comments, or feedback that requires complex cross-file code-context reasoning should retry or escalate to a stronger model. The current Pi `dispatch_runner_subagent` surface does not expose a per-dispatch model/profile option, so the implementation work may require a narrow runner/harness contract before `pr-address` can make this default automatically.

## Objective Impact

This adds model cost and latency reduction as an explicit efficiency slice without weakening the Objective's safety thesis. Cheaper classification is acceptable only because deterministic templates, strict validation, compact payload locators, and escalation preserve correctness boundaries.

The change adds a new roadmap row and completion criterion for classifier model routing, and updates assumptions/risks/open questions to track the harness/API boundary separately from `pr-address`'s classifier semantics.

## Follow-Ups

- Add a per-dispatch model/profile option to runner subagent launches or document an equivalent harness fallback.
- Make `pr-address` classifier launches default to the cheap/fast profile when bounded-classification preconditions hold.
- Preserve deterministic validation as the gate, and escalate to a stronger model on validation failure, ambiguity, or complex cross-file context needs.
