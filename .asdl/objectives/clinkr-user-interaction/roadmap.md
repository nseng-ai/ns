# Roadmap

## Work

- [x] Settle the Clinkr interaction abstraction name and API boundary.
  - Durable surface: `ClinkrInteraction` with `confirm({ message, defaultAnswer })`.
  - Confirmation returns a domain result union (`confirmed`, `declined`, `aborted`), and package operations map those results to their existing CLI conventions.
  - Bulk stdin payload reading remains outside the interaction seam.
- [x] Implement the real confirmation interaction and fake/test seam.
  - `createClinkrInteraction` owns prompt suffix formatting, yes/no parsing, default handling, invalid-answer reprompting, prompt/error stderr output, and EOF abort results over an injected one-line stdin reader.
  - `createFakeClinkrInteraction` queues semantic confirmation results, records requests, throws on unexpected prompts, and exposes `assertComplete()` for unused queued answers.
- [x] Migrate current TypeScript confirmation call sites onto the Clinkr seam.
  - `slot gc`, `slot free`, `handoff gc`, `handoff delete`, and `packagechk claim-*` now use `ctx.interaction.confirm(...)` or the package context interaction.
  - Package `runCli` functions construct/overlay interaction from resolved Clinkr IO and one-line stdin readers, so prompts use the same stderr capture as other Clinkr output.
  - `slot` JSON/machine-mode destructive confirmations still refuse without `--force`/`--yes` through `confirmation_required` failures.
- [x] Document the interaction boundary for future CLI authors.
  - The exported Clinkr API comment documents `ClinkrInteraction` for terminal yes/no confirmation, `ClinkrIo` for output rendering/status streams, and stdin helpers for full payload reading / edge line-reader wiring.

## Parked

- Freeform text prompts, select menus, multi-step wizards, and richer interactive UI surfaces until a concrete command needs them.
- Replacing Commander or adding a prompt library.
- Public API stabilization for external npm consumers.
