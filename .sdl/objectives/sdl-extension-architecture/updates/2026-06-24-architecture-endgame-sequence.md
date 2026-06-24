# Semantic Update: Re-scope to the architecture endgame (ADR 0009)

## Summary

A design session resolved the full end-state extension architecture and recorded it
in `docs/adr/0009-extension-layering-and-peer-dependencies.md` plus new glossary
terms in `ts/packages/sdl/CONTEXT.md`. This Objective is re-scoped from the
(now essentially complete) command-first flow experiment — **Phase 1** — to driving
that end-state to completion — **Phase 2**: the transitional holding-pen package
deleted and all nine user-facing product capabilities modeled as extensions.

### The resolved architecture (ADR 0009)

Three layers:

- **Below the SDK — neutral infra:** `@sdl/core`, `@sdl/clinkr`, `@sdl/graphite`,
  `@sdl/brmem`.
- **The SDK:** the `@sdl/sdl` kernel + `@sdl/sdl/sdk` thin host primitives.
- **Above the SDK — capability extensions:** flow, handoff, objective,
  branch-context, plans, pr-address, slot, roaster, aretro, plus the shared
  `@sdl/extension-kit` substrate.

Key rules:

- `ccc` is itself an orchestrator extension at the apex of a shallow, acyclic
  extension dependency DAG.
- Each capability extension has **two faces**: a **command face** (loaded by the
  kernel) and a **Peer API** (`@sdl/<cap>/api`, consumed in-process by sibling
  extensions, chiefly `ccc`).
- **Gateway-injected peer cores:** domain logic takes injected gateways
  (`GitGateway`), never raw `ctx`; `ctx` lives only in the command shell, which
  converts `ctx`→gateways via `@sdl/extension-kit`. This is what makes domain logic
  unit-testable with `InMemoryGitGateway` — the concern that started the session.
- **Two new packages:** `@sdl/extension-kit` (above-SDK substrate for the
  `ctx`→gateway adapter + shared result/error shapes) and
  `@sdl/domain-primitives-transitional` (below-SDK disposable holding pen for the
  SDK-independent primitives currently tangled in `@sdl/sdl`). The `-transitional`
  suffix is deliberate — it flags the dependency as debt at every import site.
- `internal-migration-export` renamed to **internal workspace export**; dividing
  rule: `ctx`-dependent shared code goes above the SDK in `@sdl/extension-kit`,
  SDK-independent primitives below.
- Standalone tools (`packagechk`, `vibechk`, `areg`) are off this axis; `pi-*` is a
  separate presentation host.

## Objective Impact

- **Thesis/Scope extended.** Command-first flow migration is Phase 1 (complete
  provenance); the endgame is Phase 2.
- **Non-Goals lifted.** The prior parking of capability migration (Objective, Slot,
  Branch Context, Handoff, Roaster, PR Address, CCC) is now the core of Phase 2.
  The SDK-contract guards (no `ctx.git`, no gateway promotion into `@sdl/sdl/sdk`)
  and standalone-tools-off-axis remain.
- **Completion criteria.** Finish line is now: `@sdl/domain-primitives-transitional`
  deleted; nine capabilities are extensions with two faces + gateway-injected cores;
  `ccc` is an orchestrator extension; below-SDK is domain-free.
- **Structure.** Per-capability migrations are **child Objectives**, ordered by
  `ccc`-consumption. This Objective owns the architecture spine (packages,
  conventions, `ccc`, transitional retirement, criteria); flow stays the in-repo
  reference implementation.

## Phase 2 sequence

1. **`@sdl/extension-kit`** — relocate the `ctx`→gateway adapter (`SdlCommandExecApi`)
   and the shared result/error shapes out of flow; flow `cp`/`push`/`submit` consume
   gateways through it. Banks the `InMemoryGitGateway` testability win.
2. **Lock conventions** — Peer API subpath `@sdl/<cap>/api`, gateway-injected-core
   rule, exports-map DAG enforcement.
3. **`@sdl/domain-primitives-transitional`** — extract SDK-independent primitives out
   of `@sdl/sdl`; apply the internal-workspace-export rename; repoint
   `ccc`/`pi-extensions`/flow.
4. **Per-capability child Objectives** — handoff, objective, slot, branch-context,
   plans, pr-address, roaster, aretro; ordered by `ccc`-consumption; flow is the
   reference.
5. **Convert `ccc`** to an orchestrator extension consuming Peer APIs.
6. **Delete `@sdl/domain-primitives-transitional`** — completion marker.

## Follow-Ups

- Open design items inherited from ADR 0009: the exact Peer API subpath mechanics,
  the DAG-enforcement mechanism (exports map / lint), and the sequencing of
  extracting domain logic out of `@sdl/sdl`.
- Spawn the first per-capability child Objective (a `ccc`-consumed capability) when
  Phase 2 step 4 begins.
