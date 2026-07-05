# Rebaseline to the `@nseng-ai` / 25-package world

## Summary

Trunk-style verified rebaseline (branch cut from `master` at `8fdc6f50`, no branch
evidence touching this slug). The record still described a 21-package `@ns/*` world; HEAD
ground truth has moved substantially since the `ji`→`ns` rebaseline. Verified against
`git ls-files`, `package.json` manifests, the ADR corpus, `CONTEXT.md`, and
`CONTEXT-MAP.md`:

- **Scope `@ns/*` → bare `@nseng-ai/*`** (ADR 0028, amending ADR 0026's npm-scope clause;
  internal package name now equals published npm name). Confirmed: `git grep '"@ns/'` over
  `ts/packages/*/package.json` is empty.
- **25 tracked packages**, not 21 (`git ls-files 'ts/packages/*/package.json' | wc -l` =
  25). Growth since the record: the `local/`→`internal/` role directory now has a second
  resident `@internal/typescript-style-guard`, and three new host packages exist —
  `@nseng-ai/ns` (`ts/packages/hosts/ns-cli`, the checkout-free CLI publish target with
  the kernel runtime folded in), `@nseng-ai/command-backed-skill-registry`, and
  `@nseng-ai/pi-command-surfaces`.
- **ADR 0029 renamed seven packages** to public names with directory moves:
  `core`→`foundation`, `objective`→`objectives`, `slot`→`slots`, `handoff`→`handoffs`,
  `address`→`pr-feedback`, `aretro`→`retros`, `roaster`→`reviews`. npm identity only —
  CLI/bin/`/ns:*`/domain vocabulary unchanged (Roaster stays the engine name, `ns objective`
  stays, etc.).
- **Naming exceptions are now** the unscoped `nscc` plus the reserved internal space
  `@internal/*` (two residents under `ts/packages/internal/`), not the single local-space
  `@internal/pi-tools`.
- **Context inventory unchanged at 13** (root + 12 package contexts; `git ls-files
  '*CONTEXT.md'` = 13). The `./land/api` / `./land/testing` flow exports and the
  kernel `./sdk` re-absorption re-verified as still true.
- **CONTEXT-MAP.md was already rebaselined by adjacent work** to 25 packages /
  `@nseng-ai` with correct `capabilities/` link paths, no `sdl-land` Present entry, and a
  correct naming-exception note — so the record's old "map catch-up — post-rename drift"
  narrative was inverted (the map led; the record lagged). Residual map nuance only: a
  "Thirteen present package context files" wording versus 12 package contexts.
- **Root context now titled `ns`** with `SDL` / `Source Development Lifecycle` demoted to
  `_Avoid_` aliases — the old "living docs titled SDL Tools" risk/open-question is
  resolved.
- **ADR corpus grew to 34 files spanning `0001`–`0029`** with five duplicated numbers
  (`0012`, `0016`, `0022`, `0023`, `0024`), up from the record's "29 / `0001`–`0025` /
  four dupes."
- Load-bearing assumptions re-verified as still holding: `.agents/skills/domain-modeling/`
  `CONTEXT-FORMAT.md` + `ADR-FORMAT.md` present; `grill-me` / `grill-with-docs` present;
  `@sdl/domain-primitives-transitional` is not a tracked package.

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD

## Objective Impact

`objective.md` Scope, Non-Goals, Assumptions/Risks, and Open Questions and the whole
`roadmap.md` were rewritten from scratch against the `@nseng-ai` / 25-package baseline;
`orientation.md`'s temporary drift lines were re-derived. The retired `@ns/*` scope, the
21-package count, the "map lags the rename" framing, the "SDL Tools" living-docs risk, and
the stale ADR count were all corrected. The "Map catch-up — post-rename/restructure drift"
roadmap row was closed `[x]` (absorbed by adjacent map work). The undecided-packages set
was updated to add `@nseng-ai/ns`, `@nseng-ai/command-backed-skill-registry`,
`@nseng-ai/pi-command-surfaces`, and `@internal/typescript-style-guard`, and to rename the
prior four (`address`/`clinkr`/`core` → `pr-feedback`/`clinkr`/`foundation`, plus `nscc`).
No closure: this is a standing Objective with active work (Planned contexts unauthored,
undecided decisions unrecorded).

## Follow-Ups

- Record per-package map context decisions for the newer/undecided packages, especially the
  three new hosts and the second internal resident.
- Author the Planned contexts (`areg`, `packagechk`, `retros`, `vibechk`) and re-derive the
  Pi-adjacent slate (`@nseng-ai/flow-pi` phantom, `@internal/pi-tools/*`).
- Opportunistically check whether any package context descriptions still carry stale
  `sdl` / `ji` / `@ns` naming, fixable inline per the obvious-drift policy.
- This refresh edited only the Objective record (`objective.md`, `roadmap.md`,
  `orientation.md`, this update); it did not touch `CONTEXT-MAP.md` or any `CONTEXT.md`.
