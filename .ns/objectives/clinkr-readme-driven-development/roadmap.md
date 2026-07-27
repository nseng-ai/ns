# Roadmap

## Work

- [x] Settle the original cold-audience Clinkr story and approve the filesystem-first direction, app-owned execution/completion, explicit outcomes, command-level rendering, narrow raw escape hatch, invocation-owned context, and runtime discovery without manifests or production codegen.
- [x] Build a broad steelthread through Clinkr, Foundation, SDK composition, Flow, Objectives, and Brmem. It proved the filesystem-oriented result and exposed contract refinements around command metadata separation, CLI-directory ownership, framework usage-error schema composition, presentation-ready string rendering, status-specific outcome schemas, packaging, and real-host behavior.
- [x] Rebaseline the Objective from prototype reconciliation to a clean rebuild. Bless the steelthread as evidence rather than production architecture; record contract changes in `references/steelthread-contract-changes.md`, implementation lessons in `references/steelthread-implementation-lessons.md`, and the decision in `updates/2026-07-27-steelthread-rebuild-rebaseline.md`.
- [ ] Review and bless `references/README-draft.md` as the implementation source of truth. Resolve the reopened builder, context-free typing, completion ownership, extension-topology composition, raw-definition, and public-entrypoint questions; remove provisional wording; and add compile fixtures for every TypeScript example plus an executable fixture for the primary one-command path.
- [ ] Rebuild Clinkr's single runtime and filesystem topology directly from the blessed README. Enforce immediate-child recursive laziness, strict command/group shapes, honest context-free/contextful types, transactional selected loads with in-flight sharing/success caching/retry, one outcome-schema and rendering owner, explicit raw behavior, app-owned executable policy, and no legacy lowering or compatibility public model.
- [ ] Prove the standalone integration by migrating Brmem's `src/cli/` tree onto the rebuilt interface. Preserve fake-driven command scenarios and hidden `exec` behavior, add packed-tarball inventory evidence, and delete every temporary adapter used by this slice before continuing.
- [ ] Rebuild SDK/host composition over the same topology and selection traversal. Decode extension descriptors into an exact discriminated union, preserve source precedence and actionable diagnostics without flattening/reconstructing trees, and route execution, help, schema, and completion without pre-dispatch or host-specific duplicate selection.
- [ ] Prove the real-host integration by migrating Objectives. Cover visible and hidden groups, Markdown and JSON output, framework and command usage errors, all selected operations, context adaptation, malformed neighbors, and import counters at nested depths; delete any compatibility path before broad migration.
- [ ] Migrate remaining callers in dependency order, porting behavior tests rather than prototype-internal tests. Remove obsolete mutable groups, per-exit render fields, automatic aliases, duplicate validation/render synthesis, broad descriptor detection, and old completion/raw paths rather than maintaining dual support.
- [ ] Verify the reconciled package and representative callers, including packed layout and shell-completion instructions, then promote the blessed draft to Clinkr's canonical package README and replace the Objective draft with a provenance pointer.
- [ ] Return the steelthread and rebuild gate lessons to `foundation-readme-driven-pass`, including the rule to rebaseline when a vertical slice validates the product interface but reveals central parallel architecture, then close this Subobjective.

## Parked

- Opaque Commander subtree mounting until a concrete caller requires a framework-specific adapter.
- Generated manifests, filesystem codegen, and single-file bundle support; use a justified programmatic seam or a later dedicated adapter rather than weakening the common filesystem contract.
- Per-command context derivation beyond the homogeneous contextful tree until concrete callers justify another model.
- Unrelated Clinkr utilities or downstream CLI redesign discovered during the rebuild; split those into separately tracked work after discussion.
