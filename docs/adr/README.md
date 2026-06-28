# Architecture Decision Records

ADRs are durable records of architectural decisions as they were accepted at the time.

## Maintenance policy

- Treat accepted ADRs as historical records. Do not rewrite them just because command names, validation wiring, package names, or implementation details later drift.
- Put current operational guidance in mutable docs, package READMEs, skills, checklists, tests, or CI/Just wiring instead.
- If a later choice changes the architecture decision itself, write a new ADR that supersedes or refines the older one, and cross-reference the relationship.
- Small corrections are acceptable when they fix typos, broken links, or factual mistakes that were wrong when the ADR was written; avoid making old rationale read as if it was written after later migrations.
