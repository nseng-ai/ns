# Pi Extensions Shim and Autopilot Cleanup

## Summary

Remediated the `pi-extensions` code-smell cluster. The repeated `.pi/extensions` relative package re-export shims now route through `.pi/lib/workspace-packages.ts`; that helper keeps package resolution private, exposes only the default extension import shape callers use, and owns concrete fallbacks for workspace packages not reachable from the root package dependency graph. In `.pi/extensions/objective-autopilot.ts`, the recurring `pi`/`ctx` pair is now carried as `AutopilotEnv`, child/recovery progress widgets share one renderer/model formatter, and child/recovery report parsing shares one marker-block parser.

## Objective Impact

All 5 `pi-extensions` findings now have fixed dispositions in `roadmap.md`: the environment data clump, progress-widget duplication, shim duplication, report-parser duplication, and workspace-package-helper speculative generality are removed without intended behavior changes. This reduces the open code-smell backlog by one cluster while keeping the remediation inside the original `.pi/extensions` / `.pi/lib` scope.

Validation passed on 2026-06-30: `node --experimental-strip-types` import smoke checks for `.pi/lib/workspace-packages.ts`, the five modified shim extensions, and `.pi/extensions/objective-autopilot.ts`; `just ts-format-check`; `just ts-lint`; `just ts-check`; `just dprint-check`.

## Follow-Ups

None for this cluster. The remaining open Objective rows are the larger infra/capabilities/local-pi-tools/capability-pi/tools/hosts/aretro clusters, with overlap checks still required where noted in `roadmap.md`.
