# brmem cutover lessons fed into umbrella playbook

## Summary

`brmem` is now the second TS-default capability after `pr-address`. This update promotes the completed Branch Memory cutover lessons into the umbrella migration ledger, roadmap, and porting playbook.

Reusable lessons added to the playbook:

- For git-backed state capabilities, durable storage contracts outrank Python module shapes: `refs/brmem/base|ns/...` Snapshot Refs, branch `/` to `---` encoding, Entry Locator shape, Entry Key and Namespace rules, content limits, exit codes, and JSON envelopes are the contracts to preserve.
- When storage interoperability is the central risk, prove storage/gateway parity first, then expand operations on the proven seam.
- Keep ref/blob/tree plumbing package-local until a second consumer proves the seam; centralize only repeated CLI-backed helper needs such as shell-out command handling and machine-envelope parsing.
- Temporary cross-language parity probes are valid migration evidence and can be deleted once TypeScript is default and the Python reference is deleted.
- A private deleted package can use an explicit in-repo pre-deletion commit as rollback/reference evidence; `brmem` records `44c3e9992b424c4b174ccaeb9f4567bb8f611dc1` for that purpose.
- `brmem` accepted the `just install-brmem` / `install-tools` run-from-source TypeScript shim because actual consumers did not require npm publishing or checkout-free bundling.

## Objective Impact

The umbrella migration ledger now marks Branch Memory / `brmem` as TS-default and records the completed second cutover evidence: standalone `ts/packages/brmem` library and CLI, public TypeScript shim, deletion of tracked `packages/brmem` active paths, in-repo rollback/reference commit, and parked native-library consumer migration.

The umbrella roadmap remains open for the broader migration. It now records `brmem` completion evidence under the still-open row for repeating the capability subobjective pattern until all active first-party user-facing capabilities are TS-default.

## Follow-Ups

- Keep direct native-library consumer migration parked until a future Objective selects it.
- Route any second-consumer-proven git ref/blob/tree gateway extraction to `ts-cli-foundation`; do not extract solely from `brmem` evidence.
- Proceed next toward `handoff` per the planned capability order unless new evidence changes the sequence.
