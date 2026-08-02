# ADR 0051: Text-content Points

## Status

Accepted (refines ADR 0031)

## Context

ADR 0031 defines two accepted Point kinds: a **Hook** (commands the owning workflow executes) and a **Prompt** (LM-facing content the SDK selects for the owning workflow). Some customization surfaces instead need one uninterpreted text value selected from a file. This content is neither executable behavior nor necessarily input to an LM.

Classifying such content as a Prompt would falsely imply LM-facing semantics and Markdown conventions. Making each workflow parse its own config and implement its own source-precedence ladder would recreate the fragmentation ADR 0031 eliminated.

## Decision

The Point system gains a third first-class accepted kind:

- **Text-content**: cardinality-one, uninterpreted text whose source the SDK selects and reports. The SDK never renders the text, interprets placeholders, or invokes an LM for it.

A repository consumer installs text-content as one non-empty repository-relative path string in the `ns.toml` `[points]` table. The conventional project file is `.ns/text-content/<point-id>.txt`. A definition may declare a package-relative default, conventionally a `.txt` file resolved relative to the defining descriptor manifest.

Resolution follows the same precedence ladder as Prompt content: development environment override, `[points]` installation, conventional file, descriptor default. A point descriptor may name an optional `developmentOverrideEnvVar` for a cardinality-one Prompt or Text-content point. This is definition metadata for extension development, not a generic environment-variable naming convention or project configuration tier.

Resolution is fail-closed: a selected source that is missing, unreadable, or invalid is an error for the consuming workflow, never a silent fallback to a lower-precedence source. Introspection (`ns extension points`, `ns extension point <id>`) reports the selected Text-content source distinctly from Prompt sources.

The consuming workflow decides what the selected text means. If a workflow chooses to treat it as a format or template, that workflow owns all grammar, validation, and rendering. Those semantics do not become SDK behavior.

## Consequences

- Uninterpreted text customization shares descriptor, `[points]` parsing, catalog, source selection, and diagnostics machinery instead of introducing parallel workflow config parsers.
- Prompt semantics stay precise: `prompt` continues to mean LM-facing content.
- Consumers may interpret selected Text-content, but the SDK remains a source selector and reporter.
- The `accepts` union is widened across descriptor validation, config parsing, catalog construction, and introspection; existing Hook and Prompt behavior is unchanged.

## Alternatives

- **Execute the customization as a Hook:** rejected; a command is executable behavior, not a selected text value, and would obscure the data boundary behind subprocess execution.
- **Reuse Prompt:** rejected; it misstates LM involvement and imposes Prompt/Markdown semantics on otherwise uninterpreted text.
- **Use a workflow-specific config parser:** rejected; it duplicates Point definition, installation, precedence, diagnostics, and introspection mechanics.
- **Render or interpret the text in the SDK:** rejected; formats, placeholders, and other meaning are workflow policy. Central rendering would couple the SDK to consumer vocabularies.
- **Cardinality-many Text-content:** rejected for now; this kind represents one selected text value, and no demonstrated consumer needs SDK-defined text composition semantics.
