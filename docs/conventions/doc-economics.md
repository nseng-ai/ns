# Doc Economics

Shared rules for deciding whether a fact or recommendation deserves durable documentation, and in what form. This is the authoritative home of the doc-cost philosophy applied by the retro skills (`docs-retro` for session retros, `branch-retro` for branch-evidence retros); each skill keeps only its skill-specific application inline.

- **Drift risk is a first-class cost.** Document contracts and invariants, not surfaces or enumerations. Prefer changes whose stale state is obvious through tests, command failures, or existing review paths. Never document a negative ("no X exists") — negatives self-heal into lies the moment someone adds X.
- **Point at the source of truth.** State where truth lives ("read `index.ts` for the surface") instead of copying it. Every doc recommendation names its source of truth and what prevents or detects drift.
- **Prefer code over prose.** Executable or tested affordances — a missing helper, a round-trip test linking writer and parser, a better error message, a rename, a CLI operation or `just` target — beat documentation for repeated mechanical work. Code cannot drift.
- **Placement is a cost model.** Standing context (`AGENTS.md`, `CLAUDE.md`, ambient skill frontmatter) is paid in every session forever; lazy-loaded text (code comments, skill `references/`, `CONTEXT.md`) is paid only on retrieval. A doc earns its keep only on a discovery path agents already use — a relevant skill, CLI help, package README, `AGENTS.md`, or command output — placed at its retrieval moment.
