# ADR 0012: Clinkr Output-Volume Discipline

## Status

Accepted

## Context

ADR 0011 established TypeScript Clinkr's JSON machine envelope but explicitly
deferred compact JSON, JSONL/streaming output, pagination, truncation, and other
output-volume primitives. The agent-era CLI survey shows the tension: agents need
bounded, token-efficient tool output with clear continuation paths, while
human-first CLI guidance values readable defaults and stable, additive command
interfaces.

The Clinkr gap audit found that Clinkr currently pretty-prints rendered JSON
machine envelopes and `--json-schema` output. It also found no framework-level
compact mode, pagination helper, truncation contract, range selector, or
streaming/JSONL protocol. Adding any of those as a general framework surface now
would require choosing abstractions before enough command-specific evidence
exists.

The immediate design pressure is still real: large lists, logs, diffs, search
results, and inventories can waste an agent's context window or make the agent
assume an incomplete result is complete. The question is whether Clinkr should
solve that as a framework API now, or whether SDL should treat it as a
command-local authoring discipline until repeated needs justify extraction.

## Decision

Clinkr will not add a framework output-volume API in this slice.

Specifically, Clinkr will not add `--compact`, `--format compact-json`, a generic
pagination/truncation/range flag set, a generic bounded-result wrapper, or a
JSONL/streaming format now. TypeScript Clinkr keeps the current pretty JSON
serialization for rendered `--format json` machine envelopes and `--json-schema`
output unless a future ADR supersedes this decision.

Output volume is a command-local design responsibility for now. `sdl-cli-design`
should teach this as soft guidance for all commands: when a command's machine
result can grow large enough to burden an agent context window, the command should
choose domain-appropriate bounds such as filters, limits, cursors, ranges,
summaries, or narrow subcommands. When a command can return a truncated or
bounded machine result, its schema should make the completion state and recovery
path machine-readable: whether the result is complete or truncated, which bounds
were applied, and either how to continue/narrow the result or why no continuation
is available.

This is deliberately not a hard framework gate yet. Code review and
`sdl-cli-design` should prefer bounded command designs, but Clinkr should not
pretend one generic abstraction fits every list, log, diff, tree, search result,
or long-running scan before those cases have repeated evidence.

## Revisit Criteria

Reopen this decision when either of these happens:

- at least two real commands independently need the same framework-level
  output-volume shape; or
- one severe agent-context failure shows that command-local bounds and result
  metadata cannot solve the problem cleanly.

A future ADR may then extract a common Clinkr API such as compact serialization,
a result-bounds helper, shared continuation metadata, or a streaming/JSONL
protocol.

## Consequences

- No Clinkr runtime change is required by this ADR.
- `sdl-cli-design` can still give concrete output-volume guidance without
  claiming Clinkr already has compact or pagination primitives.
- Command authors keep flexibility to choose domain-appropriate bounding and
  continuation semantics.
- The tradeoff is less framework-enforced consistency: bounded-output quality
  depends on command design and review until repeated patterns justify a shared
  Clinkr surface.
- Pretty JSON remains the stable machine-output spelling for now, which favors
  readability and minimizes churn over token compaction.

## Rejected Alternatives

- **Add `--compact` now.** Compact JSON would save tokens and could apply to both
  rendered JSON envelopes and `--json-schema`, but there is not yet a concrete
  caller or repeated evidence that the extra framework flag is worth carrying.
- **Make compact JSON the default machine format.** This optimizes for agents but
  changes the current readable default and makes a broad compatibility choice for
  a private but already-used framework surface.
- **Add generic pagination or truncation primitives now.** Shared options could
  improve consistency, but list-style pagination does not naturally cover diffs,
  logs, tree views, search results, and other domain outputs.
- **Add a generic bounded-result wrapper now.** A wrapper might eventually be the
  right extraction point, but standard fields chosen too early risk becoming
  ceremonial or forcing awkward command schemas.
- **Add JSONL or streaming output now.** Streaming may matter for long-running or
  very large commands, but it needs a concrete event/envelope protocol and should
  wait for an actual command design that proves the need.
- **Leave output volume entirely undocumented.** That avoids premature policy, but
  it ignores the agent-era finding that context volume is a real design
  constraint. The accepted compromise is command-local guidance first, framework
  extraction later if evidence appears.
