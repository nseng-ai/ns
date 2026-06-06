# Closed handoff list duplication gap

## Summary

The `/handoff:list` deduplication gap is closed. Live Pi handoff code now invokes the dedicated `handoff list --branch/--all --format json` CLI and keeps the TypeScript side to argument parsing, JSON normalization, preview reads, and card rendering. The parser accepts the `handoffs` array shape emitted by the handoff CLI while retaining legacy `entries` support as compatibility handling, not as the primary listing path.

Evidence: `ts/packages/pi-extensions/src/handoff.ts` builds `handoff list --branch <branch> --format json` or `handoff list --all --format json`; `ts/packages/pi-extensions/test/handoff.test.ts` asserts those calls for `/handoff:list`; `handoff list --help` exposes `--include-deleted`; targeted `bun test test/handoff.test.ts` passed for the Pi handoff extension.

## Objective Impact

The Objective no longer has an orphan `/handoff:list` dedup row. `roadmap.md` marks the handoff-list row complete, and `parity-table.md` moves `/handoff:list` to FULL alongside `/handoff:create` and `/handoff:pickup`. While refreshing that section, the table also updates the handoff skill names and singular `handoff` Branch Memory namespace to match the current handoff skill family.

This is another concrete parity-table-rot example: the implementation was already migrated, but durable tracking still showed it as PARTIAL. The parity-review skill remains the next important control to catch stale rows systematically.

## Follow-Ups

- Continue with the durable parity-review skill so future full-sweep runs catch both removed surfaces and rows whose implementation status changed before the table was refreshed.
- Continue the remaining orphan rows: `land-stack`, cmux dispatch/open-branch, `autobranch`, `/code:land`, and `/code:changes`.
