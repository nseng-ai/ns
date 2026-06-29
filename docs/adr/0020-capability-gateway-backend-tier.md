# ADR 0020: Capability Gateway Backend tier, the floor of the capability layer

## Status

Accepted — refines ADR 0017 (declared package tiers) and ADR 0018 (four-bucket classification), and
**revises** ADR 0019's placement of the gateway *interface* in the kit (see Decision).

## Context

ADR 0018 classified each lower-level module into four buckets; ADR 0019 added the
`kit-interface-standalone-real` outcome: a **Kit Gateway**'s interface and fake live at
`@sdl/capability-kit/<domain>`, while a heavy real implementation lives in its own standalone package
(`@sdl/git`'s `RealGitGateway`, standalone `@sdl/graphite`, `@sdl/cmux`). Those standalone packages
are still declared `sdl.tier: neutral-infra`.

That single tier conflates a *role* (non-domain shared infra) with a *position* (the pure floor below
the SDK). A standalone real gateway is not a Pure Utility — it owns real-world I/O — and it is not
neutral: it is a first-party citizen of the **capability layer** (the SDL extension stack of
Capability Kit + Capabilities built on the SDK). It deserves its own tier inside that layer.

The intended position is **the floor of the capability layer**: below the **Capability Kit** and
above the SDK. A gateway backend is foundational, and the kit should *wrap* it (`kit → backend`), the
way a substrate sits above the real implementations it adapts. But ADR 0019 put the gateway
*interface* in the kit, so the backend must depend *up* on the kit to implement it
(`@sdl/git → @sdl/capability-kit/git`) — which forces the backend *above* the kit, the opposite of
where it belongs. That up-edge is the obstacle.

## Decision

Name the tier **Capability Gateway Backend** (declared id `capability-gateway-backend`): the
standalone package that owns the heavy real implementation of a Kit Gateway seam. It is the floor of
the capability layer — **below the Capability Kit and above the SDK**, a first-party citizen, not
Neutral Infra. The name joins the existing `Capability *` family (Capability Kit, Capability API,
Capability Pi). A Capability Gateway Backend depends *down* only — on the gateway contract and Neutral
Infra — and never up on the kit; the kit wraps it.

To make that true, the gateway **contract** (the interface + the result/error types a consumer needs)
moves *out of* `@sdl/capability-kit/<domain>` to **at or below the backend** — either owned by the
backend package itself (`@sdl/git` owns `GitGateway` alongside `RealGitGateway`) or, when the contract
is pure interface types with no I/O, in Neutral Infra. The kit keeps the **fake** and the
`ctx`→gateway **adapter**, and depends down on the contract (and, where it wires a real gateway, on the
backend). This **revises ADR 0019**, which co-located the interface + fake in the kit; the fake stays,
the interface descends.

`@sdl/git`, `@sdl/graphite`, and `@sdl/cmux` are Capability Gateway Backends. `@sdl/brmem` is **not** —
it remains the ADR 0018 SDK-provided-service exception, parked for a separate follow-up. **Neutral
Infra** is hereby pure-floor-only.

This ADR records the classification, direction, and vocabulary. The code relocation (move the contract
down, repoint the fake/adapter, declare `sdl.tier: capability-gateway-backend`, update the TypeScript
style guard so a backend points down and `neutral-infra` stays pure) is a follow-up slice under the
neutral-infra-gateway-consolidation Objective.

## Considered Options

- **Capability Gateway Backend tier below the kit, contract relocated down (chosen).** Puts the backend
  where it belongs (the capability-layer floor), lets the kit wrap it, and makes every gateway edge
  point down. Costs a revision of ADR 0019's interface placement.
- **A tier above the kit (keep the interface in the kit).** Rejected: it removes the false
  "neutral-infra → kit" violation but leaves the backend depending up on the kit, contradicting the
  goal that backends are the foundation of the capability layer. (This was an earlier draft.)
- **A neutral, non-capability name (e.g. "Gateway Backend").** Rejected: these gateways are first-party
  capability-layer citizens, not neutral infrastructure; the name should say so and match the
  `Capability *` family.
- **Widen the `neutral-infra` policy to allow Kit Gateway seam imports.** Rejected: silences the guard
  but keeps role and position conflated under one tier.

## Consequences

- Each gateway domain becomes: contract (at/below the backend) ← real impl
  (`capability-gateway-backend`) ← wrapped by the kit (fake + `ctx` adapter). Edges point down; the
  kit's fan-in is unchanged.
- The relocation is uneven per package: `@sdl/git → capability-kit` and `@sdl/brmem → capability-kit`
  are `import type` only (a `devDependency` move erases the runtime edge once the contract descends),
  while `@sdl/graphite` imports the value `readLocalBranchRefs` from the kit's git seam, which must move
  into `@sdl/git`. `@sdl/cmux` has no kit edge.
- `@sdl/brmem` stays parked debt until its SDK-provided follow-up.
- The genuine inversions `@sdl/kernel → @sdl/slot` (SDK → capability) and `@sdl/ccc → @sdl/pi`
  (capability → host) are unaffected and remain real.
