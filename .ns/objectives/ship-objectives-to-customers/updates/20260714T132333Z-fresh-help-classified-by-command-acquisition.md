# Fresh `ns --help` classified by command acquisition

## Summary

Top-level help now presents commands by how customers acquire them rather than by the SDK's internal catalog source level. The bare `@nseng-ai/ns` host renders all six distribution-shipped namespaces and commands — `init`, `update`, `shell`, `completion`, `extension`, and `skills` — under `Built-ins:` and omits the empty `Extensions:` section. Commands introduced only by project-declared extensions render under `Extensions:`, while project additions to or overrides within an established distribution namespace leave that namespace under `Built-ins:`.

## Evidence

- `ts/packages/sdk/src/extensions/descriptor-catalog.ts` defaults preinstalled descriptor entries to the built-in help category without changing their `preinstalled` source level.
- `ts/packages/sdk/src/extensions/registry.ts` preserves presentation metadata through higher-precedence project overrides while retaining project source provenance and override diagnostics.
- `ts/packages/sdk/src/cli/index.ts` resolves one top-level help category from the complete command-info set, removing first-leaf ordering from group classification.
- Focused SDK registry, SDK CLI integration, and host CLI tests passed, including section-boundary assertions for fresh help, project-only commands, mixed namespaces, loaded listing metadata, and direct/nested overrides.

## Objective impact

This corrects the bare-core customer presentation surface without changing descriptor loading, extension acquisition, catalog precedence, lazy command loading, or execution semantics. It supplies fresh-install help evidence for `ship-objectives-to-customers`; it does not change the release scope or acquisition-path gates owned by `objectives-bare-core-release`.
