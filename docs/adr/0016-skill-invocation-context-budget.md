# ADR 0016: Skill Invocation Kinds Spend the Ambient Context Budget Deliberately

## Status

Accepted

## Context

Pi and Claude Code include model-invoked skill frontmatter in the model's ambient context. The skill body remains progressively disclosed, but every `name` and `description` for an ambient skill is paid on every session. As the SDL skill set grew, specialized workflow skills, setup skills, and leaf operation skills accumulated enough frontmatter to become a measurable context cost.

SDL already has an `areg`-managed invocation taxonomy in `docs/conventions/skill-conventions.md`: `normal`, `ambient-only`, `invoke-only`, and `command-backed`. The missing decision was not the mechanics of those kinds, but the policy for when a skill deserves ambient model discovery.

## Decision

Skill invocation kind is a context-budget decision and must be managed through `areg`, not by hand-editing frontmatter or sidecar files.

SDL will use domain-specific defaults:

- Keep a skill ambient (`normal`) only when the model must discover it from ordinary user language and one of these eligibility categories applies: umbrella/router, common coding standard, safety-sensitive workflow, or broad external-boundary guidance.
- Use `command-backed` when a verified namespaced Pi command is the preferred user surface. The backing skill is hidden from ambient model context and from Pi's raw `/skill:<name>` surface, while the replacement command remains available.
- Use `invoke-only` for specialized, rare, setup, migration, language-specific, admin, or otherwise explicit workflows that remain useful by name but should not consume ambient context.
- Treat internal backend skills as explicit-only unless their extension wrapper requires model discovery. `metadata.internal: true` is a visibility axis, not an invocation kind.
- Treat vendored/upstream skills as a separate review class: do not casually rewrite upstream content, but allow recorded local invocation-kind changes when ambient token cost is material.

The documentation should include stable examples by category, not a full current-state registry table. `areg skill list` and `areg skill show <name>` are the live source of truth.

## Consequences

- New and audited skills must justify ambient discovery instead of inheriting it by default.
- Specialized leaf workflows can remain available to humans and wrapper commands without spending ambient frontmatter tokens.
- Command-backed conversion has a stronger precondition than invoke-only conversion: a verified Pi replacement command must exist and be the preferred surface.
- A skill with `description: "Command: <name>"` while still ambient is a misconfiguration, because it spends context while providing no useful routing trigger.
- The repo avoids stale hand-maintained skill-kind tables; live state stays in `areg` output.

## Rejected Alternatives

- **Ambient by default:** preserves maximum discoverability but lets frontmatter grow without a budget.
- **Explicit-only by default for every skill:** saves tokens but makes the human remember too many routers and safety standards.
- **Full registry table in docs:** gives an audit snapshot but will drift from `areg skill list`.
- **Hand-editing `disable-model-invocation`:** creates inconsistent artifact bundles; `areg check` should catch this drift.
