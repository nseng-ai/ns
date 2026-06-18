# Clinkr User Interaction

## Thesis

Clinkr should own a small, explicit abstraction for interactive user confirmation so TypeScript CLI commands do not each wire raw stdin, stderr prompts, defaults, invalid-answer loops, and EOF abort behavior by hand. The immediate evidence is the `slot gc --delete-branches` hang: the command prompt accepted Enter visually, but its stdin seam read until EOF instead of reading one submitted line. Click avoided this class in Python by providing `click.confirm()` plus `CliRunner.invoke(input=...)`; Commander gives Clinkr argument parsing, output capture, and exit override affordances, but no prompt or confirmation primitive. Clinkr should therefore provide the Click-like safety at the ASDL framework layer.

The abstraction should avoid prematurely committing to the word "gateway" if that name obscures the concept. The durable goal is a Clinkr-level user interaction seam for confirmation behavior, with real Node readline behavior at the edge and fast fake/test behavior available to scenario tests.

## Scope

- Design and implement a Clinkr-level confirmation interaction seam for TypeScript CLIs.
- Keep the first increment confirmation-focused: prompt text, default answer, accepted yes/no spellings, invalid-answer reprompting, EOF/cancel/abort behavior, and writing prompts/errors to the correct stream.
- Provide a real Node adapter that reads one interactive line at a time and never waits for EOF to accept a submitted answer.
- Provide a fake or test helper that lets scenario tests answer confirmations deterministically without touching process stdin.
- Migrate existing TypeScript confirmation call sites that currently depend on `confirmFromStdin`/raw stdin wiring, including `slot gc`, `slot free`, `handoff gc`, and `handoff delete` if they remain active call sites.
- Preserve the separation between interactive confirmation and bulk stdin payload reading. Piped JSON/text payload helpers such as full-stdin readers should remain separate and should not be hidden inside the confirmation seam.
- Document naming and ownership in Clinkr terms so future commands know whether to use the interaction seam, Clinkr IO, or payload stdin.

## Non-Goals

- No broad prompt/select/menu framework unless a concrete command needs it during this work.
- No general terminal UI abstraction, readline wrapper package, or dependency on Commander for prompting; Commander remains the argv/help/error engine only.
- No migration of non-interactive payload reading (`readStdin()`-style full-stream consumption) into the confirmation seam.
- No execution policy, task runner, or workflow-controller behavior in Objectives or Clinkr.
- No public API stability promise beyond repo-private TypeScript CLI needs.

## Completion Criteria

- Clinkr exposes a named interaction/confirmation abstraction whose API makes the confirmation semantics explicit without requiring command code to call raw stdin or readline directly.
- The real implementation accepts Enter/default answers immediately after a newline, not after EOF, and treats EOF as an abort/cancel result rather than a hang.
- Tests cover yes, no, default accept/default decline, invalid input followed by a valid answer, EOF/abort, and prompt/error stream behavior.
- At least one user-facing CLI scenario proves the original bug class is fixed through the public command path, not only a unit helper.
- Existing TypeScript confirmation users are migrated or deliberately left with documented rationale.
- Bulk stdin payload readers remain available and are not used for interactive confirmation.

## Assumptions and Risks

Assumptions:

- The first useful abstraction is confirmation-only, not a generic input framework. This should cover the current bug class while avoiding a premature API for freeform prompts or menus.
- Clinkr is the right ownership layer because it already owns command dispatch, human vs machine output behavior, IO injection, and Commander containment.
- A small real adapter over Node readline is enough; no third-party prompt library is needed.
- Scenario tests can become more meaningful and faster by injecting a fake interaction seam rather than simulating process stdin.

Risks:

- Naming may be misleading. `UserInputGateway` sounds mechanism-shaped and may invite bulk stdin or payload reading into the same surface; alternatives such as user interaction, prompt, confirmation, or interactive UI should be considered before settling the API name.
- Overgeneralizing beyond confirmation could create a half-built prompt framework with unclear ownership relative to Pi/TUI UI surfaces.
- Under-generalizing to only `confirmFromStdin` could leave commands still responsible for prompt rendering and stream behavior, preserving the class of bugs in a different form.
- Existing tests may assert low-level stdin behavior; migration should preserve user-facing behavior while updating tests to target the new seam.

## Open Questions

- What is the canonical name for the seam: confirmation, user interaction, interactive prompt, UI, or gateway? The initial preference is to avoid `gateway` unless the final shape is clearly an external-capability adapter.
- Should the seam live entirely in `@asdl/clinkr`, or should the low-level one-line reader remain in `@asdl/core/stdin` with Clinkr owning only confirmation policy?
- Should Clinkr contexts receive the interaction seam automatically from `ClinkrGroup.run`, or should each CLI context explicitly include it next to its domain gateways?
- Should confirmation return a domain result such as `"yes" | "no" | { type: "aborted" }`, or use Clinkr failure/negative conventions at the CLI boundary?
