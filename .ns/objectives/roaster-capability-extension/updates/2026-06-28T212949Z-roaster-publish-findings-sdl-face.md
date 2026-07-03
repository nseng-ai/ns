# Roaster publish-findings SDL face

## Summary

Roaster's hidden GitHub publication automation now has SDL command-face parity as `sdl roaster exec publish-findings`. The SDL extension contributes hidden command `exec-publish-findings`, loading `@sdl/roaster/commands/exec-publish-findings` through the repo extension shim and preserving the existing review-run envelope stdin contract, publication options, summary/inline marker semantics, and human diagnostics.

The standalone `roaster exec publish-findings` path remains raw-exit compatible for this slice; standalone binary cutover remains a later roadmap row.

## Objective Impact

This completes the roadmap row to migrate or disposition GitHub findings publication. The SDL command is enveloped with a concrete result schema and maps fatal publication errors to `failure("roaster_publish_findings_failed", ..., { fatalFailurePhase, reason })`, while successful publication still treats inline API errors as non-fatal summary state.

Validation was fake-backed only: no live GitHub writes, no `gh` invocation against a real backend, and no workflow/job publication was run.

## Follow-Ups

- Align public skills, Pi metadata, docs, and context to use the SDL command face after command parity.
- Decide the standalone `roaster` binary cutover separately; until then, its `exec publish-findings` command remains raw-compatible by design.
