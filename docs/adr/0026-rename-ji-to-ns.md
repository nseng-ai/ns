# ADR 0026: ns Product Identity

## Status

Accepted

## Context

The product needs a short, durable identity across its CLI, configuration, agent surfaces, and published distribution. Before public release, a complete hard cut is safer than preserving aliases for superseded names.

## Decision

The product's proper name is **ns**, always lowercase, including at sentence starts. It evokes three meanings: **nonslop**, **namespace**, and Nick Schrock's initials.

Current product surfaces use:

- CLI and bin: `ns`
- repository configuration and state: `.ns/` and `ns.toml`
- slash-command prefix: `/ns:*`
- environment prefix: `NS_*`
- npm scope: `@nseng-ai`
- product package: `@nseng-ai/ns`

Name cutovers are hard: active code and current documentation do not provide old-name aliases, fallback paths, or dual reads. Immutable historical records remain verbatim rather than being scrubbed.

Collision handling is inventory-driven. The common token `ns` is not evidence of product usage, so cutover verification searches for known obsolete forms instead of asserting every `ns` occurrence is branded.

## Consequences

- Users encounter one product identity across CLI, config, slash commands, environment, and npm.
- Pre-public renames do not create permanent compatibility surface.
- Historical ADRs, closed records, and commits can retain the vocabulary true at their time.
- Package-specific identity remains governed separately from release disposition.

## Alternatives

- **Keep a superseded product name:** rejected because it would freeze weaker naming into public surfaces.
- **Compatibility aliases and fallback reads:** rejected because there was no public consumer base requiring them.
- **Claim an `@ns` npm scope or unscoped package:** rejected; the established publication identity is `@nseng-ai`.
