# Slice 2 blocked on the argv gate; owner relaxed it for read-only fact commands

## Summary

The runner step for extraction map slice 2 (real `stackShape`/facts gateway
backend) returned `blocked` with no files changed (the empty attempt branch
was deleted). The blocker is verified, not a child misreading:

- Real branch-tip SHAs require adding `%(objectname)` to the branch-listing
  `for-each-ref` format, which is hard-coded in the shared git gateway at
  `ts/packages/sdl-capability-kit/src/git/index.ts:299` — outside the flow
  package — and asserted byte-for-byte in
  `flow/test/unit/land-stack-command-scenarios.test.ts:388` and
  `ccc/test/land-command.test.ts:37`.
- Routing production shape loading through the domain gateway (instead of
  the `preloadedShape` bypass) reorders scenario command order.

This is the inventory update's "argv-exactness" open decision hit
concretely: fidelity for the facts backend and a byte-for-byte argv freeze
cannot both hold.

Owner decision (2026-07-02, in-session): the slice gate's byte-for-byte
argv contract now applies to **mutation commands only**. Read-only
fact-command argv and command order may change when a slice's fidelity goal
requires it, with scenario assertions updated in the same slice and the
diff parent-reviewed. Explicitly authorized for slice 2 as a scoped
exception to the flow-only file boundary: editing the
`sdl-capability-kit` git gateway branch-listing format and the `ccc`/flow
test assertions that pin it.

## Objective Impact

- The migration row's slice gate wording is updated on the roadmap; the
  Runner Policy carries the scoped file-boundary exception. The mutation
  argv tripwire is unchanged — blast-radius control for the destructive
  slices (5–9) is intact.
- The inventory's "argv-exactness" open decision is settled: byte-for-byte
  is a mutation-command guarantee, not a facts-command one.

## Follow-Ups

- Re-dispatch slice 2 under the relaxed gate.
