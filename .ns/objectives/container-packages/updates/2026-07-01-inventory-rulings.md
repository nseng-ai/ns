# User rulings on the draft inventory

Four rulings on the first inventory draft, applied to
`references/inventory.md`:

1. **Standalone tools stay standalone** — no tools container; `areg`,
   `packagechk`, `vibechk`, `worktree-status` each keep their package.
2. **`@sdl/clinkr` stays standalone** — not folded into `@sdl/core` despite
   being dependency-free neutral-infra.
3. **`@sdl/plans` and `@sdl/branch-context` stay split** — no fold. Knock-on:
   without absorbing plans, branch-context's end-state split is ~3 units,
   under the ≥4 threshold, so branch-context is now standalone too.
4. **Gateway backends fold into `@sdl/core`** — `git`, `github`, `graphite`,
   `cmux` become core subpackages instead of a new gateways container. This is
   the user-ruled tier-crossing exception: the code inherits core's
   `neutral-infra` tier and the `capability-gateway-backend` tier lane retires
   (recorded as a risk; guard rules keyed to that tier get reconciled in the
   guard slice). Cycle-safe — their only workspace deps (core, exec, test-kit)
   all land inside core.

Revised census: **44 → 24 top-level** (8 containers + 16 standalone),
~49–51 subpackages, 2 new consolidation containers (capability-pi, local Pi
tools — names still TBD). `@sdl/core` ends at ~12–13 subpackages (time, 5
neutral-infra folds, 4 gateway folds, 1–3 own units).

Still awaiting at approval: the two container names, borderline
`aretro`/`roaster` containerize calls, tier-crossing confirmation, and CLI bin
ownership for folded packages.
