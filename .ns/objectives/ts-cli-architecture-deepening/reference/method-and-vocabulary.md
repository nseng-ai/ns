# Method and vocabulary

## How the audit was run

1. Read the domain glossary (`CONTEXT.md`, `CONTEXT-MAP.md`) and ADRs in `docs/adr/` for the touched areas.
2. Mapped the workspace: 19 packages under `ts/packages/`; identified the CLIs and the shared `asdl-core` library. Approximate source sizes at audit time (LOC of `src/**.ts`):
   - pi-extensions 23.8k, ccc 11.6k, asdl-core 8.6k, areg 6.6k, slot 6.4k, roaster 3.8k, aretro 3.7k, sdl 3.4k, brmem 3.3k, objective 2.8k, branch-context 2.5k, sdlcc 2.4k, plans 1.8k, pi-extension-runtime 1.8k, pr-address 1.7k, vibechk 1.5k, packagechk 1.4k, clinkr 1.4k, handoff 0.8k.
3. Fanned out five `Explore` agents, one per package group, each instructed to find 3–5 concrete deepening opportunities using the deletion test and the shallow/deep vocabulary.
4. Curated the raw findings into nine candidates, balancing strength, package variety, and cross-cutting leverage. See `candidate-map.md`.

Scope of this pass: `asdl-core` + the TypeScript CLIs. `pi-extensions` (largest package) and the framework packages `clinkr` / `pi-extension-runtime` were out of scope for this pass and are candidates for a follow-up.

## Glossary (from the `codebase-design` skill)

Use these terms exactly; do not substitute "component", "service", "API", or "boundary".

- **Module** — anything with an interface and an implementation. Scale-agnostic: a function, class, package, or tier-spanning slice.
- **Interface** — everything a caller must know to use the module correctly: type signature plus invariants, ordering constraints, error modes, required configuration, performance characteristics.
- **Implementation** — what's inside a module. Distinct from adapter: a thing can be a small adapter with a large implementation (a Postgres repo) or a large adapter with a small implementation (an in-memory fake).
- **Depth** — leverage at the interface: how much behaviour a caller (or test) exercises per unit of interface they must learn. **Deep** = lots of behaviour behind a small interface. **Shallow** = interface nearly as complex as the implementation.
- **Seam** (Michael Feathers) — a place where you can alter behaviour without editing in that place; the *location* where a module's interface lives.
- **Adapter** — a concrete thing that satisfies an interface at a seam. Describes role, not substance.
- **Leverage** — what callers get from depth: more capability per unit of interface learned. One implementation pays back across N call sites and M tests.
- **Locality** — what maintainers get from depth: change, bugs, knowledge, and verification concentrate in one place. Fix once, fixed everywhere.

## Principles applied

- **The deletion test.** Imagine deleting the module. If complexity vanishes, it was a pass-through (delete it). If complexity reappears across N callers, it was earning its keep (keep it, possibly deepen it). Every candidate below records its deletion-test result.
- **The interface is the test surface.** Callers and tests cross the same seam. If you need to test *past* the interface, the module is the wrong shape.
- **One adapter = hypothetical seam; two adapters = real seam.** Don't introduce (or relocate to create) a seam unless something actually varies across it. Candidate 9 (diff parsing) is held precisely because it has one consumer today.
- **Depth is a property of the interface, not the implementation.** A deep module can be internally composed of small, swappable parts — they just aren't part of the interface.

## Repo constraints that bound several candidates

- **Runtime Graphite boundary** (AGENTS.md): runtime package code must not depend on Graphite by default. A module may depend on Graphite only when Graphite is part of its explicit user-facing contract. `slot gt` is the canonical opt-in Graphite group — its name is the contract. Do not parse human-facing Graphite display output (`gt ls`, `gt log`) for machine decisions; use plumbing (`gt parent/children --no-interactive`). → bounds candidate 5.
- **Gateway / Domain logic** (`CONTEXT.md` Architecture Boundaries): a Gateway is the canonical interface to an external/non-deterministic capability and the single seam where real I/O is replaced by an in-memory fake in tests. Domain logic consumes Gateways but is not itself a seam — prefer faking the Gateway beneath it. → frames candidates 2, 4, 5, 6.
- **ADR-0007** (roaster shared diff parser): roaster deliberately delegates patch parsing to `@pierre/diffs` and stays a *thin* adapter; the ADR rejected broadening roaster's parser surface. → bounds candidate 9 to a watch-point.
- **typescript-fake-driven-testing**: the canonical pattern is real adapter + in-memory fake at each Gateway seam, with CLI scenario tests. The "add a fake" candidates (2) and "narrow the seam" candidates (5, 6) target this directly.
