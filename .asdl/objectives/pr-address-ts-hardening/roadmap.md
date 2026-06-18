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
- [ ] (Deferred to strangler mutation-parity follow-up) Batch/single-op resolve
      idempotency on replay + characterization tests (audit findings #2/#3/#4/#5).
- [ ] (Deferred to strangler — session machinery removal) Checkpoint-missing
      detection coupled to a message prefix and untested checkpoint-recovery
      branches + orphaned fixture (#7/#14).
- [ ] (Deferred to strangler — `legacy/` deletion) `payload-store.ts` god-module
      split and `PayloadReference`-defined-3× consolidation (#10/#11).
- [ ] (Deferred to strangler — RunEngine contract) Operation-result schema drift
      between runtime types and `--json-schema` docs (#6).
