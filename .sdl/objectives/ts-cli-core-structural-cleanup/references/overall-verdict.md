# Overall verdict & priority ordering

## Verdict

Do not approve as-is — not because anything is broken (type hygiene across the
fleet is genuinely strong: no `as unknown as`, no `any`, errors-as-values
throughout, gateway seams, Zod at most boundaries) but because the same five
concepts are reimplemented 3–15 times across packages instead of living once in
the shared layer, and three god-files/god-functions have crossed the
size/cohesion line. The holistic lens is where the value is — almost every
high-leverage finding is a cross-package "code judo" move that *deletes* code.

## Recommended order of attack (highest payoff first)

1. **Shared CLI helpers** (`defineCli` + `execGroup`). Touches all 15 CLIs,
   deletes ~150 lines, kills two latent drift bugs (stale version, runtimeInfo
   desync). Pure subtraction — do it first. See `cli-wiring-layer.md`.
2. **Decompose `ccc performGraphiteMaintenance` + split `landing-operations.ts`.**
   Highest *risk* × highest sprawl (post-merge ref mutation). See `ccc.md`.
3. **Split `areg/real-gateways.ts`** per-gateway + collapse the init/skill-kind
   policy to data + share spec-resolution policy with the fake. See `areg.md`.
4. **Unify Branch-Memory access**: branch-context → in-process gateway; collapse
   the brmem-cli candidate framework; compose core git in brmem. See
   `branch-memory-access.md` + `cross-package-dedup.md`.
5. **ccc boundary convergence + roaster leaf reuse + one branch-resolve/validate
   helper.** See `ccc.md`, `cross-package-dedup.md`.
6. **Per-package Zod-boundary and dead-code cleanups**, each independently
   landable. See `aretro-sdlcc.md`, `per-package-cleanups.md`, `asdl-core.md`.

## What is already RIGHT — calibration, do NOT "fix" these

- **pr-address is the model citizen**: pure-wiring `cli.ts`, consumes
  `@asdl/core/{github-pr-feedback,git,exec,submit}`, reimplements nothing. Use it
  as the template for the other CLIs.
- **`clinkr/group.ts` (~550) is clean** — no spaghetti forcing CLIs into awkward
  shapes; its `as` casts are localized and zod-backed. (One minor note: the
  `--runtime` flag is intercepted by a raw `argv[0]` check before parsing, so it
  only works as the literal first arg — worth a comment, not a refactor.)
- **Intentionally-sequential flows are correct, not missed `Promise.all`s**:
  the land-stack merge loop (each PR rebases onto trunk after the prior merges)
  and gh rate-limited submit loops are hard correctness constraints.
- **`objective`** uses filesystem/checked-in records — a legitimately different
  storage model from brmem refs. Do NOT force it onto the Branch-Memory gateway.
- **Distinct gateway interfaces stay distinct**: roaster's REST `pulls/{n}/files`
  surface vs core's GraphQL feedback gateway; areg's domain-scoped project
  gateway with its explicit "no generic FS gateway" doc-comment. Only shared
  *leaf helpers* and *policy* are unified, never whole interfaces.
- **Content-slug derivation, frontmatter parsing, aretro/sdlcc git-via-gateway +
  `--json` plumbing** are already shared/correct.
- **Vendored third-party code under `.agents/skills/`** is out of scope entirely.

## Cross-cutting theme

The fleet's *foundations* are strong; the work is (a) pulling repeated concepts
down into `@asdl/core` / `clinkr`, and (b) breaking three files apart. Almost
every fix removes code. Behavior must not change — this is a structural/quality
Objective, verified by `just` (tsgo + Vitest) and the existing CLI scenario tests.
