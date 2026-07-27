# README Contract Audit Reconciled

## Summary

A final consistency audit reconciled the active Objective and mutable reference records with the edited cold-audience README. The README remains the current contract candidate until its roadmap blessing gate closes; earlier references to an already “blessed README” in `2026-07-27-steelthread-rebuild-rebaseline.md` and `references/steelthread-contract-changes.md` were premature. This update supersedes only that status wording, not the clean-rebuild decision or the steelthread's evidence.

The audit also separated settled behavior from remaining API design. The README now settles public advanced builder exposure, app-owned default completion transport with a lower-level host escape hatch, context behavior, raw ownership, and entrypoint categories. Remaining questions concern exact builder and raw constructors, truthful TypeScript overloads, topology-preserving SDK composition, and individual export placement.

## Objective Impact

`objective.md`, `roadmap.md`, `references/decision-record.md`, `references/contract-audit.md`, `references/steelthread-contract-changes.md`, and `references/steelthread-implementation-lessons.md` now use the same current contract boundaries. Historical one-file command-topology prose is explicitly superseded by the required `metadata.ts` + selected-only `command.ts` seam. Implementation detail intentionally removed from the README remains binding through `references/implementation-contract-notes.md`.

The package-level acceptance scope is explicit: it must cover malformed topology, absolute command-directory validation, transactional load caching and retry, fresh Commander trees, bodyless and framework-owned usage outcomes, exception propagation, the `md` alias, completion merge/fallback behavior, and progressive-output constraints. Representative consumers prove integration rather than carrying the entire contract matrix.

## Follow-Ups

- Close the README blessing gate only after its TypeScript examples compile and the primary example executes unchanged.
- Finalize the remaining builder, typing, SDK-composition, raw-constructor, and export-placement questions before rebuilding the runtime.
- Preserve existing immutable updates as historical evidence; read this update as the status correction for premature “blessed README” wording.
