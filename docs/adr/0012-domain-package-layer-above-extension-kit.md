# ADR 0012: The Domain-Package Layer sits above extension-kit; the Presentation Host holds no domain

## Status

Accepted — refines ADR 0009 (Extension Layering and Peer Dependencies). ADR 0009 stands
as written; this ADR sharpens its "above the SDK" tier and adds one rule it only implied.

## Context

ADR 0009 described three layers and placed `@sdl/extension-kit` and the capability
extensions together "above the SDK." In practice "above the SDK" is two distinct
sub-layers, and the boundary between them matters for where domain logic is allowed to
live. Separately, capability domain logic is today stranded in the `@sdl/pi`
**Presentation Host** rather than in its owning capability — for example
`@sdl/pi/objectives` owns the Objective selection/diff/list rules, and `ccc` consumes
them via `@sdl/pi/objectives/selection`. That is the orchestrator depending on the
presentation host for domain, an inversion ADR 0009 did not name explicitly.

## Decision

**The "above the SDK" tier is two sub-layers.** `@sdl/extension-kit` is a thin,
capability-agnostic **Above-SDK Substrate** (the `ctx`→gateway adapter + shared
result/error shapes). Above it sits the **Domain-Package Layer**: the capability
packages that depend on extension-kit and hold most domain logic.

**Domain logic lives only in the Domain-Package Layer.** The `@sdl/pi` Presentation
Host and the `@sdl/sdl` kernel must not own capability domain. When a sibling needs
capability domain in-process, it consumes that capability's Peer API
(`@sdl/<cap>/api`) — it does not reach into the Presentation Host. Capability domain
currently stranded in `@sdl/pi/*` is relocated into its owning Capability Package and
re-consumed through the Peer API; the Presentation Host keeps only UI and runtime
registration.

```text
ccc (Orchestrator Extension, apex)        @sdl/pi (Presentation Host, off-axis)
                 \                                   /
                  \         consume via @sdl/<cap>/api Peer APIs
                   v                               v
+-----------------------------------------------------------+
|  DOMAIN-PACKAGE LAYER  (above extension-kit)              |  <- most domain logic
|  @sdl/objective, @sdl/handoff, @sdl/slot,                 |
|  @sdl/branch-context, @sdl/plans, @sdl/pr-address, ...    |
|  each: Domain Core + Peer API (@sdl/<cap>/api) + thin     |
|  Command Face                                            |
+-----------------------------------------------------------+
                           | depends on
+-----------------------------------------------------------+
|  @sdl/extension-kit  (Above-SDK Substrate, stays thin)    |  <- ctx->gateway adapter
|                                                          |     + shared result/error shapes
+-----------------------------------------------------------+
                           |
@sdl/sdl kernel + @sdl/sdl/sdk   (the SDK)
                           |
Neutral Infra: @sdl/core, @sdl/clinkr, @sdl/graphite, @sdl/brmem
```

## Consequences

- "Convert `ccc` to an orchestrator extension" now means removing both `@sdl/sdl/*`
  internal-subpath imports **and** `@sdl/pi/*` domain imports in favor of Peer APIs.
- Phase-2 completion of the `sdl-extension-architecture` Objective requires that no
  capability domain remains in `@sdl/pi`; the Presentation Host consumes capability
  domain through Peer APIs only.
- Each per-capability migration gains a structural test: `@sdl/<cap>` sits in the
  Domain-Package Layer (depends on `@sdl/extension-kit`), owns its Domain Core there,
  and does not scatter domain into `@sdl/pi` or `@sdl/sdl`.
- `@sdl/extension-kit` is held to its thin-substrate role: shared, capability-agnostic
  plumbing only — it is not a second home for domain logic.

## The SDK boundary is permeable over time, gated on generality

The boundary between the above-SDK layers (Above-SDK Substrate + Domain-Package Layer)
and the SDK is deliberately permeable *downward*: over time a domain concept or
primitive may graduate from a capability or from extension-kit *into* the SDK — but only
after it proves general worth (repeated across capabilities, broadly applicable, no
longer capability-specific). This is the layering expression of the existing
command-first SDK promotion rule: the default is to keep concepts above the SDK, and
promotion is the evidence-gated exception, not the goal.

The bar is high on purpose. The above-SDK patterns are deliberately opinionated —
gateways foremost — and opinionated patterns are unlikely to earn universal appeal, so
they are expected to stay above the SDK for a long time, probably indefinitely. The SDK
stays thin and general; the opinionated `ctx`→gateway substrate stays in
`@sdl/extension-kit` (consistent with ADR 0009's rejection of freezing gateways into the
SDK contract via `ctx.git`).

## Rejected Alternatives

- **Leave domain in `@sdl/pi` and let `ccc` import it from there.** Keeps the
  orchestrator coupled to the presentation host for domain and blocks deletion of the
  transitional package's role as the last below-SDK domain consumer.
- **Move shared capability domain into `@sdl/extension-kit`.** Re-tangles domain into
  the substrate; extension-kit stays capability-agnostic, capabilities own their domain.
