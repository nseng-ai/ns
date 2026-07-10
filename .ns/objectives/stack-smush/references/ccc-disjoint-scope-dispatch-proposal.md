# CCC disjoint-scope dispatch proposal

Task artifact for the **CCC disjoint-scope dispatch proposal** roadmap row of the
`stack-smush` Objective. This is a **proposal for a later live decision**, not a
settled spec: where a real choice exists it is written as options plus a
recommendation, and the final call on each knob stays with the user. It proposes how
CCC dispatch (1) declares disjoint scopes for parallel commit-granularity subagents,
(2) orders the concatenation join of their private branches onto the run branch, and
(3) serializes a piece when a join conflict falsifies its disjointness claim.

Grounding: the resolved **Subagent run-building mechanics** row and the frontier
grilling resolutions
(`../updates/20260710T111652Z-frontier-grilling-session-resolutions.md`), the
packaging mechanics resolution
(`../updates/20260710T122903Z-packaging-mechanics-design-resolved.md`), the observed
join mechanics in
[`graphite-slicing-mechanics-survey.md`](graphite-slicing-mechanics-survey.md) (§2),
the run-building narration convention in
[`commit-narration-convention.md`](commit-narration-convention.md), the CCC package
vocabulary in `ts/packages/capabilities/ccc/CONTEXT.md`, and the dispatch
implementation in `ts/packages/capabilities/ccc/src/cmux/` (paths cited inline are
relative to the repo root).

## Settled ground this proposal builds on (not reopened)

- Serialize entangled work; parallelize **only declared-disjoint scopes on private
  branches**; join by concatenation-rebase as **contiguous blocks in a deliberate
  order, never interleaved**; a join conflict **falsifies the disjointness claim**
  and forces serialization of that piece.
- **CCC, not smush, owns the join.** Smush accepts any existing stack as input and
  never concatenates subagent branches.
- **The branch is the run**: linear, merge-free `trunk..tip`, no run identity beyond
  it. No structured markers or trailers in commit messages; classification happens at
  packaging time. Run pieces follow the commit-narration convention.
- Join mechanics are surveyed and supported: `gt move --onto` concatenates disjoint
  tracked branches with Graphite metadata kept correct; conflicts surface
  non-destructively as a standard rebase-in-progress, and `git rebase --abort`
  restores the piece branch intact (survey §2).

## The CCC dispatch surface today

CCC — Cmux Command and Control (`ts/packages/capabilities/ccc/CONTEXT.md`) — is the
repo's orchestration layer for command flows that compose branch preparation, slot
worktrees, cmux workspaces, and child Pi dispatch. Its dispatch commands
(`src/cmux/command-surfaces.ts`) are:

- `/ns:ccc:workspace:dispatch-prompt <prompt>` (`src/cmux/dispatch-prompt.ts`) —
  generates a branch slug, creates the branch with `git branch <name> HEAD` plus
  `gt track <name> --parent <caller-branch> --no-interactive`
  (`createTrackedBranchFromResolvedParent`), stores the launch prompt in Branch
  Memory (`ccc-dispatch/prompt.md` on the new branch), checks the branch out into a
  slot worktree, opens a cmux workspace, and launches a child Pi session that reads
  its prompt back via `brmem get`.
- `/ns:ccc:workspace:dispatch-from-trunk <prompt>` (`src/cmux/dispatch-from-trunk.ts`)
  — the same flow, parented on refreshed Graphite trunk instead of the caller's HEAD.
- `/ns:ccc:workspace:dispatch-plan` / `/ns:ccc:surface:dispatch-plan`
  (`src/cmux/slot-dispatch-plan.ts`) — takes the latest saved plan, creates a
  Graphite-tracked branch-context branch with the plan attached, and launches a child
  Pi session running the branch-context implementation command.

Three facts matter for run building:

1. **The private-branch half already exists.** Every dispatch produces exactly the
   shape the settled contract requires: a Graphite-tracked branch with an explicit
   parent, isolated in its own slot worktree, with its payload carried git-natively
   (Branch Memory or an attached plan). N parallel dispatches from a run branch tip
   already yield N private sibling branches.
2. **Nothing above a single dispatch exists.** There is no decomposition concept (a
   set of pieces belonging to one run), no scope declaration anywhere in the payload
   path, no ordering, and no join operation of any kind.
3. **The completion instructions are wrong for run pieces.** `buildLaunchPrompt`
   (`src/cmux/dispatch-prompt.ts`) tells every child to commit and then run
   `ns flow submit`. A run piece must never submit; its branch is consumed by the
   join.

So the proposal is an orchestration layer *above* the existing per-piece dispatch
mechanics, plus a payload change, plus a join procedure — not a rebuild of dispatch.

## Proposed workflow shape

One **run dispatch** consists of:

1. **Decompose.** The orchestrating session splits the planned work into pieces and
   classifies each as entangled (serialize) or disjoint (parallelizable), writing a
   short decomposition document: per piece, a prose task, a scope claim, and a join
   position. The document is transient process input (per the Objective's
   non-goals), not durable state.
2. **Dispatch the parallel wave.** Each disjoint piece is dispatched via the existing
   mechanics off the current run branch tip (the **run base** for that wave),
   producing private sibling branches. The payload carries the scope claim, the
   run-piece completion instructions, and the narration convention (below).
3. **Pieces complete.** A piece is join-eligible when its work is committed per the
   narration convention and its piece tip validates (`just`).
4. **Barrier, then ordered join.** When every piece in the wave is final (complete or
   serialized out), CCC joins the private branches onto the run branch as contiguous
   blocks in the declared order via `gt move --onto`.
5. **Conflict handling.** A join conflict falsifies that piece's disjointness claim:
   abort non-destructively, pull the piece out of the wave, and serialize it (options
   below).
6. **Fold and validate.** Collapse the joined chain back into the single run branch,
   validate the run tip with `just`, and fix forward if red. The run branch — one
   linear, narrated commit run — is now valid smush input. Entangled pieces and any
   next wave continue from the new tip.

The rest of this document takes the open design choices in that shape one at a time.

## Decision 1 — where the workflow lives

- **Option A — prose-first (skill/procedure over existing surfaces).** The
  orchestrating agent uses the existing dispatch commands per piece, embeds scope
  claims in payloads, tracks the decomposition itself, and performs the join with the
  survey's raw `gt` recipes. No new TypeScript.
- **Option B — new CCC orchestration commands.** A `run dispatch` command that
  consumes a decomposition document and fans out pieces deterministically, plus a
  `run join` command that applies the declared order and stops cleanly on conflict.
- **Option C — prose-first with a declared push-down path.** Start as Option A;
  name the deterministic sub-operations now (fan-out dispatch of N pieces; the
  ordered join executor with conflict reporting) as `cli-push-down` candidates that
  graduate on real-run evidence, mirroring how packaging chose an LM-driven v1 with
  parked push-downs.

**Recommendation: Option C.** It is consistent with the packaging-mechanics
resolution's posture (LM-driven v1, push-downs gated on evidence), requires zero new
CLI before the workflow has been exercised once, and keeps the join — the only
genuinely delicate step — in the same propose-then-mutate style the repo already
trusts for stack mutation. The survey's gaps list (§6, items 1–2) already names the
join push-down shape.

## Decision 2 — declaring disjoint scopes

A scope claim is the piece's statement of what it owns for the duration of the wave.
Two components are proposed: a one-line prose **ownership statement** ("owns the
`slots` gateway split and its tests; touches nothing under `flow/`") and an explicit
**path set** (directories/globs the piece expects to write). The claim is a *claim*,
not a lock — the settled contract makes the join conflict the ground truth detector,
so declaration exists to (a) make the orchestrator's disjointness judgment explicit
and reviewable, (b) give the subagent a fence to notice itself crossing, and (c) make
falsification attributable after the fact.

Where the claim lives: in the dispatch payload, which already travels git-natively —
Branch Memory `ccc-dispatch/prompt.md` on the piece branch (or the attached plan for
plan-shaped pieces) — plus the orchestrator's transient decomposition document. This
adds no new durable state and no new storage surface; claims die with the piece
branches at fold time, which is correct — they are production scaffolding, not run
content. The no-structured-markers rule is about *commit messages* and is untouched:
nothing about the claim enters the run's commits.

Checking strictness is the real choice:

- **Option A — prose-only.** No mechanical check; the orchestrator eyeballs
  disjointness, the join detects lies.
- **Option B — advisory overlap check at dispatch.** Before dispatching a wave,
  compare declared path sets pairwise; overlap is a warning that forces the
  orchestrator to either re-scope or consciously accept the risk. Never a hard block
  (path sets cannot express true disjointness anyway).
- **Option C — realized-scope enforcement at join.** Before a piece is
  join-eligible, diff its branch against the run base and verify the touched paths
  fall inside the declared set; violations block the join.

**Recommendation: Option B at dispatch, plus the Option C comparison as a
join-time *report*, not a gate.** The dispatch-time check is nearly free and catches
the dumbest failure (two pieces declared onto the same directory). The join-time
realized-vs-declared report makes an honest record of scope creep without pretending
path disjointness implies semantic disjointness — two pieces can touch disjoint files
and still be entangled in behavior, which is why joined-tip validation (Decision 4)
and the red-tip rule (Decision 5) exist. Hard enforcement (C as a gate) is rejected
for v1: it punishes benign fence-adjacent edits and duplicates what the conflict
check does better.

## Decision 3 — ordering the concatenation join

Settled: blocks are contiguous and deliberately ordered, never interleaved. Open: who
picks the order and when.

- **Option A — declared at decomposition time.** The join position is part of each
  piece's entry in the decomposition document; the default order is narrative — the
  order a reader of the finished run would want, respecting any soft dependencies
  ("B's tests read helpers A introduces").
- **Option B — chosen at join time.** The orchestrator (or joining agent) looks at
  what the pieces actually became and orders them then.
- **Option C — completion order.** First finished, first joined.

**Recommendation: Option A as the default, with a deliberate join-time override
allowed; Option C is rejected outright.** Ordering is a narrative decision about the
run that packaging will later read, so it belongs where the narrative is designed —
the decomposition — and the frontier resolution's "deliberate order" language points
the same way. But the declared order is a plan, not an oath: if a piece grew in an
unexpected direction, the joining agent may re-order *explicitly, recording why* in
the join proposal. Completion order is arbitrary with respect to the story and would
make run legibility hostage to scheduler noise.

**Barrier vs. incremental joining:** join only when every piece in the wave is final
(**barrier join**) versus concatenating the declared prefix as pieces complete.
Recommendation: barrier join for v1. It is simpler, makes the join one reviewable
operation, and loses little — truly disjoint pieces rebase cleanly regardless of when
they join. Incremental prefix-joining (never out of declared order) is a later
optimization if wave latency hurts in practice.

## Decision 4 — join mechanics

Straight from the survey (§2), with the run branch as the accumulation point:

1. **Precondition — release piece worktrees.** A branch checked out in a slot
   worktree cannot be operated on from another worktree. Before joining, each
   completed piece's slot is released (checked away from the piece branch). This is a
   real lifecycle step the proposal makes explicit; today nothing reclaims a
   dispatched slot automatically.
2. **Concatenate in declared order.** With piece branches `p1..pN` all tracked with
   parent = run base: from `p1`, `gt move --onto <run-branch> --no-interactive`; from
   `p2`, `gt move --onto p1`; and so on. Each move appends that piece's commits as a
   contiguous block and keeps Graphite metadata correct. (For a branch that was never
   gt-tracked, the equivalent `git rebase --onto` + `gt track` recipe applies —
   survey §2b.)
3. **Fold the chain back into the run branch.** After joining, the structure is
   `run ← p1 ← … ← pN`. Two options for what smush receives:
   - *Leave the chain as a stack.* Smush accepts any existing stack, so this is
     legal input — but the piece boundaries are production accidents that would
     masquerade as deliberate review structure, and the run branch would no longer
     be the tip.
   - *Fold to a single run branch.* `gt fold` applied down the chain collapses the
     piece branches into the run branch, preserving every commit and SHA (survey §2
     observed fold as pure metadata when the child is already restacked); the piece
     branch names — and their Branch Memory dispatch payloads — disappear with it,
     which is the correct fate for production scaffolding.

   **Recommendation: fold.** "The branch is the run" is the settled contract; hand
   smush a run, not an accident of dispatch. (Exact fold flag choice — folding from
   the chain tip so the surviving name is the run branch — is an implementation
   detail to verify against survey §3's observed `--keep` semantics.)
4. **Validate the joined tip** with `just` before declaring the run (or the wave)
   done. A clean textual join does not prove behavioral disjointness; the tip-green
   contract is re-established here, by the orchestrator, before packaging ever sees
   the branch.

## Decision 5 — serializing a falsified piece

Detection is already settled and observed: `gt move --onto` exits non-zero, leaves a
standard rebase in progress with recovery instructions, and `git rebase --abort`
restores the piece branch fully intact. The open question is what "serialize that
piece" means after the abort:

- **Option A — redo: abort, defer, re-dispatch serially.** Pull the piece out of the
  wave, finish joining the remaining pieces, then re-dispatch the piece as a *serial*
  subagent on the joined run tip. The original piece branch is kept as reference
  material — its narrated commits and diff travel into the redo prompt — and is
  deleted once the redo lands.
- **Option B — repair in place.** Resolve the rebase conflicts (joining agent or a
  fresh subagent), `gt continue`, keep the original commits with conflict
  resolutions folded in.
- **Option C — triage.** The joining agent judges the conflict: trivially mechanical
  overlaps (formatting, adjacent imports, lockfiles) are repaired in place; anything
  semantic falls back to Option A.

**Recommendation: Option A as the default, with Option C's narrow repair carve-out
as the knob to decide live.** The principled argument for redo: a falsified claim
means the piece was authored against a false premise — its author never saw the
work it collides with — so mechanically resolving the textual conflict preserves
commits whose narration and reasoning may now be wrong, exactly the "silent choice"
failure the narration convention calls unrecoverable. Redoing on the joined tip
produces commits narrated against reality. The cost (discarded work) is real but
bounded: the reference branch means the redo is guided, not from scratch. Pure
Option B is rejected as a default; whether the trivial-conflict carve-out is worth
its judgment burden is a live-decision question.

Two adjacent rules complete the story:

- **Semantic falsification.** A piece that joins cleanly but turns the joined tip red
  also falsified its disjointness claim — in behavior rather than text. Handle by a
  narrated fix-forward commit on the run when the interaction is small, or by
  unwinding and redoing the offending piece (Option A) when it is not. The backup-ref
  habit from packaging (snapshot the pre-join run tip) makes unwinding cheap and
  should be adopted here.
- **Deferred pieces join last.** A serialized piece re-enters as ordinary serial work
  on the run tip after the wave's join completes; it does not re-enter the declared
  order mid-wave (that would be interleaving by another name).

## How the narration convention travels into subagent prompts

Run pieces are run-building, so the commit-narration convention binds them. The
dispatch payload — the same Branch Memory / attached-plan channel that exists today —
is the delivery vehicle:

- **Embed the convention's liftable summary.** `commit-narration-convention.md` ends
  with a one-paragraph "Summary for skill authors" written for exactly this purpose;
  the run-piece payload template includes it verbatim, plus a pointer to the full
  convention (today the reference file; once the smush-adjacent skill is authored,
  its run-building section becomes the canonical pointer).
- **Replace the completion instructions.** `buildLaunchPrompt`'s current "then run
  `ns flow submit`" block must not travel into run pieces. The run-piece variant
  instructs: commit per the narration convention; validate your piece tip with
  `just`; do **not** submit, push, or land anything; report completion and your
  realized scope back to the orchestrator.
- **Add the piece preamble.** You are one piece of a commit run; here is your scope
  claim; work outside it is not yours — if the task genuinely requires crossing the
  fence, stop and report rather than silently widening (a reported fence-crossing is
  a cheap re-scope; a silent one is a join conflict or worse).

This is a payload-construction change in CCC's dispatch path (a second prompt
template beside the existing one), not a new channel.

## Piece-tip greenness

The run contract requires only the run tip green, and every piece tip except the last
becomes an interior commit of the run. Minimum-contract reading: only the joined tip
must validate. Proposed rule instead: **each piece tip must pass `just` to be
join-eligible** (interior commits *within* a piece stay free to be red, per the
convention). A red piece tip poisons every later block and makes join-time blame
murky for the cost of one validation run per piece; and since piece tips are the
natural seams of the run, green piece tips are precisely the "green natural seams"
courtesy the narration convention already leans toward. The joined run tip is still
re-validated (Decision 4) because piece greenness does not compose across
behaviorally-entangled pieces.

## What the later live decision must settle

The knobs, gathered: workflow home (Decision 1 — recommend prose-first with named
push-downs); scope-check strictness (Decision 2 — recommend advisory-at-dispatch,
report-at-join); order authority and barrier-vs-incremental (Decision 3 — recommend
declared order with narrated override, barrier join); fold-vs-leave-chain (Decision 4
— recommend fold); the repair carve-out on falsified pieces (Decision 5 — recommend
redo-by-default, carve-out to be decided); and piece-tip greenness as a
join-eligibility gate (recommend yes).

## Out of scope here

- Implementing any of it: no CCC code, payload templates, skills, or CLI changes are
  part of this row.
- Smush internals, PR labels, and anything post-submission.
- Piece-completion signalling and orchestrator wake-up (today: human/orchestrator
  observation via cmux and worktree status). Whether handoffs or Objective runner
  plumbing should carry "piece done" is part of the existing Fog item on how commit
  runs interact with Objectives, branch-context, and handoffs — it graduates
  separately if the live decision wants it.
- Remote execution targets for dispatch (`docs/wayfinding/ns-cloud-capabilities/ideas.md`);
  the join contract here is target-agnostic on purpose — a piece branch is a piece
  branch however it was produced.
