# @nseng-ai/extension-kit

See @AGENTS.md in this directory for package rules.

The package also exposes the shared model-policy contract at
`@nseng-ai/extension-kit/model-policy`. Repositories configure typed model
profiles and operation overrides in the top-level `ns.toml` `[models]` table:
`[models.profiles]` maps names to qualified provider/model references and
`[models.operations]` maps operation IDs to profile names. Omitted operations use
`fast`; the package owns policy parsing and resolution while extensions retain
operation-specific validation.
