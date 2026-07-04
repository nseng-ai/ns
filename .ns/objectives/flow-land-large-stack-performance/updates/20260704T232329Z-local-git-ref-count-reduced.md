# Local git/ref call count reduced

## Summary

Local branch `flow-land-large-stack-performance/gh-pr-view-cache` reuses Flow land's existing repo-discovery local-branch tip inventory during preflight branch presence and local SHA checks. That removes per-landing-branch `show-ref`/`rev-parse` subprocesses before PR fact loading while leaving the merge-time strict PR/head verification and backup/cleanup gates intact.

Measured against the recorded fake-backed large-stack scenarios:

- linear-11 improved from 205 to 183 total external calls, with git calls dropping 97 to 75.
- linear-25 improved from 457 to 407 total external calls, with git calls dropping 209 to 159.

Validation: the runner checkpoint for commit `7128fc2533d49e2f5ff3745cd483d61358c369c8` reports targeted Vitest coverage for Flow land preflight, stack command scenarios, topology guards, and CCC land command tests, plus full `just` passing after fixture updates.

## Objective Impact

Advances the local git/ref subprocess-volume roadmap row with before/after call-count evidence on the same fake-backed baseline shapes. The original baseline remains durable evidence; the scenario assertions now describe the optimized current counts so future slices continue to catch call-volume drift.

## Follow-Ups

- Continue investigating backup ref snapshotting/deletion and post-restack guard reads for additional local git/ref reductions if measurements justify them.
- GitHub/`gh` read-path dedup and Graphite maintenance cost remain separate actionable optimization rows.
