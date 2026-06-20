# Objective Family Alignment Sequencing

## Summary

Aligned the Objective skill-family role contract before starting the larger `objective-update` rewrite. The umbrella `objective` skill now states the operation roles canonically: `objective-next` is a recommend-first router, `objective-update` owns exactly-one-Objective tracking and Closure Gate closure, `objective-refresh` is non-closing rebaseline work, `objective-close` is explicit closure, and `objective-stack-impl` is implementation orchestration rather than lifecycle ownership.

The immediate mismatch was in `objective-next`: its frontmatter described the skill as unconditionally read-only/advisory, while the body already routed to confirmed `objective-update` for stale tracking and confirmed execution when durable Objective policy allows it. The frontmatter now reflects that recommend-first router model without redesigning the workflow.

## Objective Impact

The per-skill remediation sequence now inserts this Objective-family alignment slice before the `objective-update` rewrite and then `objective-create`. This preserves the holistic review finding that `objective-update` remains the keystone remediation target, while removing cross-skill role ambiguity first.

This slice deliberately excluded `objective-close` archived-path handling and avoided rewriting `objective-update` or `objective-create`; those remain follow-up work under the existing remediation roadmap.

## Follow-Ups

Use the clarified umbrella contract as input to the upcoming `objective-update` rewrite. After that, continue to `objective-create` body work unless a new higher-value remediation slice is explicitly selected.
