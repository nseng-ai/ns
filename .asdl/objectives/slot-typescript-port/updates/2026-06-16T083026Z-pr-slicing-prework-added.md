# PR slicing prework added for next session

## Summary

Added `prework/07-pr-slicing-and-next-session-plan.md` to turn the existing slot TypeScript port
prework into explicit PR-sized execution packets for a fresh Graphite session. The plan identifies a
recommended stack from the foundational `ts/packages/slot` scaffold + `list` PR through pool
lifecycle, cd/clipboard primitives, navigation, release, Graphite, shell/completion, distribution,
Python retirement, and playbook feedback.

Also updated `prework/README.md` to list the new PR-slicing document and updated `roadmap.md` to mark
the already-authored inventory and prework suite complete, including the new seventh prework spec.

## Objective Impact

This does not implement `ts/packages/slot`; it makes the next implementation session easier to split
into more small PRs without re-planning boundaries. The next substantive Objective work remains the
first implementation PR: scaffold `ts/packages/slot`, port the pure core, and implement the read-only
`list`/`ls` operation.

The new PR map clarifies that after the scaffold/list PR lands, several follow-on slices can be
planned independently: `init`/`resize`, cd-directive + clipboard primitives, `free`/`gc`, and the
hidden `slot gt exec` half of the Graphite surface. It also keeps shell/completion install,
distribution cutover, and Python deletion as separate higher-blast-radius or gated PRs.

## Follow-Ups

- Next session should read `prework/07-pr-slicing-and-next-session-plan.md` before creating branches.
- Load `typescript-style`, `typescript-fake-driven-testing`, and `graphite` before TypeScript branch
  implementation work.
- Start with PR 1 (`slot-ts-scaffold-list`) unless a human explicitly chooses a narrower docs-only
  or planning slice.
