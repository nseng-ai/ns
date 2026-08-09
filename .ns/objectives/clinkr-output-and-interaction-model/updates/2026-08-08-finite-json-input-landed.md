# Finite JSON Input Contract Landed

## Summary

The bounded modern structured-command path now represents whole-payload input as one finite JSON read. Clinkr exposes the lazy `readJsonInput` host capability and has no embedded ambient process-stdin fallback; its standalone adapter binds that operation to process stdin. Clinkr also owns the reusable `loadJsonInput()` and `parseJsonInputText()` operation through `@nseng-ai/clinkr/app`, including inline/file/host source selection, conflict and empty-input checks, JSON parsing, and caller-supplied schema validation. Foundation and the ns SDK use the same JSON-specific naming, and PR Feedback and Reviews consume the Clinkr-owned operation.

The former Extension Kit JSON-input subpath is deleted without a compatibility forwarder. Extension Kit retains only the ns-host context adapter. Command-specific schemas, wording, and error translation remain with the owning commands. Interactive confirmation remains a separate line-oriented semantic adapter and was not folded into JSON input.

## Objective Impact

The third roadmap item is complete. PR #4166 records the implementation, including the follow-up ownership correction at its head. The bounded Clinkr/SDK shared surface no longer exposes generic whole-stream `readStdin` or `stdin()` request capabilities, and Clinkr is the sole public owner of the reusable finite JSON-input operation.

Child-reported validation includes TypeScript formatting, lint, typecheck, the full TypeScript suite with 6,367 passing tests, the TypeScript style guard with 184 passing tests, and focused tests with 939 passes. Parent verification searched the bounded packages and found only the deliberately separate confirmation line-input callback, then ran 96 focused files with 1,136 passing tests. Default `just` remains blocked by pre-existing dprint drift in the unchanged Objective MCP reference.

## Follow-Ups

- Implement and verify the smallest semantic host-owned confirmation and selection surface without exposing terminal machinery.
- Make structured output and rendering capability explicit per invocation, including Pi capture and terminal-control sanitization.
- Preserve the standalone-only process acquisition boundary and command-owned validation established here.
