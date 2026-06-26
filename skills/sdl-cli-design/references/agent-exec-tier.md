# Agent / `exec` tier

Agents read CLI output as context and choose tools probabilistically under a
token budget. An agent-facing command must preserve context budget and steer
recovery, not merely be parseable. Sources: Anthropic "Writing effective tools
for AI agents", Speakeasy, Agent Layer (see the survey).

## Rules

- **Schema-first results.** Every agent-facing command returns a typed result
  with a `resultSchema`. `--json-schema` publishes the real machine-envelope
  shape (ADR 0011; `buildMachineEnvelopeSchema` / `machineEnvelopeSchema`). Docs,
  help, schema, and skill prose must agree.
- **One stable envelope.** `--format json` emits the camelCase discriminated
  envelope: `status` (`ok` | `negative` | `failure` | `usageError`), `exitCode`,
  and for non-ok outcomes `errorType`/`message`, plus optional structured `data`
  (`toMachineEnvelope`, `MachineEnvelope` in `ts/packages/clinkr/src/exit.ts`).
  The envelope is stable; change it additively only.
- **Explicit format, no TTY guessing.** Agents select output with an explicit
  flag (`--format json`); never vary the *machine* contract by TTY detection.
  TTY may only change human presentation.
- **Context-bounded output.** Long lists/diffs/logs/search results must be
  bounded by the command (ADR 0012 — no framework pagination). When truncating or
  windowing, put completion state, the applied bound, and how to get the next or
  narrower result **into the result schema** so the agent can recover.
- **Errors as steering signals.** Failures identify what failed, whether it is
  recoverable, and what input/command shape to try next. Use a stable snake_case
  `errorType` and structured `data` (`failure(errorType, message, data)`);
  thrown `ClinkrFailure` preserves `data`. Do not invent a global error enum
  (ADR 0010) — choose stable per-command error types and optionally narrow the
  failure schema for stable consumers.
- **Usage errors are enveloped.** Modeled-argument / Zod validation failures
  return a `usageError` envelope with structured issue data, not bare stderr
  (ADR 0011). Use `requireInteractiveOrUsageError` / handler-returned
  `usageError(...)` for missing-authorization in non-interactive mode.
- **No prompts in the agent path.** Agent/`exec` commands must never block on a
  prompt; require a flag and fail fast with a `usageError` naming it.
- **Hidden `exec` subgroup for skill-only ops.** Operations meant for skills/agents
  rather than interactive humans live under an `exec` `ClinkrGroup` constructed
  with `isHidden: true` (AGENTS.md "Skill-Invoked CLI Commands"). Keep top-level
  `--help` focused on commands a human would type.
- **Fewer, higher-level commands.** Prefer commands that match real agent
  workflows over a thin command per low-level API call; namespace so boundaries
  are legible.

## Anti-patterns

- Returning maximal raw data instead of task-relevant fields.
- Unbounded lists/logs with no completion or continuation signal.
- Opaque errors (`error: failed`) with no `errorType`/`data`/next step.
- Bare-stderr usage errors that bypass the envelope.
- A skill-only operation exposed as a top-level human command.
