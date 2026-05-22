# asdl_core.sessions

`asdl_core.sessions` contains harness-neutral models for local agent session facts, source adapters that parse harness logs, and deterministic evidence aggregation.

Normalized session facts intentionally keep metadata and counts instead of raw prompt, assistant, or tool-output text. Consumers should import from the canonical module that owns the symbol, such as `asdl_core.sessions.types` or `asdl_core.sessions.evidence`.

For the branch retrospective evidence boundary, see `docs/branch-retro.md`.
