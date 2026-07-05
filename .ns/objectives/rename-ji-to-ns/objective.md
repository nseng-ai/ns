---
edges:
  - objective: checkout-free-sdl-distribution
    annotation: Supplies and gates that Objective's publish name — the external package target moves to @nseng-ai/ns, superseding the @nseng-ai/ji target it previously recorded as resolved.
---

# Rename ji to ns

## Thesis

The product renames from ji to **ns** — always lowercase (never `NS` or `Ns` as the
product name; `NS_*` env vars are ordinary env-var uppercase, not brand casing). Decided
July 2026, one day after the sdl→ji rename of ADR 0024 landed; the rationale, accepted
collisions, and npm plan live in ADR 0026, with the naming brief at
`docs/ns-naming-brief.md`.

The name carries three meanings at once: **nonslop** — the toolkit that stands athwart
slop calling stop; durable planning, branch memory, and directed handoffs are anti-slop
infrastructure — **namespace** — the CLI is literally a namespace (`/ns:handoff:create`,
`.ns/`, `NS_*`, `ns objective …`), self-describing at every surface — and **Nick
Schrock's initials**, a private signature. "ns = nonslop" is established vocabulary: the
owner's old `nonslop` repo shipped `ns-*` prefixed skills and an `ns-ci` workflow (see
the closed `migrate-areg-and-ns-skills` Objective).

The transition repeats the ADR 0024 playbook: a **hard cutover** with zero compatibility
codepaths, safe because the consumer population is still exactly this repo and the
owner's machines — nothing was ever published under `@nseng-ai/ji`. The GitHub repo is
already renamed: `origin` is `https://github.com/nseng-ai/ns.git` (verified 2026-07-03).

This Objective self-hosts: its own record rides the `git mv .ji .ns` cutover to
`.ns/objectives/rename-ji-to-ns/`.

## Scope

- **Core cutover, one landing window:** `ji` bin → `ns`; repo state dir `.ji/` → `.ns/`
  (`git mv`, paths only); Pi namespace `/ji:*` → `/ns:*`; env vars `JI_*` → `NS_*`; XDG
  namespaces `$XDG_{STATE,CONFIG,DATA}_HOME/ji/` → `.../ns/`; active docs and skills
  sweep; the four `skills/ji-flow-*` dirs → `ns-flow-*`.
- **Internal sweep, same day:** workspace scope `@ji/*` → `@ns/*`; `src/ji/` →
  `src/ns/`; `./ji/...` export subpaths; `ji-*.ts` filenames; the `"ji"` package.json
  manifest key → `"ns"`; `jicc` → `nscc`; `ji.toml` → `ns.toml`.
- **Execution mechanics:** both phases land the same day via the re-instantiated
  refactor-swarm cutover pipeline plus the AST codemod lineage from the sdl→ji rename.
- **Decision records:** ADR 0026, `docs/ns-naming-brief.md`, a superseded banner on
  `docs/ji-naming-brief.md`, and the frozen `collision-register.md` in this record
  (DO-NOT-TOUCH inventory of pre-existing non-brand `ns` tokens).
- **npm naming:** the external publish target is `@nseng-ai/ns`, superseding
  `@nseng-ai/ji` (update `2026-07-03-npm-target-nseng-ai-ji.md` in `rename-sdl-to-ji`);
  the workspace scope is `@ns/*`, superseding that Objective's never-executed
  `@ji/*` → `@nseng-ai/*` correction row. No claim on the public `@ns` npm scope is
  assumed — not as plan A, not as fallback.
- **Machine migration, scripted this time:** shim, zshrc sentinel block, XDG dirs with
  worktree slots via `git worktree move`, `JI_*` shell-profile exports, and
  `refs/ji/*` → `refs/ns/*`.

## Non-Goals

- No compatibility codepaths of any kind: no `ji` alias bin, no `.ji/` or legacy-XDG
  read fallback, no `/ji:*` Pi aliases.
- No scrubbing of history-facing content: closed Objectives, `updates/` files, ADR
  bodies, and migration evidence keep saying "ji" (and "sdl") verbatim forever;
  `git mv .ji .ns` moves paths, never content.
- Non-brand binaries (`slot`, `brmem`, `vibechk`, `areg`, `ccc`, `enriched-plan`,
  `packagechk`) are untouched.
- No "fixing" of pre-existing non-brand `ns` tokens — brmem's `refs/brmem/ns/` segment,
  the `--namespace <ns>` placeholders, the `migrate-areg-and-ns-skills` slug (see
  `collision-register.md`).
- Checkout-dir rename `~/code/sdl-tools` → `~/code/ns` is deferred (documented
  follow-up: `mv` → `git worktree repair` → `just install-tools`).
- No product redesign of `jicc` beyond the mechanical `nscc` rename; folding it into
  `ns` remains a future decision (carried from ADR 0024's parking).
- Marketing narrative stays out of CONTEXT.md and AGENTS.md; the brief under `docs/` is
  its only in-repo home.
- Does not execute `checkout-free-sdl-distribution`'s bundling/publish work; this
  Objective only supplies and gates the name.

## Completion Criteria

- `ns …` is the only invocation surface; no `ji` bin exists in the workspace.
- `.ns/` is the repo state root; `/ns:*` is the Pi namespace; env vars are `NS_*`; XDG
  paths use the `ns` namespace; `just` passes and `ns objective list` works
  post-cutover.
- All workspace packages carry `@ns/*` (or `nscc`) names; the manifest key is `"ns"`;
  `ns.toml` replaces `ji.toml`; no `@ji/` import, `src/ji/` dir, `./ji` export subpath,
  or brand-named `ji-*.ts` file remains.
- Residual-grep invariants are leftover-`ji`-only — no positive-`ns` search is part of
  verification, because `ns` is too common a token (collision register).
- ADR 0026 is merged; `docs/ns-naming-brief.md` is checked in;
  `docs/ji-naming-brief.md` carries the superseded banner with its narrative intact.
- No active doc, skill, or context file introduces `ji` as a surface, path, or
  vocabulary outside historical records.
- The scripted machine migration has run on the owner's machines: shim, zshrc block,
  XDG dirs with slots repaired, profile exports, and no `refs/ji/*` refs remaining.

## Assumptions and Risks

Assumptions:

- The consumer population is exactly this repo plus the owner's machines, and nothing
  has been published under `@nseng-ai/ji`; the hard cutover and the workspace-scope
  supersession are both safe on that basis. If an external consumer appears mid-cutover,
  revisit.
- The `nseng-ai` npm org/scope remains the publish namespace and package name `ns` is
  available/owned there for `@nseng-ai/ns`; no `@ns` org claim is part of the plan.
- The refactor-swarm cutover pipeline and AST codemod from the sdl→ji rename
  re-instantiated cleanly enough to land the core cutover and the package/path/config
  sweep; remaining work is residual trail cleanup rather than proving the pipeline.

Risks:

- **`ns` is an extremely common token** (namespace variables, plurals ending in -ns, DNS
  NS records, nanoseconds, Cocoa's `NS` prefix, NativeScript's `ns` CLI). A naive sweep
  or grep-driven verification would produce false positives; mitigated by the frozen
  collision register and the leftover-`ji`-only invariant rule.
- **Pre-existing in-repo `ns` tokens can be "fixed" by an overzealous edit agent** —
  proven category from the sdl→ji hop, where stale habits regressed `.sdl/` onto trunk.
  The collision register's DO-NOT-TOUCH entries are pasted into the edit-agent brief.
- **In-flight branches and worktree slots** created pre-cutover carry `.ji/` trees and
  old paths; they hit rename-shaped conflicts on restack. Accepted, same as last hop;
  stragglers are fixed by hand under the machine-migration row.
- **Two renames in two days** compounded stale-name habits and the risk has partly
  materialized as leftover active prose/identifier trails after the main cutover. The
  orientation's standing rule carries the durable one-name discipline until this
  Objective closes.

## Open Questions

- None at creation. Publish mechanics for `@nseng-ai/ns` stay with
  `checkout-free-sdl-distribution`; the checkout-dir rename is parked with a documented
  procedure.
