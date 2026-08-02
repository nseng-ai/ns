# Interaction and Confirmation Ownership Settled

## Summary

The interaction seam and confirmation policy now have explicit final owners.

`ClinkrInteraction` remains the modern application-controlled semantic seam, with the real line-oriented terminal adapter in shared Clinkr ownership. Applications inject it through invocation context; hosts may adapt an existing confirmation facility; dispatch never constructs it or prompts automatically. Its final public entrypoint is the package root. No `/interaction` subpath will be added because current runtime consumers already form the root importer class and another door would not pass the rank test.

Confirmation outcome translation belongs to the modern command model. `confirmOrUsageError(...)` remains on `/app` during quarantine and moves to root with that surface at the final clean cut. The legacy-exit `requireInteractiveOrUsageError(...)` and `confirmInteractiveOrUsageError(...)` helpers are transitional and will be deleted after callers preserve their application-specific bypass, diagnostics, pre-prompt output, decline, and abort policies through modern outcomes.

Strict general interaction fakes remain in `@nseng-ai/clinkr/testing`; `/app/testing` remains the app invocation harness. This preserves tests that exercise domain or host behavior through the interaction seam without constructing a `ClinkrApp`.

## Objective Impact

This resolves the interaction-owner blocker on the in-progress single-`ClinkrApp` runtime and narrows the legacy-deletion path without adding public surface. `src/app/**` may depend on the retained `src/interaction.ts` seam but must not import legacy confirmation, exits, or rendering owners.

The decision is grounded in current Clinkr prompt/retry/EOF tests, strict-fake tests, README example 14, and representative SDK, Extension Kit, Brmem, Packagechk, ns-dev, Slots, Handoffs, and Flow consumers. Existing evidence is sufficient to settle ownership but not to delete the legacy gates: modern `confirmOrUsageError(...)` still lacks direct behavior tests, and callers retain policy-rich uses of the transitional helper.

## Follow-Ups

- Add direct modern confirmation evidence for non-interactive refusal, explicit confirmation, decline, abort, default-no requests, unexpected prompts, and unused scripted answers.
- Preserve real terminal-adapter tests for prompt formatting, invalid-input retry, defaults, interactivity resolution, and EOF abort.
- Inventory and migrate legacy gate callers while preserving caller-owned `--yes` bypasses, missing-flag diagnostics, `beforePrompt` ordering, and decline/abort behavior.
- At the final clean cut, move the modern app command/outcome surface and `confirmOrUsageError(...)` to root, retain interaction constructors and types there, and remove the temporary `/app` entrypoint plus legacy gate exports.
