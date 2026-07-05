# Rebaseline package-scope claims to the landed `@nseng-ai/*` scope (ADR 0028)

## Summary

Trunk-explicit, non-closing rebaseline against ground truth at HEAD. The design contract verified intact and the subsystem remains unimplemented: no `@nseng-ai/harness-artifacts` package exists (`git ls-files` for `harness-artifact` matches only this record's own updates), `ns --help` exposes no `skills`/`provision` command (its extensions are address/aretro/branch-context/flow/handoff/objective/…), and `references/pup-skill-management-report.md` remains checked in. All roadmap rows stay unchanged — vocabulary `[~]`, everything else `[ ]`.

One material claim class had gone stale: the record described workspace packages as `@ns/*`-scoped. That was ADR 0026's original plan, but **ADR 0028 superseded it to bare `@nseng-ai/*`**, and that is the landed ground truth. Verified at HEAD:

- Actual package scope is uniformly `@nseng-ai/*`: `@nseng-ai/kernel` (its `bin` maps `ns` → `./src/cli/index.ts`), `@nseng-ai/areg` (`ts/packages/tools/areg`), `@nseng-ai/handoffs`. A `grep` for `@ns/` across every `ts/**/package.json` returns zero.
- The extension-manifest carrier claim holds where it was already right: the field key is `ns` (`manifest.ns.commands`, parsed by `ts/packages/kernel/src/extensions/discovery.ts`) and repo state lives under `.ns/` — only the owning package name was wrong (`@nseng-ai/kernel`, not `@ns/kernel`).

Other contract facts re-verified unchanged: `skills/skillx` present; AREG's `npx-skills` gateway (`src/gateways/npx-skills-gateway.ts`), lockfile/check operations (`src/operations/lockfile.ts`, `check.ts`), and the live "managed artifacts" overlay sense (`src/operations/skill-kind.ts`) all still present, so the skills-lock convergence open question and the overlay-rename cleanup stay live; the three AREG migration Objectives (`migrate-areg-and-ns-skills`, `areg-typescript-port`, `areg-ts-cli-cleanup`) all carry `closed.md`; the mirrored edge to `ship-objectives-to-customers` is intact on both sides.

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD

## Objective Impact

- `objective.md` corrected: every `@ns/*` package reference rebaselined to `@nseng-ai/*` (`@nseng-ai/kernel`, `@nseng-ai/areg`, handoff artifacts now `@nseng-ai/handoffs`, candidate package `@nseng-ai/harness-artifacts`); the naming note now cites ADR 0028 as the scope amendment and states plainly that no `@ns/*` package names exist. The lingering "SDL vocabulary" phrase in the bare-artifact risk was updated to "ns vocabulary". Thesis, scope, non-goals, completion-criteria shape, and open questions otherwise unchanged.
- `roadmap.md` corrected: same `@ns/*` → `@nseng-ai/*` fixes in the vocabulary, extension-carried, AREG re-platform, and reconcile rows. No status changes; the subsystem remains unimplemented.
- No closure: all core deliverables remain open work.

## Follow-Ups

- None new. Next actionable steps are unchanged: confirm the package name (`@nseng-ai/harness-artifacts` leading) and the first harness set (`pi` + `claude-code` lean), then the design row.
