# Roadmap

## Work

- [ ] Close the `gh api -F`/`@` local file-read primitive in `gateways.ts`
      Switch `threadId` and thread/comment cursors (`gateways.ts:305,313,322,444,451`)
      from `-F` to `-f` (raw fields); keep `-F` only for the integer `number`.
      Evidence: regression test asserting an `@`-prefixed thread id is sent
      literally and does not read a local file.
- [ ] Stop silently dropping comments with unparseable ids
      Replace the `numericId`→`0`-then-filter behavior (`gateways.ts:517,486,285`)
      so a review/discussion comment with a null `databaseId` and a string node
      id is preserved or surfaces an explicit parse error. Evidence: test over a
      fake GitHub response with that id shape.
- [ ] Enforce path containment on `read-feedback-detail --payload-path`
      Apply the store's symlink/containment guard (`payload-store.ts:397-429`) to
      a user-supplied raw `--payload-path` and drop the `readLooseJsonFile`
      bare-read fallback (`read-feedback-detail.ts:126-130`). Resolve the open
      question on legitimate out-of-store reads first. Evidence: test rejecting a
      symlinked/non-contained path.
- [ ] Remove gateway/index re-export barrels and the dead `stdoutModeRequestShape` export
      Drop the `gateways.ts:29-50` type re-exports and the `index.ts:1` barrel,
      repoint importers at canonical `core/gateways.ts` paths, and delete the
      unreferenced `stdoutModeRequestShape` (`operation-schemas/shared.ts:20`),
      per the repo no-reexport rule. Evidence: `check` passes; `grep` finds no
      remaining barrel re-export of the in-scope symbols.

## Parked

- [ ] (Deferred to strangler mutation-parity follow-up) Batch/single-op resolve
      idempotency on replay + characterization tests (audit findings #2/#3/#4/#5).
- [ ] (Deferred to strangler — session machinery removal) Checkpoint-missing
      detection coupled to a message prefix and untested checkpoint-recovery
      branches + orphaned fixture (#7/#14).
- [ ] (Deferred to strangler — `legacy/` deletion) `payload-store.ts` god-module
      split and `PayloadReference`-defined-3× consolidation (#10/#11).
- [ ] (Deferred to strangler — RunEngine contract) Operation-result schema drift
      between runtime types and `--json-schema` docs (#6).
