# Roadmap

## Work

- [x] Collapse the findings-publication pipeline into one end-to-end `publishFindings` workflow (candidate 1).
      Shipped on branch `roaster-findings-publication-workflow`: `src/findings-publication.ts` owns one `publishFindings` operation, `roaster exec publish-findings` is the single adapter, and `.github/workflows/roaster.yml` streams the review envelope directly into it instead of round-tripping through temp files and three exec commands. The branch removed the old hidden exec commands rather than keeping compatibility wrappers; this is accepted for the unreleased/private hidden exec surface.
      Evidence: scenario tests exercise the combined publish command, duplicate handling, fallback-only findings, and failure handling; PR #1823 TypeScript CI passed; PR #1823 roaster comments rendered summary bodies, inline posting status, and activity-log updates against a real PR.
- [x] Unify the duplicated DTO definitions into one source of truth each (candidate 2).
      Shipped on branch `roaster-dto-schema-type-unification`: `src/models.ts` owns canonical schema-inferred `ReviewDefinition`, `ReviewApplicability`, `DiffFile`, and `DiffChangeKind` types. `review-definition.ts`, `review-applicability.ts`, and `diff-parsing.ts` now import canonical model types and keep behavior only; `cli-operations.ts` passes the parsed canonical definition directly instead of manually re-wrapping applicability arrays.
      Evidence: field-by-field shape comparison found no semantic DTO mismatch beyond readonly-array type decoration; targeted roaster tests passed; full TypeScript format, lint, check, and test gates passed.
- [x] Capture the execution environment in the roaster context (candidate 3).
      Shipped through the candidate-3 stack and refined on branch `roaster-context-runtime-vocabulary-refactor`: `runCli` creates or accepts a full `RoasterContext` with raw gateway dependencies, `cwd`, `env`, optional `signal`, stdin, stdout, and stderr, then derives the operation-facing `RoasterRuntime` through `createRoasterRuntime(context)`. Operation handlers depend on the runtime capability surface and work-shaped methods; raw gateway interfaces stay intact behind the context.
      Evidence: stale-term checks found no `ctx.context`, `ctx.cwd`, `ctx.env`, or `githubOptions()` in roaster operation/publication source; `context.test.ts` covers forwarding of `cwd`, `env`, and `signal`; branch-local diff and PR #1837 show the final context/runtime vocabulary and fake-context support. Earlier candidate-3 slices passed targeted roaster tests and full TypeScript deps, format, lint, check, legacy check, test, and guard gates.
- [x] Decide and resolve the failure-union depth mismatch (candidate 4).
      Shipped on branch `shrink-roaster-failure-consumed-shape`: `src/failures.ts` now exposes a single consumed `RoasterFailure` shape with `type` and `message`, keeps semantic failure-code aliases for source categories, and removes unused structured payload fields from gateway and operation failures. The old `failureMessage` and `isFailureOfType` helpers were deleted because callers now consume the shape directly.
      Evidence: local branch diff against Graphite parent `roaster-context-runtime-vocabulary-refactor`; branch commit `151a0c37e`; targeted failure/scenario test updates; `pnpm --dir ts run check`; `pnpm --dir ts run test`.

## Parked

None.
