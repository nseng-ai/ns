# Decision Inventory — container-packages

Drafted 2026-07-01 from code evidence (src file counts, `src/` top-level structure,
`sdl.tier`, and the workspace dependency graph); revised same day with user
rulings (tools standalone, clinkr standalone, plans stays split, gateway
backends fold into `@sdl/capability-kit`, three-way categorization, the
**pi-subpackage model** replacing a capability-pi container, all
`capability`-tier packages living under `ts/packages/capabilities/`,
`ts/packages/local/` as the hierarchy space for unpublished project-local
packages, worktree-status folding into the `@sdl/pi` host, and sdl-sdk
folding into `@sdl/kernel` as its `sdk` subpackage). Finalized in the
2026-07-01 review pass with the closing rulings: aretro demoted to
standalone, roaster confirmed containerize, the consolidation container named
`@sdl-local/pi-tools`, the kernel `sdk` subpackage kept pure (public
extension API only), the strict `local/` admission invariant, and a dedicated
relocation slice for standalone movers. **Status: APPROVED 2026-07-01**
(single review pass complete). Conversion rows in `roadmap.md` are
actionable; keep-standalone entries are closed with rationale recorded.

This file is durable source material, not current truth: a conversion slice
re-verifies its entry against current code at pickup (files where the split
expects them, no new unclaimed areas, dependency edges unchanged) before acting.

## Decision vocabulary

- **containerize** — the package becomes a container of its own subpackages
  (end-state split of four or more units, counting a core-style unit that claims
  loose root files, excluding the transitional remainder).
- **standalone** — the package keeps its flat shape for now, with rationale
  (usually: end-state split would be three or fewer units, or a user ruling).
- **fold → target/name** — the package's code moves into a container package as
  the `name` subpackage; the published package is deleted and its dependents
  re-import from the target's subpath. Folds are the consolidation mechanism;
  the ≥4 threshold does not apply to them.

Fold rules (from `objective.md`): no package-level dependency cycles; a new
**consolidation container** is allowed only when net-negative on top-level
count and its name is user-approved (the sole new container is
`@sdl-local/pi-tools`, approved at review).

## The pi-subpackage model (user-confirmed)

Each capability that has a Pi surface owns a **`pi` subpackage** (exported as
`./pi`) instead of a separate `*-pi` published package. Mechanics:

- `@sdl/pi` becomes an **optional peer dependency** (plus a devDependency for
  types/tests) of each capability with a `pi` subpackage — the Node spelling of
  a "pi extra". A CLI consumer importing the capability's `api` subpath never
  resolves the host; `.pi/extensions/*` adapters import `<capability>/pi`
  inside a running Pi host where it is definitionally present.
- Guard rule: **only the `pi` subpackage may import `@sdl/pi`.** A helper
  useful to the capability's core belongs in `@sdl/core`, not in a pi package.
- Loading `./pi` outside a Pi environment fails loudly at import; optionality
  lives in the manifest, not in runtime branching.
- The neutral `@sdl/pi/...` helpers consolidate as an `@sdl/pi` `kit`
  subpackage — the surface capability `pi` subpackages import.
- The recorded package-level boundary "capability never depends on `@sdl/pi`"
  refines to "capability runtime core never imports `@sdl/pi`; only its `pi`
  subpackage may, as optional peer" — reconciled in the vocabulary slice
  (CONTEXT.md / ADR).
- Cycle-safe: `@sdl/pi` depends on no capability, so the optional-peer edge is
  one-directional; the deliberately broken pi ↔ ccc cycle is not recreated.

## Categories (user-confirmed)

Every top-level package belongs to one of three categories:

- **Core infra** — the neutral floor plus SDK layers: core, clinkr, brmem,
  kernel (absorbing sdl-sdk), capability-kit.
- **Standalone tools** — self-contained tool CLIs: areg, packagechk, vibechk.
- **First-party extensions/capabilities** — capabilities, their Pi surfaces,
  and hosts: flow, slot, aretro, roaster, pi (absorbing worktree-status),
  local Pi tools, ccc, handoff, objective, address, plans, branch-context,
  sdlcc.

These roughly project the existing `sdl.tier` lanes upward (neutral-infra/sdk →
core infra; standalone-tool → standalone tools; capability/capability-pi/
local-pi-tool/host → extensions/capabilities).

## End-state census (proposed)

- Top-level packages: **44 → 21** (12 containers + 9 standalone).
- Subpackages: ~52–56 across the 12 containers.
- New consolidation containers: 1 (local Pi tools).

| Category                | Cluster                                    | Decision                | Top-level delta |
| ----------------------- | ------------------------------------------ | ----------------------- | --------------- |
| Core infra              | `@sdl/core` + 5 neutral-infra folds        | container               | 6 → 1           |
| Core infra              | `@sdl/capability-kit` + 4 gateway folds    | container               | 5 → 1           |
| Core infra              | `@sdl/kernel` + `sdl-sdk`                  | container               | 2 → 1           |
| Core infra              | clinkr, brmem                              | standalone              | 2 → 2           |
| Standalone tools        | areg, packagechk, vibechk                  | standalone              | 3 → 3           |
| Extensions/capabilities | `sdl-flow` + `sdl-land` + `@sdl/flow-pi`   | container               | 3 → 1           |
| Extensions/capabilities | `@sdl/handoff` + `@sdl/handoff-pi`         | container               | 2 → 1           |
| Extensions/capabilities | `@sdl/objective` + `@sdl/objective-pi`     | container               | 2 → 1           |
| Extensions/capabilities | `@sdl/ccc` + `@sdl/ccc-pi`                 | container               | 2 → 1           |
| Extensions/capabilities | `@sdl/branch-context` + its `-pi`          | container               | 2 → 1           |
| Extensions/capabilities | `@sdl/slot`                                | container               | 1 → 1           |
| Extensions/capabilities | `@sdl/pi` + `@sdl/worktree-status`         | container               | 2 → 1           |
| Extensions/capabilities | `@sdl/aretro`                              | standalone              | 1 → 1           |
| Extensions/capabilities | `@sdl/roaster`                             | container               | 1 → 1           |
| Extensions/capabilities | local Pi tools (7 packages)                | new container           | 7 → 1           |
| Extensions/capabilities | address, plans, sdlcc                      | standalone              | 3 → 3           |

Tier note (user-ruled): folding `git`, `github`, `graphite`, `cmux` into
`@sdl/capability-kit` retires the `capability-gateway-backend` tier — the code
inherits the `capability-kit` tier, which matches its position definitively
above the kernel/sdk layer. Cycle-safe: capability-kit already depends on git,
and the gateways depend only on core/exec/test-kit, none of which depend back
on capability-kit. Guard rules keyed to the retired tier get reconciled in the
guard slice. The `capability-pi` tier also retires: its code becomes `pi`
subpackages inside `capability`-tier containers.

---

## Core infra

### @sdl/core — **containerize** (the pilot, user-confirmed)

- Tier `neutral-infra`, 20 src files + folds below. Deps: none.
- End-state subpackages (~8–9 units): `time` (declared on PR #2677);
  neutral-infra folds `cli-runtime`, `cli-theme`, `exec`, `test-kit`,
  `typescript-analysis`; plus 1–3 units claiming the 18 loose root files
  (candidates: `primitives`, `terminal`, `config`).
- Rationale: core is the neutral floor everything depends on; absorbing the
  tiny neutral-infra satellites removes five top-level packages with zero
  cycle risk (all absorbed packages depend only on core/each other).

### @sdl/clinkr — **standalone** (user ruling)

- Tier `neutral-infra`, 18 files. Deps: none; dependents: very many.
- User ruled clinkr keeps its own package identity rather than folding into
  core. Own split would be ≤3 units → standalone.

### @sdl/cli-runtime — **fold → @sdl/core/cli-runtime**

- Tier `neutral-infra`, 3 files. Deps: clinkr, core.

### @sdl/cli-theme — **fold → @sdl/core/cli-theme**

- Tier `neutral-infra`, 8 files. Deps: clinkr, core.

### @sdl/exec — **fold → @sdl/core/exec**

- Tier `neutral-infra`, 2 files. Deps: core, test-kit (both inside the target).

### @sdl/test-kit — **fold → @sdl/core/test-kit**

- Tier `neutral-infra`, 1 file. Deps: none.

### @sdl/typescript-analysis — **fold → @sdl/core/typescript-analysis**

- Tier `neutral-infra`, 1 file. Deps: none. No workspace dependents visible.

### @sdl/brmem — **standalone**

- Tier `neutral-infra`, 29 files (`operations` + 18 loose root ≈ 2 units).
- Cannot fold into core: `brmem → @sdl/capability-kit → @sdl/core` would create
  a package cycle. Under the ≥4 threshold as its own container → standalone.

### @sdl/kernel — **containerize** (absorbs sdl-sdk; user ruling)

- Tier `sdk`, 12 files + 9 from `sdl-sdk` = 21. End-state: `sdk` (the
  absorbed extension API, imported as `@sdl/kernel/sdk`), `cli`
  (cli.ts, command-registry), `extensions` (discovery, loader, registry),
  `operations`, core ≈ 4–5 units. The kernel keeps the `sdl` bin.
- Resolves the former Open Question ("later kernel/sdl-sdk merge") in favor of
  merging now: the SDK/runtime split expressed as two packages is expressed
  instead by the `sdk` subpackage boundary — extensions author against
  `@sdl/kernel/sdk` only, guard-enforced.
- Cycle-safe: the only edge is kernel → sdl-sdk; nothing depends on sdl-sdk
  without also being able to depend on kernel.
- Cost accepted at ruling: sdl-sdk's ~12 workspace dependents (every
  capability, capability-kit, hosts/pi) re-import from `@sdl/kernel/sdk` and
  their dependency now points at a manifest carrying kernel's heavier deps
  (`pi-ai`, `pi-coding-agent`, `jiti`) — manifest-level noise in this
  source-export workspace, not runtime weight.
- `sdk` purity (user ruling at review): the `sdk` subpackage is exclusively
  the absorbed public extension API — "extensions author against
  `@sdl/kernel/sdk` only" stays crisp. Kernel's existing `src/sdk/` internals
  (command-io, pi-text-generation; internalWorkspaceExports, not public
  plugin API) move into another unit, exact home pinned at conversion time.

### sdl-sdk — **fold → @sdl/kernel/sdk** (user ruling)

- Tier `sdk`, 9 files (command, execution, extension-manifest, schema,
  services, result, text-generation). Deps: clinkr, core, zod — all already
  kernel deps.

### @sdl/capability-kit — **containerize** (absorbs the gateway backends; user ruling)

- Tier `capability-kit` (its own ADR 0012 layer, definitively above kernel/sdk),
  21 loose root files + folds below.
- End-state subpackages (~5–6 units): gateway folds `git`, `github`,
  `graphite`, `cmux`, plus 1–2 kit units claiming the 21 loose root files.
- Rationale: the gateway backends are capability-facing infrastructure that
  lives above the kernel/sdk layer; capability-kit already depends on git, and
  every capability that uses a gateway already sits at or above this layer.

## Gateway backends — fold into @sdl/capability-kit (user ruling)

Cycle-safe: gateway deps (core, exec, test-kit) all sit below capability-kit;
`graphite → git` becomes an internal subpackage edge. Tier-crossing — see the
tier note above.

### @sdl/git — **fold → capability-kit/git** (4 files)

### @sdl/github — **fold → capability-kit/github** (15 files)

### @sdl/graphite — **fold → capability-kit/graphite** (9 files; internal dep on git)

- `@sdl/graphite` carries a CONTEXT.md; it moves with the fold as
  subpackage-level context. The Graphite dependency boundary
  (`docs/graphite-dependency-boundary.md`) is unaffected — the boundary is
  about runtime `gt` usage, not package location.

### @sdl/cmux — **fold → capability-kit/cmux** (6 files)

## Standalone tools — all standalone (user ruling)

User ruled these keep their own package identity; no tools container.
(worktree-status left this group by user ruling — despite its
`standalone-tool` tier it has no `bin` and is Pi-native UI; it folds into
`@sdl/pi`, see the extensions section.)

### @sdl/areg — **standalone** (41 files; own split `operations`, `gateways`, core ≈ 3 units)

### @sdl/packagechk — **standalone** (15 files; ≤3 units)

### @sdl/vibechk — **standalone** (10 files; ≤3 units)

## First-party extensions/capabilities

Directory placement (user ruling): every `capability`-tier package lives under
`ts/packages/capabilities/`. Today only flow, land, and slot are there;
handoff, objective, ccc, branch-context, plans, address, aretro, and roaster
relocate as part of their conversion slices (standalone rulings like plans and
address still move — the ruling is about directory placement, not shape).

### sdl-flow — **containerize** (absorbs sdl-land and @sdl/flow-pi)

- Tier `capability`, 96 files. End-state subpackages: `land-stack`, `submit`,
  `autobranch`, `commands`, `land` (absorbing `sdl-land`), `pi` (absorbing
  `@sdl/flow-pi`), plus `shared`/core unit for 9 loose root files — ~7 units.

### sdl-land — **fold → sdl-flow/land**

- Tier `capability`, 5 files, deps: none. Flow already delegates stack
  preflight to sdl-land internally and owns the land command face; CONTEXT.md
  notes CCC must not import sdl-land directly, so the only consumer is flow.

### @sdl/flow-pi — **fold → sdl-flow/pi** (8 files)

- Adds `@sdl/pi` optional peer and a `@sdl/kernel` dep to flow; both
  cycle-safe (neither depends on flow).

### @sdl/slot — **containerize**

- Tier `capability`, 58 files. End-state: `operations`, `lifecycle`,
  `gateways`, `shell` + core unit for 16 loose root files — ~5 units. No Pi
  shim exists; a future slot Pi surface would follow the pi-subpackage model.

### @sdl/handoff — **containerize** (pi-subpackage model)

- Tier `capability`, 22 files + 27 from `@sdl/handoff-pi`. End-state: `sdl`,
  `operations`, `pi` (absorbed shim), core ≈ 4 units.

### @sdl/handoff-pi — **fold → @sdl/handoff/pi** (27 files)

- Adds `@sdl/pi` optional peer and a cmux edge (cmux lands inside
  capability-kit, which handoff already depends on).

### @sdl/objective — **containerize** (pi-subpackage model)

- Tier `capability`, 38 files + 2 from `@sdl/objective-pi`. End-state:
  `operations`, `sdl`, `pi`, core ≈ 4 units.
- The recorded "never depends on `@sdl/pi`" boundary refines to the
  pi-subpackage rule; reconcile in the vocabulary slice.

### @sdl/objective-pi — **fold → @sdl/objective/pi** (2 files)

### @sdl/ccc — **containerize** (pi-subpackage model)

- Tier `capability`, 23 files + 8 from `@sdl/ccc-pi`. End-state: `cmux`,
  `autobranch`, `pi`, core ≈ 4 units.
- Does not recreate the broken pi ↔ ccc cycle: the edge is ccc → pi (optional
  peer) only; `@sdl/pi` does not import ccc.

### @sdl/ccc-pi — **fold → @sdl/ccc/pi** (8 files)

### @sdl/branch-context — **containerize** (pi-subpackage model)

- Tier `capability`, 22 files + 7 from `@sdl/branch-context-pi`. End-state:
  `sdl`, `testing`, `pi`, core ≈ 4 units. (With plans staying split — user
  ruling — the `pi` unit is what carries this over the threshold.)

### @sdl/branch-context-pi — **fold → @sdl/branch-context/pi** (7 files)

### @sdl/plans — **standalone** (user ruling)

- Tier `capability`, 10 files. User ruled plans and branch-context stay split.
  Own split ≤2 units → standalone. No Pi shim exists.

### @sdl/address — **standalone**

- Tier `capability`, 37 files (`sdl`, `core`, `operation-schemas` ≈ 3 units).
  Its Pi surface is host-resident residue in `@sdl/pi`, not a shim package; if
  it is ever extracted it becomes `@sdl/address/pi` under the pi-subpackage
  model.

### @sdl/aretro — **standalone** (user ruling at review; demoted from borderline containerize)

- Tier `capability`, 26 files. The proposed ~5-unit split (`payloads`,
  `sessions`, `sdl`, `operations`, core) cleared the threshold only
  technically — units of 2–8 files each. Ruled standalone: five tiny circles
  hurt topology legibility more than they help, and containerizing later is a
  purely additive manifest change. Relocates under `capabilities/` in the
  relocation slice.

### @sdl/roaster — **containerize** (user-confirmed at review)

- Tier `capability`, 39 files. End-state: `gateways`, `commands`, `sdl` +
  `operations`, core unit for 19 loose root files ≈ 4 units. The large loose
  root was flagged as making the split feel forced; the user confirmed
  containerize anyway — gateways/commands are real seams, and the core unit
  absorbs the loose root.

### New consolidation container `@sdl-local/pi-tools` (user-approved name) — 7 subpackages

All seven are tier `local-pi-tool` with no workspace dependents;
`thermo-council → runner-subagents` becomes an internal subpackage edge. These
are Pi-*native* tools, not capability shells, so the pi-subpackage model does
not apply — they consolidate as a peer container above the host. Directory
placement (user ruling): the container lives at `ts/packages/local/pi-tools/`
— `ts/packages/local/` is the designated hierarchy space for unpublished,
project-local packages (per `ts/packages/README.md`, these are private tools
registered only through this repo's `.pi/extensions/*` adapters, not SDL
capabilities or distribution packages).

Strict `local/` admission invariant (user ruling, guard-checkable): a package
lives under `ts/packages/local/` **iff** its name is `@sdl-local/*`; it must
be `private: true`, is not an SDL capability or distribution package, and no
platform package may depend on it (zero workspace dependents outside
`local/`). The `@sdl-local` scope is reserved for this space; the seven
`@local-pi-tools/*` names retire with the fold.

- @local-pi-tools/backing-skill-commands — **fold** (5 files)
- @local-pi-tools/context-profiler — **fold** (18 files)
- @local-pi-tools/grill — **fold** (9 files)
- @local-pi-tools/pr-feedback-watch — **fold** (15 files)
- @local-pi-tools/pr-previews — **fold** (10 files)
- @local-pi-tools/runner-subagents — **fold** (15 files)
- @local-pi-tools/thermo-council — **fold** (14 files)

### @sdl/pi — **containerize** (absorbs @sdl/worktree-status; user ruling)

- Tier `host`, 44 files across 11 small dirs + 8 from `@sdl/worktree-status`.
  End-state: `kit` (the neutral `@sdl/pi/...` helpers consumed by capability
  `pi` subpackages, CCC, and local Pi tools), `commands`, `runtime`, `parity`,
  `worktree-status` (absorbed), core — ~6 units, with the tail dirs (models,
  investigate, terminal, sessions, pr, skills, grill) folded into those.
- As the optional-peer target of every capability `pi` subpackage, `@sdl/pi`
  must continue to depend on no capability package.

### @sdl/worktree-status — **fold → @sdl/pi/worktree-status** (user ruling)

- Tier `standalone-tool` today, but the classification was a misfit: no `bin`
  (unlike areg/packagechk/vibechk), Pi-native footer UI consumed only via the
  `.pi/extensions/worktree-status.ts` adapter, and it deep-imports pi
  internals (`@sdl/pi/commands/ack`, `@sdl/pi/shared/timers`,
  `@sdl/pi/commands/events`).
- Cycle-safe: the only package edge is worktree-status → pi, which becomes
  internal. The pi ↔ worktree-status cycle that
  `hosts/pi/src/parity/worktree-status.ts` avoids by keeping parity metadata
  as strings dissolves — the parity record can reference the internal
  subpackage directly.
- Cannot fold into a capability (e.g. slot): boundary rule "only a
  capability's `pi` subpackage imports `@sdl/pi`" plus "@sdl/pi depends on no
  capability" leave the host container as the only legal fold target.
- Adds `@earendil-works/pi-tui` as a pi runtime dep (currently devDep) and
  git/github/graphite gateway deps (already inside capability-kit, which pi
  depends on).

### sdlcc — **standalone**

- Tier `host`, 16 files. Distinct host binary; ≤3 units.

---

## Review resolution (2026-07-01)

1. ~~Local Pi tools container name~~ — approved as `@sdl-local/pi-tools`,
   with the `@sdl-local` scope reserved for the `local/` space.
2. ~~Borderline containerize decisions~~ — aretro demoted to standalone;
   roaster confirmed containerize.
3. ~~CLI bin ownership for folded packages~~ — verified non-issue from code:
   zero folded packages carry a `bin`. All bins live in surviving packages
   (`sdl` in kernel, `ccc`, `brmem`, `areg`, `packagechk`, `vibechk`,
   `sdlcc`).
4. Done: keep-standalone entries are closed; conversion rows appended to
   `roadmap.md`, one per containerize/fold decision plus the dedicated
   relocation slice (user ruling: standalone movers — plans, address, aretro
   — relocate under `capabilities/` in one early mechanical slice; containers
   relocate within their own conversion slices).
