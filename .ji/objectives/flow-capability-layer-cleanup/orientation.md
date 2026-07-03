**Direction: Flow workflow domain moves up; Capability Kit holds only shared capability substrate.**

Getting to: submit/PR-description/Graphite-submit/autobranch policy lives in the Flow Capability; CCC consumes checkpoint/autobranch behavior through `sdl-flow/api` and other curated Flow API subpaths; shared gateway result/error shapes and `SdlExtensionApi`→gateway adapter patterns live in `@sdl/capability-kit` (ADR 0009/0012/0016).

What you see now — cleanup tail: submit/PR-description/Graphite-submit/autobranch policy has moved into Flow, and capability gateway result substrate has moved into `@sdl/capability-kit`; remaining work is final package-tier/import-guard/docs/context rebaseline.

Avoid: moving all gateways into Capability Kit; adding new domain logic below the SDK; adding new direct CCC imports of Flow internals or `@sdl/autobranch/*`; treating transitional CCC re-exports as the long-term API; treating GitHub/Graphite protocol mechanics as Flow policy without evidence.

Active slice: see this objective's roadmap.md.
