# Non-Closing Claim Rebaseline

## Summary

Provenance: objective-refresh basis target=97c24506a709c0f2a925f46bc524fd028f5e168c from=bf5974bdf846fd53a2b22d6462e20b566ebd4a19

Refreshed the active Objective record without closure. The rebaseline verified that the Flow API seam is no longer an open naming question: `ts/packages/capabilities/flow/src/api.ts` exists as `sdl-flow/api`, and CCC runtime paths in `ts/packages/ccc/src/autobranch/flow.ts` and `ts/packages/ccc/src/cli.ts` consume it. CCC runtime compatibility surfaces such as `autoslot`, `land`, `trunk-pull`, and `land-stack/*` now re-export Flow-owned entrypoints from `sdl-flow/*`.

The refresh also verified the transitional state that remains: `sdl-flow/api`, Flow autobranch command code, and CCC autobranch tests still import `@sdl/autobranch/*`; `@sdl/autobranch` still exists and is tiered as `neutral-infra`; `@sdl/core/submit` and `@sdl/graphite/submit` still export submit/PR-description policy; `@sdl/capability-kit` does not yet own the submit-specific `ErrorInfo` / `GatewayResult` / `commandFailure` substrate; kernel module-loader aliases and style-guard graph membership still mention stale submit/autobranch subpaths.

Verified PR evidence remains status-aware, not merged: PR #2341, "Extract Flow orchestration into `ts/packages/capabilities/flow`", is open and non-draft, with recorded checks successful except Graphite mergeability still in progress at refresh time.

## Objective Impact

This corrects the durable Objective prose by moving the `sdl-flow/api` naming/shape question out of Open Questions and into the verified current contract. The roadmap now states the same transitional facts as current ground truth: the CCC seam is designed and runtime-consumed, but autobranch implementation/tests and submit/result substrate moves remain open.

## Follow-Ups

- Move `@sdl/autobranch` implementation and tests into Flow ownership, then remove or reclassify stale package-tier/style-guard/module-loader treatment.
- Move submit/PR-description and Graphite submit policy out of `@sdl/core/submit` and `@sdl/graphite/submit` in separate slices.
- Move capability gateway result/error helpers into `@sdl/capability-kit` without turning Capability Kit into a Flow domain home.
