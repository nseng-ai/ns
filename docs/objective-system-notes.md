# Objective System Notes

This document tracks durable notes and future-improvement ideas for the
objective system in this repo.

Active work should continue to live in issue-backed objectives. Use this file
for cross-cutting product, workflow, and design notes that we want to preserve
across individual objectives.

## Working Principles

- Always shape work into clean, reviewable PR slices.
- Objectives, roadmaps, and progress workflows should bias toward the next
  smallest slice that can be reviewed confidently and landed independently.
- If a workstream feels too large for clean review, split it into more PRs
  rather than batching unrelated changes together.
- A good objective should make the next clean PR obvious, not just describe the
  eventual end state.

## Lessons Learned

- Flat completion-criteria lists become hard to scan when they mix deliverables,
  invariants, workflow requirements, and cost-policy concerns in one section.
- For experience-oriented work, outcome-style objectives are stronger than
  implementation-bundle objectives. They help a fresh human or agent judge what
  value should exist when the work is done.
- Completion criteria should describe the delivered experience and the value it
  provides, not just inventory the components that happen to exist.
- A "closure test" framed as a meta question about whether the issue is
  readable is weak. The stronger pattern is "evidence of completion" that says
  what observable facts would convince a skeptical reader that the experience
  has really been delivered.
- Separate `Assumptions` and `Risks` sections reduce repeated text and keep the
  value and completion sections focused on what is being shipped.
- Objectives should be easy to scan in GitHub. Hierarchical organization is
  often better than one long flat section, especially for completion framing.
- Outcome-style parent objectives tend to expose cleaner sub-objectives. When
  the delivered value is explicit, it becomes easier to split the work into
  narrower reviewable slices.
- For standards-enforcement systems, the cost model can be intentionally
  asymmetric: cheap narrow review detection, then higher-context remediation by
  the engineer. The objective should make that asymmetry explicit rather than
  treating all inference as one undifferentiated cost.
- A strong value statement can tighten scope. Example: "adding a reviewer is as
  easy as adding a markdown file" is a better framing signal than a long list
  of parser, CLI, and workflow capabilities.
- A roadmap is not automatically actionable just because it is ordered. The
  first unfinished item should be prescriptive enough that a fresh agent can
  identify the next clean PR without inventing scope.
- Roadmap precision should intentionally decrease farther out. The next slice
  should be concrete; later items can stay looser and be refined as progress is
  made.
- A dedicated `Next Slice` section may be stronger than overloading the roadmap
  when the system wants objective-progress to feel like "work on the next thing
  and it is obvious what to do."
- Objective reconciliation should happen only after work has been pushed and
  verified. Local implementation can go sideways; the issue body should not be
  updated as if work is real before there is an external artifact or verified
  state to point at.
- Some objectives need explicit cross-cutting constraints recorded in the
  objective body, such as required skills, coding standards, or testing
  architecture. If these are left implicit, future sessions will drift.
- Stable objective slugs are useful beyond temp files. They can become durable
  handles for branches, worktrees, scratch space, and future objective tooling.

## Future Improvements

- Teach objective creation to explicitly bias roadmap items toward clean,
  reviewable PR slices for multi-PR work.
- Make PR slicing a first-class part of objective shaping, not an implicit
  follow-on decision.
- Consider recording rough PR count expectations when that would help future
  sessions preserve the intended slice size.
- Teach objective progress to re-evaluate whether the next planned step still
  forms a clean reviewable slice before implementation starts.
- When useful, capture branch or worktree slug suggestions alongside the
  objective so execution can start without re-deriving naming decisions.
- Add support for multiple objective styles rather than forcing every objective
  into one shape. At minimum:
  - outcome / experience objectives
  - substrate / platform objectives
  - migration / convergence objectives
- Add an outcome-style objective template that centers on:
  - objective
  - what done looks like
  - evidence of completion
  - context anchor
  - assumptions
  - risks
  - roadmap
- Replace or supplement flat `Completion Criteria` sections with hierarchical
  framing such as:
  - delivered experience
  - value delivered
  - evidence of completion
- Rename weak "closure test" language to "evidence of completion" when the goal
  is to describe what observable facts prove the objective is done.
- Teach objective creation to distinguish between:
  - end-state deliverables
  - invariants / constraints
  - assumptions
  - risks
    so those concerns do not collapse into one overloaded bullet list.
- Encourage objectives to include at least one short value statement that
  tightens the intended user-facing outcome. Example patterns:
  - adding a reviewer is as easy as adding a markdown file
  - the next clean PR is obvious from the roadmap
  - cheap detection, expensive remediation
- Add explicit guidance for roadmap precision by distance:
  - the first unfinished item should be PR-shaped and highly prescriptive
  - near-future items should have clear outcomes plus rough scope boundaries
  - farther-out items may stay intentionally loose and be refined later
- Add or test a `Next Slice` section in objective bodies for the immediate
  actionable unit:
  - outcome
  - included scope
  - non-goals
  - done-when evidence
- Teach objective-progress to refine the roadmap before coding if the next
  unfinished item is not specific enough to define the next clean PR.
- Change the reconciliation boundary:
  - objective-progress should not rewrite the issue body or post reconciliation
    comments for merely local, unpushed work
  - reconciliation should happen after the relevant PR or branch state is
    pushed and verified
  - local implementation notes should stay local until the work is stable
- Teach objective creation to capture required skills or authoring constraints
  when they are load-bearing for the work. Example: "when writing Python for
  this objective, load and follow `ns-dignified-python`,
  `ns-py-fake-driven-testing`, and `ns-pytest`."
- Consider making objective slugs first-class objective metadata so they can be
  reused consistently across:
  - temp artifact directories
  - branch / worktree naming
  - objective list display
  - future cross-session tooling
- Teach objective progress and reconcile flows to preserve hierarchy when
  rewriting the issue body, so outcome-style objectives do not collapse back
  into flat paragraphs or mixed bullet lists over time.

## Guardrails

- Do not treat this document as a substitute for an issue-backed objective.
- Do not dump transient session notes here; keep it focused on durable
  improvements to the objective system itself.
- When a note becomes an actionable workstream, convert it into an objective or
  issue and link that work from future edits.
