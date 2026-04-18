<!--
Template for a twerk objective issue.

Fill in every section that applies, then delete any section that is genuinely
empty. Delete this HTML comment before creating the issue.

Shape rules:
  - Pick either `## Roadmap` (structured / multi-PR) OR `## Initial Next Steps`
    (loose / exploratory). Not both.
  - `## Completion Criteria`, `## Context Anchor`, and `## Assumptions & Risks`
    are load-bearing — objective-progress reads and evaluates them each session.
    Do not omit them unless the objective truly has none.
-->

# Objective

[One or two short paragraphs describing the target outcome in plain language.
State what will be true when this objective is done, not the steps to get
there.]

## Completion Criteria

Concrete, verifiable conditions. `objective-progress` evaluates each of these
against the codebase and uses them to decide when the objective is done.

- [Condition that can be checked against the codebase, tests, or artifacts]
- [Another condition]

## Context Anchor

Curated pointers a fresh agent session should load before working on this
objective. Pointers, not essays. If a bullet wouldn't actually help the next
session, cut it.

- [Relevant file or module path, and why it matters]
- [Existing pattern to follow, with a concrete example location]
- [Prior decision or constraint that shaped the current state]
- [Related PRs, issues, or commits worth reading first]

## Assumptions & Risks

What the plan rests on, and what could invalidate it. `objective-progress`
reviews these each session and flags ones that no longer hold.

- **Assumption:** [Something we believe to be true about the codebase, the
  environment, or the approach]
- **Risk:** [Something that could invalidate an assumption or derail the plan]

## Roadmap

Ordered, progressable items. Use this section when the objective is a series
of related PRs or phased work — it turns the issue into a lightweight control
plane. Each item should be something a single session can meaningfully
advance, phrased as an outcome.

Replace this section with `## Initial Next Steps` for loose / exploratory
objectives, or omit both if there is truly nothing concrete yet.

1. [First phase or PR slice — outcome, not task list]
2. [Next phase]
3. [Later phase — "TBD" is acceptable if the path isn't clear yet]

## Initial Next Steps

Use this section _instead of_ `## Roadmap` for loose / exploratory objectives.

- [First concrete step]
- [Follow-up]

## Scope & Non-Goals

- [Boundary, invariant, or non-goal worth preserving]

## Why This Matters

[Optional. Omit when the title and objective statement already make it
obvious.]
