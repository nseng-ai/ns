# sdl-flow

This context captures Flow language for lifecycle commands, the `sdl-flow/api` compatibility seam consumed by CCC, and the current boundary between Flow-owned presentation/orchestration and `sdl-land` domain-core extraction.

## Language

**Flow**:
The SDL Capability that owns public lifecycle workflows such as changes, copy, autoslot, autobranch, submit, pull-trunk, regenerate-pr, push, and land.
*Avoid*: CCC source-control helper, Pi workflow package, Graphite wrapper

**Flow Command Face**:
The user- and agent-facing `sdl flow ...` command surface and its Pi mirrors, including CLI parsing, completions, renderer registration, prompts, progress, and human output for Flow workflows.
*Avoid*: land domain core, CCC adapter, `sdl-land` command surface

**Flow Capability API**:
The curated `sdl-flow/api` in-process compatibility surface consumed by downstream packages, especially CCC, so they do not import Flow private source modules.
*Avoid*: package-root import, private `sdl-flow/src/...` import, narrowed land-only API, CCC-owned seam

**Flow Land Compatibility Boundary**:
The current compatibility rule that land consumers continue to enter through **Flow Capability API** while Flow may delegate renderer-independent planning to `sdl-land` internally.
*Avoid*: direct CCC import from `sdl-land`, direct CCC import from Flow land-stack internals, removing existing `sdl-flow/api` exports during migration

**Flow Land Execution**:
The Flow-owned land behavior that still includes command presentation, stack-mode orchestration, prompts, merge execution, Graphite maintenance, and cleanup behavior while land-domain extraction is incomplete.
*Avoid*: fully migrated land capability, pure preflight plan, `sdl-land` CLI behavior

**Flow Stack Preflight Adapter**:
The internal Flow adapter that maps Flow's land-stack gateways and current stack facts into `sdl-land` stack preflight planning, then maps the result back to Flow's existing land-stack shapes.
*Avoid*: public API, CCC integration point, presentation layer

**Flow Submit Boundary**:
The Flow ownership boundary for submit, PR description regeneration, Graphite submit orchestration, and related lifecycle policy; reusable Graphite facts and command mechanics remain below Flow in Graphite/gateway packages.
*Avoid*: neutral Graphite domain, CCC submit owner, `sdl-land` behavior

**Flow Autobranch Boundary**:
The Flow ownership boundary for public `sdl flow autobranch` behavior and the compatibility path consumed by CCC through **Flow Capability API**.
*Avoid*: CCC public command owner, plain branch helper, Graphite primitive

**Flow API Narrowing Candidate**:
An export on **Flow Capability API** that may become redundant after extraction, but must remain until consumers are deliberately migrated with a compatibility plan.
*Avoid*: immediate removal, accidental behavior change, package-root replacement
