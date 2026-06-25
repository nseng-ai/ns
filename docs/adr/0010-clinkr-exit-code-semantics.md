# ADR 0010: Clinkr Exit-Code Semantics

## Status

Accepted

## Context

Agent-era CLI design has two consumers with different failure-reading behavior.
Shell scripts and CI usually branch on the process exit status. Agents and other
machine consumers can inspect structured output, but only when the command emits a
stable machine envelope. Human users need useful prose, not a taxonomy lesson.

The survey in `docs/agent-era-cli-design-survey.md` captures the tension:
clig.dev says non-zero exit codes should map to important failure modes, while
agent-era guidance treats structured, actionable errors as the primary recovery
surface. The survey explicitly leaves open whether SDL should standardize richer
numeric exit codes, keep simple `0`/`1`/`2` process semantics and rely on envelope
fields, or define a hybrid.

The Clinkr gap audit in `docs/clinkr-agent-era-gap-audit.md` shows why this must
be decided before changing APIs. Clinkr currently has a typed machine envelope
with `exit_code`, optional `error_type`, optional `message`, and optional `data`,
but `error_type` is unconstrained. Handler failures can be represented as machine
envelopes, while usage errors currently exit `2` as raw stderr for Python parity.
`negative` outcomes are also split: machine envelopes report `exit_code: 1`, but
the default process exit can remain `0` unless `--shell-exit-code` is requested.

A richer numeric taxonomy such as `3=not-found`, `4=permission`, `5=conflict`, or
`6=transient` would make some shell-only automation easier, but it would also
compress domain-specific failure detail into a small global number space. Clinkr's
existing design is already envelope-first: command handlers return typed results,
JSON output is deterministic, and command-specific schemas can describe machine
results more precisely than process status can.

## Decision

Clinkr will use a compact process exit taxonomy as the default contract:

- `0` means success.
- `1` means the command was invoked well enough to run, but the requested
  operation failed semantically or operationally.
- `2` means usage, invocation, validation, or configuration failure before the
  requested operation could run normally.

Detailed failure semantics belong in the machine envelope, not in an expanded
process-exit code list. The authoritative machine-readable classification should
be a disciplined `error_type` / `code` value plus structured `data` / details when
extra recovery context is useful. Future Clinkr and `sdl-cli-design` work should
therefore prioritize:

- optional structured `data` on failure exits;
- a documented convention or schema path for `error_type` / `code` values;
- structured usage-error envelopes for machine modes, if the Python-parity
  constraint is later relaxed by a separate ADR;
- remediation-oriented details such as invalid fields, allowed values,
  retryability, or suggested next commands when those are useful to agents.

Expanded numeric exit-code taxonomies are not the Clinkr default. Individual
commands may still document additional process exit codes only when they have a
specific shell/CI contract that cannot reasonably consume the machine envelope.
Those command-local additions must remain additive and documented; they must not
replace the envelope as the detailed failure contract.

This ADR does not by itself resolve the separate Python-parity questions around
usage-error enveloping, JSON compaction, or the current `negative` process-exit
behavior. It sets the design direction those ADRs should respect: keep process
status coarse; make structured machine errors rich.

## Consequences

- Agents get one stable rule: inspect the machine envelope for detailed failure
  meaning instead of trying to infer semantics from numeric process exits.
- Shell users still get conventional status behavior: `0` for success, non-zero
  for failure, and `2` for invocation/usage/configuration problems.
- `sdl-cli-design` should teach CLI authors to design actionable envelope errors:
  stable `error_type` / `code`, concise message, structured details, and recovery
  hints where appropriate.
- Clinkr should not grow a large global numeric enum before it has stronger
  envelope semantics. The likely first implementation work is structured failure
  `data` and an error-type discipline, not exit-code proliferation.
- Commands with genuine shell-only integration needs still have an escape hatch,
  but those extra codes are command-specific API and require documentation.
- The existing `negative` default remains a known follow-up: this ADR favors
  coarse non-zero process status for non-success, but any compatibility-sensitive
  change to `negative` process exits needs its own decision.
- Usage-error enveloping remains a separate decision. This ADR says that if SDL
  later makes usage errors machine-readable, the details should be envelope data,
  not a larger set of numeric process statuses.

## Rejected Alternatives

- **Adopt a global rich numeric taxonomy.** This helps shell-only conditionals,
  but it is lossy for agents, hard to make domain-neutral, and likely to become
  either incomplete or ceremonial. It also duplicates information that a typed
  envelope can express more clearly.
- **Keep only generic `0`/`1` with no special usage code.** This is simpler, but
  loses a widely understood distinction between bad invocation and a command that
  ran and failed. Clinkr already normalizes parser/usage errors to `2`, and that
  distinction is useful for humans, scripts, and agents.
- **Make every command invent its own numeric status map.** This maximizes local
  flexibility but weakens Clinkr as a framework contract. Command-local additions
  remain allowed for strong shell/CI reasons, but they are not the default design.
- **Rely on free-form `error_type` strings without further discipline.** This
  preserves maximum compatibility, but leaves agents without a reliable recovery
  contract. The envelope should carry the detail, but the detail still needs
  naming and schema discipline.
