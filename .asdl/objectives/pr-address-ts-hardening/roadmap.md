# Roadmap

## Work

- [ ] Remove the remaining gateway/index re-export barrels in `pr-address/src`
      Drop the type re-export block in `gateways.ts:11-17` (re-exporting
      `CurrentBranchResult`, `GatewayFailure`, `GatewayOptions`,
      `PrAddressGitGateway`, `RepoContextResult` from `./core/gateways.ts`) and
      the `index.ts:1` re-export of `runCli` / `CliDeps` from `./cli.ts`, then
      repoint importers at the canonical source modules per the repo no-reexport
      rule. The old `stdoutModeRequestShape` / `PRLookupMiss` exports are already
      gone — do not recreate that work. Evidence: `check` passes; `grep` finds no
      remaining barrel re-export of the in-scope symbols.

## Parked

- [ ] (Relocated — ownership decision pending) `gh api -F`/`@` cursor file-read
      primitive: the pagination helpers moved to
      `asdl-core/github-pr-feedback/args.ts` (owned by
      `pr-address-github-primitives`). `threadId` is already a raw `-f` field
      (`args.ts:66`), but `threadCursor` (`args.ts:57`) and `commentCursor`
      (`args.ts:42`, `args.ts:67`) still use `-F`. Outside this Objective's
      `ts/packages/pr-address/src` boundary; track under the primitives Objective
      or re-scope explicitly before acting (see objective.md Open Questions).

- [x] (Resolved in current ground truth) Stop silently dropping comments with
      unparseable ids: the extraction replaced `numericId`→`0`-then-filter with a
      Zod refinement (`withNumericGithubIdentity` /`numericGithubIdentity`,
      `asdl-core/github-pr-feedback/schemas.ts:163-192`) that surfaces an
      explicit parse error instead of dropping. Covered by `expectInvalidIdentity`
      in `ts/packages/asdl-core/test/github-pr-feedback.test.ts`. No `id !== 0`
      filter remains in either package.

- [ ] (Retired with deleted surface) `read-feedback-detail --payload-path`
      containment bypass: the downloader-only surface has no `read-feedback-detail`,
      payload-store/session code, or raw `.raw.json` path reads.

- [ ] (Retired with deleted surface — strangler completed 2026-06-18) Batch/
      single-op resolve idempotency on replay + characterization tests (audit
      findings #2/#3/#4/#5): the original mutation helpers in the legacy surface
      are gone. (Reply/resolve helpers later reappeared in the shared
      `asdl-core` primitives using raw `-f` fields, owned by
      `pr-address-github-primitives`.)

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
