# Cost-Aware Classifier Routing Implemented

## Summary

Pi runner subagent dispatch now supports optional per-dispatch model selection. The `dispatch_runner_subagent` tool accepts a `model` string, rejects blank values, trims valid values, passes the model pattern through to child Pi as `--model`, and records it as `requestedModel` in tool details without claiming it is the resolved actual model.

The public `pr-address` workflow now routes ordinary bounded feedback classification through a configured cheap/fast Pi model pattern when available. The classifier guidance keeps deterministic `classification-template` scaffolding, strict JSON packet output, `validate-feedback-classification`, and validator-driven escalation to a stronger/default model for validation failures, omissions, ambiguous feedback, or complex cross-file code-context reasoning.

Verification: targeted runner subagent tests passed; `bun run check` passed in `ts/packages/pi-extensions`; `just ts-check`, `just ts-test`, and `just dprint-check` passed; targeted dprint checks passed for the changed Markdown guidance.

## Objective Impact

This completes the cost-aware classifier model routing roadmap slice. The implementation adds the missing Pi per-dispatch model knob without hard-coding provider-specific policy, and it keeps the cost policy in `pr-address` skill guidance where bounded-classification safety can be stated alongside deterministic validation and escalation rules.

The broader Objective remains open. Per-batch evidence/checkpoint support, finalization support, and a representative lower-orchestration proof are still needed before closure.

## Follow-Ups

- Continue adding per-batch evidence/checkpoint support for changed files, validation commands, commit SHAs, addressed IDs, GitHub mutation outcomes, and skipped items.
- Add finalization support for unresolved feedback summaries.
- Prove the lower-orchestration happy path on a representative PR-addressing run.
