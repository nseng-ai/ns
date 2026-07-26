# ADR 0034: External-Tool Workflow Ownership Without Accretion

## Status

Accepted

## Context

A product package organized as generic “command and control” had accumulated unrelated workflow façades around one real concern: driving an external workspace-and-tab tool. Naming a broad orchestration layer made residue look like architecture and blurred ownership among product workflows, host presentation, and external-tool mechanics.

The current external product is Herdr. `@nseng-ai/herdr` owns coherent user workflows over the installed `herdr` CLI; cmux is not a current product-extension name or command namespace.

## Decision

Do not create a generic command-and-control or orchestration extension. A product extension over an external tool must own a coherent user workflow and be named for the product domain users operate, not become a façade for unrelated source-control, landing, slot, or host concerns.

The **Herdr extension** owns Herdr-native space and tab operations and composes narrower extension package APIs and infrastructure into prompt, Saved Plan, Objective, Slot, and optional Handoff workflows. Its `HerdrGateway` is an extension-owned Consumer Gateway over the external `herdr` CLI.

Lower substrate remains separate from the product workflow. Generic command execution and Git stay in Neutral Infra; ns-shaped shared external-tool mechanics belong in the Extension Kit when they have shared consumers; host registration and presentation stay in the host-facing subpackage. Lower substrate must not acquire Herdr workflow policy merely to share an adapter.

Do not publish or install a first-party binary that shadows the external tool's binary. Ns-owned commands remain under the `ns` Command Face or host-qualified Pi surface.

A pre-public rename or boundary correction is a hard cut: remove old names, exports, namespaces, and forwarding shims together. Historical records may retain old CCC and cmux terminology, but current package and command claims use Herdr.

## Consequences

- One sentence can state the product boundary: Herdr drives Herdr spaces and tabs for ns workflows.
- Flow, Slots, Handoffs, Plans, Objectives, and host presentation retain their own domain ownership.
- External-tool mechanics and the consuming workflow can evolve independently without a generic orchestration grab bag.

## Alternatives

- **Generic orchestration layer:** rejected because it attracts unrelated façades and obscures domain ownership.
- **Current cmux product extension:** rejected because the current product and package are Herdr.
- **Put product workflow in lower substrate or the Pi host:** rejected because adapters and presentation are not domain owners.
- **Shadow the external binary:** rejected because it makes invocation ownership ambiguous.
