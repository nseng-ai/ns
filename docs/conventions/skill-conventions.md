# Skill Conventions

Conventions for authoring, naming, vendoring, and managing skills in this repo. Routed from the root `AGENTS.md` ("Skills" section). [`skills/README.md`](../../skills/README.md) is the authoritative mutable contract for first-party support dispositions, family ownership, skill identity, canonical topology, Harness Overlays, and dependency closure; this document owns the associated procedures.

### Skill Management Channels

Skill management in this repo is layered. The channels are additive and have distinct ownership:

1. **First-party npm-module-bundled provisioning (`ns skills` / `ns update`).** `@nseng-ai/ns` (harness-artifacts feature, `src/harness-artifacts/`, exposed to other packages through `@nseng-ai/ns/api`) models harness artifacts statically declared by npm modules and reconciles them into harness roots. Record: `.ns-harness-artifacts-manifest.json`.
2. **Repo-local and third-party acquisition (`npx skills`).** Repo-local first-party skills have disposition- and family-nested canonical sources defined by `skills/README.md`, with flat Harness Overlays at `.agents/skills/<name>` and `.claude/skills/<name>`. GitHub-sourced skills are vendored as real directories under `.agents/skills/<name>/`. `npx skills` owns install/layout/list/update/remove operations and `skills-lock.json` checks for these skills.
3. **Cross-harness overlays (`ns skill-exposure`).** This surface owns only repo-declared Skill Exposure Policy and Harness Overlay reconciliation, including the command-backed replacement invariant. It does not discover skills, inspect whole repositories, validate content hashes, verify mirrors, or diagnose install health.

Externally sourced skills overlay onto this management rather than escaping it: upstream owns skill content, while this repository explicitly declares exposure policy at the harness-overlay seam.

When two channels can materialize the same flat identity, ownership is provenance-bound rather than last-writer-wins. An artifact recorded by `npx skills` in `skills-lock.json` remains owned by that channel; npm-module provisioning must neither overwrite nor adopt it into `.ns-harness-artifacts-manifest.json`. The npm module may provision a missing target and then owns only that manifest-recorded artifact. Update and removal mutate only artifacts owned by their channel; ambiguous pre-existing targets fail closed. Removing an extension must preserve `npx skills`-owned artifacts, local/untracked files, and domain records. ADR 0049 applies this contract to the seven portable Objective skills and the `@nseng-ai/objectives` enhancement.

Procedures for channel 2 are documented in `skills/internal/skill-system/skill-management/SKILL.md`; load that known first-party path directly. The canonical install flag is `--agent codex claude-code -y`. Do not maintain a duplicate skill index in `AGENTS.md`.

### Auditing and Tightening Skills

To audit or tighten a `SKILL.md` — for predictability, token cost, trigger quality, progressive disclosure, install layout, or CLI push-down — summon the **`skill-audit`** skill (`skills/internal/skill-system/skill-audit/`). It carries ns's operational audit checklists and loads its conceptual frame at run time from the vendored `writing-great-skills` skill (`.agents/skills/writing-great-skills/`), which is the single source of the audit vocabulary — upstream refreshes flow in with no re-sync of the audit skill. Use the vocabulary's failure-mode names as the labels for audit findings; the names and deep definitions live in the vendored skill and its `GLOSSARY.md`.

### Skill Exposure Policy and Harness Overlays

Every managed skill has an explicit **Skill Exposure Policy**. The retained policies are exactly `normal`, `invoke-only`, and `command-backed`. Manage them only through explicit skill-directory or direct `SKILL.md` paths:

```bash
ns skill-exposure apply <normal|invoke-only|command-backed> <path...>
ns skill-exposure show <path...>
ns skill-exposure check <path...>
```

`<path...>` must identify a skill directory or its `SKILL.md` directly, such as `skills/internal/code/code-gh` or `.agents/skills/writing-great-skills/SKILL.md`. There is no discovery, list, find, doctor, or whole-repository scan surface. `check` verifies only the declared paths' exposure overlays and command-backed replacement invariant; it does not validate `skills-lock.json` hashes, mirrors, acquisition, or install health.

| Policy           | Model auto-routes (ambient)?                  | Human invocation                   | Harness overlays                                                                           |
| ---------------- | --------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `normal`         | yes — **requires a real trigger description** | native skill invocation            | no explicit-only overlay                                                                   |
| `invoke-only`    | no on Claude Code + Pi                        | native skill invocation            | `disable-model-invocation: true` + `agents/openai.yaml`                                    |
| `command-backed` | no                                            | verified namespaced Pi replacement | invoke-only overlays + `.pi/settings.json` `-skills/<name>` + verified replacement command |

For first-party skills, policy-owned source overlays live with the explicit nested canonical skill directory; for vendored GitHub-sourced skills, local overlay files may live under `.agents/skills/<name>/` plus `.pi/settings.json`. Do not hand-edit these files. Apply the policy to each explicit path so an upstream refresh can replace content and the overlay can be re-derived.

- **Generic authoring guidance does not own overlays.** Do not hand-author invocation flags even when upstream guidance describes them.
- **Descriptions stay human-readable.** `normal` requires a real trigger; explicit policies can retain one.
- **`invoke-only` vs `command-backed`.** Use `invoke-only` by default for explicit workflows. Use `command-backed` only when the verified namespaced Pi replacement is the preferred surface.
- **Exposure is orthogonal to support disposition.** Skill Exposure Policy does not determine `public`, `incubating`, or `internal`; `metadata.internal: true` is separate visibility evidence, not an exposure policy.
- **Codex cannot go zero-ambient.** Claude Code and Pi remove invoke-only descriptions from model context; Codex blocks implicit invocation but keeps the description ambient. See [Harness skill/command/prompt invocation mechanics](../research/harness-skill-invocation.md).

### Skill Invocation Decision Policy

ADR 0016 (`docs/adr/0016-skill-invocation-context-budget.md`) records the durable decision behind this policy.

Ambient skill frontmatter is a shared context budget. Default by domain, not by habit: make a skill `normal` only when the model must discover it from ordinary user language and an eligibility category below applies. Otherwise apply `invoke-only` to its explicit path, or `command-backed` when a verified namespaced Pi replacement is preferred.

Use these buckets:

1. **Ambient routers and standards (`normal`)** — keep broad entrypoints and always-relevant coding guidance model-invoked when automatic discovery prevents mistakes. Eligible categories are:
   - umbrella/router skills that route a family of explicit leaf workflows, such as `handoff`, `objective`, or `branch-context`;
   - common coding or repo standards that should fire during ordinary implementation, such as TypeScript style overlays;
   - safety-sensitive workflows where missing the skill is worse than paying the frontmatter cost, such as merge-conflict resolution;
   - broad external-boundary guidance where the agent must choose the right API/tooling before acting, such as GitHub or PR-feedback workflows.
2. **Command-backed workflows (`command-backed`)** — use for explicit workflows whose preferred user surface is a verified namespaced Pi command. Skill Exposure writes the explicit-only sidecars and Pi exclusion together.
3. **Invoke-only workflows (`invoke-only`)** — use for specialized, rare, setup, migration, language-specific, or admin skills that remain useful by name but should not consume ambient context.
4. **Internal backend skills** — keep implementation-support skills explicit-only unless an extension wrapper requires model discovery. Internal visibility is separate from exposure policy.
5. **Vendored/upstream skills** — treat real directories under `.agents/skills/` as a separate review class. Apply local exposure overlays by explicit path when ambient token cost is material and the decision is recorded; prefer a wrapper or documented fork when changes exceed invocation metadata.

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
