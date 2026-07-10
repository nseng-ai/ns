# First real run: parallel packaging, decision-first classification, skill revision

## What happened

The `code-smush` skill ran its first real packaging session over a live, submitted
18-branch / 25-commit stack (`extension-feedback/follow-up-cleanups` and its 17
downstack branches, PRs #3301–#3363). Three packaged shapes were built; the final
one — four decision groups in an alternating eight-slice Decision/Span stack — was
submitted by the user as PRs #3364–#3371. The input stack was never mutated: all
construction was **parallel** (new refs + `gt track` on new branches only), a mode
the skill did not yet describe.

## Findings (evidence from the session)

1. **Classification quality was the binding constraint; mechanics were nearly
   free.** Both discarded stacks failed for the same reason: the classifier did not
   know the user's reviewability objective (minimal Decision PRs; everything else
   consequence spans) until the user stated it. The correct map fell out almost
   mechanically once decisions were enumerated first and tested pairwise for
   coupling ("could a reviewer accept A while rejecting B?").
2. **Commit-first reasoning missed the demotion move.** Commits with
   decision-sounding subjects (init-before-install, prepared-state validation)
   were consequences of earlier decision groups; scanning commit subjects for
   decisions could not see that.
3. **False infeasibility near-miss.** The agent claimed the four-group shape
   required commit splitting/reordering and the user approved a history rewrite on
   that basis, before correction. The missing invariant: any grouping respecting
   commit order is expressible with pure pointers; only intra-commit boundaries or
   reordering are infeasible.
4. **Parallel construction changes the economics.** Candidate stacks were built,
   judged, and abandoned at zero cost with zero orphaned PRs and no rename gap.
   The heavyweight propose-and-wait gate is calibrated for destructive mutation;
   pointer construction supports a cheaper build-inspect-discard loop.
5. **Safety incidents.** (a) `gt branch info` was run to inspect PR state — it is
   remote-capable and hung 120s; the skill's denylist framing did not cover it.
   (b) A stale `index.lock` broke `gt squash` mid-batch; recovery used a guarded
   `git reset --soft <parent> && git commit` after verifying the lock was
   unowned.
6. **Cost structure.** Per-boundary `just` validation dominated wall-clock cost;
   slice count is not free.
7. **Quality ceiling is set at commit-authoring time.** Several decision commits
   carried substantial implementation, so their minimal Decision PRs were still
   large. Packaging cannot fix coarse commits; this is standing feedback for the
   commit-narration convention (`references/commit-narration-convention.md`).

## Decisions folded into the skill (same slice)

- Phase 1 rewritten **decision-first**: elicit the reviewability objective, build a
  Decision Inventory, run a coupling pass, apply the demotion rule, then map onto
  an ordered partition; feasibility invariant stated explicitly.
- **Packaging modes** section added: parallel is the default whenever PR
  associations exist or are unknown; in-place fold is the explicit destructive
  option.
- Ratification gate weight now follows destructiveness; candidate parallel stacks
  are a sanctioned iteration loop.
- Local-only rule reframed as a command **allowlist** (`gt branch info` and other
  `gt` PR/read verbs explicitly out; local Graphite cache or user input only, with
  staleness reported as unknown).
- Operational hardening: stale-lock preflight before mutating `gt` ops, guarded
  `reset --soft` recovery for failed `gt squash`, one-commit spans need no squash,
  concurrent boundary validation permitted, validation-cost note in proposals.

## Status effects

- Completion criterion 2 (proved on real work) is substantially advanced: a real
  stack was packaged and user-submitted through the existing submit path; landing
  and review-fate observation remain.
- The **repackaging-under-change prototype row** stays open: parallel packaging
  sidesteps fold/rename hazards rather than observing them; PR/review-thread/CI
  fate under in-place fold and re-slice is still unobserved.
