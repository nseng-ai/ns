# Orientation — Flow Deepening Round 2 / Land Domain Extraction

Direction: Flow land execution migrates onto the Land Domain Core
(`flow/src/land/`, four-gateway `LandContext`); the Flow Land Compatibility
Boundary round trip retires when migration completes.
Getting to: one operation-shaped Graphite command channel, one preflight
crossing (Flow Stack Preflight Adapter), `SubmitGateway` returning domain
results, per-failure catalogs where one failure is one edit site.

What you see now: `land-stack/` still orchestrates execution beside `land/`,
crossing via mirror types and dual mappers in `plan-mapping.ts`; the channel
interface is still argv-shaped; `regenerate-pr --force` is still a no-op.
Avoid: adding wrappers, mirror types, or mappers at the compatibility
boundary; consolidating or polishing the round trip (it gets deleted, not
improved); designing tests against a scripted channel adapter — scripted
`pi.exec` is the canonical land test seam.
