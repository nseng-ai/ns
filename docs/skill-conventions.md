# Skill Conventions

Conventions for authoring, naming, vendoring, and managing skills in this repo. Routed from the root `AGENTS.md` ("Skills" section).

### Managing Skills With `npx skills`

All skill-management procedures — adding, editing, removing, updating, listing, and publishing skills — are documented in the `skill-management` skill at `.agents/skills/skill-management/SKILL.md`. Use that skill whenever you need to install or modify skills rather than running `npx skills` commands freehand. The canonical asdl install flag is `--agent codex claude-code -y`. Local skills live as real directories under `skills/<name>/`; `.agents/skills/<name>` is a symlink back to that canonical source, keeping the universal-agent directory populated without duplicating content. GitHub-sourced skills remain real directories under `.agents/skills/<name>/`.

### Skill Invocation Kinds (`areg`)

How a skill is invoked — whether the model auto-routes to it, whether a human can call it by name, and whether it costs ambient context — is **managed by the agent registry (`areg`)**, not by hand-authored frontmatter. Every local skill has exactly one *invocation kind*. Inspect with `areg skill list` (all skills, with derived `MODEL`/`NATIVE`/`PI` columns) or `areg skill show <name>` (one skill, with its artifact facts); change with `areg skill apply <kind> <skills...>`. **Do not hand-edit the underlying flags/artifacts** — `areg skill apply` reconciles the whole bundle at once, and `areg check` flags any hand-introduced drift as `mixed`/`inconsistent`.

The four kinds are a 2×2 over two independent questions — *does the model auto-route to it?* and *can a human invoke it by name?*

| Kind             | Model auto-routes (ambient)?                  | Human `/invoke`?                   | Managed artifacts                                                                                    |
| ---------------- | --------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `normal`         | yes — **requires a real trigger description** | yes                                | none (plain ambient skill)                                                                           |
| `ambient-only`   | yes (model-only)                              | no                                 | `user-invocable: false`                                                                              |
| `invoke-only`    | no (zero ambient on Claude Code + Pi)         | yes (`/skill:name`)                | `disable-model-invocation: true` + `agents/openai.yaml`                                              |
| `command-backed` | no                                            | yes, via a namespaced Pi extension | invoke-only artifacts + `.pi/settings.json` `-skills/<name>` + a **verified** Pi replacement command |

Norms and gotchas this taxonomy makes non-obvious:

- **`description: "Command: <name>"` with the real description in a leading HTML comment is the *rendered output* of an explicit-only kind, not a freehand token-saving convention to copy by hand.** A skill that is kind `normal` but carries a `Command: <name>` stub is **misconfigured**: it is advertised to the model (ambient) with nothing to route on — "listed but unroutable." Fix it by either writing a real `normal` trigger description or reconciling it to an explicit-only kind via `areg skill apply`; don't just paste the stub.
- **`invoke-only` vs `command-backed`.** `invoke-only` is the light, default explicit-only kind — zero ambient on Claude Code + Pi, still invocable via `/skill:name`, no extra dependency. `command-backed` additionally hides the raw `/skill:name` in Pi and routes to a namespaced Pi extension (`/ns:cmd`); `areg skill apply command-backed` only succeeds when that replacement extension already exists and verifies (see `.pi/extensions/`). Don't reach for `command-backed` unless the Pi replacement is built. No skill currently uses `command-backed` (the kind is supported but unexemplified); most explicit-only conversions should target `invoke-only`.
- **Invocation kind is orthogonal to visibility.** `metadata.internal: true` (non-public / not externally installable) is a *separate* axis from the invocation kind. A skill can be internal and `normal`, or public and `invoke-only`, etc. Do not infer one axis from the other.
- **Codex can't go zero-ambient.** Claude Code and Pi both honor `disable-model-invocation: true` (the entry leaves the model's context); Codex keeps the description ambient and only blocks implicit invocation. The full per-harness mechanics — flags honored, ambient token cost, read roots, namespacing — live in [Harness skill/command/prompt invocation mechanics](harness-skill-invocation.md). This section is the repo's *managed taxonomy* layered on top of those mechanics.

### Public Skill Authoring — No Internal References

Public skills (those with a `skills/<name>` symlink for external discoverability) are user-facing documents. Do not reference asdl-internal module paths, class names, or implementation details (e.g., `asdl_core.gh.IssueGateway`, `RealIssueGateway.get_reviews`) in their `SKILL.md` files or frontmatter descriptions. Describe *what* CLI operations to call (e.g., `pr-address exec get-reviews`), not *how* they are implemented. Implementation details belong in Python source, not in public `SKILL.md` files. Internal skills (no `skills/` symlink) may reference internals freely.

### Skill Model Examples

When a skill body references model tiers or per-dispatch model selection, keep the default guidance harness-neutral, but always include concrete examples for both OpenAI and Anthropic (e.g. `openai-codex/gpt-5.4-mini` and `claude-haiku-4-5`), each labeled with its harness, so agents on either harness can resolve the tier unambiguously.

### Vendored Skill Code

See [Matt Pocock Skills Upstream Adaptation Guide](agents/matt-pocock-skills.md) for the current Matt-sourced vendored skill set, ASDL overlays, and future upstream update checklist.

- `.agents/skills/<name>/` is either (a) a symlink back to a first-party skill at `skills/<name>/` or (b) a real directory containing vendored third-party code. Treat only real directories there as vendored; symlinked entries resolve to first-party asdl work under `skills/<name>/` and are subject to normal linting, typechecking, and review.
- Treat `.claude/skills/*` as symlinks into `.agents/skills/`; the vendored-vs-first-party distinction follows through the chain to the underlying directory.
- For repo-local skills, `skills/<name>/` is the canonical source — edit files there directly. `.agents/skills/<name>` is a symlink back to that source, and editing through either path is equivalent.
- Do not apply first-party language standards, style guides, or refactoring skills (for example `dignified-python`, `typescript-style`, `python-fake-driven-testing`, or `fdt-refactor-mock-to-fake`) to code inside vendored (real-directory) entries under `.agents/skills/` unless the user explicitly asks to modify the vendored dependency itself.
- When reviewing or editing the repo, exclude vendored entries — all files under real directories in `.agents/skills/<name>/`, including embedded scripts, tests, fixtures, package manifests, and lockfiles — from normal linting, typechecking, code review, and cleanup expectations; assume those files should remain as-shipped unless the task is specifically about updating the vendored skill itself. Code review agents should limit findings for vendored skills to integration-boundary issues such as broken invocation docs, dependency/workspace leakage, missing provenance/license notices, tracked generated artifacts, or deviations from the vendoring contract.

### Code and Dev Skill Prefixes

Use `/code:*` as the Pi slash-command namespace for codebase/source-control management workflows: worktree snapshots, checkpoints, branch/stack maintenance, and Graphite/GitHub workflows that manage code state.

Use `code-*` for code/source-control workflow skills, whether published or repo-private. The code-skill family does not use an `internal-` name prefix: visibility is controlled by frontmatter, and internal/prototype skills must carry `metadata.internal: true`. The `internal-` prefix remains available for repo-private skills in other domains.

`dev-` no longer means "codebase-related." Do not introduce new `dev-*` skills for codebase/source-control work. Prefer the domain namespace (`sdl-*`, `code-*`, `ccc-*`, etc.) for new workflow skills; any future `dev-*` skill needs an explicit product decision.
