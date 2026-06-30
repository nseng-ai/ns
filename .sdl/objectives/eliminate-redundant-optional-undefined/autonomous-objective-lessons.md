# Autonomous Objective Lessons

This document collects lessons from running this standing Objective through autonomous / objective-autopilot style loops. Its purpose is to make future auto-objectives easier to steer, measure, review, and improve.

## Current Lessons

### Use an explicit objective function

An autonomous Objective needs a visible measurement model. For this Objective, the scorecard is:

1. typed optional-undefined property count; and
2. undefined-normalization/check code count.

The first metric should generally trend down. The second may fluctuate while boundary normalization moves through the stack. Future auto-objectives should similarly name their primary and secondary metrics, including which metrics are monotonic, which are diagnostic, and which require qualitative interpretation.

### Expect policy to evolve from experience

Autonomous Objective policy should not be treated as fully knowable upfront. This Objective started with semantic cleanup rules and then added standing runner policy, review-substantive slice sizing, a minimum edit threshold, and a PR metric scorecard after repeated runs exposed friction. Future auto-objectives should leave room for explicit policy-refinement updates when runs reveal that agents need sharper guidance, different slice sizing, clearer stop conditions, or better metrics.

### Require PR-level before/after evidence

Autonomous progress is easier to review when every submitted PR carries the objective metrics in its description. The PR description should state the measurement scope, before/after counts, validation run, and any caveats. This prevents the durable Objective record from becoming the only place where progress is understandable.

### Prefer semantic slices over syntactic sweeps

Autonomous cleanup should choose coherent semantic clusters rather than broad grep-driven rewrites. A good slice explains why the edited declarations share the same boundary, construction path, or compatibility claim.

### Separate execution granularity from review granularity

Tiny trickle PRs create review overhead and make the Objective feel noisy. Broad rewrites create risk. Autopilot should be allowed to make small, reversible, locally validated execution steps while exploring, but those steps should usually be aggregated into a coherent review-substantive PR. The right PR unit is not the smallest safe edit; it is one semantic boundary, package, or subsystem cluster that a reviewer can understand as a single claim.

Very granular commits or checkpoints may be useful during execution, but PRs should usually group them when they share the same semantic boundary. Do not batch unrelated optional-undefined edits just to make the PR bigger.

### Track temporary normalization debt separately from final simplification

Some work moves progress forward by adding explicit omission-building checks before upstream types are narrowed. Auto-objectives need to distinguish final-state metric improvement from temporary scaffolding that enables later cleanup.

### Keep Semantic Updates as learning and policy records, not commit logs

Semantic Updates should not replicate commit messages or become per-branch changelogs. They are most valuable when they record durable lessons that should influence future tooling, Objective definitions, runner policy, or candidate classification. Good updates explain why future agents should behave differently or what classification can be reused.

Autonomous execution should also use Semantic Updates to record policy decisions made during the run that may deserve later human review: scope boundaries chosen, categories preserved, metric interpretation changes, stop/ask decisions, or evidence that suggests a future tool or guard. Routine execution details belong in commits, PR descriptions, or validation output, not in Objective updates unless they change the Objective's future behavior.

### Preserve stop/ask boundaries

Autonomous loops should stop or ask when they encounter public compatibility surfaces, external schemas, ambiguous domain meaning, validation fallout outside the slice, or external write actions not explicitly authorized. These stop conditions should be part of the Objective policy, not rediscovered by each runner.

## Future Auto-Objective Design Notes

- Each auto-objective should define its objective function in durable prose before repeated autopilot runs.
- Metrics should be cheap enough for agents to recompute locally and concrete enough to appear in PR descriptions.
- Metrics should not replace semantic review; the Objective should explicitly say what qualitative claims must accompany the numbers.
- Objective updates should capture reusable classification lessons, not per-run logs.
- The roadmap should state default slice sizing and examples of coherent clusters.
- If a metric routinely requires a custom command, consider pushing that measurement into a tested CLI helper instead of relying on ad hoc shell snippets.

## Open Questions

- Whether SDL should grow a standard PR-description block for objective metrics.
- Whether objective-autopilot should provide reusable measurement hooks, or whether each Objective should keep bespoke measurement instructions.
- Whether recurring auto-objective lessons should eventually move into shared Objective guidance rather than staying in this Objective record.
