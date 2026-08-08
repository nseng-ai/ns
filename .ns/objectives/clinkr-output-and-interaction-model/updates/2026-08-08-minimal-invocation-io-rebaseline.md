# Minimal Invocation I/O Rebaseline

## Summary

The Objective is rebaselined from a comprehensive Clinkr channel ontology to the minimum conservative invocation surface required by demonstrated use cases. Shared structured command execution will model finite JSON request input, invocation-scoped output, and semantic confirmation/selection. It will not virtualize general stdin, terminal sessions, raw mode, key events, or a speculative Request/Response/Progress/Notice/Elicitation family.

The investigation found that Pi Saved Plan creation already passes complete Markdown as the structured `write_saved_plan_file` tool argument and calls `writeSavedPlanFile()` in process. The portable `enriched-plan-save` skill and `enriched-plan exec save --stdin|--content-file` path are exposed and tested but have no observed first-party runtime caller. That portable path will be deleted while Pi Saved Plan creation and the Saved Plan domain/store workflows remain.

Remaining shared whole-payload consumers are expected to be finite JSON requests. The implementation must inventory them before removing generic `readStdin`/`stdin()` and should prefer a finite JSON text value over a reader callback unless a concrete caller proves lazy acquisition is necessary. Interactive input remains a separate semantic host capability: standalone execution may adapt a rich CLI library, Pi uses `ctx.ui`, and tests use strict fakes.

## Objective Impact

The former channel-ontology blessing, Click prior-art survey, coined Notice/Elicitation vocabulary, mandatory Response reshape, additional output-heavy production workflow, broad ADR/promotion program, and MCP analysis are no longer completion gates. The Objective now owns a bounded deletion and interface-reduction effort plus reliable Pi embedding evidence.

The edge contract with `clinkr-readme-driven-development` is narrowed accordingly. That Objective still waits for this one before README promotion, but it now consumes the reduced finite-JSON input, invocation-scoped output, semantic-interaction, and explicit Pi-host contract rather than a comprehensive channel ontology.

Future possibilities are preserved without inflating current scope: the final roadmap item writes a follow-up document covering semantic Response/event models, richer terminal adapters, streamed progress/notices, raw-command or PTY virtualization, and additional hosts such as MCP, with evidence thresholds for reopening each direction.

## Follow-Ups

- Inventory all production whole-payload consumers and identify any non-JSON exception before interface deletion.
- Delete the portable `enriched-plan-save` skill and `enriched-plan exec save` command while retaining Pi's structured Saved Plan tool and domain operation.
- Replace generic whole-stream input on the modern path with the smallest finite JSON-specific contract.
- Make Pi rendering capabilities, output capture, interaction, headless behavior, and terminal-control sanitization explicit and test them through the real host composition.
- Write the future-directions follow-up only after the reduced supported surface is implemented and documented.
