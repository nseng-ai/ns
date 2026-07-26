# Happy-path charting: Pi-style install, three commands, Claude Code first, fully-live bar

## Summary

A charting session with the owner (2026-07-05) pinned the first shippable customer
slice: a documentation "happy path" where a stranger installs the core CLI and then the
objectives system, fully decoupled from everything else. Decisions:

- **Pi-style extension delivery.** The published `@nseng-ai/ns` core ships bare;
  `@nseng-ai/objectives` publishes standalone and is added via a new
  `ns install <source>` surface mimicking `pi install` / `pi remove` / `pi update`.
  (Packaging supersession recorded in `checkout-free-sdl-distribution`,
  `updates/20260705T185714Z-bare-core-extension-split.md`.)
- **Three-command happy path**: `npm install -g @nseng-ai/ns` →
  `ns install @nseng-ai/objectives` → `ns init` in the customer repo. Install is
  user-level settings; repo activation stays in `ns init`. The path never touches
  slot/flow/brmem/Graphite.
- **Claude Code first**, explicitly superseding the 2026-07-01 all-three harness bar for
  this slice; Codex + Pi verification parked as follow-up.
- **Fully-live ship bar**: both packages on npm, documentation publicly deployed
  (nseng.ai, Vercel gate removed — gate removal owned by the retired website Objective), and a
  stranger completes the path with zero improvisation.

## Objective Impact

- Resolved Decisions extended with the 2026-07-05 block; the all-three bar annotated as
  superseded for the first slice.
- Open Questions reopened: `ns install` surface design; whether objective skills ship
  inside the extension package (revising the skill-management-subsystem assumption);
  whether `ns init` lives in core or the extension (possible `@ns/init` re-homing).
- Roadmap: new `ns install`/`remove`/`update` design row; docs row re-scoped to the
  three-command happy path; verification row narrowed to Claude Code with the
  zero-improvisation bar; Codex/Pi verification moved to Parked.

## Follow-Ups

- Run the `ns install` design row (with `ns-cli-design`), resolving the three reopened
  Open Questions.
- Start the Get Started content draft against the decided command shape; reconcile when
  the CLI designs close.
- Coordinate the two-package first publish and launch-gate removal with their owning
  objectives.
