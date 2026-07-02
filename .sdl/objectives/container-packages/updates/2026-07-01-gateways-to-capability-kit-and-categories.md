# Gateways re-ruled into capability-kit; three-way categorization added

Two user rulings superseding parts of the earlier inventory revisions:

1. **Gateway backends fold into `@sdl/capability-kit`, not `@sdl/core`.** The
   earlier gateways-into-core ruling is superseded: prompted by the
   tier-crossing concern, the user placed `git`, `github`, `graphite`, `cmux`
   in capability-kit because gateways live definitively above the kernel/sdk
   layer — the neutral floor was the wrong home. `@sdl/capability-kit` flips
   from standalone to **container** (~5–6 units: four gateways plus 1–2 kit
   units claiming its 21 loose root files). Cycle-safe: capability-kit already
   depends on git, and the gateways depend only on core/exec/test-kit. The
   `capability-gateway-backend` tier still retires; the code inherits the
   `capability-kit` tier.

2. **Three-way top-level categorization (user-confirmed):** every top-level
   package is categorized as **core infra** (core, clinkr, brmem, sdl-sdk,
   kernel, capability-kit), **standalone tool** (areg, packagechk, vibechk,
   worktree-status), or **first-party extension/capability** (flow, slot,
   aretro, roaster, pi, capability-pi, local Pi tools, ccc, handoff,
   objective, address, plans, branch-context, sdlcc). The categories project
   the existing `sdl.tier` lanes upward; the inventory is now organized by
   them, and completion criteria require every top-level package to carry one.

Census after these rulings: **44 → 24 top-level** (9 containers + 15
standalone), ~50–55 subpackages. `@sdl/core` ends at ~8–9 subpackages (time,
five neutral-infra folds, 1–3 own units); `@sdl/capability-kit` at ~5–6.

Still awaiting at approval: the two consolidation-container names,
borderline `aretro`/`roaster` calls, and CLI bin ownership for folded
packages.
