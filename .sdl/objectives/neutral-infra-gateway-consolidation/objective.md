# Neutral-Infra Gateway Consolidation

## Thesis

The `neutral-infra` tier is incoherent because `@sdl/core` is three packages fused into
one: pure utilities, real-world I/O gateways, and SDL runtime mechanics. Today all nine
capabilities import `@sdl/core/exec` (112 sites) and `@sdl/core/git` (45 sites) directly —
reaching raw process and git I/O that the architecture says they should only ever see
through injected gateways. This Objective decomposes `@sdl/core` and re-homes every subpath
by one classification rule, so each tier means exactly one thing: neutral-infra is pure,
real-world/external-tool gateways live in `@sdl/capability-kit`, and intrinsic host services
are provided by the SDK and hidden in the kernel.

It executes a structural rule that the umbrella `sdl-extension-architecture` Objective
asserts but never owns ("gateways are derivable from `exec` and belong above the SDK in
`@sdl/capability-kit`"). That Objective drives capability migration and deleting the
transitional holding-pen; this sibling owns making the infra tier underneath it coherent. It
is a standalone, cross-referenced Objective, not a child of the umbrella and not a rename of
existing work.

## The classification rule

Each module is classified by **how a consumer reaches it**:

- **Pure utility** — a deterministic transform with no I/O and no SDL runtime knowledge
  (`text-*`, `result`, `primitives`, `time-format`, `markdown-frontmatter`, `managed-region`,
  slug parsers). Stays in `@sdl/core` as the pure-utility library; any layer may depend on it
  directly, no injection needed.
- **Kit gateway** — wraps real-world I/O or an external tool and is *derivable from `exec`*
  (`git`, `github-*`, `exec`, `graphite`, `cmux`). Moves into `@sdl/capability-kit` as a
  **per-domain subpath** (`@sdl/capability-kit/git`, `/github`, `/exec`, …) that co-locates
  the interface, the real adapter, and the in-memory fake. Capabilities depend on the kit
  laterally.
- **SDK-provided service** — an *intrinsic* host service the author reaches through `ctx` /
  the vended api object (`command-io` → `ctx.stdout`; `progress-phase` → progress). Its
  **interface lives in `sdl-sdk`** and its **implementation is hidden in the kernel**. The
  test: *if the author reaches it through the vended api object, it is SDK-provided.*
- **Runtime harness** — builds the runtime that *creates* the api object and is never reached
  through `ctx` (`cli-entry`). Lives in the kernel (or a neutral CLI-runtime infra home);
  never vended.

`@sdl/brmem` is the **named exception**: it is a stateful host service (not derivable from
`exec`), so it follows the SDK-provided pattern rather than the kit pattern. Its relocation
is deliberately out of scope here and tracked as a separate follow-up Objective.

## Scope

- Decompose `@sdl/core`: classify all ~36 subpaths by the rule above and re-home each. What
  remains in `@sdl/core` is pure utilities by construction.
- Relocate the kit gateways (`git`, `github-*`, `exec`, and the standalone `@sdl/graphite`
  and `@sdl/cmux` packages) into `@sdl/capability-kit` as per-domain subpaths co-locating
  interface + real + fake. Repoint every capability/consumer import and **delete the old
  doors** in the same slice.
- Move the SDK-provided services (`command-io`, `progress-phase`) so their interfaces sit in
  `sdl-sdk` and their implementations are hidden in the kernel behind `ctx`; repoint `flow`'s
  direct `progress-phase` import onto `ctx`.
- Move `cli-entry` to its runtime-harness home (kernel or neutral CLI-runtime infra); keep
  `runner-usage` as a pure `@sdl/core` util once confirmed I/O-free.
- Classify the residual ambiguous subpaths (`machine-envelope`, `runner-usage`, `model-slug`,
  `branch-slug`, `temp-files`, `xdg`, `clock`, `timers`, `stdin`, `workspace-root`,
  `brmem-cli`) by the `ctx`/I/O test and document each disposition.
- Document the four-bucket classification rule in CONTEXT/ADR so the tiers stay coherent after
  the move.

## Non-Goals

- Do not relocate or re-tier `@sdl/brmem` — it is the named exception; its SDK-provided
  relocation (below the kernel, vended through the api object) is a separate follow-up
  Objective.
- Do not add a lint guard forbidding capability→real-adapter imports in this Objective.
  Enforcement of "capabilities use the interface, not the real adapter" is **review-only for
  now**; the guard is a tracked follow-up.
- Do not redesign capability behavior, command faces, or the `sdl-sdk` author API beyond
  moving existing interfaces to their classified home.
- Do not take on the umbrella's capability-migration or transitional-package-deletion work.
- Do not migrate the standalone tools (`areg`, `vibechk`, `packagechk`, `worktree-status`)
  off-axis, except where they import a relocated `@sdl/core/*` subpath.

## Completion Criteria

- `@sdl/core` exports only pure utilities; no `@sdl/core` subpath performs real-world I/O or
  wraps an external tool. `@sdl/core/exec` and `@sdl/core/git` no longer exist as
  capability-facing doors.
- `git`, `github-*`, `exec`, `graphite`, and `cmux` are reachable only as
  `@sdl/capability-kit/<domain>` per-domain subpaths, each co-locating interface + real +
  fake; no capability imports the raw I/O directly.
- `command-io` and `progress-phase` are reached by capabilities through `ctx`; their
  interfaces live in `sdl-sdk` and implementations in the kernel; `flow` no longer imports
  `progress-phase` directly.
- `cli-entry` lives in its runtime-harness home; `runner-usage` is a pure util or, if it does
  I/O, is reclassified and re-homed accordingly.
- Every one of `@sdl/core`'s original subpaths has a documented disposition under the
  four-bucket rule, and the rule itself is recorded in CONTEXT/ADR.
- Evidence: targeted package tests for touched packages pass; source searches confirm
  capability imports of `@sdl/core/exec` / `@sdl/core/git` are gone; the runtime dependency
  graph remains acyclic.

## Assumptions and Risks

Assumptions:

- The "reached-through-`ctx` ⇒ SDK-provided" test cleanly classifies every core subpath;
  ambiguous cases (`machine-envelope`, `runner-usage`) resolve by inspecting whether the
  author touches them through the api object or only as a pure shape.
- Gateways genuinely are derivable from `exec`, so moving them above the SDK into
  `@sdl/capability-kit` requires no new kernel surface.
- `@sdl/capability-kit` absorbing all gateway adapters is acceptable even though it stops
  being the ~882-LOC thin seam the umbrella describes; its character intentionally changes
  from "thin `ctx`→gateway adapter" to "the gateway library."
- `@sdl/brmem` is separable as the one stateful service that follows the SDK-provided pattern
  rather than the kit pattern, and isolating it does not block the rest of this work.

Risks:

- **Review-only enforcement leak.** With reals and interfaces co-located in
  `@sdl/capability-kit/<domain>`, a capability can still import the real adapter and skip the
  gateway, re-creating today's `core/exec` leak one tier up. Mitigation: a `SDL_TS_BAN_*`
  subpath guard is an easy follow-up; track whether leaks actually appear before building it.
- **Broad mechanical repoint.** `@sdl/core` has fan-in 31 and `exec` alone has 112 import
  sites; repointing touches nearly every package, risking a partial migration that leaves two
  doors open at once. Mitigation: delete each old subpath in the *same* slice that repoints
  its consumers.
- **Ambiguous subpaths misfiled.** `machine-envelope` and `runner-usage` may not classify
  cleanly; filing them in the wrong bucket re-introduces the incoherence this Objective
  removes. Mitigation: classify by concrete consumer evidence and document the call.
- **Drift with the umbrella.** Making `brmem` SDK-provided (in its follow-up) contradicts the
  umbrella's current "no domain gateways in `sdl-sdk`" Non-Goal. This is a recorded,
  principled exception (a stateful service, not derivable from `exec`), to be reconciled in
  the umbrella's wording when the brmem follow-up lands — not silently resolved here.

## Open Questions

- Does `cli-entry` belong in the kernel or in a neutral CLI-runtime infra package, given that
  non-extension tools (`areg`, `vibechk`, `brmem`) also import it to boot their programs?
- Is `machine-envelope` an SDK-provided output service (interface in `sdl-sdk`, impl in
  kernel) or a kit gateway? It is an output protocol, not obviously derivable from `exec`.
- When `brmem` becomes SDK-provided in its follow-up Objective, is the umbrella's "no domain
  gateways in `sdl-sdk`" Non-Goal rewritten, or does `brmem` ride a distinct "host service"
  surface kept separate from the gateway non-goal?
- Should the per-domain kit subpaths expose `real` and `fake` under nested subpaths
  (`/git/real`, `/git/testing`) now, to make a future ban-guard trivial, even though
  enforcement is deferred?
