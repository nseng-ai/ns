# Objective onboarding docs authored with truthfully gated first release

## Summary

Replaced all four placeholder objective onboarding pages in `documentation` with real
customer-facing content, then reconciled the copy with the current master state where
`ns init`, `ns skills …`, and `ns update` are implemented in the bundled `@nseng-ai/ns`
package but the package itself is not yet published to npm:

- `retired website files` — install `@nseng-ai/ns` from npm
  (Node ≥ 24.12, git, harness prerequisites), verify with `ns objective list`,
  `ns init --help`, and `ns skills list`. Carries a "coming with the first release" gate
  because the package has a checkout-free bundle/local pack smoke path but is not yet
  published.
- `retired website files` — end-to-end loop: install → `ns init
  --harness ...` → create → advance → update → close, driven through the Objective
  skills in the harness. The `ns init` step now reflects the implemented surface on
  master (managed `ns:objectives` `AGENTS.md` block, `CLAUDE.md → @AGENTS.md` import,
  skill materialization into `.claude/skills/` / `.agents/skills/`, `.ns/objectives/`
  creation, verify-and-write-never-commit git posture, harness choice persisted to
  `ns.toml`). Includes the Codex caveat (skills always cost context on Codex) and names
  `ns update` as the later harness-artifact refresh command.
- `retired website files` — the concept page: durable checked-in
  narrative records, git-native/no-hidden-state framing derived from
  `docs/north-star.md`, the `.ns/objectives/<slug>/` record layout
  (`objective.md`/`roadmap.md`/`updates/`/`closed.md`), roadmap statuses, lifecycle via
  skills, and "what Objectives are not."
- `retired website files` — CLI reference documenting the human subcommands
  (`list`, `show`, `check`, `archive`) with their real flags, `--format`, and
  `--json-schema`, and stating explicitly that lifecycle mutations are skill-driven, not
  CLI subcommands. It now also acknowledges the `exec` helper surface as an agent
  contract documented by its own `--help`/`--json-schema` output.

Skill references were kept to the current shipped shape: the four lifecycle skills
(`objective-create`/`-next`/`-update`/`-close`) are named with one-line behavioral
descriptions matching their shipped `SKILL.md` triggers, and harness artifact management
is described via the implemented `ns init`, `ns skills …`, and `ns update` surfaces rather
than a speculative extension-install flow.

Also fixed small drift: `retired website files` still said "the CLI shipping today is
`ji`" — rebaselined to the landed `ns` cutover. `just docs-check` passes; a pre-existing
dprint failure in `eve-parity-retired website files` (unrelated indentation) was fixed
via `just dprint-fix` to keep validation green.

## Objective Impact

- The docs-content roadmap row moves to `[~]`: all four placeholder pages are now real
  objective-specific content aligned with the resolved decisions (`ns` naming,
  `.ns/objectives/`, managed `AGENTS.md` block, Claude Code/Codex/Pi as the harness
  bar). What remains on that row is publication un-gating, which stays blocked: the rest
  of the docs corpus (introduction, other concepts/tools/skills/guides pages) is still
  placeholder, and Vercel deploys remain gated by `ignoreCommand: "exit 0"` under
  the retired website Objective.
- Gaps waiting on dependencies: the npm installation step stays marked "coming with the
  first release" until `checkout-free-sdl-distribution` actually publishes `@nseng-ai/ns`
  and a real global/`npx` install is verified. The `ns init` and first-party skill
  materialization surfaces have landed on master and the docs now describe them as
  implemented, not speculative.
- Coordination note: the retired website Objective has an open IA-restructure row that plans to
  dissolve the Tools top-level section (objectives becoming a kernel feature page under
  Concepts). These pages were written in the current IA per this Objective's slice; if
  the restructure lands first, `tools/objective.mdx` content should move, not be
  rewritten.

## Follow-Ups

- Remove the npm "coming with the first release" gates after `@nseng-ai/ns` is published
  and the documented global/`npx` install path is verified in a throwaway non-ns repo.
- Un-gate publication only when the remaining docs corpus stops being placeholder
  (owned by the retired website Objective's content rewrite row).
