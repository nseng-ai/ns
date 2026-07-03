# Flow source-layout path rebaseline

## Summary

A trunk non-closing refresh found the durable record's flow source paths stale and
internally inconsistent. The flow extension implementation has been relocated into the
`sdl-flow` package at `ts/packages/extensions/flow/src/{commands,shared}/`, while
`.sdl/extensions/flow/` now holds only the extension manifest (`package.json`) and thin
re-export command shims — each `src/commands/<name>.ts` is
`export { default } from "sdl-flow/commands/<name>";`. There is no
`.sdl/extensions/flow/src/shared/` directory.

The record still cited `.sdl/extensions/flow/src/shared/…` (a path that does not exist)
and `.sdl/extensions/flow/src/commands/…` as implementation locations across both
`objective.md` (Scope) and `roadmap.md` (Phase-1 rows, the maturity ladder, the
capability-area matrix, and the A1/A2/A5/A7 evidence rows), even though newer rows
(A3/A4/A6/A8 and the submit-rewrite row) already used the correct `sdl-flow` package
framing. This drift originated with the 2026-06-24 flow-only-module relocation
(`updates/2026-06-24-relocate-flow-only-modules.md`) but was never propagated to the
older rows.

## Decisive evidence

- `ls .sdl/extensions/flow/src/` → only `commands/`; no `shared/` directory.
- `.sdl/extensions/flow/src/commands/changes.ts` contents:
  `export { default } from "sdl-flow/commands/changes";` (a shim, not implementation).
- `ls ts/packages/extensions/flow/src/shared/` → the real helper set
  (`ccc-cli.ts`, `checkpoint.ts`, `checkpoint-message.ts`, `git.ts`,
  `model-generation.ts`, `pr-description.ts`, `submit.ts`, `text-generation.ts`,
  `text-helpers.ts`, `worktree.ts`, `changes-model-summary.ts`).
- `ts/packages/extensions/flow/src/commands/submit.ts` is 344 lines (the readable
  delegating command), confirming the former ~3017-line bundle is gone.

## Action taken

- Rewrote every `.sdl/extensions/flow/src/…` reference in `objective.md` and
  `roadmap.md` to the real `ts/packages/extensions/flow/src/…` implementation path
  (`sdl-flow` package). Manifest references (`.sdl/extensions/flow/package.json`) and the
  extension-location phrasing ("grouped project-local flow extension under
  `.sdl/extensions/flow`") were intentionally left intact — they remain accurate.
- Added a durable "Source layout" sub-bullet to the objective's Scope so future readers
  resolve the shim/package split correctly and the drift does not recur.

No semantic claims about the architecture were changed: this is a path-layer rebaseline
only. The architecture endgame status is unchanged and was re-verified during the
refresh — extension-kit, the Peer API conventions guard
(`SDL_TS_BAN_CAPABILITY_PRIVATE_PEER_IMPORT`), and
`@sdl/domain-primitives-transitional` exist; gateway-injected `runPushCore`/`runCpCore`
are covered by `InMemoryGitGateway` unit tests; the Slot child Objective
(`slot-capability-extension`) is closed with `@sdl/slot/api` present; and Phase-2
steps 5 (`ccc` still imports `@sdl/sdl/context`) and 6 (transitional package still has
consumers) correctly remain open.

## Objective Impact

No status change. Durable records now name the correct flow implementation paths and are
internally consistent.

Provenance: objective-refresh basis target=aa2dae9a3 from=96b67a5a0
