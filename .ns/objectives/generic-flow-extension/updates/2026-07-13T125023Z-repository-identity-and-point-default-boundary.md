# Repository identity resolved and point-default ownership tightened

## Summary

Completed the repository-identity audit cluster (F2 and F3). Checkpoint workflows now
resolve the configured Graphite trunk through a structured gateway before text generation
or Git mutation. Direct `cp` and submit's composed checkpoint path refuse the actual trunk
and fail closed when Graphite cannot provide that fact; literal `main` and `master` names
have no special status unless configured as trunk.

`pull-trunk` now inspects that trunk branch's configured Git upstream and carries its exact
remote name and remote ref into the refresh plan. Checked-out trunks use the selected
worktree while non-checked-out trunks update the local ref directly; missing, unreadable,
or malformed upstream facts stop before worktree inspection or refresh mutation. The
shared Graphite/Git gateway coverage exercises custom trunks, dirty and clean checkpoint
flows, composed submit behavior, non-`origin` remotes, both refresh shapes, and early
failure paths. The README draft and package README were synchronized with the implemented
contract.

Review follow-up also tightened the completed F10 boundary: the Flow descriptor alone owns
the PR-description packaged default path and provenance. The SDK's fallback point metadata
remains definition-only and intentionally resolves no packaged default when descriptor
evidence is absent. This corrects the mirrored-default wording in the historical
2026-07-13 point-default update without modifying that immutable record; runtime catalog
precedence and selected-policy failure behavior are unchanged.

## Objective Impact

The roadmap now marks repository identity complete and keeps the audit-driven parent slice
active for Graphite machine facts and Pi ownership. Point-default fidelity remains complete
with its durable evidence corrected to descriptor-owned default metadata. The assumptions
and risks plus the orienting rule now reflect the two completed genericization clusters.

The Objective remains open: Graphite machine-fact cleanup, Pi policy ownership, final
README settlement/promotion, and orientation retirement or re-derivation are still active.

## Follow-Ups

- Replace `squash-stack`'s Slot Command Face inventory and submit's human-facing Graphite
  display parsing with structured Graphite facts, without broadening into Graphite
  abstraction or the parked failure-protocol work.
- Move repo-owned Pi skill policy out of the Flow package while retaining generic Flow
  command mirrors.
- Promote the canonical README only after those remaining implementation clusters make its
  full adopter contract true.
