# ADR 0009: Extension Layering and Peer Dependencies

## Status

Accepted

## Context

SDL is moving its domain capabilities to live *above* the thin SDL extension API
(`@sdl/sdl/sdk`). Today much of that domain logic is tangled inside the `@sdl/sdl`
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
- **The SDK:** the `@sdl/sdl` kernel plus `@sdl/sdl/sdk`, a thin host-primitives
  extension API (`exec`, `env`, `textGenerator`, `confirm`, IO streams).
- **Above the SDK — capability extensions:** flow, handoff, objective,
  branch-context, plans, pr-address, slot, roaster, aretro.

`packagechk`, `vibechk`, and `areg` are standalone tools off this axis. In
particular, `packagechk` is scoped to public package-registry state and package-name
claiming; it is not a home for workspace import-boundary checks, extension dependency
DAG enforcement, or local package export-map policy. The `pi-*` packages are a separate
presentation host, not capability extensions.

**`ccc` is itself an orchestrator extension** that depends on peer capability
extensions. It sits at the apex of a shallow, acyclic extension dependency graph;
capabilities are mostly leaves.

**Each capability extension has two faces.**

- **Command face** — `defineExtension()` command contributions, loaded by the
  kernel for CLI/Pi surfaces.
- **Peer API** — a curated, typed programmatic export consumed in-process by
  sibling extensions (chiefly `ccc`) through the required `@sdl/<cap>/api`
  subpath convention. Siblings depend on that curated peer subpath only, never on
  internals.

Peer dependencies are ordinary package edges in the module graph; the **kernel
loader is unaware of them** and still loads each command face independently.
Package roots and command faces are not sibling domain APIs unless their package
documentation separately says so: the kernel loads command faces, while sibling
extensions import Peer APIs in-process.

**Peer cores are gateway-injected.** Capability domain logic and its Peer API take
injected gateways (`GitGateway`, etc.), never raw `SdlExtensionApi`. `ctx` lives
only in the outermost command shell, which converts `ctx`→gateways at the edge and
then calls the same gateway-injected core the Peer API exposes. `ccc` builds
gateways the same way and calls peer cores.

**Two new packages.**

- `@sdl/extension-kit` — the shared **above-SDK extension substrate**. Owns
  cross-cutting, capability-agnostic code: the `ctx`→gateway adapter (today's
  `SdlCommandExecApi`) and shared result/error shapes. Capability-specific logic
  stays in each capability behind its Peer API.
- `@sdl/domain-primitives-transitional` — the **transitional below-SDK
  domain-primitives package**. Holds the SDK-independent domain primitives currently
  tangled in `@sdl/sdl` (pending-worktree, checkpoint-flow). Explicitly disposable:
  it shrinks to zero once every capability is an above-SDK extension and
  `ccc`/`pi-extensions` consume Peer APIs instead of `@sdl/sdl/*` internal subpaths.
  The `-transitional` suffix is deliberate — it flags the dependency as debt at every
  import site rather than relying on docs to convey disposability.

**Rename `internal-migration-export` to `internal workspace export`.** The dividing
rule between sharing mechanisms is SDK-dependence: `ctx`-dependent shared code
belongs above the SDK in the substrate; SDK-independent primitives stay below.

## Consequences

- Gateway-injected peer cores are unit-testable with `InMemoryGitGateway` — no real
  git subprocess and no argv-string scripting. This is the original motivation,
  resolved structurally rather than per-test.
- Each capability must deliberately design its Peer API at `@sdl/<cap>/api`.
  Depending on a peer's guts is banned — the same boundary discipline as the SDK,
  one layer up.
- Migration is incremental and the lower domain-primitives package is disposable; in
  the end-state no permanent below-SDK consumer of domain logic remains.
- Lightweight enforcement is part of the convention lock: package `exports` maps
  define curated subpaths, and `just ts-guard` rejects capability-to-capability
  private/deep imports such as `@sdl/<cap>/src/...`, `@sdl/<cap>/internal...`, and
  undeclared capability subpaths. Full topological DAG/cycle analysis can be
  strengthened later when migrations create concrete peer edges; this ADR only
  requires the lightweight boundary guard now.
- Open follow-up, not decided here: the sequencing of extracting domain logic out
  of `@sdl/sdl`.

## Rejected Alternatives

- **Expose gateways at the SDK level (`ctx.git`):** gateways are derivable from
  `exec`, not host capabilities; this would freeze the gateway shape into the SDK
  contract and has no natural stopping point (git, then graphite, github, fs…).
- **`ccc` as a below-the-line peer reaching into capability internals:** makes every
  capability's internals `ccc`'s coupling surface and leaves a permanent below-SDK
  domain consumer.
- **Pass `ctx` to Peer APIs (B1):** re-creates the argv-scripting test problem one
  layer up.
- **A permanent lower domain-primitives package:** unnecessary once `ccc` is an
  above-SDK extension — nothing below the SDK then needs domain logic.
- **CLI/process-boundary peer dependencies:** would force `ccc` to parse sibling
  human-facing output for machine decisions, which the repo bans.
