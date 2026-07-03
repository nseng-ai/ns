# Orientation — Flow Deepening Round 2 / Land Domain Extraction

Direction: Flow land execution migrates onto the Land Domain Core
(`flow/src/land/`, four-gateway `LandContext`); the Flow Land Compatibility
Boundary round trip retires when migration completes.
Getting to: one operation-shaped Graphite command channel, one preflight
crossing (Flow Stack Preflight Adapter), `SubmitGateway` returning domain
results, per-failure catalogs where one failure is one edit site.

What you see now: land execution runs on the Land Domain Core's
`LandContext` gateways and the compatibility round trip is DELETED — the
nine migration slices and the retirement all landed 2026-07-02
(`plan-mapping.ts` gone; no `LandPlanForFlow`, no `preloadedShape` bypass,
no `flow-adapter-failure` collapse). Also done: the operation-shaped
channel (specs own argv; no `runRaw`); `regenerate-pr --force` real
semantics; `SubmitGateway` domain results with per-failure catalogs.
Remaining: only the Parked presentation row (review #5) — an owner
promote/re-scope/drop decision gates closure. Argv gate note:
byte-for-byte applies to mutation commands; read-only fact argv was
relaxed 2026-07-02. Do not recreate mirrors, mappers, or adapter shims at
the boundary the retirement just deleted.
Avoid: adding wrappers, mirror types, or mappers at the compatibility
boundary; consolidating or polishing the round trip (it gets deleted, not
improved); designing tests against a scripted channel adapter — scripted
`pi.exec` is the canonical land test seam.
