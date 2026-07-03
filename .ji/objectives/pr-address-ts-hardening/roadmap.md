# Roadmap

## Work

- [x] Remove the remaining gateway/index re-export barrels in `pr-address/src`
      Completed by removing the type re-export block in `src/gateways.ts`,
      deleting `src/index.ts`, removing the package-root `exports` entry from
      `package.json`, and repointing package-local gateway type importers at
      `./core/gateways.ts`. Evidence: branch diff against
      `update-objective-refresh-workflow`, PR #1920, focused package check/test
      passed, and stale-surface searches find no remaining in-scope barrel
      re-export or package-root TypeScript consumers.

## Parked

- [x] (Resolved after relocated ownership decision) `gh api -F`/`@` cursor
      file-read primitive: the pagination helpers moved to
      `asdl-core/github-pr-feedback/args.ts`. The narrow cursor fix was applied
      in that shared primitive owner: `threadCursor` and both `commentCursor`
      variables now use raw `-f` GraphQL fields, while `owner={owner}`,
      `repo={repo}`, and numeric `number` intentionally remain `-F`. Evidence:
      focused `@asdl/core` check/test passed, broader TypeScript gates passed,
      and tests pin an `@`-prefixed cursor literal.

- [x] (Resolved in current ground truth) Stop silently dropping comments with
      unparseable ids: the extraction replaced `numericId`→`0`-then-filter with a
      Zod refinement (`withNumericGithubIdentity` /`numericGithubIdentity`,
      `asdl-core/github-pr-feedback/schemas.ts`) that surfaces an explicit parse
      error instead of dropping. Covered by `expectInvalidIdentity` in
      `ts/packages/asdl-core/test/github-pr-feedback.test.ts`. No `id !== 0`
      filter remains in either package.

- [ ] (Retired with deleted surface) `read-feedback-detail --payload-path`
      containment bypass: the downloader-only surface has no `read-feedback-detail`,
      payload-store/session code, or raw `.raw.json` path reads.

- [ ] (Retired with deleted surface — strangler completed 2026-06-18) Batch/
      single-op resolve idempotency on replay + characterization tests (audit
      findings #2/#3/#4/#5): the original mutation helpers in the legacy surface
      are gone. (Reply/resolve helpers later reappeared in the shared
      `asdl-core` primitives using raw `-f` fields.)

- [ ] (Retired with deleted surface — strangler completed) Checkpoint-missing
      detection coupled to a message prefix and untested checkpoint-recovery
      branches + orphaned fixture (#7/#14): the session/checkpoint machinery was
      removed.

- [ ] (Retired with deleted surface — strangler completed) `payload-store.ts`
      god-module split and `PayloadReference`-defined-3× consolidation (#10/#11):
      `payload-store` was deleted.

- [ ] (Retired — strangler download-only cutover; no RunEngine) Operation-result
      schema drift between runtime types and `--json-schema` docs (#6): the
      workflow `exec` surface was retired; any residual concern on the surviving
      `operation-schemas` would need a fresh Objective.
