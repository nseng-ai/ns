# Steelthread Subobjective Closed; Synthesis and Cross-Child Lesson

## Summary

The `ns-skills-steelthread` Subobjective closed 2026-07-06 as completed (its `## Closure` + `closed.md`). The thread proved the harness-artifact provisioning architecture end-to-end: a static first-party catalog → harness path table (`pi`/`claude-code`/`codex`, aliases, user/project scope, `CLAUDE_CONFIG_DIR`) → deterministic provision plan → local-copy materialization → install manifest v1 with per-file SHA-256 hashes, surfaced as `ns skills list/path/install [--dry-run] [--force]` and consumed by the `@nseng-ai/ns-init` `RealSkillMaterializer` seam. Zero `npx skills` dependency; no stubbed layers. Full `just` green (main suite 4539, `typescript-style-guard` 120, tsgo, objective edge sweep `sweep-ok`).

The `[~]` child row on the roadmap is flipped to `[x]`.

## Objective Impact

The umbrella's shared-core ambition now rests on a validated thread. The decided architecture (static explicit catalog + harness path table + reconcile-compatible plan/apply + inspectable hashed manifest) held under real implementation; the `@nseng-ai/harness-artifacts` package boundary is confirmed by a real second-consumer seam (`ns-init`) beyond the CLI.

## Cross-Child Lesson

A late feedback-remediation refactor introduced two Closure-Gate breaks that the child's independent re-validation caught (the roadmap's "green at every slice" claim had gone stale):

1. **Kernel SDK has two export sync points, not one.** `@nseng-ai/kernel/sdk` is mirrored by a hand-maintained virtual module in `runtime/module-loader.ts` (for jiti-loaded extension command entries). Any symbol added to the SDK barrel must be added to that mirror too, or `sdk-module-loader.test.ts` fails. Future shared-core work that touches the SDK surface must update both.
2. **A helper returning an `extensions` registry type belongs in `extensions`, never `sdk`.** Placing `repoLocalNsExtensionToPreinstalledCatalog` in the `sdk` circle forced an upward `sdk -> extensions` import, closing a non-deferred subpackage-topology cycle (`deferredTopologyCircleCycles` is intentionally empty). The fix: keep it in `extensions` and surface it through `@nseng-ai/kernel/cli` (where the sibling `PreinstalledNsCommandCatalogEntry` type already lives). Binding guidance for the AREG re-platforming row, which will add more shared-core exports.

## Follow-Ups (parked-row dispositions unchanged)

- The **"Re-platform AREG onto the shared core"** parked row is now unblocked by this closure — it is the first-declared follow-on and the natural next Subobjective (converge `skills-lock.json` with the install manifest on one hash/record format; replace areg's `npx skills` materialization with the shared provisioner). Graduate it when prioritized.
- Remaining parked rows keep their dispositions; the "decide disposition of each parked row after the steelthread validates" work row is now actionable.
