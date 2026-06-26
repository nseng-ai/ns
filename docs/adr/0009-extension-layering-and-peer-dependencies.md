# ADR 0009: Extension Layering and the Extension Dependency Graph

## Status

Accepted

## Context

SDL is moving its domain capabilities to live *above* the thin SDL extension API
(`sdl-sdk`). Today much of that domain logic is tangled inside the `@sdl/sdl`
kernel package and shared through internal subpaths consumed by `ccc`, `flow`, and
`pi-extensions`. The kernel glossary says the kernel "should not own repository
workflow policy," so this tangling is a known misplacement.

Two questions had to be answered before extracting anything: what the end-state
layering is, and how one extension is allowed to depend on another. The motivating
concern was testability — flow's command logic was tested by scripting raw `git`
argv strings against a faked `ctx.exec`, which is brittle and couples tests to
command syntax rather than behavior.

## Decision

**Three layers.**

- **Below the SDK — neutral infra (never domain):** `@sdl/core` (git/exec
  gateways), `@sdl/clinkr` (command framework), `@sdl/graphite` (gt adapters),
  `@sdl/brmem` (Branch Memory storage primitive).
- **The SDK:** the SDL kernel (`@sdl/sdl`) plus the `sdl-sdk` package as the SDK layer,
  a thin SDL extension API of host primitives (`exec`, `env`, `textGenerator`,
  `confirm`, IO streams).
- **Above the SDK — capability extensions:** flow, handoff, objective,
  branch-context, plans, pr-address, slot, roaster, aretro.

`packagechk`, `vibechk`, and `areg` are standalone tools off this axis. In
particular, `packagechk` is scoped to public package-registry state and package-name
claiming; it is not a home for workspace import-boundary checks, extension dependency
DAG enforcement, or local package export-map policy. The `pi-*` packages are a separate
presentation host, not capability extensions.

**`ccc` is the highest-fan-out consumer** in the **Extension Dependency Graph** — it
depends on many provider capabilities. The graph is shallow and **must stay acyclic**;
capabilities are mostly leaves (providers). `ccc` holds no privileged tier.

**Each capability has two faces.**

- Its kernel-loaded commands — `defineExtension()` command contributions, loaded by
  the kernel for CLI/Pi surfaces.
- **Capability API** — a curated, typed programmatic export imported in-process by
  a downstream **consumer** extension (chiefly `ccc`) through the required `@sdl/<cap>/api`
  subpath convention. Consumers depend on that curated subpath only, never on
  internals.

Dependency edges (consumer→provider) are ordinary package edges in the module graph; the
**kernel loader is unaware of them** and still loads each command face independently.
Package roots and command faces are not consumer-facing domain APIs unless their package
documentation separately says so: the kernel loads command faces, while consumer
extensions import Capability APIs in-process.

**Capability cores are gateway-injected.** Capability domain logic and its Capability API
take injected gateways (`GitGateway`, etc.), never raw `SdlExtensionApi`. `ctx` lives
only in the outermost command shell, which converts `ctx`→gateways at the edge and
then calls the same gateway-injected core the Capability API exposes. `ccc` builds
gateways the same way and calls provider cores.

**Two new packages.**

- `@sdl/capability-kit` — the shared **Capability Kit** (above-SDK substrate). Owns
  cross-cutting, capability-agnostic code: the `ctx`→gateway adapter (today's
  `SdlCommandExecApi`) and shared result/error shapes. Capability-specific logic
  stays in each capability behind its Capability API. (Renamed from `@sdl/extension-kit`;
  the name "Extension Kit" is reserved for a future general all-extensions substrate.)
- `@sdl/domain-primitives-transitional` — the **transitional below-SDK
  domain-primitives package**. Holds the SDK-independent domain primitives currently
  tangled in `@sdl/sdl` (pending-worktree, checkpoint-flow). Explicitly disposable:
  it shrinks to zero once every capability is an above-SDK extension and
  `ccc`/`pi-extensions` consume Capability APIs instead of `@sdl/sdl/*` internal subpaths.
  The `-transitional` suffix is deliberate — it flags the dependency as debt at every
  import site rather than relying on docs to convey disposability.

**Rename `internal-migration-export` to `internal workspace export`.** The dividing
rule between sharing mechanisms is SDK-dependence: `ctx`-dependent shared code
belongs above the SDK in the substrate; SDK-independent primitives stay below.

## Consequences

- Gateway-injected capability cores are unit-testable with `InMemoryGitGateway` — no real
  git subprocess and no argv-string scripting. This is the original motivation,
  resolved structurally rather than per-test.
- Each capability must deliberately design its Capability API at `@sdl/<cap>/api`.
  Depending on a provider's guts is banned — the same boundary discipline as the SDK,
  one layer up.
- Migration is incremental and the lower domain-primitives package is disposable; in
  the end-state no permanent below-SDK consumer of domain logic remains.
- Lightweight enforcement is part of the convention lock: package `exports` maps
  define curated subpaths, and `just ts-guard` rejects capability-to-capability
  private/deep imports such as `@sdl/<cap>/src/...`, `@sdl/<cap>/internal...`, and
  undeclared capability subpaths.
- **The Extension Dependency Graph must stay acyclic.** A cycle between extensions is
  debt, not design. The known current violation is the `@sdl/pi` ↔ `@sdl/ccc` cycle
  (the `@sdl/pi` runtime host delegating orchestration to `ccc` while `ccc` imports host
  domain); breaking it is tracked by the `sdl-extension-architecture` Objective. Full
  topological cycle analysis in `just ts-guard` enforces this invariant as migrations
  create concrete consumer→provider edges.
- Open follow-up, not decided here: the sequencing of extracting domain logic out
  of `@sdl/sdl`.

## Rejected Alternatives

- **Expose gateways at the SDK level (`ctx.git`):** gateways are derivable from
  `exec`, not host capabilities; this would freeze the gateway shape into the SDK
  contract and has no natural stopping point (git, then graphite, github, fs…).
- **`ccc` as a below-the-line consumer reaching into capability internals:** makes every
  capability's internals `ccc`'s coupling surface and leaves a permanent below-SDK
  domain consumer.
- **Pass `ctx` to Capability APIs (B1):** re-creates the argv-scripting test problem one
  layer up.
- **A permanent lower domain-primitives package:** unnecessary once `ccc` is an
  above-SDK extension — nothing below the SDK then needs domain logic.
- **CLI/process-boundary dependency edges:** would force `ccc` to parse provider
  human-facing output for machine decisions, which the repo bans.
