# PR 3 collect-evidence Complete

## Summary

`aretro exec collect-evidence` now exists as the first real skill-facing `aretro` operation. It accepts `--repo`, `--branch`, `--session-root`, and `--max-sessions`, uses a typed CLI context with injectable git and session-source gateways, and defaults the real session source to the shared Pi JSONL adapter.

The JSON result is a Clinkr envelope whose data contains `success`/`error`, repo context, query metadata, source metadata, aggregate metrics, compact session summaries, warnings with source refs, and an empty `evidence_items` tuple reserved for PR 4. Known user-correctable states such as non-repos and detached HEAD return stable negative JSON; missing session roots and source warnings remain successful collection results with surfaced warnings.

Validation passed with targeted unit and scenario tests, aretro plugin smoke coverage, and the full `just` suite (`1314 passed`).

## Objective Impact

This completes roadmap PR 3. The collector is now a thin consumer of `asdl_core.sessions`: it builds a `SessionQuery`, calls the injected `SessionSource`, converts normalized session dataclasses to stable DTOs, and does not re-parse Pi JSONL or introduce Graphite stack discovery.

Repo and branch context are represented separately from per-session association. The requested/current branch appears in repo context with `branch_source` (`explicit`, `git_current_branch`, `detached`, or `unresolved`), while session association remains exactly what the session source reports, preserving conservative confidence when branch metadata is absent.

The implementation also reinforces the privacy and semantics boundary: no raw transcript, prompt, assistant, tool-output, or command-output text is emitted, and no semantic recommendation logic is present in Python.

## Follow-Ups

- PR 4 should add reusable aggregation evidence classes for repeated file reads, repeated shell commands, failed tools, tools by name, token usage, and large outputs, then populate `evidence_items` from those deterministic facts.
- PR 5 should expand scenario/plugin coverage where useful for plugin-path JSON behavior and real-source missing-root behavior without moving semantic recommendations into Python.
- Later real-session validation should check payload size, warning usefulness, and association confidence against actual Pi logs before adding non-Pi adapters.
