# Decision: harness-neutral squash-stack flow core

**Accepted — 2026-07-10, @schrockn** (stack review of PR #3378, `flow-deepening-smush--02d-harness-neutral-squash-stack`).

## Decision

Stack squash is a harness-neutral flow core (`flow/src/stack-squash/stack-squash.ts`) registered as the NS command `ns flow squash-stack`; the Pi `gt:squash-stack` command is a thin adapter over the same core.

## Rationale

One shared engine keeps CLI and Pi discovery, tip-first squashing, tip restoration, and failure reporting consistent. The core exposes a typed `StackSquashOutcome` union with presentation helpers, so both surfaces render identical summaries and failures.

## Alternative rejected

Keep stack squash Pi-only. That avoids widening flow's public command surface but leaves the workflow tied to one harness's command execution and messaging, with no CLI parity.

## Consequences

- `flow/squash-stack` is part of the loaded flow command registry; registry expectations are checked in.
- Pi's `stack-squash.ts` carries no workflow logic of its own; behavior changes belong in the shared core.
