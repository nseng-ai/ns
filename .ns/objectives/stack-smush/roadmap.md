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
      rules, slicing authority. Resolved: fully-agent authority — packaging slices
      and submits, the human ratifies the slice map asynchronously by reshaping.
      Ordered partition of the commits; a decision PR is one high-impact choice plus
      the commits needed to judge it in isolation; span PRs are the maximal
      stretches between; span sizing/splitting is packaging judgment narrated in the
      slice map.
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
      agents, so a slicing CLI push-down is mandatory. PR fate under fold/re-slice
      (review threads, CI) is documented-but-not-observed — owned by the repackaging
      prototype row. Findings recorded in
      `updates/20260710T114846Z-graphite-slicing-survey-findings.md`.
- [x] **Subagent run-building mechanics** (grilling) — How commit-granularity
      subagents produce one linear run. Resolved: serialize entangled work;
      parallelize only declared-disjoint scopes on private branches, joined by
      concatenation-rebase as contiguous blocks in a deliberate order — never
      interleaved; a join conflict falsifies the disjointness claim and forces
      serialization of that piece. CCC dispatch needs disjoint-scope declarations
      and a join order (see the CCC dispatch proposal row).
- [ ] **Packaging mechanics design** (grilling) — The operation that slices a stack
      into decision/span form and its composition with Flow submit and the existing
      land path. Decided early: span squash is an explicit post-stack-creation
      command, never implicit in packaging or land. Was blocked by the Graphite
      slicing-mechanics survey — now unblocked (survey resolved 2026-07-10); ready
      for a live session, with the survey's gaps list (slice push-down,
      concatenation-join command, selective span squash, decision/span labeling) as
      the agenda.
- [x] **Review-policy encoding** (grilling) — Resolved: `decision`/`span` PR labels
      plus a body rationale written by packaging make review policy durable,
      visible, and queryable; decision PRs request careful human review; span PRs
      get agent review (the reviews capability) as the deliberate stand-in, with no
      human request.
- [ ] **Repackaging under change** (prototype) — Prototype the hard case of the
      general packaging operation: re-slicing a live, reviewed stack (review
      feedback beneath a decision PR, span reclassification after async
      ratification); find where it thrashes PRs, reviews, and CI. Blocked by:
      Packaging mechanics design.
- [x] **Vocabulary and placement** (grilling) — Resolved early (formally blocked by
      mechanics design; the placement and vocabulary decisions did not depend on
      it). Placement: packaging lives as a **skill** — an LM-driven mutation of an
      existing stack after creation, with deterministic sub-operations pushed down
      to CLI per `cli-push-down`. Input scope: any existing stack — a
      contract-conforming commit run is best-case input, accreted or feedback-laden
      stacks are valid degraded input, and pre-existing PRs are folded via `gt
      fold`; repackaging is the same operation re-run. Canonical terms (Commit Run,
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
- [ ] **Smush skill authoring** (task) — Author the packaging skill itself per the
      resolved semantics, plus whatever CLI push-downs the survey shows are needed.
      Blocked by: Packaging mechanics design.

## Parked

- Promotion to the default agent workflow — already decided as the direction if the
  additional path proves out on real work; the rollout is follow-on work gated on the
  recorded promotion decision (Completion Criteria 3), likely its own Objective.
