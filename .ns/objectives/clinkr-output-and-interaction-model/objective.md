---
edges:
  - objective: clinkr-readme-driven-development
    annotation: Supplies the minimal invocation I/O and semantic-interaction contract that the README-driven Clinkr path must document and use before promotion.
---

# Clinkr Invocation I/O and Interaction Surface

## Thesis

Make the smallest conservative change that puts structured command execution one level above ambient process stdin/stdout and makes embedded execution reliable inside Pi.

The shared interface should model only demonstrated user intent:

- a finite JSON request input for structured commands;
- invocation-scoped command output owned by the host rather than process globals; and
- semantic interaction operations such as confirmation and selection.

It should not virtualize general stdin, a terminal session, raw mode, key events, or a speculative family of communication channels. Standalone execution adapts these narrow capabilities to process streams and may opt into a rich CLI interaction library. Tests use invocation-scoped fakes and capture. Pi adapts interaction to `ctx.ui`, captures output for host presentation, and does not let an embedded structured command inherit ambient terminal behavior.

## Scope

- Delete the unused portable Saved Plan save path:
  - delete the `enriched-plan-save` skill and its Harness Overlays;
  - delete `enriched-plan exec save`, including `--stdin` and `--content-file`;
  - remove its skill-exposure and parity registration, command-specific tests, and stale guidance;
  - rename Pi implementation files where necessary so retained Pi behavior does not imply that the deleted portable workflow still exists.
- Retain Pi `/ns:plan:save`, Pi `/ns:plan:grill-and-save`, the structured `write_saved_plan_file` tool, the `writeSavedPlanFile()` domain operation, and Saved Plan listing, resolution, selection, and attachment.
- Inventory every remaining whole-payload stdin consumer and prove that the shared cases are finite JSON requests. Replace Clinkr `readStdin` and SDK `stdin()` with a JSON-specific input contract rather than a general stdin abstraction. Prefer passing finite JSON text directly when lazy acquisition has no demonstrated value; keep parsing, schema validation, and command-specific errors with Clinkr or the owning command.
- Keep interactive input separate from request input. Commands depend on semantic confirmation and selection capabilities, not line readers or terminal streams. A standalone terminal adapter may implement those capabilities with an opt-in rich CLI interaction library; Pi implements them through `ctx.ui`; tests use strict fakes.
- Keep output invocation-scoped. Standalone adapters may default to process output, while embedded and test hosts provide explicit sinks. Do not require a new semantic Response/event ontology merely to stop ambient writes.
- Make Pi's in-process extension-command execution explicit and reliable:
  - provide the supported request-input policy, output sinks, rendering capabilities, and semantic interaction adapters per invocation;
  - prevent structured embedded commands from reading process stdin or deriving terminal capabilities from the physical process terminal;
  - sanitize captured terminal controls at the Pi presentation seam before content reaches Pi's TUI renderer;
  - define explicit fail-closed behavior for interaction when Pi has no applicable UI;
  - preserve Pi lifecycle rules such as waiting for idle and not using stale session contexts.
- Verify the narrow interface through focused standalone, fake-driven, and Pi-host scenarios.
- As the final work item, write a follow-up document that records possible future directions and the evidence required to pursue them. Include semantic Response/event models, richer terminal adapters, streamed progress or notices, raw-command/PTY virtualization, and additional hosts such as MCP. The document must distinguish these possibilities from current commitments.

## Non-Goals

- A comprehensive Request/Response/Progress/Notice/Elicitation channel ontology.
- General stdin, readable-stream, terminal-session, PTY, raw-mode, key-event, cursor, screen-state, or resize virtualization.
- Running arbitrary terminal-oriented interaction libraries inside Pi. Pi interaction uses Pi's runtime extension UI capabilities.
- A mandatory `ClinkrResponse`, `ClinkrFinalPresentation`, or event protocol.
- Eliminating stdout/stderr vocabulary from process adapters, subprocess results, raw commands, compatibility types, or test capture results.
- Redesigning raw commands. They remain an explicit escape hatch with separately owned byte and input behavior.
- Repository-wide migration of legacy Clinkr construction, output, or interaction APIs.
- Click or multi-framework prior-art research as a completion gate.
- MCP or another hypothetical host as a current implementation target.
- Deleting the Saved Plan store, Pi Saved Plan commands/tools, `writeSavedPlanFile()`, or later Saved Plan selection and attachment workflows.
- Updating CONTEXT.md ahead of implemented ground truth.

## Completion Criteria

- The portable Saved Plan save path is gone: no `enriched-plan-save` skill or overlays, no `enriched-plan exec save`, no `--stdin`/`--content-file` save command, and no exposure/parity/docs that claim the path remains supported. Pi's structured Saved Plan tool and domain operation continue to work.
- Production shared command interfaces no longer expose a general whole-stream `readStdin` or `stdin()` capability. Remaining structured whole-payload input is represented by a finite JSON-specific contract with clear ownership of acquisition, parsing, schema validation, and errors.
- Ordinary argv execution, help, version/runtime, schema, completion, and rejected argument combinations do not acquire JSON input. Tests prove the input capability is called only when required.
- Semantic interaction is host-provided and limited to demonstrated operations. Standalone execution can opt into a rich-library adapter without making that library a Clinkr core dependency; Pi uses `ctx.ui`; tests use strict fakes.
- Structured command output and rendering capability are invocation-scoped for embedded and test execution. Standalone process-backed defaults remain adapter behavior rather than command behavior.
- A representative Pi extension-command suite proves success and failure output, confirmation or selection, explicit headless behavior, absence of ambient process input/output, non-ANSI embedded rendering, and terminal-control sanitization before TUI presentation.
- Existing finite JSON request workflows continue to work through standalone execution and fake-driven tests after the generic stdin surface is removed.
- Relevant package, type, test, formatting, and repository checks pass.
- A final follow-up document captures plausible future expansions, their motivating evidence thresholds, and why they are deferred. No deferred direction remains an implicit closure requirement.

## Assumptions and Risks

Assumptions:

- After removing portable Saved Plan save, every demonstrated shared whole-payload input use case is a finite JSON request. The inventory must falsify or confirm this before the generic stdin interface is removed.
- Structured commands, not raw commands, define the supported Pi embedding surface for this Objective.
- Terminal and Pi are the only production hosts that must shape the current seam. Tests provide the additional adapter evidence needed for testability, not a third production transport.
- Pi's semantic `ctx.ui` operations are the correct embedded interaction adapter; emulating terminal input inside Pi would add complexity without a demonstrated requirement.

Risks:

- **Hidden text consumer.** A production command may still consume arbitrary stdin text. Mitigation: inventory call sites before changing the interface; split a genuinely required domain-specific input capability rather than restoring generic stdin.
- **Rename-only abstraction.** `readStructuredRequest()` could preserve ambient process fallback under a narrower name. Mitigation: require hosts to supply the finite structured-request reader explicitly at the invocation seam; only the standalone adapter binds it to process stdin.
- **Terminal leakage.** A default process capability or writer can leak through SDK/Foundation composition into Pi. Mitigation: test the real in-process Pi composition and assert no process reader/writer is touched.
- **Renderer corruption.** Captured ANSI or control sequences can reach the physical terminal behind Pi and desynchronize its differential renderer. Mitigation: disable ANSI for embedded structured execution and sanitize at the Pi presentation seam.
- **Interaction inflation.** Choosing a rich terminal library can pull its raw terminal model into shared command types. Mitigation: keep library-specific streams, raw mode, lifecycle, and cleanup inside the standalone adapter.
- **Compatibility drag.** Legacy stdin/output fields may linger indefinitely after the new path exists. Mitigation: this Objective requires deletion of the generic shared surface for the bounded modern path; explicitly record any unavoidable compatibility residue and owner.

## Open Questions

- Should the JSON-specific invocation contract carry finite JSON text or an already parsed unknown value? Default to text so the command's schema remains authoritative, but choose the smaller interface after the consumer inventory.
- Does any demonstrated JSON consumer require lazy acquisition, or can every embedded/test host pass the finite payload value directly?
- What is the smallest output interface that preserves standalone stream behavior and Pi-safe capture without introducing a semantic Response model?
- Which optional terminal interaction library, if any, provides the smallest concrete adapter proof? A documented adapter contract may be sufficient if adding a dependency would not improve production behavior.
- Should raw commands be rejected by the Pi bridge or supported through their existing explicit byte sinks? Decide from current Pi-exposed raw-command inventory; do not broaden raw input virtualization.
