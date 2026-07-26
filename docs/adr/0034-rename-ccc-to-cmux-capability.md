# ADR 0034: External-Tool Workflow Ownership Without Accretion

## Status

Accepted

## Context

Product package organized as generic “command and control” accumulated unrelated workflow façades around one real concern: driving external workspace-and-tab tool. Naming broad orchestration layer made residue look like architecture, blurred ownership among product workflows, host presentation, external-tool mechanics.

Current external product is Herdr. `@nseng-ai/herdr` owns coherent user workflows over installed `herdr` CLI; cmux is not current product-extension name or command namespace.

## Decision

Do not create generic command-and-control or orchestration extension. Product extension over external tool must own coherent user workflow, be named for product domain users operate, not become façade for unrelated source-control, landing, slot, or host concerns.

**Herdr extension** owns Herdr-native space and tab operations, composes narrower extension package APIs and infrastructure into prompt, Saved Plan, Objective, Slot, and optional Handoff workflows. Its `HerdrGateway` is extension-owned Consumer Gateway over external `herdr` CLI.

Lower substrate stays separate from product workflow. Generic command execution and Git stay in Neutral Infra; ns-shaped shared external-tool mechanics belong in Extension Kit when they have shared consumers; host registration and presentation stay in host-facing subpackage. Lower substrate must not acquire Herdr workflow policy merely to share adapter.

Do not publish or install first-party binary that shadows external tool's binary. Ns-owned commands stay under `ns` Command Face or host-qualified Pi surface.

Pre-public rename or boundary correction is hard cut: remove old names, exports, namespaces, forwarding shims together. Historical records may retain old CCC and cmux terminology; current package and command claims use Herdr.

## Consequences

- One sentence states product boundary: Herdr drives Herdr spaces and tabs for ns workflows.
- Flow, Slots, Handoffs, Plans, Objectives, host presentation keep their own domain ownership.
- External-tool mechanics and consuming workflow evolve independently, no generic orchestration grab bag.

## Alternatives

- **Generic orchestration layer:** rejected; attracts unrelated façades, obscures domain ownership.
- **Current cmux product extension:** rejected; current product and package are Herdr.
- **Put product workflow in lower substrate or the Pi host:** rejected; adapters and presentation are not domain owners.
- **Shadow the external binary:** rejected; makes invocation ownership ambiguous.
