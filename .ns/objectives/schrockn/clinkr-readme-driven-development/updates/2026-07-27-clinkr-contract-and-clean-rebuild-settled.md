# Clinkr Contract and Clean Rebuild Settled

## Summary

The Clinkr README-driven pass has settled its product contract and rebaselined implementation around a clean rebuild. The broad steelthread proved filesystem-first authoring across Clinkr, Foundation, SDK composition, Flow, Objectives, and Brmem, but it also exposed parallel transitional machinery: immutable nodes lowered into the legacy mutable runtime, SDK pre-selection preceded dispatch, topology was traversed repeatedly, validation and rendering retained multiple owners, and descriptor typing remained permissive. The steelthread is therefore acceptance and failure-mode evidence, not production architecture to preserve.

The approved contract uses filesystem-owned routes with cheap `metadata.ts`, selected-only `command.ts`, and cheap complete `group.ts`; stdin-only `--input-json`; the exact `human | json | md` format domain; command-level renderers; invocation-owned context; app-owned completion; and framework-neutral raw execution. Contextful apps and structured definitions use `requiresContext: true`, while omission means context-free. `resultSchema` is the sole typed payload schema; negative, failure, and usage-error outcomes have fixed shapes with optional unvalidated diagnostic data, and `success | negative | failure | usage-error` is the internal and wire vocabulary. A narrow scoped builder mounts recursively lazy sources that own disjoint subtrees; duplicate commands, command/group collisions, and every cross-source shared group path fail rather than merge or override. Raw modules return `defineRawCommand(...)`, and specialized APIs remain on named subpaths.

The production direction is one deep `ClinkrApp` module over one private recursively lazy topology and one traversal for execution, help, schema, and completion. Clinkr owns validation, envelopes, rendering, raw dispatch, completion, and exception policy. Filesystem and programmatic sources adapt into this topology, and Commander is fresh per-invocation materialization rather than a second router. The rebuild proceeds in dependency order through command contracts, topology/runtime, Foundation and Brmem acceptance, SDK composition and Objectives acceptance, remaining callers, legacy deletion, package qualification, and README promotion.

## Objective Impact

`references/README-draft.md` is the approved cold-audience prose contract. It removes provisional license/guide promises, requires Node.js `>=24.12.0`, makes `md` the sole Markdown CLI token while retaining `renderMarkdown`, specifies structured JSON input, records shell-completion maturity, and keeps advanced composition focused. `references/implementation-contract-notes.md` preserves detailed acceptance behavior; `references/steelthread-contract-changes.md` and `references/steelthread-implementation-lessons.md` preserve provenance and rebuild constraints.

The Objective no longer attempts to polish the prototype stack in place. Completion requires one runtime and traversal, immediate-child laziness, truthful context typing, exact descriptor decoding, topology-preserving composition, explicit raw/completion ownership, representative Brmem and Objectives acceptance, removal of compatibility owners, packed-artifact evidence, canonical README promotion, and return of the steelthread rebaseline lesson to `foundation-readme-driven-pass`.

The active implementation stack remains open rather than landed: PR #3948 carries this contract/rebaseline; open descendants PR #3951, PR #3952, PR #3953, PR #3949, and PR #3950 establish command/outcome contracts, filesystem-backed execution, executable README examples, structured-runtime hardening, and raw dispatch. Their implementation evidence belongs with those descendant changes rather than being recorded as trunk state here.

Provenance: objective-refresh basis target=b354ba6c25e0b8da6e384e506ee37999aa2f220e from=0d199790b94c377ac17e78e0c031670423a8b01c

## Follow-Ups

- Land and review the dependency-ordered rebuild without connecting the new runtime to the legacy runtime through compatibility lowering.
- Complete private topology/source composition and the single runtime before Foundation/Brmem and SDK/Objectives acceptance.
- Reconcile the stale status-specific-schema sentence in `references/README-draft.md` with the approved typed-success/untyped-diagnostics contract.
- Return the reusable process rule to the parent Objective: when a steelthread validates the product interface but falsifies the central implementation architecture, preserve its evidence and rebaseline before broad migration.
