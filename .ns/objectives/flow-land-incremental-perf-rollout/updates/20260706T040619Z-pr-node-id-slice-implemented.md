# PR node-ID plumbing slice implemented

## Summary

The first rollout slice — carrying GitHub PR node IDs through land PR facts — was freshly derived and implemented on branch `consolidate-flow-land-perf-objectives`, using the reference branch `flow-land-pr-node-id` (commit `a5674e380`) as reading material only. All reference anchors still matched current trunk, so the slice re-derives the same shape: `id` added to REST `--json` field selection (`PR_FIELDS`) and the batched GraphQL query; `parsePullRequestSnapshot` now rejects payloads missing a string node ID; the ID is carried through `PullRequestSnapshot`, `PullRequestFacts`, the land context adapter, the landing plan, and the `pullRequestFacts` test builder. Test fixtures across flow and ccc were updated and a new rejection test covers the missing-ID case.

Validation: `just ts-check` clean; targeted Vitest for flow + ccc — 573 tests passed; full `just` passed (4450 TS tests, objective sweep clean). This slice adds a field to existing calls and does not change external-call volume, so the fake-backed scenario call counts (linear-11 = 145, linear-25 = 313) are unchanged.

## Objective Impact

- First roadmap row moves to in progress: implementation and validation are done; the row's user dogfood declaration is still outstanding and must be recorded before the first risky slice lands.
- The re-derivation assumption held trivially for this slice: reference anchors were unchanged on trunk and the slice separated cleanly.
- Work is left as uncommitted local edits on `consolidate-flow-land-perf-objectives` per the confirmed execution preview; PR submission was out of scope.

## Follow-Ups

- User dogfoods a real `/sdl:flow:land` run with this slice and the declaration is recorded on the roadmap row.
- After the slice lands and is declared sound, the next row (targeted trunk fetches) becomes eligible.
