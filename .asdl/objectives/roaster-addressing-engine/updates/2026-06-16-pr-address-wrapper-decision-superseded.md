# pr-address Wrapper Decision Superseded

## Summary

The older decision in this closed Objective to preserve `pr-address` as a lightweight roaster-backed workflow wrapper has been superseded. The current direction is recorded in the active `pr-address-strangler-rewrite` Objective: keep `pr-address` only as a tiny read-only feedback downloader around `download-feedback`, delete the old `pr-address` workflow engine, delete/retire `stack-address`, and rebuild any future addressing workflow from `/pr:download-feedback` and `/pr:download-stack-feedback` rather than from payload sessions or roaster wrapper semantics.

## Objective Impact

This closed Objective remains closed and should not drive `objective-next` recommendations. Its historical wrapper language is provenance, not current implementation guidance. Do not use this record to reintroduce a roaster-owned collector/accounting/closeout architecture or to preserve the old `pr-address` wrapper contract.

## Follow-Ups

Use `pr-address-strangler-rewrite` for the active deletion/rebuild sequence. If a future roaster-based addressing workflow becomes desirable, create a new narrowly scoped Objective instead of reviving this closed roadmap.
