# ADR 0016: Skill Invocation Kinds Spend the Ambient Context Budget Deliberately

## Status

Accepted (amended 2026-07: added `unlisted`)

## Context

Pi and Claude Code include model-invoked skill frontmatter in the model's ambient context. The skill body remains progressively disclosed, but every `name` and `description` for an ambient skill is paid on every session. As the SDL skill set grew, specialized workflow skills, setup skills, and leaf operation skills accumulated enough frontmatter to become a measurable context cost.

SDL already has an `areg`-managed invocation taxonomy in `docs/conventions/skill-conventions.md`: `normal`, `ambient-only`, `invoke-only`, `command-backed`, and `unlisted`. The missing decision was not the mechanics of those kinds, but the policy for when a skill deserves ambient model discovery.

## Decision

Skill invocation kind is a context-budget decision and must be managed through `areg`, not by hand-editing frontmatter or sidecar files.

SDL will use domain-specific defaults:

- Keep a skill ambient (`normal`) only when the model must discover it from ordinary user language and one of these eligibility categories applies: umbrella/router, common coding standard, safety-sensitive workflow, or broad external-boundary guidance.
- Use `command-backed` when a verified namespaced Pi command is the preferred user surface. The backing skill is hidden from ambient model context and from Pi's raw `/skill:<name>` surface, while the replacement command remains available.
- Use `invoke-only` for specialized, rare, setup, migration, language-specific, admin, or otherwise explicit workflows that remain useful by name but should not consume ambient context.
- Use `unlisted` for one-shot bootstrap/scaffold skills that should have no invocation surface at all: `areg skill apply unlisted` writes the invoke-only artifact bundle (`disable-model-invocation: true` + Codex `agents/openai.yaml`) plus the Pi `-skills/<name>` exclusion, and additionally **removes both mirror symlinks** (`.agents/skills/<name>`, `.claude/skills/<name>`) so the skill is hidden from every harness typeahead and `$name`/`/skill:name` reference. Unlike `command-backed`, `unlisted` has **no** Pi replacement command — conversion requires removing the registry entry first, and discovery moves to an ambient router skill (`metadata.category: <family>` on each leaf) that points at the canonical `skills/<name>/` source.
- Treat internal backend skills as explicit-only unless their extension wrapper requires model discovery. `metadata.internal: true` is a visibility axis, not an invocation kind.
- Treat vendored/upstream skills as a separate review class: do not casually rewrite upstream content, but allow recorded local invocation-kind changes when ambient token cost is material.

The documentation should include stable examples by category, not a full current-state registry table. `areg skill list` and `areg skill show <name>` are the live source of truth.

## Consequences

- New and audited skills must justify ambient discovery instead of inheriting it by default.
- Specialized leaf workflows can remain available to humans and wrapper commands without spending ambient frontmatter tokens.
- Command-backed conversion has a stronger precondition than invoke-only conversion: a verified Pi replacement command must exist and be the preferred surface.
- A skill with `description: "Command: <name>"` while still ambient is a misconfiguration, because it spends context while providing no useful routing trigger.
- The repo avoids stale hand-maintained skill-kind tables; live state stays in `areg` output.
- `unlisted` leaves keep their real `description` in `SKILL.md` at no token cost, because nothing injects it into any harness context — the router carries the ambient triggers instead.
- Reverting an `unlisted` skill to a listed kind requires the skill re-install flow (recreating both mirror symlinks), not just an `areg skill apply`, since the mirrors were removed.
- `unlisted-mirrors-present` is the drift signal: an `unlisted` skill whose mirror symlinks still exist is a misconfiguration `areg check` flags.

## Rejected Alternatives

- **Ambient by default:** preserves maximum discoverability but lets frontmatter grow without a budget.
- **Explicit-only by default for every skill:** saves tokens but makes the human remember too many routers and safety standards.
- **Full registry table in docs:** gives an audit snapshot but will drift from `areg skill list`.
- **Hand-editing `disable-model-invocation`:** creates inconsistent artifact bundles; `areg check` should catch this drift.
- **Keeping bootstrap skills command-backed:** the scaffold family has no verified Pi replacement commands and no ongoing invocation demand, so paying for the `/ns:cmd` surface (and the Codex `$name` / Claude Code typeahead entries the mirrors expose) buys nothing; `unlisted` drops all of it.
- **Deleting the bootstrap skills outright:** loses the shipped scaffold playbooks; `unlisted` keeps the content invoke-able through the router while removing the ambient/typeahead cost.
- **A lockfile or frontmatter "kind" marker for unlisted:** would add a hand-maintained state field parallel to the artifacts `areg` already reconciles; the kind is derived from artifact facts (bundle present + mirrors absent), consistent with the rest of the taxonomy.
