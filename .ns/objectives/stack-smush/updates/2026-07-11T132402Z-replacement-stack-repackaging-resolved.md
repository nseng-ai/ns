# Repackaging resolved: replacement-stack construction, not in-place fold

A live exchange (2026-07-11, objective-next session) resolved the repackaging
process: repackaging a live, submitted stack is **replacement-stack construction** —
build the new shape alongside the old stack from the same underlying commits, verify
it, hand it to the user to submit, and report the entire old stack as the
close-candidate set — rather than in-place `gt fold` / re-slice.

## Summary

The decision generalizes what the first real run already did. The
`extension-feedback/follow-up-cleanups` 18-branch repackaging (see
`updates/20260710T223421Z-first-real-run-parallel-packaging-and-decision-first-revision.md`)
ran in parallel mode and hit zero orphaned-PR surprises, while every unobserved
hazard on the books — fold/re-slice PR fate, `gt rename` on a PR-associated branch,
incidental orphan detection — belongs exclusively to the in-place path. Replacement
construction is also better-shaped for the skill's philosophy:

- **LBYL, not surgery.** Build the replacement, verify boundaries, and only then hand
  over. The old stack stays intact as its own safety net until the swap; the backup
  ref becomes belt-and-suspenders rather than the only recovery path.
- **Deterministic close set.** Instead of detecting whatever `gt fold` incidentally
  orphaned, the close-candidate set is exactly the old stack — a complete,
  predictable list the skill reports loudly. The never-mutate-PRs boundary is
  unchanged; closing old PRs stays with the user.

Resolutions from the exchange:

1. **Review-feedback continuity** is handled by intelligence, not PR identity: during
   replacement, inspect the old stack and move relevant feedback forward into the new
   shape. In-place absorption (`gt absorb` / `gt modify --into`) remains available
   for commit-content feedback that does not change slice boundaries, as surveyed.
2. **Coexistence naming**: the replacement stack carries a very short generation
   token — `s<num>-` or similarly terse — so old and new stacks coexist during
   verification. Human legibility is prioritized over machine legibility; exact
   placement in the `<run>--<NN><c>-<slug>` grammar is settled when the smush skill's
   repackaging section is rewritten.

## Objective Impact

- The **repackaging-chaos risk** largely dissolves: fold/re-slice PR fate,
  rename-under-PR-association, and orphan detection are dead paths for repackaging.
  Residual risk shifts to feedback carry-forward fidelity and disciplined old-stack
  closure. `gt rename` remains in use only at initial packaging (tip-slice grammar
  name).
- The **Repackaging under change** prototype row is rescoped: it no longer owns
  fold/rename observations; it now owns one deliberate full replacement cycle on a
  reviewed stack — feedback carry-forward from old PRs, old-stack closure handling,
  coexistence naming, CI cost.
- The **packaging mechanics** resolved row's repackaging clause is revised in place
  (revision note); `gt fold --stack --keep` remains a surveyed, supported mechanic
  but is no longer the repackaging process.
- New task row: rewrite `skills/code-smush/SKILL.md`'s repackaging section to
  replacement-stack semantics.
- The CI-cost Fog item sharpens: replacement repackaging re-runs CI across the full
  new stack, so PR count and re-run cost now compound.

## Follow-Ups

- Where feedback carry-forward lives is open: v1 smush is local-only with no GitHub
  contact, but inspecting the old stack's review threads requires read-only PR
  access. Either the repackaging path gains a read-only inspection step or
  carry-forward lives in a companion post-submit step (decide-skill family). Owned by
  the code-smush rewrite task row.
- Exact placement of the `s<num>` generation token in the branch grammar — same task
  row.
- The rescoped prototype row still needs a live run to observe the full replacement
  cycle end to end.
