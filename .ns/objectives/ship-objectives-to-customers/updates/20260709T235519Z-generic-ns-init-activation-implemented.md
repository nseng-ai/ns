# Generic descriptor-driven `ns init` activation implemented

## Summary

Implemented the bounded generic activation slice across kernel, harness artifacts, and
`@nseng-ai/ns-init`.

The kernel now exposes an internal installed-only loader for the exact ordered extension specs
declared in `ns.toml`. It resolves local packages directly and npm packages only from managed
storage, reuses the descriptor export/import/validation contract, and aggregates declaration
diagnostics without acquiring or updating packages.

Harness artifacts now exposes a prepare/apply path over those already-loaded descriptor facts. It
provisions only supplied `bundledArtifacts` into explicitly selected project harness roots, detects
artifact declaration/path/collision/local-edit failures before activation writes, preserves stale
manifest entries, and never includes the first-party catalog or removes orphaned artifacts.

`ns init` is now extension-agnostic. Before writing, it computes the resulting harness config, loads
the resulting ordered declarations, prepares the exact generic `AGENTS.md` pointer and wholly
generated `.ns/instructions.md`, inspects stable-deduplicated consumer directories, and prepares
artifact work. Any diagnostic returns an empty completion report and no writes. Apply proceeds in
the settled order (`ns.toml`, agent files, generated instructions, consumer directories, artifacts)
and reports completed duties on the first write failure for forward recovery. The retired
Objectives-specific block, directory, skill materializer, symbols, and tests were removed from
`@nseng-ai/ns-init`.

## Objective Impact

The activation roadmap row remains `[~]`, but its `ns init` portion is complete. The only remaining
work in that row is lifecycle reconciliation from `ns extension install|uninstall|update`, including
uninstall deprovisioning while preserving consumer data.

No completion criterion is newly met yet because the bare-core republish and customer onboarding
still depend on those extension lifecycle commands.

## Validation

Focused checks and tests pass for `@nseng-ai/kernel`, `@nseng-ai/harness-artifacts`, and
`@nseng-ai/ns-init`; ns-init real-adapter integration tests pass; the TypeScript style guard passes;
and the retired ns-init terminology grep is empty. The first full `just` run exposed one host help
assertion whose stable generic wording is preserved by the ns-init command description; final full
validation follows the closeout review.

## Follow-Ups

Implement `ns extension install|uninstall|update|list` and invoke the generic activation
reconciliation after lifecycle changes. Do not add acquisition to `ns init`, implicitly include
first-party artifacts, delete stale artifacts during init, or remove consumer directories.
