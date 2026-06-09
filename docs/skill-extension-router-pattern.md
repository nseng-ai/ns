# Skill/Extension Router Pattern

Use this pattern to consolidate rare, related workflow skills behind one installed router skill, while keeping substantial playbooks lazy-loaded and optional selector ergonomics deterministic.

## Use this pattern when

- A workflow family is valuable but rare enough that every route should not occupy always-visible skill frontmatter or autocomplete space.
- The individual workflows need substantial instructions, checklists, or recovery notes that belong in ordinary Markdown playbooks.
- Old standalone skill names are still useful for pasted prompts or muscle memory, but should no longer be installed as separate trigger surfaces.
- A deterministic Pi selector would improve route choice without requiring the model to infer the route from broad autocomplete entries.

Do not use this pattern for frequent, low-burden workflows that deserve direct discoverability, or as a generic replacement for normal focused skills.

## Skill router structure

A router skill has one installed skill surface with terse frontmatter and a body that performs route selection. For internal or prototype workflow families, use the command-style description and internal metadata:

```yaml
---
name: <router-name>
description: "Command: <router-name>"
metadata:
  internal: true
---
```

Keep the router body small:

- State the routing contract and when to ask for clarification.
- Keep a route table mapping canonical route names and old aliases to reference files.
- Put full playbooks under `skills/<router-name>/references/` as ordinary Markdown.
- Resolve relative reference paths from the router skill directory.
- Treat old standalone names as aliases only, not as installed duplicate skills.

For repo-local skills, `skills/<name>/` is the canonical source. The installed `.agents/skills/<name>` and `.claude/skills/<name>` entries should be symlinks to that source. When migrating old standalone skills into a router, remove the old canonical directories and installed symlink surfaces instead of leaving hidden duplicates.

## Migration checklist

1. Create or update `skills/<router-name>/SKILL.md` with terse frontmatter, routing rules, and a route table.
2. Move each old playbook into `skills/<router-name>/references/<route>.md`.
3. Add canonical route rows and old-name alias rows to the router table.
4. Remove old `skills/<old-name>/`, `.agents/skills/<old-name>/`, and `.claude/skills/<old-name>/` entries.
5. Remove old skill lockfile entries if the migration changes installed skill state.
6. Validate skill inventory, symlink/install state, and formatting.

Avoid copying every current route into always-loaded repository context such as `AGENTS.md`. The router skill frontmatter is the discoverable entrypoint; the detailed route inventory belongs in the lazy-loaded router body.

## Pi-specific: Optional selector command

A Pi selector command can make route choice ergonomic without expanding the installed skill surface. Keep it deterministic:

- Present a route picker, or resolve a direct route/alias argument.
- Display the selected route, reference path, and suggested prompt.
- Do not call `sendUserMessage` or otherwise start an LM turn automatically.
- Let the user manually send the displayed prompt when ready.

Durable or risky selector behavior belongs in `ts/packages/pi-extensions/` with tests. Project-local `.pi/extensions/` files should remain thin adapters when the behavior has been promoted. If the selector is still experimental and repo-local, document why it remains in the project-local extension layer.

## Validation

For a Markdown-only documentation change, run:

```bash
just dprint-check
git diff --check
```

If Markdown formatting fails, run `just dprint-fix`, then rerun validation.

For a skill migration, also verify the installed router and repository consistency, for example:

```bash
INSTALL_INTERNAL_SKILLS=1 npx skills list | rg "<router-name>"
uv run areg check
```

For selector code changes, load the TypeScript style skill before editing and run the relevant package checks/tests, normally through the repo `just` targets or the changed package's `pnpm --dir ts/packages/pi-extensions ...` scripts.
