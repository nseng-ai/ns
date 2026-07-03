# SDL SDK Cutover and GitHub Gateway Layering

## Summary

PR #2178 evidence / commit `a64bdf4b2` split the SDL author SDK into the dedicated unscoped `sdl-sdk` package and recorded ADR 0016's GitHub gateway layering decision. The Objective's live architecture model now treats `sdl-sdk` as the concrete SDL extension API / current Public author API filler, with `@sdl/sdl` remaining the host/kernel.

## Objective Impact

- PR #2178: Split SDL author SDK into `sdl-sdk` and refactor GitHub gateway layering — hard-cut the author import from `@sdl/sdl/sdk` to `sdl-sdk`, made `sdl-sdk` the distinct SDK-layer package, kept `@sdl/sdl` as host/kernel, split GitHub identity/status mechanics in core, and moved the PR-feedback seam to `@sdl/pr-address/api` while real mechanics remain in `@sdl/core/github-pr-feedback`.
- ADR 0016 revises the Objective's SDK-tier evidence: the SDK tier is now the `@sdl/sdl` host/kernel plus the distinct `sdl-sdk` author package, not a host package subpath.
- The GitHub layering decision de-risks the extension-graph model by rejecting a generic GitHub capability package and preserving the dependency direction `@sdl/pr-address` → `@sdl/core`, never the reverse.

## Follow-Ups

- Keep package-local `sdl-sdk` tests so the SDK package owns direct public-surface coverage alongside the host-owned jiti virtual-module mirror tests.
- Continue Phase 2 work only through its existing roadmap and child Objective boundaries; this cutover does not close the whole Objective while non-parked Phase 2 work remains.
