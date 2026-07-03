# Orientation — Flow Deepening Round 2 / Land Domain Extraction

Direction: Flow land execution migrates onto the Land Domain Core
(`flow/src/land/`, four-gateway `LandContext`); the Flow Land Compatibility
Boundary round trip retires when migration completes.
Getting to: one operation-shaped Graphite command channel, one preflight
crossing (Flow Stack Preflight Adapter), `SubmitGateway` returning domain
results, per-failure catalogs where one failure is one edit site.

What you see now: `land-stack/` still orchestrates execution beside `land/`,
crossing the boundary from five modules (see the 2026-07-02 inventory
update), with mirror types and dual mappers in `plan-mapping.ts`. Done as of
2026-07-02: the channel is operation-shaped (specs own argv; no `runRaw`);
`regenerate-pr --force` has real force semantics; `SubmitGateway` returns
domain results with per-failure catalogs (one failure = one edit site).
Remaining: the extraction migration (Policy: direct per slice as of
2026-07-02, deterministic slice gate and settled design decisions on the
roadmap row, slice map in the inventory update) and the round-trip
retirement it unlocks.
Avoid: adding wrappers, mirror types, or mappers at the compatibility
boundary; consolidating or polishing the round trip (it gets deleted, not
improved); designing tests against a scripted channel adapter — scripted
`pi.exec` is the canonical land test seam.
