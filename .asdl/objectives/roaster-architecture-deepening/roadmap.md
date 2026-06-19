# Roadmap

## Work

- [x] Collapse the findings-publication pipeline into one end-to-end `publishFindings` workflow (candidate 1).
      Shipped on branch `roaster-findings-publication-workflow`: `src/findings-publication.ts` owns one `publishFindings` operation, `roaster exec publish-findings` is the single adapter, and `.github/workflows/roaster.yml` streams the review envelope directly into it instead of round-tripping through temp files and three exec commands. The branch removed the old hidden exec commands rather than keeping compatibility wrappers; this is accepted for the unreleased/private hidden exec surface.
      Evidence: scenario tests exercise the combined publish command, duplicate handling, fallback-only findings, and failure handling; PR #1823 TypeScript CI passed; PR #1823 roaster comments rendered summary bodies, inline posting status, and activity-log updates against a real PR.
- [x] Unify the duplicated DTO definitions into one source of truth each (candidate 2).
      Shipped on branch `roaster-dto-schema-type-unification`: `src/models.ts` owns canonical schema-inferred `ReviewDefinition`, `ReviewApplicability`, `DiffFile`, and `DiffChangeKind` types. `review-definition.ts`, `review-applicability.ts`, and `diff-parsing.ts` now import canonical model types and keep behavior only; `cli-operations.ts` passes the parsed canonical definition directly instead of manually re-wrapping applicability arrays.
      Evidence: field-by-field shape comparison found no semantic DTO mismatch beyond readonly-array type decoration; targeted roaster tests passed; full TypeScript format, lint, check, and test gates passed.
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
