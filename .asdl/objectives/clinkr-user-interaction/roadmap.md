# Roadmap

## Work

- [ ] Settle the Clinkr interaction abstraction name and API boundary.
  - Decide whether this is called confirmation, user interaction, prompt, UI, or gateway. Keep bulk stdin payload reading explicitly out of scope.
  - Evidence: API review notes or tests make the distinction between interactive confirmation and full-stream stdin payloads unambiguous.
- [ ] Implement the real confirmation interaction and fake/test seam.
  - Real behavior should read one line via Node readline, render prompts/errors through Clinkr-owned IO, apply defaults, reprompt invalid input, and abort on EOF.
  - Fake behavior should let scenario tests provide semantic answers without timing, process stdin, or EOF mechanics.
- [ ] Migrate current TypeScript confirmation call sites onto the Clinkr seam.
  - Cover `slot` and `handoff` prompt users first because they demonstrated the bug class.
  - Preserve JSON/machine-mode confirmation refusal behavior where commands currently require force/yes flags.
- [ ] Document the interaction boundary for future CLI authors.
  - Explain when to use the confirmation seam, when to use Clinkr IO, and when to use full stdin payload readers.

## Parked

- Freeform text prompts, select menus, multi-step wizards, and richer interactive UI surfaces until a concrete command needs them.
- Replacing Commander or adding a prompt library.
- Public API stabilization for external npm consumers.
