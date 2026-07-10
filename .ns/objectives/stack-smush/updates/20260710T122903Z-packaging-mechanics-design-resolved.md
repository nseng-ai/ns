# Packaging Mechanics Design Resolved

## Summary

A live grilling session on 2026-07-10 resolved the Packaging mechanics design row.
The user confirmed the complete readback, including the final scope boundary that CCC
owns assembling disjoint subagent branches into one ordered stack and smush receives
that stack as input.

The resolved design is:

- The Slice Map is derived, never stored. Durable effects are branch structure and,
  after submission, PR metadata; transient JSON between skill steps is process input.
- Smush is opt-in, experimental, manually invoked, and local-only. Flow, CCC, and the
  default workflow do not invoke it implicitly; it never submits, contacts GitHub or
  another remote, or mutates PRs.
- V1 is wholly LM-driven prose with no new CLI. It uses the survey's raw `git branch
  <name> <sha>` plus `gt track --parent --no-interactive`, `gt squash -m`, `gt fold
  --stack --keep`, and `gt absorb` / `gt modify --into` recipes. Read-side checks use
  existing `ns slot gt exec` commands and never parse `gt log`.
- Mutation is propose-first and protected by a backup ref at the original run tip.
- Each proposed boundary SHA validates with `just` in a temporary worktree. A red
  boundary is handled by moving the cut, then adding a fix-forward commit into the
  slice, then escalating; cuts are partly validation-driven.
- Span Squash is a standard explicit step after slicing and boundary validation. It
  reduces the live stack's conflict surface, preserves decision PRs, and leaves an
  all-green, locally bisectable stack. The squash message contains the rationale and
  a narration digest of the collapsed commits. Harder later re-slicing is an accepted
  prototype cost.
- Flow already squash-merges every landed PR, so Span Squash serves live-stack
  manageability rather than trunk hygiene; PR title/body rationale becomes trunk
  history.
- Before submission, classification and rationale live in branch names and commit
  messages. A squashed span commit carries rationale plus narration digest; a decision
  boundary commit carries its why-decision paragraph. PR labels and body encoding are
  a post-submit concern outside the skill. Renaming is cheap before submission but can
  break PR association afterward.
- Repackaging submitted stacks uses `gt fold` without `--close`. The skill never
  closes or otherwise touches PRs and prints a loud report of orphaned close-candidate
  PRs.
- CCC's disjoint-scope dispatch/join workflow owns concatenating independently
  produced branches into one ordered linear stack. Smush accepts any existing stack
  and does not perform that join.

## Objective Impact

The Packaging mechanics design row is resolved and checked off. **Repackaging under
change** and **Smush skill authoring** are unblocked. Skill authoring now means a
local-only LM-driven prose skill using existing commands, with zero new CLI work.

The earlier survey conclusion that a slicing push-down was mandatory is superseded for
v1: deterministic push-downs are parked until real-run evidence justifies them. Their
intended home is `ns slot gt exec`; the parked slicing shape is a purely topological,
classification-free command over ordered `{name, boundarySha}` entries plus trunk and
run branch, with LBYL checks for linear merge-free history, ordered boundaries, nonempty
slices, and branch-name collisions. The run branch survives as the reparented stack tip.

The repackaging-chaos risk is more concrete: the prototype must cover re-slicing a
squashed span, post-submit reclassification and branch/PR association, and orphaned PR
fate after fold/re-slice. The Objective is not ready to close: the repackaging prototype,
remaining conventions/proposals, skill implementation, real-work proof, and promotion
decision remain open.

## Follow-Ups

- Run the **Repackaging under change** prototype through the newly identified hard
  cases and observe PR, review-thread, and CI behavior.
- Author the **Smush skill** as the resolved opt-in local-only LM-driven workflow,
  without new CLI push-downs.
- Draft the commit-message convention, CCC disjoint-scope dispatch proposal, and
  Slice Map ratification surface proposal.
- Revisit deterministic CLI push-downs only after real-run evidence establishes a
  repeated mechanical need.
- Reconcile the root `CONTEXT.md` definitions of Packaging and Span Squash with this
  resolution in a separate vocabulary edit; the current wording still implies that
  packaging submits and that deterministic push-downs are immediate.
