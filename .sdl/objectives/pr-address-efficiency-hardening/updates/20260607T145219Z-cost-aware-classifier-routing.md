# 2026-06-07 — Cost-Aware Classifier Routing Progress

## Summary

Shipped the first cost-aware classifier-routing slice: Pi runner subagent dispatch now accepts an optional model pattern, forwards it to child Pi as `--model`, and reports `requestedModel` as launch evidence without claiming the actual resolved model.

`pr-address` documentation now treats cheap/fast classification as a bounded optimization, not a trust shortcut: ordinary compact-manifest classification may request the cheaper profile where the harness supports it, but deterministic validation remains mandatory and failures or ambiguity escalate to the default/stronger model.

## Objective Impact

This de-risks the Objective's cost/latency criterion while preserving the safety thesis. The shipped surface gives `pr-address` a concrete way to request cheaper initial classifier runs in Pi, and the docs keep correctness anchored in templates, strict JSON, validation, and escalation rather than model choice.

## Follow-Ups

- Keep cross-harness fallback language current for environments that cannot choose a model per runner dispatch.
- Watch future `pr-address` runs for validation-failure or ambiguity cases that should refine the cheap/fast eligibility policy.
- Continue removing manual orchestration around classification, planning, mutation payloads, checkpoints, and finalization.
