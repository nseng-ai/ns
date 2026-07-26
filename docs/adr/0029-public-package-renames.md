# ADR 0029: Public Workspace and Package Identity

## Status

Accepted

## Context

Workspace package names become public API once packages release. Maintaining different internal and published names would need permanent alias mapping, while generic internal labels would leak externally by accident.

Package **identity** and **release disposition** answer different questions. Identity is npm name. Disposition records whether current contract is public, incubating, or internal; governed by package path ontology.

## Decision

Externally intended workspace packages use published identity directly under `@nseng-ai/<leaf>`. No workspace-to-published alias mapping. Package directories use same leaf identity required by current package ontology.

Choose externally meaningful package names before publication. Current examples: `@nseng-ai/foundation`, `@nseng-ai/objectives`, `@nseng-ai/slots`, `@nseng-ai/handoffs`, `@nseng-ai/pr-feedback`, `@nseng-ai/reviews`.

Renames are hard cuts, no package aliases. Package identity does not dictate command or domain vocabulary: npm packages may be plural while noun-oriented command groups stay singular; independently useful packages not folded into `@nseng-ai/ns` merely to hide names.

Release disposition stays separate axis. Move between `public/` and `incubating/` changes release commitment, not `@nseng-ai/*` identity. Crossing `internal/` boundary also needs deliberate scope and identity cutover imposed by its separate `@internal/*` contract; that coupled cutover does not make disposition identity field.

## Consequences

- Imports, workspace manifests, eventual consumer installs use one identity.
- Public names deliberate before becoming compatibility commitments.
- CLI nouns and domain terms can stay optimized for users, not mirroring npm names.
- Disposition changes stay explicit release decisions; only move across internal boundary also entails identity cutover.

## Alternatives

- **Publish-time aliases:** rejected; adds permanent mapping and package-manager complexity.
- **Partial rename:** rejected; accidental names then freeze at different times.
- **Fold all packages into `@nseng-ai/ns`:** rejected; independently useful package boundaries should stay available.
