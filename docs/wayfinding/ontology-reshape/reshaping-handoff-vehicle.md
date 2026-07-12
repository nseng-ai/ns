# Reshaping handoff vehicle

Resolves the ontology-reshape roadmap row "Decide the reshaping handoff vehicle
(grilling)", 2026-07-11. Judged against two live experiments on
`layering-reshape-spec.md`: a same-session direct-implementation pass (rolled back by
user steer) and a successful spec → verification sweep → ratified enriched plan →
dedicated-session execution (nine stacked slices, `just` green per slice; experience
report in `updates/2026-07-11-layering-reshape-executed.md`).

Execution is Objective work (decided 2026-07-11): a grilling row that ends in a spec
graduates into execution task rows in this Objective's roadmap. This document is the
procedure those rows follow.

## The vehicle

**Default: the saved-plan pipeline.**

1. The decision (grilling) session ends at a **spec** (see contract below), plus the
   ADR carrying rationale.
2. A read-only **verification sweep** fact-checks the spec's claims against the repo
   (importers, paths, counts, "X enumerates Y" assertions), sized to the spec.
3. The corrected spec becomes a **ratified enriched plan** (branch-context saved
   plan).
4. A **dedicated execution session** implements the plan as stacked local slices,
   `just` green per slice, local-only until user review.

**Escape hatches:**

- **Trivial-slice direct implementation** — a decision-free, single-slice change
  (e.g. a one-line retier) may skip the plan artifact; verification collapses to
  inline checks.
- **New Objective** — only if a future reshaping is genuinely multi-session with its
  own expected discoveries. None so far has qualified; name the exception when hit
  rather than pre-building a tier.

## Session-separation rule

Execution never begins in the decision session on the agent's initiative. Only an
explicit user instruction in that session can start it; the default exit is
spec + plan with execution deferred. (This is the lesson of the rolled-back first
attempt: the pull to "just execute" right after deciding is a signal, not an
instruction.)

## Two verification duties

Neither substitutes for the other:

- **Sweep at plan-derivation time** validates the spec's *claims* so the plan is
  built on current ground truth. In the live example a 10-agent read-only sweep
  caught every stale claim (a false module claim, a missed interface, an
  already-renamed package, a double listing) and none caused rework mid-flight.
- **Re-enumeration at execution time** re-derives any volatile inventory (dir
  counts, importer lists, label sets) at the moment of action. Ground truth moved
  twice between sweep and execution (46 → 52 residue dirs; fixture labels renamed by
  an earlier slice).

## Spec content contract

A spec hands off cleanly when it contains:

1. **What it resolves and where rationale lives** — the originating roadmap row and
   a pointer to the ADR. The spec is mechanics only: what changes, in what order,
   how to verify.
2. **Landed vs. not** — an explicit line separating edits already made from
   decisions not yet executed.
3. **Ordered items with batching** — intended implementation order; dependencies
   between items called out.
4. **Per item: the change, the scope facts, the doc ride-alongs, the verification.**
   Ride-along docs means a doc edit describing the code change rides the same PR, so
   glossaries never claim a state the code does not have.
5. **Date-stamps on anything countable** — volatile inventories marked
   "as of <date>; re-enumerate at execution."
6. **Word-boundary warnings on renames** — every rename pair states whether plain
   substring replacement is safe (live hazard: `capability-kit/git` is a prefix of
   `capability-kit/github`; a blanket substitution corrupted 36 files before a
   global check caught it).
7. **Flags on items needing the operator's own hands** — permission-boundary work
   (e.g. unrecoverable `rm -rf` of untracked dirs) marked so the plan routes it to
   the user.
8. **Parked and out-of-scope lists** — where every leftover went, so nothing
   silently drops.

## Durable home

This document is an effort-folder asset, deliberately not a repo-wide convention:
the Objective's "Method extraction" open question distills the whole
audit → reshape → document method into a portable skill near Crystallization, and
this contract is an ingredient of that skill.
