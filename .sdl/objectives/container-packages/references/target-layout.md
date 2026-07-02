# Target Layout — container-packages

**Status: DRAFT** — the rendered end state of `references/inventory.md` (same
approval gate; if the inventory changes, this doc follows). Subpackage names
for units that don't exist yet as directories (`primitives`, `kit`, `core`,
…) are illustrative and get pinned per-slice at conversion time.

Numbers: **23 top-level packages** (12 containers + 11 standalone),
~52–55 subpackages. Folded packages are deleted; surviving packages keep their
current directory locations (no relocations proposed — directory/category
alignment is out of scope).

## Workspace tree (end state)

Legend: `[C]` container, `[S]` standalone. Indented names under a container
are its declared `sdl.subpackages`.

```text
ts/packages/
│
│  ── Core infra ──────────────────────────────────────────────
├── infra/
│   ├── core/                [C] neutral-infra   (the pilot)
│   │     time, exec, cli-runtime, cli-theme, test-kit,
│   │     typescript-analysis, primitives, terminal, config
│   ├── clinkr/              [S] neutral-infra   (user ruling)
│   └── brmem/               [S] neutral-infra   (cycle-blocked from core)
├── sdl-sdk/                 [S] sdk
├── kernel/                  [S] sdk
├── sdl-capability-kit/      [C] capability-kit
│         git, github, graphite, cmux, kit
│
│  ── Standalone tools ────────────────────────────────────────
├── tools/
│   ├── areg/                [S] standalone-tool
│   ├── packagechk/          [S] standalone-tool
│   └── vibechk/             [S] standalone-tool
├── worktree-status/         [S] standalone-tool
│
│  ── First-party extensions/capabilities ─────────────────────
├── capabilities/
│   ├── flow/                [C] capability
│   │     land-stack, submit, autobranch, commands, land, pi, shared
│   └── slot/                [C] capability
│         operations, lifecycle, gateways, shell, core
├── handoff/                 [C] capability
│         sdl, operations, pi, core
├── objective/               [C] capability
│         operations, sdl, pi, core
├── ccc/                     [C] capability
│         cmux, autobranch, pi, core
├── branch-context/          [C] capability
│         sdl, testing, pi, core
├── plans/                   [S] capability      (user ruling: stays split)
├── address/                 [S] capability      (Pi surface is host residue)
├── aretro/                  [C] capability      (borderline — pending review)
│         payloads, sessions, sdl, operations, core
├── roaster/                 [C] capability      (borderline — pending review)
│         gateways, commands, sdl, core
├── local-pi-tools/          [C] local-pi-tool   (ONE package; name TBD)
│         backing-skill-commands, context-profiler, grill,
│         pr-feedback-watch, pr-previews, runner-subagents,
│         thermo-council
└── hosts/
    ├── pi/                  [C] host
    │     kit, commands, runtime, parity, core
    └── sdlcc/               [S] host
```

Deleted published packages (22): `@sdl/exec`, `@sdl/cli-runtime`,
`@sdl/cli-theme`, `@sdl/test-kit`, `@sdl/typescript-analysis` (→ core);
`@sdl/git`, `@sdl/github`, `@sdl/graphite`, `@sdl/cmux` (→ capability-kit);
`sdl-land`, `@sdl/flow-pi` (→ flow); `@sdl/handoff-pi`, `@sdl/objective-pi`,
`@sdl/ccc-pi`, `@sdl/branch-context-pi` (→ their capabilities); the seven
`@local-pi-tools/*` packages (→ the local-pi-tools container). Net: 44 − 22
folded + 1 new container = 23.

## Manifest shapes

The container pilot, properly formed (no `remainder` line):

```jsonc
// ts/packages/infra/core/package.json
{
  "name": "@sdl/core",
  "sdl": {
    "tier": "neutral-infra",
    "subpackages": [
      "time", "exec", "cli-runtime", "cli-theme", "test-kit",
      "typescript-analysis", "primitives", "terminal", "config"
    ]
  }
}
```

A capability with a Pi surface (the pi-subpackage model):

```jsonc
// ts/packages/handoff/package.json
{
  "name": "@sdl/handoff",
  "sdl": {
    "tier": "capability",
    "subpackages": ["sdl", "operations", "pi", "core"]
  },
  "peerDependencies": { "@sdl/pi": "workspace:*" },
  "peerDependenciesMeta": { "@sdl/pi": { "optional": true } },
  "devDependencies": { "@sdl/pi": "workspace:*" } // types + tests
}
```

Mid-conversion (transitional, any package): declared subpackages plus
`"remainder": true`; graduation deletes the `remainder` line.

## Import surfaces

- Core subpaths: `@sdl/core/time`, `@sdl/core/exec`, `@sdl/core/cli-runtime`,
  `@sdl/core/cli-theme`, `@sdl/core/test-kit`, … (`@sdl/clinkr` remains its
  own package per the user ruling and is imported as today).
- `@sdl/capability-kit/git`, `@sdl/capability-kit/github`,
  `@sdl/capability-kit/graphite`, `@sdl/capability-kit/cmux`.
- Capabilities keep `api` as the consumer surface and add `pi`:
  `@sdl/handoff/api` (CLI/in-process consumers) vs `@sdl/handoff/pi`
  (imported only by `.pi/extensions/*` adapters inside a Pi host).
- `@sdl/pi/kit` — the neutral helper surface consumed by capability `pi`
  subpackages, CCC, and local Pi tools.
- A subpackage may own several subpath exports (`./time` and `./time/testing`
  are both the `time` unit).

## Boundary rules the guard enforces

1. Every source file in a declaring package belongs to a declared unit; no
   remainder declared → any unassociated file fails (properly formed).
2. Only a capability's `pi` subpackage may import `@sdl/pi`.
3. `@sdl/pi` depends on no capability package (keeps the optional-peer edge
   one-directional; pi ↔ ccc stays broken).
4. Tier enforcement continues to read `sdl.tier`; retired lanes:
   `capability-gateway-backend` (code now capability-kit tier) and
   `capability-pi` (code now `pi` subpackages at capability tier).

## Topology report (end state)

- 23 top-level circles in tier lanes: neutral-infra (3), sdk (2),
  capability-kit (1), capability (10), local-pi-tool (1), host (2),
  standalone-tool (4).
- Containers render as their declared subpackage circles (~52–55 total);
  standalone packages render as single circles; no auto-discovered
  directory circles anywhere.
