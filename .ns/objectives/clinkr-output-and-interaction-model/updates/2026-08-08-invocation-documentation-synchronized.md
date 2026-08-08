# Invocation Documentation Synchronized

## Summary

Durable documentation now describes the implemented invocation contract. Canonical Clinkr and Foundation package READMEs explain finite JSON request input, separate semantic confirmation and selection, invocation-scoped structured and raw output, and explicit rendering capability. SDK author/reference documentation and Pi workflow guidance describe host ownership, Pi-native UI, non-ANSI embedded rendering, output capture, terminal-control sanitization, and ambient-I/O exclusion.

CONTEXT-MAP and the Foundation, SDK, and Pi runtime context files now use vocabulary established by implementation. Current Saved Plan guidance describes the retained Pi commands, structured tool, domain operation, and read/attachment flows; immutable historical and wayfinding records retain time-in-place references to the deleted portable path.

## Objective Impact

The seventh roadmap item is complete. Runner checkpoint `6fc9160db46090c1a2898713cd3c7f71bb1cf530` records the documentation synchronization and passed the runner gate.

Child-reported focused dprint and diff checks passed, and default `just` passed sanity before reaching the known pre-existing Objective reference formatting issue. Parent inspection confirmed the package-level contract descriptions and reran dprint across all changed documentation plus `git diff --check`; both passed.

## Follow-Ups

- Write the final future-directions document, including evidence thresholds for semantic response/events, richer terminal adapters, streamed progress/notices, raw-command or PTY virtualization, and additional hosts such as MCP.
- Format the existing MCP reference as part of that final document slice so default repository validation can run cleanly.
- Reassess Objective closure only after the final roadmap item and full relevant validation complete.
