# Descriptor activation contract and Objectives contribution implemented

## Summary

Implemented and verified the first bounded contract slice of the activation-surface roadmap work.
The public `ExtensionDescriptor` now has optional plain-data activation metadata:

```ts
activation?: {
  instructions?: string;
  consumerDirs?: readonly string[];
}
```

Descriptor-boundary validation is strict. Instructions must be preserved as one Markdown section
beginning with a non-empty level-2 heading. Consumer directories must be unique canonical POSIX-style
repository-relative paths strictly beneath `.ns/`; invalid and duplicate entries report focused field
or index paths. Both children remain independently optional, including an empty activation object.

The promoted extension-author guide and complete SDK reference now document the type, validation
invariants, no-hook rationale, and the boundary between the shipped declaration contract and future
core lifecycle consumption.

`@nseng-ai/objectives` now owns and declares its exact day-one Objectives instruction section,
including `ns objective exec load-orientations --format md`, together with
`consumerDirs: [".ns/objectives"]`. A package-level exact-contract test validates the complete
contribution through the kernel descriptor boundary without loading command thunks.

## Objective Impact

The broad activation implementation roadmap row moves from `[ ]` to `[~]`. This contract and
first-party declaration are meaningful progress, but no Objective completion criterion is newly met.

Still remaining in the encompassing row: generic `ns init` descriptor consumption, the `AGENTS.md`
pointer stanza and `.ns/instructions.md` regeneration, consumer-directory creation, artifact
provisioning, extension install/uninstall/update reconciliation, and removal of objectives-specific
behavior from `@nseng-ai/ns-init`.

## Validation

Passed focused kernel and Objectives package typechecks/tests, the TypeScript style guard, TypeScript
format/lint/typecheck gates, dprint formatting, and the full repository `just` gate (including all
4,785 default TypeScript tests and the Objective edge sweep).

## Follow-Ups

Implement generic descriptor consumption in `@nseng-ai/ns-init` and make lifecycle orchestration own
all activation writes. Do not add activation hooks or delete extension consumer data during uninstall.
