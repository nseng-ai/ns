# Capability Reorganization Added

## Summary

The Objective scope was extended to include a final capability-package reorganization slice after the gateway/service homes are settled. This is intentionally a final cleanup step: align capability package/import layout around the final `@sdl/capability-kit` seams, SDK-provided services, and capability APIs, and remove legacy organization imposed by the old `@sdl/core` doors.

A reference document was added at `references/package-layout-and-core-inventory.md` with the package-layout analysis and current `@sdl/core` inventory. It records the expected end-state roles for the pure utility package, Capability Kit seams, standalone real gateway packages, `sdl-sdk`, `@sdl/kernel`, and capability packages, plus the current categories inside `@sdl/core`.

## Objective Impact

The final roadmap now ends with capability reorganization after the gateway-purity proof. This keeps the Objective from stopping at mechanical door deletion if capability packages still carry import/module structure shaped by the old `@sdl/core` layout.

The added scope is bounded: it permits package/import/layout cleanup for capabilities, but not redesigning capability behavior, command faces, product-domain policy, or the broader transitional-package deletion work owned by the umbrella Objective.

## Follow-Ups

- Use `references/package-layout-and-core-inventory.md` during the final cleanup slice to distinguish package/import layout cleanup from behavior redesign.
- If a future pure-package rename for `@sdl/core` becomes desirable, treat it as a separate post-decomposition decision unless this Objective is explicitly extended again.
