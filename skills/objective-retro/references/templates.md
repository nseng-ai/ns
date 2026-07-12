# objective-retro artifact templates

Templates for the two artifacts this skill writes. Read the section you need
when writing that artifact: "Basis artifact template" for Workflow step 6,
"Retro artifact template" for step 7.

## Basis artifact template

````markdown
# Objective Retro Basis: <slug>

## Objective

- Slug: <slug>
- Title: <title>
- Closure state: <open|closed|deleted|unknown>
- Source record: <path>
- Storage branch: <branch>

## Delivering PRs

- PR #<n>: <title> — <url> — Confidence: <high|medium|low>; Evidence: <why included>

## Commit Set

- <sha> <subject> — PR #<n or unknown> — Evidence: <objective-dir touch|recorded PR|other>

## File Union

- `<path>`

## Materialization Strategy

Default: per-PR diffs.

Reproduce:

```bash
gh pr diff <n> --patch > /tmp/objective-<slug>-pr-<n>.patch
```

Alternates and caveats:

- live-file-state: fast but drift-contaminated; do not use as primary post-merge evidence.
- commit-set-union: faithful to selected commits but fragile around checkpoint/noise commits and attribution gaps.

## Confidence / Gaps

- Overall confidence: <high|medium|low>
- <explicit gap or caveat>

## Structural Digest

- <none; below cutoff>
- or: `objective-retro:digest/<slug>/<timestamp>.md`

## How to Review From This Basis

Materialize the per-PR diffs above, then apply any review lens. Treat this basis as the delivered-scope evidence, not as findings or approval.
````

## Retro artifact template

```markdown
# Objective Retro: <slug>

## Basis

- `objective-retro:basis/<slug>/<timestamp>.md` — confidence: <high|medium|low>

## Findings

- <finding> — Evidence: <PR/commit/file/update citation>

## Scope vs thesis

- Delivered scope vs the Objective's thesis and completion criteria: what shipped, what drifted, what was dropped — with citations.
- Roadmap-vs-delivered gaps: rows claimed done without evidence, or delivered work no row covers.

## What went well / what dragged

- <observation tied to evidence: PR shape, slice sizing, rework, review friction, tracking hygiene>

## Recommendations

- <actionable recommendation, smallest useful change first>
```
