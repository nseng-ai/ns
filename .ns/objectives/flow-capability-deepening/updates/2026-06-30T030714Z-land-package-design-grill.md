# Land Package Design Grill

## Summary

A design grill resolved the next direction for extracting Flow land behavior into a standalone domain-core package while preserving Flow's current user-facing command/API compatibility.

Decisions:

- Treat “the land package” as a new standalone workspace package under `ts/packages/capabilities/land`, rather than only an internal `src/land/` module. The package should remain land/Flow domain policy, not neutral infrastructure.
- Scope the first package as a domain core only: it owns landing orchestration vocabulary, request/outcome types, and land-specific gateway contracts/fakes; `sdl-flow` keeps command registration, CLI/Pi presentation, and compatibility adaptation.
- Initial public surface should be a narrow operation plus types/gateways: an `executeLanding(...)`-style runtime operation, `LandingRequest`, `LandingOutcome`, failure/result types, and gateway interfaces/fakes for tests. Do not export CLI parsing, completions, presentation helpers, or broad compatibility helpers from the new package.
- Model both stack landing and isolated single-PR landing in the request/outcome vocabulary, but migrate stack landing first. Leave the isolated fast-path implementation in Flow until the stack seam is proven.
- Use focused domain gateways for the fake-driven seam: Git, Graphite, GitHub pull request, and worktree/slot-facing contracts, with presentation/command-stream handling outside the domain core.
- Apply ADR 0019/0020 placement guidance by keeping `sdl-land` as a capability-domain package, not a generic Gateway Backend. It may own land-specific gateway contracts; real external-tool gateway implementations remain in existing backend packages or Flow edge adapters.
- Move pre-merge planning/preflight first: clean repo, topology/PR basics, worktree conflicts, submit/restack requirements, and dry-run plan/outcome calculation. Leave the mutation-heavy merge loop and branch deletion/restack execution in Flow until the seam is proven.
- Keep CCC on `sdl-flow/api` during the first extraction. Flow should adapt to `sdl-land` internally, and later API/export rebaseline work can narrow or deprecate current land leaks.
- `sdl-land` outcomes should be structured domain data, not rendered prose: phases, selected plan/chunks, warnings, refusal/failure codes, landed/remaining branches, and recovery facts. Flow remains responsible for messages, command-stream rendering, and result blocks.

## Objective Impact

This sharpens the open roadmap rows “Decompose Flow land command shells from land-stack domain orchestration” and “Introduce a fake-driven land-stack domain seam.” It changes the near-term implementation target from an internal-only `src/land/` boundary to a standalone `ts/packages/capabilities/land` domain-core package, while preserving the Objective's constraints that Flow owns land policy, `sdl-flow/api` stays narrow, CCC does not import Flow private internals, and durable `refs/ccc/...` compatibility is not renamed as part of this work.

The first implementation slice should create the package skeleton and move only enough pre-merge/preflight behavior behind fake-driven gateways to prove the seam. It should not broaden `sdl-flow/api`, migrate CCC directly to the new package, change public command names, or move real Git/Graphite/GitHub backend ownership into `sdl-land`.

## Follow-Ups

- Update `roadmap.md` guidance for the decomposition/fake-driven seam rows so future agents see `ts/packages/capabilities/land` as the chosen first package boundary.
- Plan or execute the first implementation slice: package skeleton, typed request/outcome/gateway contracts, Flow adapter path, and a fake-driven preflight test migrated from current land-stack command-scenario coverage.
- Revisit isolated single-PR fast-path unification only after the stack preflight seam is stable.
- Reserve `sdl-flow/api` narrowing for the final API/export cleanliness rebaseline or a dedicated compatibility slice.
