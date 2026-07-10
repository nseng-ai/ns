# Roadmap

The roadmap is a Frontier of typed Question Rows (grilling / research / prototype /
task); rows carry explicit blocked-by references and are unordered beyond blocking.
Grilling and prototype rows resolve only through live exchange with the user; research
rows are agent-alone. Most grilling rows were resolved in a live frontier grilling
session on 2026-07-10 (see
`updates/20260710T111652Z-frontier-grilling-session-resolutions.md`).

## Work

- [x] **Commit-run contract** (grilling) — What makes a run of commits packageable.
      Resolved: narrative commit messages carry the decision signal — no structured
      markers or trailers; packaging judges from prose and holds override authority.
      Greenness: run tip green; slice boundaries verified/made green at packaging;
      interior span commits may be red. The branch is the run: a linear, merge-free
      sequence `trunk..tip`, with no run identity beyond it.
- [x] **Packaging semantics** (grilling) — Decision/span PR definitions, slicing
      rules, slicing authority. Resolved: fully-agent slicing authority within an
      explicitly invoked local-only skill; submission stays with the user, who can
      ratify and reshape afterward. Ordered partition of the commits; a decision PR
      is one high-impact choice plus the commits needed to judge it in isolation;
      span PRs are the maximal stretches between; span sizing/splitting is packaging
      judgment. The Slice Map is derived from the packaged stack, never stored.
- [x] **Graphite slicing-mechanics survey** (research) — What `gt` and
      `@nseng-ai/capability-kit/graphite` primitives support packaging. Resolved
      (2026-07-10, autonomous runner step): survey at
      [`references/graphite-slicing-mechanics-survey.md`](references/graphite-slicing-mechanics-survey.md),
      observed on gt 1.8.6 in offline scratch repos. Local mechanics all supported:
      slicing is pure metadata (`git branch` at boundary SHAs + `gt track --parent`,
      no rebase; `gt fold --stack --keep` is its inverse), concatenation joins via
      `gt move --onto` with conflicts surfacing non-destructively as falsified
      disjointness, explicit span squash via `gt squash -m`, feedback absorption via
      `gt absorb` / `gt modify --into`. Hard negative: `gt split` is unusable by
      agents; the later mechanics decision chose LM-driven raw commands for v1 and
      parked a deterministic slicing push-down pending real-run evidence. PR fate
      under fold/re-slice (review threads, CI) is documented-but-not-observed — owned
      by the repackaging prototype row. Findings recorded in
      `updates/20260710T114846Z-graphite-slicing-survey-findings.md`.
- [x] **Subagent run-building mechanics** (grilling) — How commit-granularity
      subagents produce one linear run. Resolved: serialize entangled work;
      parallelize only declared-disjoint scopes on private branches, joined by
      concatenation-rebase as contiguous blocks in a deliberate order — never
      interleaved; a join conflict falsifies the disjointness claim and forces
      serialization of that piece. CCC dispatch needs disjoint-scope declarations
      and a join order (see the CCC dispatch proposal row).
- [x] **Packaging mechanics design** (grilling) — Resolved in live session on
      2026-07-10. Smush is an opt-in experimental, manually invoked, local-only
      LM-driven skill over any existing stack: no submit, GitHub, remote contact, or
      new CLI in v1. It proposes before mutation, creates a backup ref, slices with
      surveyed raw git/Graphite recipes, verifies each boundary with `just` in a
      temporary worktree, and performs explicit span squash after slicing and
      validation while preserving decision PRs. Classification and rationale live
      locally in branch names and commit messages; downstream PR labels are outside
      the skill. Repackaging uses `gt fold` without `--close`, never touches PRs, and
      loudly reports orphaned close-candidate PRs. CCC, not smush, owns joining
      disjoint subagent branches into the input stack. Full resolution:
      `updates/20260710T122903Z-packaging-mechanics-design-resolved.md`.
- [x] **Review-policy encoding** (grilling) — Resolved: the local packaged stack is
      self-describing through classification-bearing branch names and commit-message
      rationale. After the user submits it, `decision`/`span` PR labels plus body
      rationale make review policy durable, visible, and queryable; decision PRs
      request careful human review, while span PRs get agent review (the reviews
      capability) as the deliberate stand-in. PR metadata is outside the local-only
      smush skill.
- [ ] **Repackaging under change** (prototype) — Now unblocked. Prototype re-slicing
      a live, reviewed stack: review feedback beneath a decision PR, re-slicing a
      squashed span, and post-submit reclassification where branch renames threaten
      PR association. Observe PR/review-thread/CI fate and the orphaned PR candidates
      produced by `gt fold` without `--close`; the skill must report rather than
      mutate or close them.
- [x] **Vocabulary and placement** (grilling) — Resolved early (formally blocked by
      mechanics design; the placement and vocabulary decisions did not depend on
      it). Placement: packaging lives as a **skill** — an LM-driven mutation of an
      existing stack after creation. V1 uses surveyed raw commands; deterministic
      CLI push-downs are parked pending real-run evidence. Input scope: any existing
      stack — a contract-conforming commit run is best-case input, accreted or
      feedback-laden stacks are valid degraded input, and pre-existing PRs are
      folded via `gt fold` without closing PRs; repackaging is the same operation
      re-run. Canonical terms (Commit Run,
      Packaging/smush, Decision PR, Span PR, Slice Map, Span Squash) recorded in the
      root `CONTEXT.md`.
- [ ] **Commit-message narration convention** (task) — Draft the run-building
      convention prose (skill-ready): commit messages that narrate intent and make
      decisions legible to packaging ("chose X over Y because…"), granularity
      guidance (one coherent semantic step per commit), and tip-green expectations.
      Agent-alone; with no structured markers, packaging quality rests on this.
- [ ] **CCC disjoint-scope dispatch proposal** (task) — Design proposal for how CCC
      dispatch declares disjoint scopes for parallel subagents, orders the
      concatenation join onto the run branch, and serializes a piece when a join
      conflict falsifies its disjointness claim. Agent-alone; produces a linked
      proposal document for a later live decision.
- [ ] **Slice-map ratification surface proposal** (task) — Graduated from Fog
      (observability): propose how the human sees a packaged stack's slice map —
      cut points, decision/span classification, per-cut rationale — and reshapes it
      asynchronously (ccc stack map or similar). Agent-alone proposal; the final
      surface choice stays with the user.
- [ ] **Smush skill authoring** (task) — Now unblocked. Author the opt-in,
      experimental, local-only LM-driven packaging skill per the resolved mechanics,
      using surveyed raw git/Graphite commands and existing `ns slot gt exec`
      read-side verification. Zero new CLI push-downs in this row.

## Parked

- **Deterministic packaging CLI push-downs** — graduate only after real-run evidence
  shows the LM-driven v1 needs them. Target home: `ns slot gt exec`. The slicing
  command is purely topological and classification-free: ordered
  `[{name, boundarySha}]` plus trunk and run branch; LBYL checks require a linear,
  merge-free `trunk..tip`, ordered boundaries, no empty slices, and no name
  collisions; the run branch survives as the reparented stack tip. Classification
  never enters the CLI. Selective span squash and other repeated deterministic
  mechanics may graduate under the same evidence gate.
- Promotion to the default agent workflow — already decided as the direction if the
  additional path proves out on real work; the rollout is follow-on work gated on the
  recorded promotion decision (Completion Criteria 3), likely its own Objective.
