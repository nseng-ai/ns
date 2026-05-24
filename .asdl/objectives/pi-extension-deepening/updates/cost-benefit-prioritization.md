# Cost-Benefit Prioritization

## Summary

The Objective roadmap has been reordered by proposed cost/benefit ratio. The durable rationale is recorded in `candidate-cost-benefit-ranking.md`, with presentation/linkification first, Branch Memory CLI and Machine envelope parsing next, and broad command-runtime/test-fake work deferred.

## Objective Impact

This turns the candidate inventory from `assessment.md` into an execution order. The Objective now prefers low-cost, high-leverage seams before large risky refactors: shared presentation helpers, Branch Memory CLI discovery, and Clinkr envelope parsing come before `worktree-status`, `land-stack`, and generic command execution. `/submit` remains the highest absolute safety concern, but promotion is framed as an explicit disposition/safety decision rather than the first refactor.

## Follow-Ups

- Use the reordered `roadmap.md` as the default work sequence.
- Record explicit disposition for every candidate as decisions are made.
- Split `/submit` promotion into a follow-on Objective if its fake-driven workflow surface is too large for this Objective.
