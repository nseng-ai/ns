# Finite JSON Input Contract Landed

## Summary

The bounded modern structured-command path now represents whole-payload input as finite JSON-specific input. Clinkr accepts supplied `jsonInput` and has no embedded ambient process-stdin fallback; its standalone adapter owns deferred process acquisition through `readJsonInput`. Foundation and the ns SDK use JSON-specific naming, and extension-kit, PR Feedback, and Reviews have migrated their command-owned finite JSON payloads.

Parsing, schema validation, source-conflict checks, and command-specific errors remain with Clinkr or the owning commands. Interactive confirmation remains a separate line-oriented semantic adapter and was not folded into request input.

## Objective Impact

The third roadmap item is complete. Runner checkpoint `43631c1755376ed63287dcd6394e88c0f743321a` records the implementation and passed the runner gate. The bounded Clinkr/SDK shared surface no longer exposes generic whole-stream `readStdin` or `stdin()` request capabilities.

Child-reported validation includes TypeScript formatting, lint, typecheck, the full TypeScript suite with 6,367 passing tests, the TypeScript style guard with 184 passing tests, and focused tests with 939 passes. Parent verification searched the bounded packages and found only the deliberately separate confirmation line-input callback, then ran 96 focused files with 1,136 passing tests. Default `just` remains blocked by pre-existing dprint drift in the unchanged Objective MCP reference.

## Follow-Ups

- Implement and verify the smallest semantic host-owned confirmation and selection surface without exposing terminal machinery.
- Make structured output and rendering capability explicit per invocation, including Pi capture and terminal-control sanitization.
- Preserve the standalone-only process acquisition boundary and command-owned validation established here.
