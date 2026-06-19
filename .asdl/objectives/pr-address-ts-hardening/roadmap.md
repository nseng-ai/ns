# Roadmap

## Work

- [ ] Close the remaining `gh api -F`/`@` local file-read primitive in `gateways.ts`
      The old mutation helpers are gone, but review-thread pagination still sends
      string `threadId`, `threadCursor`, and `commentCursor` variables via `-F`.
      Switch those string fields to `-f` (raw fields); keep `-F` only for typed
      values/placeholders that need `gh` coercion. Evidence: regression test
      asserting an `@`-prefixed string variable is sent literally and does not
      read a local file.
- [ ] Stop silently dropping comments with unparseable ids
      Replace the `numericId`→`0`-then-filter behavior in `gateways.ts` so a
      review/discussion comment with a null `databaseId` and a string node id is
      preserved or surfaces an explicit parse error. Evidence: test over a fake
      GitHub response with that id shape.
- [ ] Remove the remaining gateway/index re-export barrels
      Drop the `gateways.ts` type re-exports and the `index.ts:1` CLI re-export,
      then repoint importers at canonical source modules per the repo
      no-reexport rule. Current ground truth already removed the old
      `stdoutModeRequestShape` dead export, so do not recreate that work.
      Evidence: `check` passes; `grep` finds no remaining barrel re-export of
      the in-scope symbols.

## Parked

- [ ] (Retired with deleted surface) `read-feedback-detail --payload-path`
      containment bypass: current downloader-only ground truth no longer has
      `read-feedback-detail`, payload-store/session code, or raw `.raw.json` path
      reads, so this historical audit finding is not active scope here.
- [ ] (Retired with deleted surface — strangler completed 2026-06-18) Batch/single-op
      resolve idempotency on replay + characterization tests (audit findings
      #2/#3/#4/#5): the resolve/mutation helpers are gone; no mutation-parity
      follow-up Objective exists.
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
