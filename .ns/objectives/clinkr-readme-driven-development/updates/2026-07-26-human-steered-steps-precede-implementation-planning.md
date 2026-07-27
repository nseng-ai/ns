# Human-Steered Steps Precede Implementation Planning

## Summary

Prompt policy now distinguishes bounded landing work from discussion and decision work. `/ns:plan:grill-and-save` applies only when material decisions are settled, the selected step can proceed mostly autonomously, and PRs are its expected direct result. Discussion, contract review, design, blessing gates, and other actively steered work instead receive short interactive prompts rather than implementation plans.

For roadmap rows that mix unresolved human-steered decisions with later implementation evidence, `objective-next` should select the decision substep first. Implementation planning becomes appropriate only after those decisions are recorded.

## Objective Impact

The active README blessing row should currently produce an interactive contract-review prompt. Its remaining provisional wording and contextful definition representation require active steering before compile and execution fixtures are planned. This corrects the prior interpretation that the entire mixed row was already a PR-shaped implementation slice.

## Follow-Ups

- Run the README contract review and record the settled wording and contextful representation.
- After that decision is durable, use `objective-next` to judge whether the fixture work is ready for `/ns:plan:grill-and-save`.
