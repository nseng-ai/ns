# Current Reviews, Address, and Slots Journeys Inventoried

## Summary

The current local Reviews, Address/Pi, and Slots/worktree journeys were inventoried
against the already-decided local-feedback-resolution Destination. The source-cited
research note is `docs/research/local-feedback-resolution-current-journeys.md`.

The principal finding is that all three areas contain reusable substrate, but none
currently owns the decided end-to-end local journey:

- **Reviews** already provides repo-only review discovery, `applies_to` glob
  filtering, profile-to-model resolution, typed single-review outcomes, input
  coverage, local PR-free execution, and Branch Memory logs. It currently runs
  one review key against `origin/<base>...HEAD`; it has no prompted arbitrary
  range, roster run, live progress, continue-on-review-failure aggregation, full
  per-finding provenance, or triage/planning handoff. Its run command also exposes
  per-run model/profile overrides that the decided first loop excludes.
- **Address/Pi** already demonstrates the useful interaction grammar: collect
  multiple GitHub feedback sources, combine them into one report, prompt for a
  human-confirmed omnibus/split-out/decline/defer plan, and preserve ordered
  per-thread partial mutation outcomes. Address itself is intentionally a
  GitHub-feedback primitive capability; the Pi combined report and disposition
  behavior are presentation/prompt policy rather than structured durable local
  artifacts. The former classification/planning/checkpoint workflow engine was
  deliberately retired and must not be blindly resurrected.
- **Slots/worktrees** already provide clean-slot allocation, plain local branch
  creation at a base, worktree isolation, explicit free/cleanup behavior, and
  composition precedents from Flow and cmux. Slots do not Graphite-track branches,
  orchestrate one candidate branch per planned PR, attach validation/outcome
  evidence, define adoption, or own candidate cleanup. Normal slot free detaches
  the worktree but retains the branch; disposable worktrees do not imply
  disposable refs.

Cross-cutting constraints discovered:

- A reproducible range needs exact identity beyond a moving `baseRef`; roster
  applicability and each review run must demonstrably use the same confirmed
  range.
- Dirty review definitions make commit-only definition provenance insufficient;
  the later artifact decision must account for the instructions actually run.
- Successful execution can still have omitted input coverage, which is another
  review gap alongside failed and toggled-off reviews.
- Local findings cannot use GitHub thread state as disposition memory; explicit
  local dispositions and checkpoints are required.
- Branch creation, Graphite tracking, slot placement, validation, and adoption
  each have partial-failure boundaries that must remain visible in outcomes.
- Existing Markdown logs and Pi editor reports are useful presentation evidence,
  not structured artifacts future consumers should scrape.

## Objective Impact

- The `(research)` current-journey inventory Question Row is resolved and marked
  `[x]` in `roadmap.md`.
- The local addressing contract row is now fully unblocked: both of its blockers
  (multi-reviewer semantics and current-journey inventory) are resolved.
- The inventory confirms the assumption that Reviews, Address, and Slots contain
  useful composable behavior, while rejecting a stronger interpretation that an
  existing capability already supplies the local journey.
- The research sharpens, without resolving, the local addressing contract:
  decisions are needed for disposition units and vocabulary, allowable bulk
  actions, planned-PR membership and dependencies, checkpoint staleness/resume,
  partial-failure accounting, and authorization boundaries.
- No package boundary, gateway shape, persistence technology, or canonical
  cross-source model was selected; the research stayed within requirements
  evidence as required by the row.

## Follow-Ups

- Use the research note's ten evidence questions to grill the now-unblocked local
  addressing contract row.
- Carry exact range identity, actual definition content identity, input-coverage
  omissions, and roster gaps into the reusable-artifact requirements row.
- Carry explicit branch/ref ownership and partial-failure outcomes into the
  autofix safety row; do not treat slot placement alone as disposal semantics.
