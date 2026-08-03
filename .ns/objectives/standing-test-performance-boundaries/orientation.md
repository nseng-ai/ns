**Direction: default tests stay fast, deterministic, fake-driven, and safe under shared caches; real adapters/runtime loading use the explicit integration lane, while irreducibly ambient contracts use the isolated lane.**

Getting to: classify each boundary independently, preserve application behavior with injected seams and fakes, retain focused real smokes, verify lane discovery after restructures, and measure before claiming speedups.

What you see now: default shared-cache, integration, isolated, sanity, and style-guard lanes exist. Default `just` / `just check` runs core validation plus sanity as a separate isolated invocation; opt-in `just ci` additionally runs integration and the style guard, while isolated remains explicit. Package-test shared-cache guards are enforced, but review-tool coverage and a filesystem structural guard for misplaced specialized directories remain open questions.

Avoid: real Git/subprocess/sqlite/network/sleeps in shared-cache default tests; per-case real-loader fan-out for localized logic; moving tests without equivalent confidence; treating isolation as integration; assuming plain `just` runs integration, isolated, or the style guard; stale pre-incubator or pre-SDK-registry paths.

Active slice: choose a fresh evidenced leak, or resolve one of the two explicit guard-scope questions in the roadmap.
