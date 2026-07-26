# ADR 0026: ns Product Identity

## Status

Accepted

## Context

Product needs short, durable identity across CLI, configuration, agent surfaces, published distribution. Before public release, complete hard cut is safer than keeping aliases for superseded names.

## Decision

Product's proper name is **ns**, always lowercase, including at sentence starts. Evokes three meanings: **nonslop**, **namespace**, Nick Schrock's initials.

Current product surfaces use:

- CLI and bin: `ns`
- repository configuration and state: `.ns/` and `ns.toml`
- slash-command prefix: `/ns:*`
- environment prefix: `NS_*`
- npm scope: `@nseng-ai`
- product package: `@nseng-ai/ns`

Name cutovers are hard: active code and current documentation have no old-name aliases, fallback paths, or dual reads. Immutable historical records stay verbatim, not scrubbed.

Collision handling is inventory-driven. Common token `ns` is not evidence of product usage, so cutover verification searches known obsolete forms instead of asserting every `ns` occurrence is branded.

## Consequences

- Users meet one product identity across CLI, config, slash commands, environment, npm.
- Pre-public renames create no permanent compatibility surface.
- Historical ADRs, closed records, commits can retain vocabulary true at their time.
- Package-specific identity stays governed separately from release disposition.

## Alternatives

- **Keep a superseded product name:** rejected: would freeze weaker naming into public surfaces.
- **Compatibility aliases and fallback reads:** rejected: no public consumer base needed them.
- **Claim an `@ns` npm scope or unscoped package:** rejected: established publication identity is `@nseng-ai`.
