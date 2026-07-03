# Extraction slice 7 landed — stack merge loop onto gateways

## Summary

Seventh autonomous slice of the extraction migration row (runner step,
commit `8f60ae783` on `flow-map-slice7-merge-loop-gateway`, stacked on
`flow-map-slice6-slot-free-gateway`). Three-file diff, all flow src
(`land-context-adapter.ts`, `landing-operations.ts`,
`landing-plan-execution.ts`).

- The stack merge loop now runs on `LandContext` gateways for branch SHA
  reads, PR fact reads, squash-merge execution (slice 3's
  `squashMergePullRequest`), and post-merge MERGED verification.
- Zero gateway-interface changes — the high-risk slice fit entirely
  behind the methods earlier slices established. Streamed command output
  and failure presentation are preserved by carrying the merge exec
  transcript through the gateway boundary (display-only pass-through,
  matching the submit-gateway idiom).
- Strongest argv evidence yet: no test files changed at all — every
  scenario assertion, mutation and fact alike, passed byte-for-byte
  unchanged.

Slice gate held: the step reported plain `just` green plus integration
and style-guard suites; parent re-verified flow (47 files / 421 tests)
and `just ts-check`. `sdl-flow/api` untouched.

## Objective Impact

- Slice 7 of 10 done, in map order. The high-risk interleaved-presentation
  concern did not materialize: the settled progress-reporting decision
  (channel-backed gateways, transcript pass-through) was sufficient and no
  new decision point surfaced.
- Next is slice 8, the riskiest: post-merge Graphite maintenance onto
  `LandGraphiteGateway` (`refreshBranchFromRemote`, tri-state
  `deleteLocalBranch`, `restackUpstack`, real forced `submitUpdate`,
  `branchChildren` — the map-named methods), preserving every destructive
  guard, checkout-conflict policy, and fail-vs-warn severity.

## Follow-Ups

- Continue the migration row at map slice 8.
