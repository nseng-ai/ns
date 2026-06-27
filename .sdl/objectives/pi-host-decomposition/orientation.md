**Direction: `@sdl/pi` is a thin Presentation Host, not a feature-domain warehouse.**

Getting to: Pi-native standalone tools move into packages stacked on `@sdl/pi`; capability mirrors thin toward owning Capability packages/APIs. See this Objective plus `sdl-extension-architecture` and ADR 0009/0012.

What you see now — mid-decomposition, do not copy: large feature subsystems still live under `ts/packages/hosts/pi/src/`; `context-profiler` has moved to the provisional Pi-tool tier, but the extraction recipe still needs to be recorded.

Avoid: adding new domain/tool logic to the host by default; making `@sdl/pi` depend on extracted Pi-tool packages; treating Handoff/Branch Context/PR/Objective mirrors as standalone Pi tools when their domain belongs in Capabilities.

Active slice: see this objective's roadmap.md.
