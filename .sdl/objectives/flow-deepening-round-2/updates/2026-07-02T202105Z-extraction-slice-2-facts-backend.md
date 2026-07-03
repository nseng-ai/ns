# Extraction slice 2 landed — real stackShape/facts gateway backend

## Summary

Second autonomous slice of the extraction migration row (runner step,
commit `c7ff48fc5` on `flow-map-slice2-facts-backend`, stacked on
`flow-land-domain-strict-merge-gate`), executed under the relaxed
fact-command argv gate recorded in
`updates/2026-07-02T200807Z-slice2-argv-gate-relaxed-for-facts.md`.

- The circular `stackShape → loadLandingShape` adapter backend in
  `land-stack/land-context-adapter.ts` is replaced by a real
  `loadStackSnapshot` backend fed by existing domain gateway facts — no
  new `LandContext` gateway methods.
- Local branch listing now carries real branch-tip SHAs: the shared git
  gateway's `for-each-ref` fact command gained `%(objectname)`
  (`sdl-capability-kit/src/git/index.ts`), and `GitLocalBranchTip` gained
  an optional `headSha` (`contract.ts`) with the fake and gateway tests
  updated. The fabricated `sha: ""` in the adapter is gone.
- Fact-command argv/order assertions were updated in flow's land scenario
  tests and `ccc/test/land-command.test.ts`, exactly the files the scoped
  exception authorized. Parent-verified: no mutation-command argv appears
  anywhere in the diff's changed lines.

Slice gate held: full Definition of Progress suite reported green by the
step (format initially failed and was fixed via `just ts-format-fix`);
parent re-verified flow (46 files / 417 tests), ccc, and capability-kit
suites plus `just ts-check`. `sdl-flow/api` untouched.

## Objective Impact

- Slice 2 of 10 done, in map order. Next is slice 3 (isolated fast-path
  merge via the new `squashMergePullRequest` gateway method, per the
  settled isolated-fast-path decision).
- Recorded residual dual path: production still enters preflight through
  the `preloadedShape` bypass for upfront Flow-side stack
  confirmation/dispatch; the round-trip retirement row removes it after
  the later execution slices collapse that compatibility path.
- The adapter fidelity risk from the inventory is now two-thirds retired:
  circular `stackShape` and fabricated SHAs are fixed; `toLandFailure`'s
  failure-collapse remains for the retirement row.

## Follow-Ups

- Continue the migration row at map slice 3.
