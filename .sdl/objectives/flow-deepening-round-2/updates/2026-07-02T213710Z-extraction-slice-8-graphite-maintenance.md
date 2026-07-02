# Extraction slice 8 landed — post-merge Graphite maintenance onto the gateway

## Summary

Eighth autonomous slice of the extraction migration row — the riskiest of
the map (runner step, commit `b111629c0` on
`flow-map-slice8-graphite-maintenance-gateway`, stacked on
`flow-map-slice7-merge-loop-gateway`).

- Exactly the five map-named methods were added to `LandGraphiteGateway`
  (parent-verified against the `land/types.ts` diff):
  `refreshBranchFromRemote`, `deleteLocalBranch`, `restackUpstack`,
  `submitUpdate` (with real `force`), and `branchChildren`.
- The destructive-guard policies are expressed as typed request
  parameters on the seam (`checkoutConflict: "fail" | "defer"`,
  `checkedOutConflict: "fail" | "retain"`), so callers state the policy
  and the backend cannot silently re-decide it. Tri-state local-branch
  delete semantics preserved; warn-vs-fail handling stays in the existing
  land maintenance policy path per the child's report.
- Post-merge refresh/delete/restack/forced-submit/branch-children now
  route through the gateway, channel-backed with streaming preserved.
- Mutation argv freeze held with zero relaxation: neither scenario
  assertion file is in the diff; all pins passed byte-for-byte unchanged.

Slice gate held: the step reported the full DoP suite green; parent
re-verified flow (47 files / 422 tests) and `just ts-check`.
`sdl-flow/api` untouched.

## Objective Impact

- Slice 8 of 10 done, in map order. Every gateway gap the inventory
  enumerated (GitHub squash-merge, git ref writes, the five Graphite
  maintenance operations, the slot-action seam) is now closed.
- Next is slice 9 (post-landing slot cleanup, `--free`): low-medium risk,
  reusing slice 6's `freeSlots` and slice 8's `deleteLocalBranch`; it
  migrates `land/post-landing-slot-cleanup.ts` off land-stack primitives.

## Follow-Ups

- Continue the migration row at map slice 9.
