# brmem

`brmem` is a branch-scoped key/value store backed by git refs. Entries live under `refs/brmem/<namespace>/<encoded-branch>:<key>` and are written and read through the `brmem` CLI. Other twerk subpackages — including `memjective` — build on top of it. Architecture and import rules for contributors live in [`AGENTS.md`](./AGENTS.md).

## Prompt Plugins

A prompt plugin is a markdown file that lets a repo customize one narrow slice of a skill's behavior without forking the skill. Plugins live at `<repo-root>/.brmem/prompts/<name>.md` (project) or `~/.brmem/prompts/<name>.md` (global). The project path wins over the global path; if neither exists, the consuming skill aborts.

### Scope-narrowing contract

A plugin is not a small skill. The skill that consumes the plugin keeps the heavy logic — input validation, state writes, the final report — and delegates only the variable, repo-specific slice it explicitly calls out. That keeps skill behavior consistent across repos while letting each repo encode its own conventions (branch-name prefixes, `git` vs `gt`, checkout policy, and so on). A plugin must not silently take over responsibilities that belong to the skill; if it tries, the skill should abort rather than follow two competing sources of truth.

### How plugins are resolved

Skills resolve plugins by calling:

```
brmem exec resolve-prompt <name> [--format json]
```

The CLI prefers the project-local path, falls back to the global path, and exits with `prompt-not-found` (exit code `2`) if neither exists, naming both checked paths in the error message. It also requires a git repo — without one it cannot locate the project path and aborts with `not-a-git-repo`. The implementation is at [`exec/resolve_prompt.py`](./exec/resolve_prompt.py).

### Packaged defaults

Each plugin ships a packaged canonical version at `skills/<plugin-name>/default-prompt.md`. `just install-tools` non-destructively seeds the global path (`~/.brmem/prompts/<plugin-name>.md`) from that packaged default, so a fresh checkout has a working fallback without overwriting any existing global override. To customize per-repo, copy the packaged default to `<repo-root>/.brmem/prompts/<plugin-name>.md` (or write one from scratch) — the project path takes precedence on every resolution.

### Motivating example: `brmem-branch-create`

The `brmem-branch-create` skill creates a new branch and stashes session context — typically a plan file — onto it via `brmem`. The stash logic is identical across every repo: pick a slug, choose a bundle, run `brmem check` and `brmem put`, report what landed. Branch creation itself, though, is genuinely repo-specific: raw `git`, `git switch -c`, `gt create`, `gt track`, name prefixes like `feature/...`, checkout vs no-checkout. So that single decision — and only that decision — is delegated to the plugin.

The contract split mirrors the skill itself:

- **Skill owns:** bundle selection, slug generation, `brmem check` / `brmem put`, the final report.
- **Plugin owns:** mapping the suggested slug to the final branch name, branch-creation pre-flights, the create command (`git` vs `gt`), checkout vs no-checkout.

Compare the two ends of that contract:

- **Packaged default** at [`skills/brmem-branch-create/default-prompt.md`](../../../../../skills/brmem-branch-create/default-prompt.md) keeps the suggested slug unchanged and creates the branch with `git branch <final-branch> HEAD`, no checkout.
- **Twerk's repo-local override** at [`.brmem/prompts/brmem-branch-create.md`](../../../../../.brmem/prompts/brmem-branch-create.md) uses the same no-checkout `git branch` creation, then runs `gt track <final-branch> --parent <original-branch>` so the new branch is registered in the Graphite stack. Twerk uses `gt` per [`AGENTS.md` § "Branch Creation and PR Submission (Graphite)"](../../../../../AGENTS.md).

This is the right shape because the variable axis is exactly branch tooling, no more and no less. The plugin file is small, the skill stays consistent across repos, and a contributor reading the override sees only the part that actually differs.

### Authoring a new plugin

- Pick a single, well-scoped axis the consuming skill explicitly calls out — don't widen the plugin into a second skill.
- Ship a packaged default at `skills/<plugin-name>/default-prompt.md` so `just install-tools` can seed it globally.
- Resolve the plugin from skill code with `brmem exec resolve-prompt <plugin-name>` and read the returned file verbatim.
- Document the input/output contract at the top of the plugin file so repo-local overrides know exactly what to honor.
