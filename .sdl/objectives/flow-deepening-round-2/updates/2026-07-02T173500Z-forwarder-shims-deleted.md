# Forwarder shims deleted

## Summary

The shims row landed via an autorun runner step (commit `67c6e49ee` on
`flow-delete-forwarder-shims`, third step in the stack; provenance trailer
`Objective-Runner-Step: flow-deepening-round-2`). The five single-purpose
rename/re-export files — `shared/git.ts`, `shared/text-helpers.ts`,
`shared/checkpoint-message.ts`, `submit/format.ts`,
`autobranch/short-sha.ts` — are gone; callers import the real interfaces
directly; no replacement re-export exists. `shared/text-generation.ts`
survives deliberately (many consumers, a real naming seam). Obsolete tests
asserting the shims existed were removed, and a foundation test now asserts
`push.ts` does not import the deleted `shared/git.ts` path (negative
regression evidence).

Evidence: parent-verified file absence and import greps; flow package suite
passes (44 files / 413 tests — down from 47/419 because shim-existence
tests were removed with their shims); `just ts-check` green; the step
reported the full Definition of Progress suite green.

## Objective Impact

- The shims completion criterion holds. Combined with the channel and
  `--force` rows, all three "finish what round 2 started" interface streams
  are done except the submit/catalog de-leak.
- Remaining work: extraction inventory (next, `Policy: direct`), the
  migration itself (`Policy: preview` — parent must stop for steering),
  round-trip retirement (unlocks after migration), and the submit/catalog
  de-leak (independent, may interleave).

## Follow-Ups

- none
