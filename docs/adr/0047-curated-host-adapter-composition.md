# ADR 0047: Curated Host-Adapter Composition

## Status

Accepted

## Context

ADR 0045 separates harness-independent ns extensions from `pi-ns-*` host adapters and requires adapters to consume curated extension APIs. Some genuine host behavior spans two independently owned adapters. The Herdr Pi adapter can create a durable Handoff before opening its Herdr destination, but duplicating the Handoff create protocol would split ownership and importing private adapter source would erase the package boundary.

## Decision

A `pi-ns-*` adapter may depend on another host adapter's declared curated API-kind subpath when the edge represents genuine same-host composition. The provider owns the composed host protocol and exposes the narrow capability required by the consumer. Consumers must not deep-import private implementation, broaden the seam into a package facade, invert domain ownership, or introduce a reverse dependency.

The first application is the optional `@nseng-ai/pi-ns-herdr` dependency on `@nseng-ai/pi-ns-handoffs/create-flow`. Handoffs owns creation, content-derived slugging, persistence ordering, and save-before-launch instructions. Herdr owns its preflight, destination instructions, durable artifact verification, and Herdr tab mutation. Exact absence of the optional adapter is suppressible; transitive, syntax, and module-evaluation failures propagate.

## Consequences

- Adapter-to-adapter edges are exceptional, explicit, curated, and mechanically visible.
- Extension package APIs remain harness-independent.
- Removing the curated create-flow seam would force protocol duplication rather than merely remove a pass-through.
- ADR 0045 remains an immutable record; this ADR clarifies composition that its original decision did not spell out.
