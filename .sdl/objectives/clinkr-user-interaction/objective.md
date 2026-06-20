# Clinkr User Interaction

## Thesis

Clinkr owns a small, explicit abstraction for interactive user confirmation so TypeScript CLI commands do not each wire raw stdin, stderr prompts, defaults, invalid-answer loops, and EOF abort behavior by hand. The immediate evidence was the `slot gc --delete-branches` hang: the command prompt accepted Enter visually, but its stdin seam read until EOF instead of reading one submitted line. Click avoided this class in Python by providing `click.confirm()` plus `CliRunner.invoke(input=...)`; Commander gives Clinkr argument parsing, output capture, and exit override affordances, but no prompt or confirmation primitive. Clinkr therefore provides the Click-like safety at the ASDL framework layer.

The shipped abstraction deliberately avoids the word "gateway" for command-facing code. The durable surface is `ClinkrInteraction`, a confirmation-focused Clinkr user-interaction seam, with real one-line stdin behavior at the CLI edge and fast fake/test behavior available to scenario tests.

Implementation evidence: `@asdl/clinkr` exports `ClinkrInteraction`, confirmation request/result types, and `createClinkrInteraction`; `@asdl/clinkr/testing` exports `createFakeClinkrInteraction`; `@asdl/core/stdin` keeps full-stream `readStdin()` separate from one-line `readStdinLine()`; and `slot`, `handoff`, and `packagechk` confirmation call sites now depend on `ctx.interaction.confirm(...)` rather than the removed public `confirmFromStdin` helper.

## Scope

- Design and implement a Clinkr-level confirmation interaction seam for TypeScript CLIs.
- Keep the first increment confirmation-focused: prompt text, default answer, accepted yes/no spellings, invalid-answer reprompting, EOF/cancel/abort behavior, and writing prompts/errors to the correct stream.
- Provide a real Node adapter that reads one interactive line at a time and never waits for EOF to accept a submitted answer.
- Provide a fake or test helper that lets scenario tests answer confirmations deterministically without touching process stdin.
- Migrate existing TypeScript confirmation call sites that currently depended on `confirmFromStdin`/raw stdin wiring: `slot gc`, `slot free`, `handoff gc`, `handoff delete`, and `packagechk claim-*`.
- Preserve the separation between interactive confirmation and bulk stdin payload reading. Piped JSON/text payload helpers such as full-stdin readers remain separate and are not hidden inside the confirmation seam.
- Document naming and ownership in Clinkr terms so future commands know whether to use the interaction seam, Clinkr IO, or payload stdin.

## Non-Goals

- No broad prompt/select/menu framework unless a concrete command needs it during future work.
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

- Confirmed: the first useful abstraction is confirmation-only, not a generic input framework. This covered the current bug class while avoiding a premature API for freeform prompts or menus.
- Confirmed: Clinkr is the right ownership layer because it already owns command dispatch, human vs machine output behavior, IO injection, and Commander containment.
- Confirmed: a small real adapter over an injected one-line stdin reader is enough; no third-party prompt library was needed.
- Superseded: `confirmFromStdin` was useful prototype evidence, but the final public API hides raw stdin/stderr wiring from command operations.
- Confirmed: scenario tests can use a semantic fake interaction seam while retaining targeted public CLI coverage for one-line stdin behavior.

Risks:

- De-risked: `ClinkrInteraction` avoids the misleading `UserInputGateway` name and keeps bulk stdin payload reading outside the interaction surface.
- De-risked: the implementation did not overgeneralize into a prompt framework; richer menus/wizards remain parked.
- De-risked: command operations no longer pass raw stdin/stderr into confirmation helpers, reducing the original hang class.
- Accepted: `confirmFromStdin` is no longer root-exported; this is acceptable because the repo is private/unreleased.
- De-risked: tests now cover the semantic seam, fake helper, prompt streams, abort/decline safety, and at least one public command path for newline/default behavior.

## Open Questions

Resolved for this increment:

- The canonical seam name is `ClinkrInteraction`, with `confirm({ message, defaultAnswer })` for yes/no confirmation.
- The seam lives in `@asdl/clinkr`; `@asdl/core/stdin.readStdinLine()` remains the low-level one-line reader that package entrypoints pass into the real Clinkr adapter.
- Package contexts explicitly include `interaction`; package `runCli` functions construct or overlay the real interaction from resolved Clinkr IO and the one-line stdin reader.
- Confirmation returns a domain result union: `{ type: "confirmed" } | { type: "declined" } | { type: "aborted" }`. CLI operations map aborts to their existing user-visible failure/code conventions.

## Closure

Completed by the local branch diff against Graphite parent `update-clinkr-user-interaction-objective`.

Closure evidence: `@asdl/clinkr` now exports the named `ClinkrInteraction` API and real adapter; `@asdl/clinkr/testing` provides a queued semantic fake; `slot`, `handoff`, and `packagechk` operations use `ctx.interaction.confirm(...)`; the old public `confirmFromStdin` root export and operation imports are gone; stale greps show only the intended private Clinkr adapter one-line `stdin` option remains; prompt suffix literals no longer live in migrated package source.

Verification: targeted package tests passed; full TypeScript tests passed; TypeScript typecheck, lint, and guard gates passed; changed-file formatting passed. The full TypeScript format check is blocked by an unrelated pre-existing format issue in `ts/packages/pr-address/src/download-feedback.ts`, not by this Objective's changed files.

Follow-up is parked, not active Objective work: future richer prompts, menus, or TUI surfaces should start from concrete command needs rather than broadening this confirmation-first seam speculatively.
