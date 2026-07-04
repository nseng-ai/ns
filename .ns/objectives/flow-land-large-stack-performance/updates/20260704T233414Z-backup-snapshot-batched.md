# Backup snapshot calls batched

## Summary

Local branch `flow-land-large-stack-performance/gh-read-path-dedup` batches pre-land backup snapshotting. Flow land now reads all target branch SHAs with one `for-each-ref` and writes all backup refs from exact object IDs with one local `git fetch`, replacing per-branch `rev-parse`/`update-ref` loops while keeping rotation, stale-ref pruning, backup refs, and failure-before-merge behavior.

Measured against the optimized current fake-backed large-stack scenarios:

- linear-11 improved from 183 to 163 total external calls, with git calls dropping 75 to 55.
- linear-25 improved from 407 to 359 total external calls, with git calls dropping 159 to 111.

Cumulative improvement from the original fake-backed baseline is 205→163 total calls for linear-11 and 457→359 total calls for linear-25. Validation: the runner checkpoint for commit `48183e5572f1749734a629e3247088dd9bec3ca1` reports targeted Vitest coverage for Flow land scenario, adapter, and CCC land command tests, plus final full `just` passing.

## Objective Impact

Further advances the local git/ref subprocess-volume row with before/after evidence on the same fake-backed stack shapes. The local git/ref bottleneck class now has two measured reductions, while remaining opportunities are narrower and can be evaluated against the updated scenario counts.

## Follow-Ups

- Decide whether stale backup deletion and post-restack guard reads still justify more local git/ref work.
- GitHub/`gh` read-path dedup remains unimplemented and is still actionable under the existing fake-backed baseline evidence.
- Graphite maintenance cost remains a separate actionable optimization row.
