**Direction: `@sdl/pi` is a thin Presentation Host, not a feature-domain warehouse.**

Getting to: Pi-native standalone tools move into packages stacked on `@sdl/pi`; capability mirrors thin toward owning Capability packages/APIs. See this Objective plus `sdl-extension-architecture` and ADR 0009/0012.

What you see now — late decomposition, do not copy: Pi-native tools have moved to `ts/packages/pi-tools/`; runner runtime helpers and terminal helpers intentionally remain neutral `@sdl/pi/...` surfaces; Handoff, Branch Context + Plans, and Objective mirrors are thin shells over Capability APIs, while PR feedback remains accepted Pi presentation residue around `pr-address`.

Avoid: adding new domain/tool logic to the host by default; making `@sdl/pi` depend on extracted Pi-tool packages; moving neutral runner/terminal helper residue into feature packages without new acyclic evidence; treating Handoff/Branch Context/PR/Objective mirrors as standalone Pi tools when their domain belongs in Capabilities.

Active slice: see this objective's roadmap.md.
