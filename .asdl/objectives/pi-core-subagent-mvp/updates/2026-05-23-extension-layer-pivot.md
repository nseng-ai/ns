# Extension Layer Strategy Pivot

## Summary

The Objective has pivoted from an upstream Pi core `ctx.runChildSession()` primitive to a local Pi extension/package child-session base layer implemented in `asdl-tools`.

The old Pi-monorepo type-export plan is superseded. The new architecture follows the proven `pi-subagents` pattern: a parent Pi extension launches a child `pi --mode json -p` process, injects child runtime extension code with `--extension`, parses JSONL events, preserves an inspectable child session/artifact path, and returns a structured result to parent extension code.

Evidence considered:

- `pi-subagents/package.json` declares a Pi package with extension, skill, and prompt resources.
- `pi-subagents/src/extension/index.ts` registers the parent-facing subagent tool and child-safe extension behavior.
- `pi-subagents/src/runs/shared/pi-args.ts` builds child Pi invocations and injects runtime extensions.
- `pi-subagents/src/runs/shared/subagent-prompt-runtime.ts` rewrites child prompt/context boundaries through an injected extension.
- `pi-subagents/src/runs/foreground/execution.ts` parses child JSON events and maps them into parent-visible results.

## Objective Impact

The Objective title, thesis, scope, non-goals, completion criteria, assumptions/risks, open questions, and roadmap now describe an extension-layer MVP rather than a Pi core implementation.

Durable plan changes:

- Keep the Objective slug `pi-core-subagent-mvp` for continuity, but target `ts/packages/pi-extensions` and project Pi package wiring.
- Do not add `ctx.runChildSession()` to Pi core for the MVP.
- Do not export public child-session types from the Pi monorepo for the MVP.
- Implement a local helper such as `runChildSession(pi, ctx, options)` instead of monkey-patching Pi command contexts.
- Use a child process plus injected runtime extension as the base layer.
- Keep terminal capture semantics, but implement them through child-local injected extension tools and parent JSON-event/result parsing.
- Treat mixed terminal-plus-sibling tool calls as a protocol error, while recording the risk that public extension APIs may not prevent sibling side effects before detection.

The previous PR stack is superseded. The replacement roadmap is four local review slices: strategy/local contract, child process runner and JSON parser, injected terminal-capture runtime, and parent integration/docs/first-consumer proof.

Local branch evidence was checked against Graphite parent `retire-core-subagent-mvp-spec-absorb-into-objectiv`; there was no implementation diff to mark complete. This update records a strategy decision, not shipped code.

## Follow-Ups

- Add local public TypeScript types and a `runChildSession` helper contract under `ts/packages/pi-extensions`.
- Decide how child runtime configuration should pass terminal tool schemas and result sinks: temp config file, generated runtime extension, or environment-mediated path.
- Decide whether child processes should default to `--no-extensions` plus explicit runtime extensions or load normal extensions with child environment guards.
- Prove the JSON parser and terminal-capture semantics with mocked child process tests before wiring a real consumer.
- Revisit upstream Pi core only if extension-layer tests show a hard blocker, especially around mixed terminal-plus-sibling tool-call prevention.
