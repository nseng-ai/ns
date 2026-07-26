# ADR 0029: Public Workspace and Package Identity

## Status

Accepted

## Context

Workspace package names become public API when packages are released. Maintaining different internal and published names would require permanent alias mapping, while generic internal labels would become externally visible accidentally.

Package **identity** and **release disposition** answer different questions. Identity is the package's npm name; disposition records whether its current contract is public, incubating, or internal and is governed by the package path ontology.

## Decision

Externally intended workspace packages use their published identity directly under `@nseng-ai/<leaf>`. There is no workspace-to-published alias mapping. Package directories use the same leaf identity required by the current package ontology.

Choose externally meaningful package names before publication. Current examples include `@nseng-ai/foundation`, `@nseng-ai/objectives`, `@nseng-ai/slots`, `@nseng-ai/handoffs`, `@nseng-ai/pr-feedback`, and `@nseng-ai/reviews`.

Renames are hard cuts without package aliases. Package identity does not dictate command or domain vocabulary: npm packages may be plural while noun-oriented command groups remain singular, and independently useful packages are not folded into `@nseng-ai/ns` merely to hide their names.

Release disposition remains a separate axis. Moving between `public/` and `incubating/` changes release commitment without changing the `@nseng-ai/*` identity. Crossing the `internal/` boundary also requires the deliberate scope and identity cutover imposed by its separate `@internal/*` contract; that coupled cutover does not make disposition an identity field.

## Consequences

- Imports, workspace manifests, and eventual consumer installs use one identity.
- Public names are deliberate before they become compatibility commitments.
- CLI nouns and domain terms can remain optimized for users rather than mirroring npm names.
- Disposition changes remain explicit release decisions; only a move across the internal boundary also entails an identity cutover.

## Alternatives

- **Publish-time aliases:** rejected because they add permanent mapping and package-manager complexity.
- **Partial rename:** rejected because it leaves accidental names to freeze at different times.
- **Fold all packages into `@nseng-ai/ns`:** rejected because independently useful package boundaries should remain available.
