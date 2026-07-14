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
      `updates/20260710T122903Z-packaging-mechanics-design-resolved.md`. Revised
      (2026-07-11, live exchange — see
      `updates/2026-07-11T132402Z-replacement-stack-repackaging-resolved.md`):
      repackaging is **replacement-stack construction** — build the new shape
      alongside from the same commits, verify, user submits and closes the old
      stack (the skill reports the whole old stack as the close-candidate set) —
      not in-place `gt fold` / re-slice; fold remains a surveyed mechanic but is
      no longer the repackaging process.
- [x] **Review-policy encoding** (grilling) — Resolved: the local packaged stack is
      self-describing through classification-bearing branch names and commit-message
      rationale. After the user submits it, `decision`/`span` PR labels plus body
      rationale make review policy durable, visible, and queryable; decision PRs
      request careful human review, while span PRs get agent review (the reviews
      capability) as the deliberate stand-in. PR metadata is outside the local-only
      smush skill. Revised (2026-07-11, live grilling session — see
      `updates/2026-07-11T073927Z-decision-lifecycle-first-runs-and-grilling-resolutions.md`):
      post-submit rendering is `[decision]`/`[span]` **title prefixes** plus the
      grammar-bearing branch names themselves; PR labels were judged consumer-less —
      automation parses `headRefName` grammar directly — and moved to Parked behind a
      concrete query consumer.
- [ ] **Repackaging under change** (prototype) — Rescoped (2026-07-11, live
      exchange — see
      `updates/2026-07-11T132402Z-replacement-stack-repackaging-resolved.md`):
      repackaging is replacement-stack construction, so the fold/re-slice and
      rename-under-PR-association observations this row was chartered for are dead
      paths and no longer owned here. Remaining: one deliberate full replacement
      cycle on a live, reviewed stack — carry relevant review feedback forward from
      the old PRs into the new shape, exercise coexistence naming (the `st<num>`
      run-segment generation token settled on 2026-07-11), hand the user the
      old-stack close list, and observe CI cost across the replacement. Partial
      evidence (2026-07-10, first real run — see
      `updates/20260710T223421Z-first-real-run-parallel-packaging-and-decision-first-revision.md`):
      the 18-branch stack was repackaged in parallel mode with zero orphaned PRs
      (user submitted the new shape as PRs #3364–#3371, since all merged), but that
      run predated the feedback-carry-forward and naming decisions and did not
      include a reviewed decision PR. Additional preliminary evidence (2026-07-14):
      code-smush produced the nine-branch
      `oidc-mint-harness-registry-pnpm-derived-st2--01d-*` through `--09s-*`
      replacement component, and the user reports that it worked well enough to treat
      replacement packaging as unblocked for downstream work. Keep this row open only
      to capture the promised detailed feedback-carry-forward, CI-cost, and old-stack
      closure observations later; it is no longer a sequencing gate.
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
- [x] **Commit-message narration convention** (task) — Draft the run-building
      convention prose (skill-ready): commit messages that narrate intent and make
      decisions legible to packaging ("chose X over Y because…"), granularity
      guidance (one coherent semantic step per commit), and tip-green expectations.
      Agent-alone; with no structured markers, packaging quality rests on this.
      Resolved (2026-07-10, autonomous runner step): convention at
      [`references/commit-narration-convention.md`](references/commit-narration-convention.md)
      — narrated intent with "chose X over Y because…" why-prose and no
      self-classification; one coherent semantic step per commit, choices separated
      from mechanical fallout, finer-over-smeared since packaging can merge but not
      split; tip green required, interior span commits may be red, boundary
      greenness owned by packaging.
- [x] **CCC disjoint-scope dispatch proposal** (task) — Design proposal for how CCC
      dispatch declares disjoint scopes for parallel subagents, orders the
      concatenation join onto the run branch, and serializes a piece when a join
      conflict falsifies its disjointness claim. Artifact produced (2026-07-10,
      autonomous runner step):
      [`references/ccc-disjoint-scope-dispatch-proposal.md`](references/ccc-disjoint-scope-dispatch-proposal.md)
      — options-plus-recommendation covering workflow home (prose-first with named
      push-down candidates), scope claims (advisory overlap check at dispatch,
      realized-scope report at join; the join conflict stays the ground truth),
      declared narrative join order with barrier join, fold-to-run after join, and
      redo-by-default serialization of falsified pieces. The dispatch design
      decision itself remains a later live decision with the user.
- [x] **Slice-map ratification surface proposal** (task) — Graduated from Fog
      (observability): propose how the human sees a packaged stack's slice map —
      cut points, decision/span classification, per-cut rationale — and reshapes it
      asynchronously (ccc stack map or similar). Artifact produced (2026-07-10,
      autonomous runner step):
      [`references/slice-map-ratification-surface-proposal.md`](references/slice-map-ratification-surface-proposal.md)
      — a shared derivation contract (re-derive from stack topology via existing
      `ns slot gt exec` read-side commands, classification from branch names,
      rationale from boundary/squash commit messages) plus options-and-recommendation:
      a read-only map mode of the smush skill for v1, with an nscc stack-map
      extension and a `ns slot gt exec slice-map` read-side push-down as
      evidence-gated graduations; reshaping flows back only as a prose re-invocation
      of smush (repackaging re-run), never hand-edited state. The final surface
      choice stays with the user.
- [x] **Smush skill authoring** (task) — Author the opt-in, experimental,
      local-only LM-driven packaging skill per the resolved mechanics, using
      surveyed raw git/Graphite commands and existing `ns slot gt exec` read-side
      verification. Zero new CLI push-downs in this row. Resolved (2026-07-10,
      autonomous runner step): first-party skill at
      [`skills/code-smush/SKILL.md`](../../../skills/code-smush/SKILL.md)
      (invocation kind `invoke-only`) — propose-first Slice Map readback, backup
      refs, metadata-only slicing (`git branch` + `gt track --parent`), per-boundary
      `just` validation in temporary worktrees with move-cut/fix-forward remedies,
      explicit Span Squash preserving decision why-paragraphs, repackaging via
      `gt fold --stack --keep` (never `--close`) with loud orphaned-PR reporting,
      and feedback absorption via `gt absorb` / `gt modify --into`. Picks the
      mechanically parseable branch-name grammar `<run>--<NN><c>-<slug>`
      (`c` ∈ {`d`,`s`}, index from trunk) that the slice-map ratification proposal
      required of this row. Superseded in part (2026-07-11): the fold-based
      repackaging and orphaned-PR reporting this row shipped were later pruned to
      zero by the replacement-stack rewrite row below; the skill's current
      repackaging process is replacement-stack construction.
- [ ] **Classification-aware PR titling in flow submit** (task) — Derive
      `[decision]`/`[span]` title prefixes from the `<run>--<NN><c>-<slug>` branch
      grammar at submit time and preserve them across title regeneration (today flow
      regenerates the whole title and would strip them). No labels — see the
      review-policy revision above. Consumer-neutral flow-side work: nothing beyond
      grammar parsing enters the flow package. Proven manually on PRs #3364–#3371 and
      #3377–#3381 (2026-07-10/11; all thirteen since merged with prefixes intact).
      Verified still unbuilt (2026-07-12): no `[decision]`/`[span]` handling exists
      anywhere in `ts/`, and flow's description generation explicitly regenerates
      titles from the diff (`ts/packages/capabilities/flow/src/submit/pr-description.ts`).
- [x] **Decisions-log convention** (task) — Canonize the isolated PR-body decisions-log
      block proven on both live stacks: `<!-- ns-decisions-log:begin -->` /
      `<!-- ns-decisions-log:end -->` markers outside flow's managed generated region,
      entries of the form `Pending → Accepted/Rejected — date (@who)` with rationale and
      a pointer to the committed record. Contract (resolved 2026-07-11, live grilling):
      the decision record committed on the decision branch is **canonical**; the PR
      block is a subordinate mirror that flow treats as opaque human-owned text
      (**preserve-opaque**). Resolved (2026-07-14): convention prose at
      [`references/decisions-log-convention.md`](references/decisions-log-convention.md)
      fixes block ownership, exact markers, entry lifecycle, update order, and stale-
      mirror handling. Flow's existing regeneration scenario now specializes its
      generic human-text guard with a complete marker block and verifies verbatim
      preservation while stale generated content is replaced. Render-from-record
      remains Parked.
- [ ] **Decide-skill authoring** (task) — Author the post-submit decision-loop skill:
      walk each decision PR bottom-up; present the decision, trade-off, and a
      recommendation to the human; on their answer, commit a decision record as a
      Semantic Update on the decision branch (via `gt modify -c`, descendants
      restacked), and flip the PR mirror from Pending to Accepted/Rejected. The owning
      Objective is discovered from the smush-time packaging-event update (next row).
      Loop proven manually across seven decision PRs on 2026-07-10/11 (see
      `updates/2026-07-11T073927Z-decision-lifecycle-first-runs-and-grilling-resolutions.md`);
      all seven mirrors verified flipped to Accepted and all seven PRs merged
      (2026-07-12 refresh). A deterministic CLI push-down is Parked.
- [x] **Smush-time objective binding** (task) — The smush skill now resolves an
      explicitly supplied active owning Objective or asks the user to select one,
      includes the binding in the ratified proposal, and commits an immutable focused
      packaging-event Semantic Update into the packaged tip. Every replacement
      generation appends a distinct event; current topology is still re-derived.
      Explicit confirmed unbound runs remain possible and loud, while binding failures
      stop without automatic rollback or bypass. This keeps Decision-record ownership
      discoverable for the decide skill. Evidence:
      [`updates/2026-07-14T132934Z-smush-time-objective-binding.md`](updates/2026-07-14T132934Z-smush-time-objective-binding.md)
      and [`skills/code-smush/SKILL.md`](../../../skills/code-smush/SKILL.md).
- [x] **Code-smush replacement-stack repackaging rewrite** (task) — Rewrite the
      repackaging section of `skills/code-smush/SKILL.md` to replacement-stack
      semantics (resolved 2026-07-11 — see
      `updates/2026-07-11T132402Z-replacement-stack-repackaging-resolved.md`): build
      the replacement alongside from the same commits, verify boundaries, report the
      entire old stack as the close-candidate set (never mutate/close PRs), drop
      `gt fold`-based repackaging and orphan detection. Resolved (2026-07-11 — see
      `updates/2026-07-11T141712Z-code-smush-replacement-rewrite-and-embedded-decisions.md`):
      skill rewritten with repackaging as replacement-stack construction under a
      deterministic path rule (in-place packaging only for a fresh, single-branch,
      PR-free run; `gt rename` survives only there), fold/orphan paths pruned to
      zero. Both embedded decisions settled live: the generation token is an
      `st<num>` **run-segment suffix** (`retry-budgets-st2--01s-...`; grammar and
      regex unchanged; no token at initial packaging, first replacement `st2`,
      lowest unused number by LBYL), and review-feedback carry-forward lives in a
      **companion post-submit step** (decide-skill family; authoring it belongs to
      the decide-skill row) — smush stays local-only and hands off the old-stack
      close list plus a pointer to that step.

## Parked

- **Deterministic packaging CLI push-downs** — graduate only after real-run evidence
  shows the LM-driven v1 needs them. Target home: `ns slot gt exec`. The slicing
  command is purely topological and classification-free: ordered
  `[{name, boundarySha}]` plus trunk and run branch; LBYL checks require a linear,
  merge-free `trunk..tip`, ordered boundaries, no empty slices, and no name
  collisions; the run branch survives as the reparented stack tip. Classification
  never enters the CLI. Selective span squash and other repeated deterministic
  mechanics may graduate under the same evidence gate. A read-only
  `ns slot gt exec slice-map` derive command (parse the `<run>--<NN><c>-<slug>`
  grammar plus boundary messages into a Slice Map view) is a smaller, distinct
  candidate in the same family, under the same real-run evidence gate.
- Promotion to the default agent workflow — already decided as the direction if the
  additional path proves out on real work; the rollout is follow-on work gated on the
  recorded promotion decision (Completion Criteria 3), likely its own Objective.
- **PR classification labels** — `decision`/`span` GitHub labels, dropped from the
  review-policy resolution on 2026-07-11: automation already parses the branch-name
  grammar from `headRefName`, so labels have no consumer today. Graduate only when a
  concrete consumer needs label-based UI filtering or querying.
- **Render-from-record decisions-log** — flow re-rendering the PR decisions-log block
  from the committed decision record (needs point-catalog wiring to stay
  consumer-neutral). Preserve-opaque is the contract; graduate only on observed
  mirror/record drift in real runs.
- **Decide CLI push-down** — a deterministic decision-recording command (objective-side,
  e.g. under `ns objective exec`, never the flow package) for the decide loop: write
  the Semantic Update on the decision branch, commit/restack, flip the PR mirror.
  Graduate on repetition evidence beyond the first manual runs of the decide skill.
