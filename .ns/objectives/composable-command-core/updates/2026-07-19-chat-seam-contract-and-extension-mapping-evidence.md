# Chat-seam sharpening of the hostable contract, plus objectives/handoffs mapping evidence

## Summary

Two read-only investigations mapped existing extensions onto the proposed bundle, and the findings drove a design sharpening, settled with the user.

**Design sharpening (decision 4 rewritten).** The host boundary is a *chat seam*: an ns command converses in a constrained way — semantic events out (host renders), structured interactions in (host asks the user). The `hostable` contract becomes `{ cwd, events, interact }`, symmetric rather than output-heavy. `interact` starts with exactly `confirm` (message + embedded preview + default) and `select`; further kinds are added YAGNI-style only per named consumer, the same discipline as the event vocabulary. clinkr (terminal frames, stderr/stdin prompts) and the Pi runtime (widgets, dialogs) are two renderers of the same conversation. Scope of this Objective is unchanged: the three flow ports remain the validation set; an interactive port (e.g. `handoff gc`) and a generic Pi chat-seam renderer are parked as migration-verdict candidates.

**Objectives extension mapping (~1,000 LoC, 12 commands): near best-case port.** Every `NsExtensionApi` consumption maps cleanly: `ctx.cwd` → bundle `cwd`; `ctx.exec` → library with DI; `ctx.commandIo.phase()` → events; `ctx.outputFormat` → `format?` (live consumer: runner-finish json suppression, `runner/finish.ts:329`); `ctx.env` essentially unconsumed. `writeStdout` of checkpoint markdown in runner-finish is a genuine durable-output event consumer. All commands are `clinkr(...)`-shaped via `objectiveNsCommand` → `createNsDomainCommand`; ambient `node:fs` reads already sit behind injectable seams. Verdict: validates the design rather than pressure-testing it — too clean; the flow gradient (especially `submit`) stays the right validation set.

**Handoffs extension mapping (~4,900 LoC): closest existing embodiment of the target architecture.** Library core (`core/` pure ops over `HandoffCliContext`) + thin per-host adapters. Distinctive evidence:

- First real `confirm?` consumer: `gc` and `delete` via `confirmInteractiveOrUsageError(ctx.interaction, ...)`; `ConfirmationRequest` (message + defaultAnswer → answer) is already semantic, close to the target shape.
- The one design-forcing friction: `gc` writes its preview to a `ctx.stderr` byte sink before prompting — a chat turn smuggled through sinks. Under the chat seam the preview travels inside the confirm request and `stderr` dies (new Open Question records the confirm-shape decision point).
- The Pi handoff extension consumes `core/` as a library (own `PiHandoffContext`), never `NsExtensionApi` and never spawning `ns handoff` — cross-host reuse happened at the library seam, supporting "services are libraries."
- `env` on the domain context is set but never read by core ops — third confirmation of "no env virtualization."

**Cross-cutting patterns (now confirmed across capabilities, not one-offs):**

- The `ctx.extensions.<capability>` test-override side channel (ADR 0024) appears in both objectives (`objectiveRunner`) and handoffs (`handoff`); it has no home in the new contract and migrates to library-seam/house-context injection — the one non-mechanical port cost.
- Per-capability Pi UI glue (handoffs' `pi/` ≈ 30 files; herdr similar) hand-builds what a generic chat-seam renderer would do once. This names the consumer path for the hostable middle tier (risk partially de-risked) and adds a second migration-payoff axis beyond `phase-stream/` shrinkage.
- Open call carried forward: whether the `validateNsExecCwd` cwd-scoping guard is replicated at the library exec seam or dropped per the subprocess-floor honesty stance.

## Objective Impact

- `objective.md`: design decision 4 rewritten as the chat seam with `{ cwd, events, interact }` and the confirm+select floor; hostable-tier risk annotated partially de-risked with the named consumer path; Open Questions updated with live evidence for `format?` (leans keep) and durable-output kinds, plus a new confirm-shape question.
- `roadmap.md`: the SDK API row's contract text updated (`interact` replaces `confirm?` in overlay and handler bundle); Parked gains the interactive-port / Pi chat-seam-renderer follow-up and widens the vocabulary parking to interaction kinds.
- Herdr note: herdr has no ns extension at all (pure Pi extension); its analysis reframes as "does the design generalize to non-ns hosts" and remains incomplete — no conclusions recorded beyond the Pi-glue pattern above.

## Follow-Ups

- Implement the SDK API row with the sharpened `{ cwd, events, interact }` contract.
- Settle the concrete `confirm` request shape (preview content included) when an interactive command ports.
- Decide the `validateNsExecCwd` guard's fate when the exec library seam is built.
- Migration verdict should scope: test-override channel migration pattern, interactive-command ports, and the generic Pi chat-seam renderer.
