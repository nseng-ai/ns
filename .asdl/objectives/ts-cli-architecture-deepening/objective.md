# TypeScript CLI Architecture Deepening

## Thesis

A fresh `improve-codebase-architecture` pass over the TypeScript CLIs and `asdl-core` surfaced nine concrete deepening opportunities: shallow modules whose interface is nearly as wide as their implementation, leaky seams where storage and topology details escape into callers, and hypothetical seams with only one adapter. The deepening pattern — collapse a shallow module into a deeper one with a smaller interface and more leverage, and apply the deletion test to confirm complexity concentrates rather than scatters — applies cleanly to each. This Objective tracks turning those candidates into actual depth.

This pass is the TypeScript-era successor to the now-shipped, Python-era `architecture-deepening` Objective; it does not revisit Python modules that no longer exist. The shared architectural vocabulary is the `improve-codebase-architecture` / `codebase-design` model: module, interface, implementation, depth, seam, adapter, leverage, locality, the deletion test, and the rule that one adapter is a hypothetical seam while two adapters make a real seam. Any grilling conversation that picks up a candidate should use those terms.

The full audit is preserved in this Objective's `reference/` directory: a self-contained visual report (`reference/architecture-review.html`, before/after diagrams and recommendation strength per candidate), the method and vocabulary (`reference/method-and-vocabulary.md`), all 24 raw findings across five exploration passes (`reference/findings-*.md`), and a map from the nine roadmap candidates back to the raw findings (`reference/candidate-map.md`). Start at `reference/README.md`.

## Scope

Nine candidates surfaced across `asdl-core` and the TypeScript CLIs. Each row in the roadmap corresponds to one candidate; the report holds the before/after diagram and deletion-test argument for each.

1. **asdl-core/submit — collapse the PR-description pipeline.** `pr-description.ts` (571), `pr-description-apply.ts` (182), and `submit-pr-descriptions.ts` (216) encode one semantic ("given a PR, produce its description") across three modules; the *when-to-generate* decision and the fingerprint it reads live in different files. Deepen to one module returning a discriminated result (`matched | updated | generated | failed`), absorbing view, fingerprint, generation, and prewritten reconciliation.
2. **asdl-core/submit — make `TextGenerationGateway` a real seam.** The interface exists with only a real adapter (one adapter = hypothetical seam). Add an in-memory fake adapter beside it (exported from `testing/`, mirroring `ScriptedCommandRunner`) so PR-description orchestration tests become deterministic. Composes with candidate 1.
3. **ccc/cmux — collapse slot-dispatch into one orchestration module.** `dispatch-prompt.ts` (432), `dispatch-from-trunk.ts` (198), and `slot-dispatch-plan.ts` (548) re-spell the same four-step sequence (branch → Branch Memory payload → slot checkout → cmux workspace). Introduce a `SlotDispatchPlan` module that owns the sequence behind `(branch, payload, metadata)`; handlers become thin call sites.
4. **slot — hide occupancy reconciliation behind the inventory.** `inventory.ts`, `planning.ts`, and `operations/gt/navigation.ts` each re-derive slot state by pattern-matching `SlotRecord.branch === null`. A reconciler module owns merging worktree state with occupancy metadata and exposes `reconcile()` plus a pure occupancy lookup; `SlotRecord` becomes immutable output.
5. **slot/gt — put a stack-navigator adapter over Graphite's discriminants.** `SlotGtGateway` exposes raw topology discriminants and entangles git checkout with Graphite reasoning, forcing tests to mock both gateways for one move. A `GraphiteStackNavigator` adapter absorbs the discriminants and error classification behind `{ branch | error }`. Must stay inside the `slot gt` boundary and use Graphite plumbing (`gt parent/children --no-interactive`), never parsed display output.
6. **brmem / handoff / branch-context — deepen Branch Memory behind an entry locator.** Ref naming (`buildSnapshotRef`, `encodeBranchName`) and validation leak from `brmem` into its own operations and into `handoff` and `branch-context`. A `BrmemEntryLocator` (with a validating `parse()`) and a thin `BrmemEntriesGateway` working in locators concentrate the storage model. Highest reuse surface in the survey.
7. **branch-context — replace the shallow brmem adapter with a plan-attachment module.** The branch-context gateway is a shallow adapter over brmem CLI output; `attach.ts` and `attached-plan.ts` still reference the namespace constant and construct entry keys. A `PlanAttachmentStorage` module hides namespace + key semantics; callers work in slugs. Composes onto candidate 6.
8. **objective — pull objective-markdown rules into one validator.** `ObjectiveStorage` only reads files while each operation re-applies its own heading/structure rules. An `ObjectiveMarkdownValidator` owns objective/roadmap/update structure so a schema change lands in one module; I/O stays a thin gateway.
9. **roaster / pr-address / asdl-core — lift diff parsing into `asdl-core`, only if a second consumer appears.** Roaster's 144-line Pierre adapter (`diff-parsing.ts`, `inline-commentability.ts`) is pure and reusable-looking, but nothing else parses diffs today (one adapter = hypothetical seam). Held as a watch-point, not a recommendation. Contradicts the spirit of ADR-0007, which deliberately kept roaster a thin Pierre adapter; relocation is justified only when a real second consumer (e.g. pr-address) needs hunk geometry.

Roadmap is an **open list**: deepening one candidate can surface adjacent shallowness. New rows may be added to `## Work` with a deletion-test argument recorded in this `## Scope` section.

## Non-Goals

- Speculative new gateways or seams. The two-adapter rule applies: don't introduce a seam unless something actually varies across it. Candidate 9 is explicitly held to this bar.
- Unrelated refactors discovered along the way (renames, dependency bumps, doc tidying). Those go to their own PRs.
- Re-litigating ADR-0007. Candidate 9 surfaces it only as a watch-point; acting on it would require reopening that ADR with a concrete second consumer.
- Touching vendored code under `.agents/skills/`.
- Re-doing the shipped Python-era `architecture-deepening` work. This Objective is TypeScript-only.

## Completion Criteria

Every candidate currently on the roadmap reaches a definite state:

- **shipped** — the deepening landed and the tests target the new interface
- **parked-with-reason** — explicitly moved to `## Parked` with a one-line reason
- **rejected-with-ADR** — a `docs/adr/` entry records why the candidate was the wrong shape, so future review passes don't re-suggest it

Closure requires that no candidate is in an indeterminate state. Candidates added mid-flight (open-list rule) extend the bar; they do not get a free pass. Targeted package tests plus the relevant `just` gates pass for each shipped candidate.

## Assumptions and Risks

**Assumptions:**

- The file paths and line counts in the report reflect the current checkout (verified at audit time on branch `remove-final-python-runtime`). *Mark incorrect if subsequent refactors move or rename the cited modules before a candidate is picked up.*
- Candidates 2, 6, and 7 compose: the `TextGenerationGateway` fake, the `BrmemEntryLocator`, and `PlanAttachmentStorage` reinforce each other rather than conflict. *Mark incorrect if grilling reveals an ordering conflict.*
- Each candidate is independently shippable as its own small PR; no candidate is a prerequisite blocker for another (composition is a bonus, not a gate).

**Risks:**

- **Candidate 5 (Graphite seam)** risks crossing the runtime Graphite-dependency boundary if the navigator leaks outside `slot gt`. De-risk by keeping the adapter named and scoped to the `slot gt` group and using only Graphite plumbing. *Not yet de-risked.*
- **Candidate 6 (brmem locator)** has the widest blast radius — it touches brmem, handoff, and branch-context. A botched encoding change could corrupt existing Branch Memory refs. De-risk by treating ref encoding as append-only/compatible and covering it with the locator's own tests before migrating callers. *Not yet de-risked.*
- **Candidate 9** could be re-suggested by a future automated review as a "missing seam" when it is in fact a deliberately-held one-adapter case. Mitigated by the explicit watch-point framing here and in the report. If it is ever rejected outright, record the rejection as an ADR amendment to 0007.

## Open Questions

- For candidate 6, should the `BrmemEntryLocator` live in `brmem` and be imported by handoff/branch-context, or be re-exported through each consumer's own seam? (Affects whether downstream packages depend on brmem's public surface or a shared locator type.)
- For candidate 3, does `slot-dispatch-plan.ts` already contain most of the target `SlotDispatchPlan` shape, making this a consolidation of the two dispatch handlers onto it rather than a new module?
- Sequencing: is candidate 1 (PR-description collapse) the right first cut as a self-contained, low-risk exercise of the pattern, or should the highest-leverage candidate 6 go first despite its wider blast radius?
