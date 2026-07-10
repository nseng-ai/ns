# Roadmap

The roadmap is a Frontier of typed Question Rows (grilling / research / prototype /
task); rows carry explicit blocked-by references and are unordered beyond blocking.
Grilling and prototype rows resolve only through live exchange with the user; research
rows are agent-alone.

## Work

- [ ] **Commit-run contract** (grilling) — What makes a run of commits packageable:
      commit granularity conventions, and whether agents mark decision commits at
      production time (for example commit trailers) or packaging infers importance
      after the fact.
- [ ] **Packaging semantics** (grilling) — Precise definitions of decision PR and
      span PR, the slicing rules, and slicing authority: agent proposes / human
      ratifies, or fully agent.
- [ ] **Graphite slicing-mechanics survey** (research) — What `gt` and
      `@nseng-ai/capability-kit/graphite` primitives support splitting a linear
      commit run into a stack, absorbing edits, and squashing spans; what Flow
      autobranch/submit already provide; where the gaps are. Produces a linked
      markdown summary.
  - Policy: agent-alone; autonomous runner step allowed per `## Runner Policy`.
  - Evidence: source-backed summary committed and linked from this row; findings on
    the "Graphite can express packaging" assumption recorded in a Semantic Update.
- [ ] **Subagent run-building mechanics** (grilling) — How commit-granularity
      subagents append to one linear run: serialized in one worktree/slot, or
      parallel work linearized afterwards; what CCC dispatch needs to change.
      Blocked by: Commit-run contract.
- [ ] **Packaging mechanics design** (grilling) — The operation that slices a run
      into the stack; span-squash timing (at packaging vs at land); composition with
      Flow submit and the existing land path. Blocked by: Packaging semantics,
      Graphite slicing-mechanics survey.
- [ ] **Review-policy encoding** (grilling) — How "needs careful human review" vs
      "may skip" is durably marked on PRs, and whether agent review (the reviews
      capability) stands in on span PRs. Blocked by: Packaging semantics.
- [ ] **Repackaging under change** (prototype) — Prototype re-slicing a live stack
      after review feedback on a decision PR forces edits beneath it; find where it
      thrashes. Blocked by: Packaging mechanics design.
- [ ] **Vocabulary and placement** (grilling) — Canonical terms (commit run,
      decision PR, span PR, packaging) into domain context, and where the capability
      lives: Flow, a new capability, or consumer practice with an explicit promotion
      path. Blocked by: Packaging semantics, Packaging mechanics design.

## Parked

- Promotion to the default agent workflow — already decided as the direction if the
  additional path proves out on real work; the rollout is follow-on work gated on the
  recorded promotion decision (Completion Criteria 3), likely its own Objective.
