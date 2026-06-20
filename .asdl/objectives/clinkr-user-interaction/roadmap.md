# Roadmap

## Work

- [~] Settle the Clinkr interaction abstraction name and API boundary.
  - Current state: `confirmFromStdin` is exported from `@asdl/clinkr`, but its API still exposes raw stdin/stderr functions to command operations.
  - Decide whether the durable surface is confirmation, user interaction, prompt, UI, or gateway. Keep bulk stdin payload reading explicitly out of scope.
  - Evidence: API review notes or tests make the distinction between interactive confirmation and full-stream stdin payloads unambiguous.
- [~] Implement the real confirmation interaction and fake/test seam.
  - Current state: `confirmFromStdin` implements yes/no parsing, defaults, invalid-answer reprompting, and EOF abort results; `@asdl/core/stdin.readStdinLine()` provides the one-line Node readline primitive.
  - Remaining: wrap this in a Clinkr-owned interaction seam and provide fake behavior that lets scenario tests supply semantic answers without timing, process stdin, or EOF mechanics.
- [~] Migrate current TypeScript confirmation call sites onto the Clinkr seam.
  - Current state: `slot gc`, `slot free`, `handoff gc`, `handoff delete`, and `packagechk claim-*` call `confirmFromStdin`; `slot` still preserves JSON/machine-mode confirmation refusal behavior through `confirmation_required` failures.
  - Remaining: remove per-command raw stdin/stderr wiring once the higher-level Clinkr interaction seam exists.
- [ ] Document the interaction boundary for future CLI authors.
  - Explain when to use the confirmation seam, when to use Clinkr IO, and when to use full stdin payload readers.

## Parked

- Freeform text prompts, select menus, multi-step wizards, and richer interactive UI surfaces until a concrete command needs them.
- Replacing Commander or adding a prompt library.
- Public API stabilization for external npm consumers.
