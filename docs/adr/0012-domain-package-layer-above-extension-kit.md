# ADR 0012: Capabilities sit above the Capability Kit; the Presentation Host holds no domain

## Status

Accepted — refines ADR 0009 (Extension Layering and the Extension Dependency Graph). ADR
0009 stands as written; this ADR sharpens its "above the SDK" tier and adds one rule it
only implied. (Terminology note: the substrate ADR 0009 introduced as `@sdl/extension-kit`
/ "Extension Kit" was later renamed to `@sdl/capability-kit` / "Capability Kit"; the name
"Extension Kit" is reserved for a future general all-extensions substrate.)

## Context

ADR 0009 described three layers and placed `@sdl/extension-kit` and the capability
extensions together "above the SDK." In practice "above the SDK" is two distinct
sub-layers, and the boundary between them matters for where domain logic is allowed to
live. Separately, capability domain logic is today stranded in the `@sdl/pi`
**Presentation Host** rather than in its owning capability — for example
`@sdl/pi/objectives` owns the Objective selection/diff/list rules, and `ccc` consumes
them via `@sdl/pi/objectives/selection`. That is CCC depending on the presentation
host for domain, an inversion ADR 0009 did not name explicitly.

## Decision

**The "above the SDK" tier is two sub-layers.** `@sdl/capability-kit` is the thin,
capability-agnostic **Capability Kit** (the `ctx`→gateway adapter + shared result/error
shapes). Above it sit the **Capabilities**: the first-party feature areas, each
implemented as an **Extension** (the technical construct) that depends on the Capability
Kit and holds most domain logic. "Extension" names the construct; "Capability" names a
feature area implemented as one. The name "Extension Kit" is reserved for a future general
substrate for building *all* extensions, third-party included.

**Domain logic lives only in the Capabilities.** The `@sdl/pi` Presentation Host and the
`@sdl/sdl` kernel must not own capability domain. When a downstream **consumer** extension
needs capability domain in-process, it consumes the providing capability's **Capability
API** (`@sdl/<cap>/api`) — it does not reach into the Presentation Host. Capability domain
currently stranded in `@sdl/pi/*` is relocated into its owning capability and re-consumed
through the Capability API; the Presentation Host keeps only UI and runtime registration.

```text
CCC (highest-fan-out consumer)             @sdl/pi  (Presentation Host, off-axis)
         \                                       /
          consume capability domain via @sdl/<cap>/api Capability APIs
          v                                      v
Capabilities  (first-party Extensions, above the Capability Kit)   <- most domain logic
    flow, objective, handoff, slot, branch-context,
    plans, pr-address, roaster, aretro, CCC
    each = Command Face over a gateway-injected Domain Core,
           plus a Capability API where a consumer depends on it in-process
        |  built on
Capability Kit  (@sdl/capability-kit, thin)                  <- ctx->gateway adapter
        |                                                       + shared result/error shapes
SDK  (@sdl/sdl kernel + @sdl/sdl/sdk)
        |
Neutral Infra  (@sdl/core, @sdl/clinkr, @sdl/graphite, @sdl/brmem)
```

## Consequences

- Making `ccc` a clean **consumer** now means removing both `@sdl/sdl/*`
  internal-subpath imports **and** `@sdl/pi/*` domain imports in favor of Capability APIs.
- Phase-2 completion of the `sdl-extension-architecture` Objective requires that no
  capability domain remains in `@sdl/pi`; the Presentation Host consumes capability
  domain through Capability APIs only.
- Each per-capability migration gains a structural test: `@sdl/<cap>` sits among the
  Capabilities (depends on the Capability Kit), owns its Domain Core there, and does not
  scatter domain into `@sdl/pi` or `@sdl/sdl`.
- `@sdl/capability-kit` is held to its thin-substrate role: shared, capability-agnostic
  plumbing only — it is not a second home for domain logic.

## The SDK boundary is permeable over time, gated on generality

The boundary between the above-SDK layers (the Capability Kit + the Capabilities) and the
SDK is deliberately permeable *downward*: over time a domain concept or
primitive may graduate from a capability or from the Capability Kit *into* the SDK — but only
after it proves general worth (repeated across capabilities, broadly applicable, no
longer capability-specific). This is the layering expression of the existing
command-first SDK promotion rule: the default is to keep concepts above the SDK, and
promotion is the evidence-gated exception, not the goal.

The bar is high on purpose. The above-SDK patterns are deliberately opinionated —
gateways foremost — and opinionated patterns are unlikely to earn universal appeal, so
they are expected to stay above the SDK for a long time, probably indefinitely. The SDK
stays thin and general; the opinionated `ctx`→gateway substrate stays in
`@sdl/capability-kit` (consistent with ADR 0009's rejection of freezing gateways into the
SDK contract via `ctx.git`).

## Rejected Alternatives

- **Leave domain in `@sdl/pi` and let `ccc` import it from there.** Keeps the
  orchestrator coupled to the presentation host for domain and blocks deletion of the
  transitional package's role as the last below-SDK domain consumer.
- **Move shared capability domain into `@sdl/capability-kit`.** Re-tangles domain into
  the substrate; the Capability Kit stays capability-agnostic, capabilities own their domain.
