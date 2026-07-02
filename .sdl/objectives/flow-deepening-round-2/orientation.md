# Orientation — Flow Deepening Round 2 / Land Domain Extraction

Direction: Flow land execution migrates onto the Land Domain Core
(`flow/src/land/`, four-gateway `LandContext`); the Flow Land Compatibility
Boundary round trip retires when migration completes.
Getting to: one operation-shaped Graphite command channel, one preflight
crossing (Flow Stack Preflight Adapter), `SubmitGateway` returning domain
results, per-failure catalogs where one failure is one edit site.

What you see now: land execution runs on the Land Domain Core's
`LandContext` gateways — the extraction migration's nine slices all landed
2026-07-02 (channel-backed Graphite maintenance, gateway squash-merge with
MERGED verification, `snapshotBackupRefs`, `freeSlots`, real facts backend
with real SHAs). Also done: the operation-shaped channel (specs own argv;
no `runRaw`); `regenerate-pr --force` real semantics; `SubmitGateway`
domain results with per-failure catalogs. Remaining: the round-trip
retirement (delete the `LandPlanForFlow` mirror, dual mappers, delegation
adapters, `preloadedShape` bypass; one crossing at the Flow Stack Preflight
Adapter) — argv gate note: byte-for-byte applies to mutation commands;
read-only fact argv was relaxed 2026-07-02.
Avoid: adding wrappers, mirror types, or mappers at the compatibility
boundary; consolidating or polishing the round trip (it gets deleted, not
improved); designing tests against a scripted channel adapter — scripted
`pi.exec` is the canonical land test seam.
