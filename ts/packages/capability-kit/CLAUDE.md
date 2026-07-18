# @nseng-ai/capability-kit

See @AGENTS.md in this directory for package rules.

The package also exposes the shared model-policy contract at
`@nseng-ai/capability-kit/model-policy`. Repositories configure typed model profiles
and operation overrides in the top-level `ns.toml` `[models]` table. Each
`[models.profiles.<name>]` table requires both `model`, a qualified provider/model
reference, and `thinking`. `[models.operations]` maps operation IDs to profile names.
Capabilities own their operation-specific default profile names (for example,
`ultrafast` for slugs or `fast` for prose); every selected profile must exist in the
repository policy. The package owns policy parsing and resolution while capabilities
retain operation-specific validation.
