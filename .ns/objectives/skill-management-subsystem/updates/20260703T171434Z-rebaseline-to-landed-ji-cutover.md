# Rebaseline naming and AREG-coordination claims to the landed ji cutover

## Summary

Trunk-explicit, non-closing rebaseline against ground truth at HEAD. The record's design contract (harness-artifact vocabulary, reconcile primitive, `ji update` hook, install manifest with content hashes) verified intact and unimplemented — no `@ji/harness-artifacts` package exists, `ji --help` exposes no `skills` command, and `references/pup-skill-management-report.md` remains checked in. Four environment claims had gone stale since the ADR 0024 cutover landing (commit `d6184e4c4` and the package-scope sweep):

- The naming note claimed the repo's binary "is still `sdl` until the `ji-core-cutover` landing" and that package names keep `@sdl/*` spelling. The landing has executed: `ji` is the live bin of `@ji/kernel`, state lives under `.ji/`, and zero `@sdl/*` package names remain (`@ji/areg`, `@ji/handoff`, `@ji/kernel` verified). `rename-sdl-to-ji` and `ji-core-cutover` remain open for residual sweep work.
- The extension-manifest carrier is now the `ji` field in `package.json`, parsed by `@ji/kernel` extension discovery (`ts/packages/kernel/src/extensions/discovery.ts`); the `sdl` field and the `sdl-sdk` package are gone (directory remnants only, no `package.json`).
- The three AREG Objectives named as "active" coordination partners (`migrate-areg-and-ns-skills`, `areg-typescript-port`, `areg-ts-cli-cleanup`) are all closed. The coordination surface for AREG re-platforming is now the landed `@ji/areg` codebase itself — its `npx-skills` gateway (`src/gateways/npx-skills-gateway.ts`) and `skills-lock.json` operations (`src/operations/lockfile.ts`, `check.ts`) verified still present, so the skills-lock convergence open question stays live.
- Path fixes in the bare-"artifact" collision risk: handoff artifacts live in `@ji/handoff`, consumer artifacts in `docs/conventions/platform-and-consumer.md`, and extensions sit under `.ji/extensions` (not `.sdl/extensions`). AREG's "managed artifacts" overlay sense verified still live in `src/operations/skill-kind.ts` — the rename cleanup remains real work.

Provenance: objective-refresh basis target=5668ac5630b2bab397ef85b9e4cfe4d5cd84c420 from=trunk-HEAD

## Objective Impact

- `objective.md` rewritten: naming note rebaselined to the landed cutover; extension-carrier claims moved from `sdl` field/`sdl-sdk` to `ji` field/`@ji/kernel`; the AREG-coordination completion criterion and overlap risk rewritten around the closed migration Objectives and the landed `@ji/areg` implementation; collision-risk paths corrected. Thesis, scope decisions, non-goals, completion criteria shape, and open questions otherwise unchanged.
- `roadmap.md` rewritten: extension-carried row and AREG re-platform row updated to the same landed facts; reconcile row names `@ji/areg`. All row statuses unchanged — vocabulary row stays `[~]` (package name unconfirmed), everything else `[ ]`; the subsystem remains unimplemented.
- No closure: all core deliverables remain open work.

## Follow-Ups

- None new. Next actionable steps are unchanged: confirm the package name (`@ji/harness-artifacts` leading) and the first harness set (`pi` + `claude-code` lean), then the design row.
