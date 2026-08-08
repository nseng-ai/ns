# Invocation Output and Pi Safety Landed

## Summary

The Pi CLI bridge now supplies explicit invocation-owned stdout and stderr capture sinks plus `canEmitAnsi: false`. Embedded structured commands no longer infer rendering capability from the physical process terminal. Captured details remain exact for command-result semantics, while terminal escape and control text is sanitized immediately before custom-message, notification, or headless presentation reaches Pi or its terminal.

Standalone process-backed behavior remains adapter-owned. The existing raw-command path continues through its downstream byte sinks; this slice did not add raw input virtualization or a mandatory Response/event protocol.

## Objective Impact

The fifth roadmap item is complete. Runner checkpoint `fb3df81e86292c4943480147b8dd1c9fc428284f` records the implementation and passed the runner gate. The Pi host now has explicit output ownership, non-ANSI rendering policy, and a terminal-control safety boundary.

Child-reported validation includes 38 focused files with 426 passing tests, the full TypeScript suite with 6,371 passing tests, typecheck, lint, formatting, style guard, and diff checks. Parent verification inspected the output seam and reran the two directly affected suites: 2 files and 51 tests passed. Default `just` remains blocked by pre-existing dprint drift in the unchanged Objective MCP reference.

## Follow-Ups

- Complete end-to-end qualification across finite JSON input, output, interaction, success/failure presentation, no-UI behavior, ambient-I/O exclusion, sanitization, and Pi lifecycle behavior.
- Synchronize durable public documentation only after that qualification confirms the supported surface.
- Keep richer semantic response or terminal models deferred unless concrete evidence requires them.
