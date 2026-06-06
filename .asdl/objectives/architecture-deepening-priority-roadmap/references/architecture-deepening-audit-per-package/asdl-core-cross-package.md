# asdl-core Cross-Package Interaction Audit

Companion to [`asdl-core.md`](./asdl-core.md). That audit read `asdl-core` from the **inside** (internal module shape). This one reads it from the **consumer side**: what each of the 9 downstream packages actually imports across the seam, framed in the `improve-codebase-architecture` skill's vocabulary — **module / interface / implementation / depth / deep / shallow / seam / adapter / leverage / locality**, plus the **deletion test**.

Read-only audit: no tests run, no files edited.

---

## 1. The seam fan-in

Distinct consuming packages per seam (import scan over `packages/*/src`). Two-plus consumers = a **real** shared seam. One consumer = a **hypothetical** shared seam — shared infrastructure with a single client (_"one adapter = hypothetical seam; two = real"_).

| Seam | Consumers | Packages | Verdict |
|---|---:|---|---|
| `clinkr.*` (group, operation, models, exit, context, ensure, failure, serialization, non_ideal_state) | 8 | aretro, asdl-dispatcher, asdl-handoff, asdl-objectives, asdl-pr-address, asdl-slots, brmem, roaster | real, deep — but **wide interface** |
| `git` (`real_git_gateway` + `git_gateway` + `types`) | 7 | aretro, asdl-handoff, asdl-objectives, asdl-pr-address, asdl-slots, brmem, roaster | real, deep — **construction leaks** |
| `plugin` (`AsdlPluginSpec`, standalone CLI builder/invoker) | 7 | aretro, asdl-dispatcher, asdl-handoff, asdl-objectives, asdl-pr-address, asdl-slots, roaster | real, deep |
| `gh` (`PRGateway`, `RealPRGateway`, `types`) | 3 | asdl-pr-address, asdl-slots, roaster | real — same construction leak as git |
| `payloads.*` | 2 | aretro, asdl-pr-address | real |
| `project_config` | 2 | areg, roaster | real |
| `console` + `format` | 2 | asdl-handoff, asdl-objectives | real (plus asdl-slots via root re-export) |
| `gt.*` | **1** | asdl-slots | **hypothetical** shared seam |
| `sessions.*` | **1** | aretro | **hypothetical** shared seam |
| root `asdl_core` re-export | **1** | asdl-slots | **shallow** pass-through |

---

## 2. Candidates

### 1. Localize production gateway construction — **Strong** · local-substitutable

**Files:** every consumer `context.py`; `git/real_git_gateway.py`; `gh/pr_gateway.py`; `gt/real_gateway.py`.

**Problem.** The gateway **interfaces** (`GitGateway`, `PRGateway`, `GtGateway`) are deep, but constructing the production **adapter** — `RealGitGateway` + `resolve_repo_root` + `resolve_trunk_branch` — **leaks across the seam** into seven packages, each re-deriving the wiring differently:

- `aretro/src/aretro/context.py:24` — `RealGitGateway()` (no trunk)
- `asdl-pr-address/src/asdl_pr_address/cli/pr_address/context.py:24` — `RealGitGateway()` (no trunk)
- `asdl-handoff/src/asdl_handoff/cli/handoff/context.py:28` — `RealGitGateway(repo_root=resolve_repo_root(cwd))`
- `brmem/src/brmem/context.py:28` — `RealGitGateway(repo_root=resolve_repo_root(cwd))` (byte-identical to handoff)
- `asdl-objectives/src/asdl_objectives/context.py:43` — `RealGitGateway(repo_root=repo_root, trunk_branch=trunk)`
- `asdl-slots/src/asdl_slots/gateway/real_git.py:29` — same, wrapped with its own trunk-error handling
- `asdl-slots/src/asdl_slots/cli/slot/checkout.py:31` — `RealGitGateway(repo_root=repo_root).list_local_branches()` **inline, bypassing its own context**

The same shape repeats for `RealPRGateway` (`asdl-pr-address` context.py:23, `asdl-slots` cli/slot/context.py:41, `roaster` cli/roaster/context.py:30) and `RealGtGateway` (`asdl-slots` cli/slot/gt/context.py:26,37). 7 packages import `real_git_gateway` directly; only 6 import the `git_gateway` interface — consumers reach for the concrete adapter.

**Solution.** One deep invocation-context factory owns adapter construction and repo-root / trunk resolution (`resolve_repo_root` is defined once at `git/real_git_gateway.py:258` but re-wired everywhere). Consumers receive a built `GitGateway`; they never name the concrete adapter.

**Deletion test.** There is no construction module to delete — the wiring is _already_ spread across seven contexts and diverging silently. Introducing the module **concentrates** that complexity. This is a shallow seam waiting to be deepened.

**Wins.** locality: trunk/root logic in one place · leverage: one factory, 7 call sites · consumers stop importing the adapter · kills the inline `checkout.py` bypass · tests inject a fake at one seam · divergent wiring converges.

---

### 2. Narrow the clinkr authoring surface — **Worth exploring** · in-process

**Files:** `clinkr/{group,operation,models,exit,context,ensure,failure,serialization,non_ideal_state}.py`; 8 consumers.

**Problem.** `clinkr` is the deepest, most-reused seam (8 packages), but its authoring **interface** is spread over nine canonical modules. `roaster` imports from all nine to author its Operations. Depth (leverage) is high; the interface is **wider than the leverage requires** — every consumer learns the same nine-module vocabulary.

**Solution.** Concentrate the Operation-authoring vocabulary into one canonical module (e.g. `clinkr.authoring` owning operation + model + exit + ensure + failure), plus `clinkr.group` for mounting. Internal modules stay split as **internal seams**; they just stop being part of the interface every consumer learns. Depth of the implementation is unchanged.

**Deletion test.** Deleting `clinkr` scatters Click/Pydantic/exit handling into all 8 packages — it earns its keep overwhelmingly. The critique is the _shape_ of a deep module's interface, not its existence.

> **Tension with `AGENTS.md`.** The repo rule forbids `__init__.py` re-exports and mandates importing from the canonical source module. A barrel export is off the table — this must be a real consolidation into a single authoring module (a new canonical source), not a façade. Worth reopening the rule only for the authoring surface, where the no-re-export cost is highest.

**Wins.** leverage: 8 consumers learn 2 modules, not 9 · locality: authoring vocabulary in one file · internal seams stay testable · graduation surface shrinks.

---

### 3. Single-consumer subdomains in the substrate — **Worth exploring** · local-substitutable

**Files:** `gt/{gateway,real_gateway,types}.py` → asdl-slots only; `sessions/*` → aretro only.

**Problem.** `gt` and `sessions` are deep subdomains living in the **shared** substrate, yet each has exactly one cross-package consumer. As shared seams they are **hypothetical**: one client, one adapter-in-practice. Knowledge is split — implementation in `asdl-core`, sole use in one package.

**Solution.** Either confirm the incubation thesis (a second consumer is genuinely coming) and leave them, or relocate each subdomain down into its sole consumer so locality and ownership coincide.

**Deletion test (relocation framing).** Move `gt` into asdl-slots, `sessions` into aretro: complexity does _not_ reappear across N packages, because only one consumes each. By the shared-seam test alone, they don't yet earn their substrate placement.

> **Recorded intent.** `asdl-core/AGENTS.md` frames the package as a labs/incubator: single-consumer-for-now is deliberate, with graduation as the exit. This isn't a defect — it's a thesis to re-test, not a refactor to run blindly. The `gt` placement is further load-bearing for the runtime-Graphite-boundary rule (`slot gt` is the canonical opt-in Graphite surface).

**Wins.** locality: ownership meets use · substrate shrinks to real shared seams · or: keep, with the thesis stated.

---

### 4. Collapse the root `__init__` re-export — **Strong (small)** · in-process

**Files:** `src/asdl_core/__init__.py`; asdl-slots importers.

**Problem.** The root `__init__` re-exports `get_console`, `make_table`, `format_relative_time`, `state_badge` — a shallow pass-through that also creates non-canonical imports the repo's own rule forbids (`asdl-slots` does `from asdl_core import get_console`).

**Solution.** Point the lone consumer at `asdl_core.console` / `asdl_core.format` and delete the re-export.

**Deletion test.** Delete it and complexity **vanishes** — nothing reappears anywhere. Textbook pass-through.

**Wins.** removes non-canonical imports · aligns with the repo's own import rule · one consumer, low blast radius.

---

### 5. The deep git seam, re-implemented standalone — **Speculative** · in-process

**Files:** `vibechk/git.py` — its own `GitGateway` + `RealGitGateway` (also `packagechk`, standalone).

**Problem.** `vibechk` defines its own `GitGateway` and `RealGitGateway` rather than crossing asdl-core's deep git seam — the repo's most-reused interface, duplicated to keep the package standalone.

**Solution.** Likely none. Surface the cost so it's a chosen trade, not a drift: standalone-ness is bought with a duplicated deep seam.

> **Recorded intent.** `CONTEXT-MAP.md` pins `vibechk` and `packagechk` as standalone / no-`asdl-core` by design — composability over integration. This is the price of that principle, not a leak to fix. Record an ADR only if the duplication starts drifting from the shared gateway's behavior.

**Wins.** names the cost of standalone-ness · drift risk: two git seams diverge · no action unless behavior splits.

---

## 3. Top recommendation

**1 · Localize production gateway construction.** The only candidate where the leak is already live in seven packages and actively diverging — aretro and pr-address skip trunk resolution, slots wraps it, and `checkout.py` constructs the adapter inline past its own context. It touches the highest-fan-in seam (git, 7 consumers), naturally absorbs the same `PRGateway` and `GtGateway` construction, and turns a scattered wiring bug-surface into one deep factory tested at a single seam. Strong, and it compounds across every CLI.

---

## 4. Verdict

Read from the consumer side, `asdl-core`'s seams sort cleanly into three groups:

- **Deep and well-reused** — `clinkr`, `plugin`, the gateway _interfaces_. These earn the substrate. The only refinement is narrowing `clinkr`'s authoring surface (Candidate 2).
- **Deep interface, leaking construction** — git/gh/gt _adapters_. The interfaces are deep; the production wiring is shallow and duplicated (Candidate 1, the top pick).
- **Single-consumer / shallow** — `gt`, `sessions`, root re-export. Either incubation theses to re-test (Candidate 3) or pure pass-throughs to delete (Candidate 4).

**Confidence:** medium-high. Grounded in a full import scan and construction-site read across all 9 consuming packages; interface-shape proposals (Candidates 1–2) would benefit from a parallel interface-design pass before implementation.
