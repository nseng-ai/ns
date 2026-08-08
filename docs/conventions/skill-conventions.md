# Skill Conventions

Conventions for authoring, naming, vendoring, and managing skills in this repo. Routed from the root `AGENTS.md` ("Skills" section). [`skills/README.md`](../../skills/README.md) is the authoritative mutable contract for first-party support dispositions, family ownership, skill identity, canonical topology, Harness Overlays, and dependency closure; this document owns the associated procedures.

### Skill Management Ownership

Skill management has two owners with a strict boundary:

1. **`npx skills` owns skill acquisition and installed state.** Use it to acquire, install, update, remove, list, and check skills. It also owns `skills-lock.json`. The canonical install flag is `--agent codex claude-code -y`.
2. **Checked-in repository files own ns-specific shape and invocation metadata.** `skills/README.md` defines canonical topology and flat Harness Overlays. Skill frontmatter, Codex `agents/openai.yaml` sidecars, and Pi exclusions in `.pi/settings.json` are reviewed and maintained directly as repository files.

There is no `ns skills`, top-level `ns update`, `ns skill-exposure`, or ns provisioning, reconciliation, or skill-catalog interface. Users and contributors invoke `npx skills` directly; ns does not wrap it or own skill installation state.

Externally sourced skills follow the same boundary: upstream owns vendored skill content, `npx skills` owns acquisition and lock state, and this repository owns deliberate local invocation-metadata changes.

Procedures are documented in `skills/internal/skill-system/skill-management/SKILL.md`; load that known first-party path directly. Do not maintain a duplicate skill index in `AGENTS.md`.

### Invocation Metadata and Harness Overlays

Every managed skill uses one of three invocation modes: `normal`, `invoke-only`, or `skill-backed-command`. These are repository conventions, not values managed by an ns command.

| Mode                   | Model auto-routes (ambient)?                  | Human invocation                       | Checked-in metadata                                                                                          |
| ---------------------- | --------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `normal`               | yes — **requires a real trigger description** | native skill invocation                | ordinary frontmatter and any upstream Codex sidecar                                                          |
| `invoke-only`          | no on Claude Code + Pi                        | native skill invocation                | `disable-model-invocation: true`, `agents/openai.yaml`, and any needed Pi exclusion                          |
| `skill-backed-command` | no                                            | verified namespaced Pi command surface | invoke-only metadata, `.pi/settings.json` `-skills/<name>`, and a reviewed Skill-Backed Command Registration |

Maintain and review this checked-in metadata directly. `npx skills` does not create Pi exclusions or all invocation metadata. After an upstream update, reapply deliberate repository-owned metadata and inspect the resulting diff.

- **Descriptions stay human-readable.** `normal` requires a real trigger; explicit modes can retain one.
- **Mechanism vs mode.** A Skill-Backed Command is the Pi command mechanism: it directly requires a skill as workflow authority. `skill-backed-command` is the repository convention that hides native skill invocation and requires a reviewed Skill-Backed Command Registration. A command can use the mechanism without adopting that mode.
- **`invoke-only` vs `skill-backed-command`.** Use `invoke-only` by default for explicit workflows. Use `skill-backed-command` only when the namespaced Pi command is the preferred surface.
- **Invocation is orthogonal to support disposition.** Invocation mode does not determine `public`, `incubating`, or `internal`; `metadata.internal: true` is separate visibility evidence.
- **Codex cannot go zero-ambient.** Claude Code and Pi remove invoke-only descriptions from model context; Codex blocks implicit invocation but keeps the description ambient. See [Harness skill/command/prompt invocation mechanics](../research/harness-skill-invocation.md).

### Skill Invocation Decision Policy

ADR 0016 (`docs/adr/0016-skill-invocation-context-budget.md`) records the durable decision behind this policy.

Ambient skill frontmatter is a shared context budget. Default by domain, not by habit: make a skill `normal` only when the model must discover it from ordinary user language and an eligibility category below applies. Otherwise maintain it as `invoke-only`, or `skill-backed-command` when a reviewed namespaced Pi command is preferred.

Use these buckets:

1. **Ambient routers and standards (`normal`)** — keep broad entrypoints and always-relevant coding guidance model-invoked when automatic discovery prevents mistakes. Eligible categories are:
   - umbrella/router skills that route a family of explicit leaf workflows, such as `handoff`, `objective`, or `branch-context`;
   - common coding or repo standards that should fire during ordinary implementation, such as TypeScript style overlays;
   - safety-sensitive workflows where missing the skill is worse than paying the frontmatter cost, such as merge-conflict resolution;
   - broad external-boundary guidance where the agent must choose the right API/tooling before acting, such as GitHub or PR-feedback workflows.
2. **Skill-backed command workflows (`skill-backed-command`)** — use for explicit workflows whose preferred user surface is a reviewed namespaced Pi command. Maintain the explicit-only sidecars and Pi exclusion together, and review the Skill-Backed Command Registration.
3. **Invoke-only workflows (`invoke-only`)** — use for specialized, rare, setup, migration, language-specific, or admin skills that remain useful by name but should not consume ambient context.
4. **Internal backend skills** — keep implementation-support skills explicit-only unless an extension wrapper requires model discovery. Internal visibility is separate from invocation mode.
5. **Vendored/upstream skills** — treat real directories under `.agents/skills/` as a separate review class. Maintain local invocation metadata when ambient token cost is material and the decision is recorded; prefer a wrapper or documented fork when changes exceed invocation metadata.

### Public Skill Authoring — No Internal References

Skills with the `public` support disposition are user-facing documents backed by an explicit external support warrant. Do not reference ns-internal module paths, class names, or implementation details in their `SKILL.md` files or frontmatter descriptions. Describe *what* CLI operations to call (e.g., `ns address exec pr-reviews`), not *how* they are implemented. Implementation details belong in source code, not in public `SKILL.md` files. Internal skills may reference internals freely. See `skills/README.md` for disposition and dependency-closure rules; Harness Overlay shape does not determine whether a skill is public.

### Skill Model Examples

When a skill body references policy-owned model tiers or routing, keep the default guidance harness-neutral and name the routing intent rather than instructing implementation callers to supply free-form model IDs. If concrete resolution examples are necessary, include both OpenAI and Anthropic as policy outcomes (for example, Pi/OpenAI `cheap` resolving to `openai-codex/gpt-5.6-luna`, and Claude/Anthropic `cheap` resolving to `claude-haiku-4-5`), clearly labeled so they are not mistaken for arbitrary caller inputs.

### Vendored Skill Code

When upstream content is *melded* into ns-owned surfaces rather than just vendored, the process — single-source pin, melded-surfaces registry, lineage blocks, rename-on-import, minimal forks, update procedure — lives in [upstream-skill-melding.md](upstream-skill-melding.md). Each upstream repo with melded content has an instance doc; see [Matt Pocock Skills](../agents/matt-pocock-skills.md) for the Matt-sourced vendored skill set, renames, recorded forks, and its melded-surfaces registry.

- `.agents/skills/<name>/` is either (a) a symlink back to a first-party skill's nested canonical source under `skills/` or (b) a real directory containing vendored third-party code. Treat only real directories there as vendored; symlinked entries resolve to first-party ns work and are subject to normal linting, typechecking, and review.
- Treat `.claude/skills/*` as symlinks into `.agents/skills/`; the vendored-vs-first-party distinction follows through the chain to the underlying directory.
- For repo-local skills, the disposition- and family-nested path specified by `skills/README.md` is the canonical source — edit files there directly. `.agents/skills/<name>` is a flat Harness Overlay symlink back to that source; follow it to resolve an identity when the canonical path is not already known.
- Do not apply first-party language standards, style guides, or refactoring skills (for example `typescript-style` or `fdt-refactor-mock-to-fake`) to code inside vendored (real-directory) entries under `.agents/skills/` unless the user explicitly asks to modify the vendored dependency itself.
- When reviewing or editing the repo, exclude vendored entries — all files under real directories in `.agents/skills/<name>/`, including embedded scripts, tests, fixtures, package manifests, and lockfiles — from normal linting, typechecking, code review, and cleanup expectations; assume those files should remain as-shipped unless the task is specifically about updating the vendored skill itself. Code review agents should limit findings for vendored skills to integration-boundary issues such as broken invocation docs, dependency/workspace leakage, missing provenance/license notices, tracked generated artifacts, or deviations from the vendoring contract.

### Code and Dev Skill Prefixes

Use `/code:*` as the Pi slash-command namespace for codebase/source-control management workflows: worktree snapshots, checkpoints, branch/stack maintenance, and Graphite/GitHub workflows that manage code state.

Use `code-*` for code/source-control workflow skills, whether published or repo-private. The code-skill family does not use an `internal-` name prefix: visibility is controlled by frontmatter, and internal/prototype skills must carry `metadata.internal: true`. The `internal-` prefix remains available for repo-private skills in other domains.

`dev-` no longer means "codebase-related." Do not introduce new `dev-*` skills for codebase/source-control work. Prefer the domain namespace (`ns-*`, `code-*`, `ns-cmux-*`, etc.) for new workflow skills; any future `dev-*` skill needs an explicit product decision.
