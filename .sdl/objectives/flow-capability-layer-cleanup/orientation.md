**Direction: Flow workflow domain moves up; Capability Kit holds only shared capability substrate.**

Getting to: submit/PR-description/Graphite-submit/autobranch policy lives in the Flow Capability; CCC consumes checkpoint/autobranch behavior through `sdl-flow/api` and other curated Flow API subpaths; shared gateway result/error shapes and `SdlExtensionApi`→gateway adapter patterns live in `@sdl/capability-kit` (ADR 0009/0012/0016).

What you see now — legacy, do not copy: Flow submit policy exported from `@sdl/core/submit` and `@sdl/graphite/submit`; `sdl-flow/api` exists but delegates to `@sdl/autobranch/*`; autobranch is still declared as neutral infra; capability gateway result shapes still leak through neutral/submit-specific modules.

Avoid: moving all gateways into Capability Kit; adding new domain logic below the SDK; adding new direct CCC imports of Flow internals or `@sdl/autobranch/*`; treating transitional CCC re-exports as the long-term API; treating GitHub/Graphite protocol mechanics as Flow policy without evidence.

Active slice: see this objective's roadmap.md.
