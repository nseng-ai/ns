# Hard Workflow Slots Prerequisites Delivered

## Summary

Every current canonical first-party portable skill or reference that directly invokes `ns slot gt exec` now makes its current operational prerequisite explicit: `@nseng-ai/slots` must be installed and enabled, and the workflow stops before mutation when the command group is unavailable. The contracts cover the seven direct skill consumers plus the independently usable delete-stack, parity-review, and PR-feedback collection references.

The wording distinguishes current command placement from permanent semantic ownership. Generic Graphite topology/reporting and Git safety helpers such as `stack-branches`, `descendants-report`, and `backup-refs` remain under `ns slot gt exec` today, but their focused ownership migration remains separate Objective work. Slot-aware occupancy, quiescence, stack-map, and conditional freeing safety remain explicit where those workflows use them.

Pi smart-restack continues to fail closed when its production preflight process cannot execute. The refusal now names `@nseng-ai/slots`, requires installing and enabling it before retrying, preserves the underlying subprocess diagnostic, and states that neither `gt restack` nor the resolver starts. Structured failure envelopes, malformed output, warnings, and blocked preconditions retain their existing cause-specific diagnostics rather than being mislabeled as missing Slots.

## Objective Impact

The hard-workflow-prerequisite roadmap row is complete. Focused fake-driven tests cover the unavailable-command message and preserved diagnostic, while existing smart-restack tests continue to prove that a refused preflight reaches no deterministic restack or LM resolver path. The bounded consumer inventory confirms that all ten canonical skill/reference files containing `ns slot gt exec` carry the prerequisite directly.

Validation passed the focused `restack-preflight`, `smart-restack`, and code-workflow parity suites; `areg check`; bounded stale-contract searches; `git diff --check`; and the default repository `just` gate, including TypeScript formatting, lint, typecheck, default tests, style guard, dependency checks, dprint, and the repository-wide Objective edge sweep.

## Follow-Ups

- Keep durable consumer accounting, `flow-slots-opt-in`, focused Graphite-helper ownership, and final synthesis open.
- Do not treat the new prerequisite prose as a permanent ownership decision; audit topology-only consumers after the focused replacement owner is chosen.
- Keep runtime Pi PR/download consumers in the broader accounting work rather than widening this portable-workflow and smart-restack slice.
