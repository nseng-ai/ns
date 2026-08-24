# Implementation proposals route through grilled Saved plans

## Summary

Future `objective-next` implementation proposals for this Objective should be directly runnable through Pi `/ns:plan:grill-and-save`. The Objective now carries a `## Metaprompt` rule requiring implementation prompts to begin with that command and to supply the bounded planning request, roadmap anchor, durable references, constraints, and completion evidence needed to grill and save a reviewed plan.

This applies only when the recommended semantic step is implementation. Research, decisions, and other non-implementation work retain their natural prompt form.

## Objective Impact

Implementation remains command-sized and evidence-gated, but the transition from recommendation to coding now includes a durable planning checkpoint. Running a proposed implementation prompt starts the structured planning grill and writes a Saved plan; it does not directly authorize implementation or change Objective execution policy.

This prompt-shaping rule is durable Objective-level context. It changes serialization only: roadmap state and Objective judgment still select the next semantic step.

## Follow-Ups

- Prefix the next `ns gs restack-resolve` CLI implementation proposal with `/ns:plan:grill-and-save`, one space, and the planning request.
- Keep implementation proposals cold-start safe so the resulting Saved plan can later drive Branch Context creation and implementation.
