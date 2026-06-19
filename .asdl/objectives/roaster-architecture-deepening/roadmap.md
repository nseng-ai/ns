# Roadmap

## Work

- [~] Collapse the findings-publication pipeline into one end-to-end `publishFindings` workflow (candidate 1, top recommendation).
  Local implementation now has one `publishFindings` workflow in `src/findings-publication.ts`, one thin `roaster exec publish` adapter, and a CI workflow that pipes the raw review-run envelope directly into publish with required `--review-name`/`--base-ref` fallback metadata. The old hidden exec commands and temp-file handoff are removed from the TypeScript CLI and checked-in workflow/docs/tests. Evidence: targeted roaster Vitest suite passed; TS format/lint/check/check:legacy passed; Python roaster workflow scenario test passed; stale old-command/temp-file grep passed. Remaining evidence before marking shipped: a real-PR roaster CI run renders findings as before.
- [ ] Unify the duplicated DTO definitions into one source of truth each (candidate 2).
      Make the Zod schemas in `src/models.ts` canonical for `ReviewDefinition`, `ReviewApplicability`, and `DiffFile`/`DiffChangeKind`; infer the types; import them in `review-definition.ts`, `review-applicability.ts`, `diff-parsing.ts`. Delete the hand-written twins and the manual re-wrap spread in `cli-operations.ts`. Diff the two shapes field-by-field first to catch silent drift.
- [ ] Bind the execution environment into the roaster context (candidate 3).
      Bind `cwd`/`env` once at `runCli`, decide whether cancellation should be part
      of that same bound run environment, and flatten
      `RoasterCliContext`/`RoasterContext` so handlers call gateways with
      work-shaped arguments only. Keep gateway seams; narrow the caller-facing
      interface. Bind at run time, not at context construction.
- [ ] Decide and resolve the failure-union depth mismatch (candidate 4, speculative).
      First confirm whether `RoasterFailure`'s unread structured fields are consumed anywhere or are forward-room. Then either shrink toward `{ type, message }` or deepen the seam to consume the structure (structured envelopes, exit codes from `code`, diagnostics). Record the decision as an update; if "deepen" is rejected in favor of keeping fields untouched, capture the reasoning (ADR if it would otherwise be re-suggested).

## Parked

None.
