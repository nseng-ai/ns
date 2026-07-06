# Closure Gate Caught Two Post-Refactor Validation Breaks; Remediated and Closed

## Summary

Independent re-validation of every completion criterion (not trusting the roadmap `[x]` markers) confirmed the functional thread intact: `ns skills list/path/install [--dry-run] [--force]` behave correctly across `pi`/`claude-code`/`codex` at both scopes; the install manifest is written with per-file SHA-256 hashes; refuse-to-clobber and `--force` are exercised; the `@nseng-ai/ns-init` `RealSkillMaterializer` seam consumes the shared provisioner. Package suites green (`harness-artifacts` 66, `ns-init` 28).

But the **Closure Gate — full `just` green — was red**, contradicting the prior update's "green at every slice" claim. The regression was introduced *after* the six runner slices, by the feedback-remediation refactor commit (`3e7520006`), not by the slices themselves:

1. **SDK virtual-mirror drift.** The refactor added `repoLocalNsExtensionToPreinstalledCatalog` to the real `@nseng-ai/kernel/sdk` but not to the hand-maintained virtual SDK mirror in `runtime/module-loader.ts`, failing `sdk-module-loader.test.ts`.
2. **Kernel subpackage-topology cycle.** The refactor placed that helper in the low-level `sdk` circle, where it imports `PreinstalledNsCommandCatalogEntry` *up* from `extensions/registry.ts` — a `sdk -> extensions` back-edge closing a non-deferred `extensions -> runtime -> sdk` circle cycle, failing the `typescript-style-guard` topology rule (`deferredTopologyCircleCycles` is deliberately empty).

## Objective Impact

Remediated by moving `repoLocalNsExtensionToPreinstalledCatalog` into the `extensions` circle (`ts/packages/kernel/src/extensions/repo-local-catalog.ts`) and surfacing it through the existing `@nseng-ai/kernel/cli` workspace export — where both consumers (`objectives`, `harness-artifacts` preinstalled catalogs) already import the sibling `PreinstalledNsCommandCatalogEntry` type — rather than minting a new public subpath. The `sdk` circle keeps the descriptor helpers and takes no upward import; kernel subpackage layering is genuinely acyclic, not deferred. The fix was amended into the origin commit (`3e7520006` → `fe6e3151e`) so the broken slice never ships.

After remediation, full `just` is green: main suite 4539/4539, `typescript-style-guard` 120/120, tsgo typecheck clean, objective edge sweep `sweep-ok`. All Completion Criteria are satisfied and independently re-verified, so this thread is closed on its branch.

Frontmatter re-judgment on close: this record carried no `blocked:` sentence; the parent umbrella `skill-management-subsystem` carries none; `ship-objectives-to-customers` keeps its `blocked:` sentence because it rests on `checkout-free-sdl-distribution`, not on this thread (its edge here is a consumption edge). No counterpart frontmatter was edited; all edges left in place.

## Follow-Ups

- Umbrella synthesis: `skill-management-subsystem` should flip its `[~]` child row for this thread and fold in the cross-child lesson (SDK exports have two sync points — the barrel and the jiti virtual mirror — and kernel subpackage layering forbids `sdk -> extensions`; a helper returning an `extensions` registry type belongs in `extensions`, surfaced via `@nseng-ai/kernel/cli`).
- Submit the branch stack when authorized (closure does not require it; merge of the closing branch is the closure event on trunk).
