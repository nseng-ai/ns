# Objective onboarding docs authored with truthfully gated install/init

## Summary

Replaced all four placeholder objective onboarding pages in `docs-site` with real
customer-facing content, written around the decided customer flow and with unlanded
surfaces truthfully gated:

- `docs-site/docs/get-started/installation.mdx` — install `@nseng-ai/ns` from npm
  (Node ≥ 24.12, git, harness prerequisites), verify with `ns objective list`. Carries a
  "coming with the first release" gate because the package is not yet published.
- `docs-site/docs/get-started/quickstart.mdx` — end-to-end loop: install → `ns init
  --harness ...` → create → advance → update → close, driven through the Objective
  skills in the harness. The `ns init` step is explicitly marked "expected flow — coming
  with the first release" (managed `ns:objectives` `AGENTS.md` block, `CLAUDE.md →
  @AGENTS.md` import, skill copy into `.claude/skills/` / `.agents/skills/`,
  `.ns/objectives/` creation, verify-and-write-never-commit git posture, harness choice
  persisted to `ns.toml`). Includes the decided Codex caveat (skills always cost context
  on Codex).
- `docs-site/docs/concepts/objectives.mdx` — the concept page: durable checked-in
  narrative records, git-native/no-hidden-state framing derived from
  `docs/north-star.md`, the `.ns/objectives/<slug>/` record layout
  (`objective.md`/`roadmap.md`/`updates/`/`closed.md`), roadmap statuses, lifecycle via
  skills, and "what Objectives are not."
- `docs-site/docs/tools/objective.mdx` — CLI reference documenting only the subcommands
  that exist today (`list`, `show`, `check`, `archive`) with their real flags,
  `--format`, and `--json-schema`, and stating explicitly that lifecycle mutations are
  skill-driven, not CLI subcommands. The hidden `exec` surface is not documented.

Skill references were kept to the roadmap contract: the four lifecycle skills
(`objective-create`/`-next`/`-update`/`-close`) are named with one-line behavioral
descriptions matching their shipped `SKILL.md` triggers; no install paths, versioning,
or `ns skills` command details beyond "copied from the installed package" were invented.

Also fixed small drift: `docs-site/AGENTS.md` still said "the CLI shipping today is
`ji`" — rebaselined to the landed `ns` cutover. `just docs-check` passes; a pre-existing
dprint failure in `eve-parity-docs-site/roadmap.md` (unrelated indentation) was fixed
via `just dprint-fix` to keep validation green.

## Objective Impact

- The docs-content roadmap row moves to `[~]`: all four placeholder pages are now real
  objective-specific content aligned with the resolved decisions (`ns` naming,
  `.ns/objectives/`, managed `AGENTS.md` block, Claude Code/Codex/Pi as the harness
  bar). What remains on that row is publication un-gating, which stays blocked: the rest
  of the docs corpus (introduction, other concepts/tools/skills/guides pages) is still
  placeholder, and Vercel deploys remain gated by `ignoreCommand: "exit 0"` under
  `eve-parity-docs-site`.
- Gaps waiting on dependencies: the installation and quickstart install/init steps stay
  marked "coming with the first release" until `checkout-free-sdl-distribution` actually
  publishes `@nseng-ai/ns` and the `@nseng-ai/init` + `ns skills install` slices land;
  the exact `--harness` flag values shown (`claude-code`, `codex`, `pi`) are illustrative
  and must be reconciled with the real `ns init` surface when it ships.
- Coordination note: `eve-parity-docs-site` has an open IA-restructure row that plans to
  dissolve the Tools top-level section (objectives becoming a kernel feature page under
  Concepts). These pages were written in the current IA per this Objective's slice; if
  the restructure lands first, `tools/objective.mdx` content should move, not be
  rewritten.

## Follow-Ups

- Reconcile the gated `ns init` / install commands against the real surfaces when
  `@nseng-ai/init` and the npm publish land, and remove the "coming with the first
  release" gates.
- Un-gate publication only when the remaining docs corpus stops being placeholder
  (owned by `eve-parity-docs-site`'s content rewrite row).
