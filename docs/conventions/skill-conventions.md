# Skill Conventions

Conventions for authoring, naming, vendoring, and managing skills in this repo. Routed from the root `AGENTS.md` ("Skills" section).

### Skill Management Channels

Skill management in this repo is layered. The channels are additive and complementary, not competing:

1. **First-party npm-module-bundled provisioning (`ns skills` / `ns update`).** `@nseng-ai/harness-artifacts` models harness artifacts (kinds `skill`/`agent`/`extension-bundle`) statically declared by npm modules; `ns skills list/path/install` and `ns update` reconcile them into the harness roots (Pi, Claude Code, Codex; project and global scopes). Record: `.ns-harness-artifacts-manifest.json`, a per-file SHA-256 install manifest. This channel has zero `npx skills` dependency.
2. **Repo-local first-party skills.** Canonical source `skills/<name>/`, mirrored by symlinks (`.agents/skills/<name>` → `../../skills/<name>`; `.claude/skills/<name>` → the `.agents` mirror), keeping the universal-agent directory populated without duplicating content. Recorded in `skills-lock.json` with `sourceType: "local"`.
3. **Third-party acquisition (`npx skills`).** GitHub-sourced skills are vendored as real directories under `.agents/skills/<name>/` and recorded in `skills-lock.json` with `sourceType: "github"`. Upstream content stays as-shipped (see Vendored Skill Code below).
4. **`areg` — whole-project inspector and harness-overlay manager.** `areg` inspects both records — `skills-lock.json` and `.ns-harness-artifacts-manifest.json` are complementary by decision, not convergence candidates — and owns invocation-kind management via harness overlays (next section).

Externally sourced skills overlay onto this management rather than escaping it: skill content is upstream's, invocation policy is ours, and the harness overlays are the seam where the two meet.

Procedures for channels 2–3 — adding, editing, removing, updating, listing, and publishing skills with `npx skills` — are documented in the `skill-management` skill. Use that skill whenever you need to install or modify skills rather than running `npx skills` commands freehand; if it is not already loaded or available, resolve it with `areg skill find skill-management --format json` and read the returned preferred `SKILL.md` path. The canonical ns install flag is `--agent codex claude-code -y`. **Exception:** `unlisted` skills have no mirrors at all — `areg skill apply unlisted` removes both `.agents/skills/<name>` and `.claude/skills/<name>`, leaving only the canonical `skills/<name>/` source.

### Auditing and Tightening Skills

To audit or tighten a `SKILL.md` — for predictability, token cost, trigger quality, progressive disclosure, install layout, or CLI push-down — summon the **`skill-audit`** skill (`skills/skill-audit/`). It carries ns's operational audit checklists and loads its conceptual frame at run time from the vendored `writing-great-skills` skill (`.agents/skills/writing-great-skills/`), which is the single source of the audit vocabulary — upstream refreshes flow in with no re-sync of the audit skill. Use the vocabulary's failure-mode names (duplication, sediment, sprawl, no-op, negation, premature completion) as the labels for audit findings; the deep definitions live in the vendored skill's `GLOSSARY.md`.

### Skill Invocation Kinds (`areg`)

How a skill is invoked — whether the model auto-routes to it, whether a human can call it by name, and whether it costs ambient context — is **managed by the agent registry (`areg`)**, not by hand-authored frontmatter. Every installed skill that areg can manage has exactly one *invocation kind*: first-party skills under `skills/<name>/` and GitHub-sourced vendored skills installed as real directories under `.agents/skills/<name>/`. Inspect with `areg skill list` (all managed installed skills, with derived `MODEL`/`NATIVE`/`PI` columns) or `areg skill show <name>` (one skill, with its harness overlay facts); change with `areg skill apply <kind> <skills...>`. **Do not hand-edit the underlying harness overlays** — `areg skill apply` reconciles the whole bundle at once, and `areg check` flags any hand-introduced drift as `mixed`/`inconsistent`.

The five kinds map onto a 2×2 over two independent questions — *does the model auto-route to it?* and *can a human invoke it by name?* — with `unlisted` filling the previously empty no/no quadrant (`invoke-only` and `command-backed` share the no/yes cell, differing only on Pi surface).

| Kind             | Model auto-routes (ambient)?                  | Human `/invoke`?                   | Harness overlays                                                                                                                                                                        |
| ---------------- | --------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normal`         | yes — **requires a real trigger description** | yes                                | none (plain ambient skill)                                                                                                                                                              |
| `ambient-only`   | yes (model-only)                              | no                                 | `user-invocable: false`                                                                                                                                                                 |
| `invoke-only`    | no (zero ambient on Claude Code + Pi)         | yes (`/skill:name`)                | `disable-model-invocation: true` + `agents/openai.yaml`                                                                                                                                 |
| `command-backed` | no                                            | yes, via a namespaced Pi extension | invoke-only harness overlays + `.pi/settings.json` `-skills/<name>` + a **verified** Pi replacement command                                                                             |
| `unlisted`       | no — no ambient surface anywhere              | no — no human invocation surface   | invoke-only harness overlays + `.pi/settings.json` `-skills/<name>`, and **both mirror symlinks removed** (`.agents/skills/<name>`, `.claude/skills/<name>`); no Pi replacement command |

For first-party skills, `areg` writes harness overlays under `skills/<name>/`. For vendored GitHub-sourced skills, `areg` writes only the local harness overlay files under `.agents/skills/<name>/` (`SKILL.md` frontmatter and `agents/openai.yaml`) plus `.pi/settings.json`; those local overlays are allowed when the ambient-token decision is repo-specific. This is the overlay seam for externally sourced skills: upstream owns the skill content, the repo owns the invocation policy, and `areg skill apply` reconciles the whole overlay bundle so an upstream refresh replaces content while overlays are re-derived rather than hand-merged.

Norms and gotchas this taxonomy makes non-obvious:

- **areg supersedes generic authoring guidance.** The vendored `writing-great-skills` skill (and upstream skill-authoring docs generally) describe raw `disable-model-invocation` frontmatter mechanics; in this repo those flags are harness overlays owned by `areg skill apply` — never hand-author them, whatever a skill-authoring reference says.
- **Descriptions stay human-readable.** Older explicit-only experiments used `description: "Command: <name>"` stubs plus hidden comments, but current `areg skill apply` does not rewrite descriptions. A skill that remains `normal` must carry a real trigger description; a skill made `invoke-only` or `command-backed` can keep its real description because Claude Code and Pi remove it from ambient context through the harness overlays.
- **`invoke-only` vs `command-backed`.** `invoke-only` is the light, default explicit-only kind — zero ambient on Claude Code + Pi, still invocable via `/skill:name`, no extra dependency. `command-backed` additionally hides the raw `/skill:name` in Pi and routes to a namespaced Pi extension (`/ns:cmd`); `areg skill apply command-backed` only succeeds when that replacement extension already exists and verifies (see `.pi/extensions/`). Use `command-backed` only when the verified Pi replacement is the preferred user surface; otherwise use `invoke-only`. **Carve-out:** the Pi `-skills/<name>` exclusion normally implies a verified replacement command, but `unlisted` deliberately writes the exclusion with **no** replacement — it removes the invocation surface entirely rather than routing it elsewhere, so its exclusion is exempt from the verified-replacement precondition.
- **Invocation kind is orthogonal to visibility.** `metadata.internal: true` (non-public / not externally installable) is a *separate* axis from the invocation kind. A skill can be internal and `normal`, or public and `invoke-only`, etc. Do not infer one axis from the other.
- **Codex can't go zero-ambient.** Claude Code and Pi both honor `disable-model-invocation: true` (the entry leaves the model's context); Codex keeps the description ambient and only blocks implicit invocation. The full per-harness mechanics — flags honored, ambient token cost, read roots, namespacing — live in [Harness skill/command/prompt invocation mechanics](../research/harness-skill-invocation.md). This section is the repo's *managed taxonomy* layered on top of those mechanics.

### Skill Invocation Decision Policy

ADR 0016 (`docs/adr/0016-skill-invocation-context-budget.md`) records the durable decision behind this policy.

Ambient skill frontmatter is a shared context budget. Default by domain, not by habit: make a skill `normal` only when the model must discover it from ordinary user language, and an eligibility category below applies. Otherwise make it explicit-only with `areg skill apply invoke-only <skill>` or, when a verified namespaced Pi replacement is the preferred surface, `areg skill apply command-backed <skill>`.

Use these buckets:

1. **Ambient routers and standards (`normal`)** — keep broad entrypoints and always-relevant coding guidance model-invoked when automatic discovery prevents mistakes. Eligible categories are:
   - umbrella/router skills that route a family of explicit leaf workflows, such as `handoff`, `objective`, or `branch-context`;
   - common coding or repo standards that should fire during ordinary implementation, such as TypeScript style overlays;
   - safety-sensitive workflows where missing the skill is worse than paying the frontmatter cost, such as merge-conflict resolution;
   - broad external-boundary guidance where the agent must choose the right API/tooling before acting, such as GitHub or PR-feedback workflows.
2. **Command-backed workflows (`command-backed`)** — use for explicit workflows whose preferred user surface is a verified namespaced Pi command. `areg` writes `disable-model-invocation: true`, the Codex `agents/openai.yaml` sidecar, and the `.pi/settings.json` skill exclusion together as harness overlays.
3. **Invoke-only workflows (`invoke-only`)** — use for specialized, rare, setup, migration, language-specific, or admin skills that remain useful by name but should not consume ambient context. This is the default explicit-only kind when there is no verified Pi replacement command.
4. **Internal backend skills** — keep implementation-support skills explicit-only unless an extension wrapper requires model discovery. Internal visibility (`metadata.internal: true`) is not an invocation kind; still manage the invocation kind through `areg`.
5. **Vendored/upstream skills** — treat real directories under `.agents/skills/` as a separate review class. Do not casually rewrite upstream content, but `areg skill apply` may write local harness overlays when ambient token cost is material and the decision is recorded. Prefer upstream overlays, wrapper skills, or a documented fork/update policy when the change would drift from the source project beyond invocation metadata.
6. **One-shot bootstrap/scaffold skills (`unlisted`)** — use for project bootstrap/scaffold workflows that run once per project and have no ongoing invocation demand or verified Pi replacement. Make each leaf `unlisted` (invoke-only harness overlays + Pi exclusion + **both mirrors removed**), tag it `metadata.category: <family>`, and add exactly one ambient router skill (`normal`) that carries the family's triggers and routes to the leaves' canonical `skills/<name>/` sources. Unlisted leaves must keep real, human-readable descriptions (nothing injects them, so there is no token cost) so the router and `areg skill find` can surface accurate scope. The `metadata.category` tag is **declarative only** — `areg` does not validate or key any behavior off it today; the promotion path, if family-level validation is later wanted, is to teach `areg` to read the tag rather than to introduce a parallel registry.

Do not maintain a full skill-kind table in this document. Use representative examples here for policy, and `areg skill list` / `areg skill show <name>` for live state.

### Public Skill Authoring — No Internal References

Public skills (those with a `skills/<name>` symlink for external discoverability) are user-facing documents. Do not reference ns-internal module paths, class names, or implementation details in their `SKILL.md` files or frontmatter descriptions. Describe *what* CLI operations to call (e.g., `ns address exec pr-reviews`), not *how* they are implemented. Implementation details belong in source code, not in public `SKILL.md` files. Internal skills (no `skills/` symlink) may reference internals freely.

### Skill Model Examples

When a skill body references model tiers or per-dispatch model selection, keep the default guidance harness-neutral, but always include concrete examples for both OpenAI and Anthropic (e.g. `openai-codex/gpt-5.6-luna` and `claude-haiku-4-5`), each labeled with its harness, so agents on either harness can resolve the tier unambiguously.

### Vendored Skill Code

When upstream content is *melded* into ns-owned surfaces rather than just vendored, the process — single-source pin, melded-surfaces registry, lineage blocks, rename-on-import, minimal forks, update procedure — lives in [upstream-skill-melding.md](upstream-skill-melding.md). Each upstream repo with melded content has an instance doc; see [Matt Pocock Skills](../agents/matt-pocock-skills.md) for the Matt-sourced vendored skill set, renames, recorded forks, and its melded-surfaces registry.

- `.agents/skills/<name>/` is either (a) a symlink back to a first-party skill at `skills/<name>/` or (b) a real directory containing vendored third-party code. Treat only real directories there as vendored; symlinked entries resolve to first-party ns work under `skills/<name>/` and are subject to normal linting, typechecking, and review.
- Treat `.claude/skills/*` as symlinks into `.agents/skills/`; the vendored-vs-first-party distinction follows through the chain to the underlying directory.
- For repo-local skills, `skills/<name>/` is the canonical source — edit files there directly. `.agents/skills/<name>` is a symlink back to that source, and editing through either path is equivalent. (`unlisted` skills are the exception: they have no `.agents/skills/<name>` mirror, so `skills/<name>/` is the only editable path.)
- Do not apply first-party language standards, style guides, or refactoring skills (for example `dignified-python`, `typescript-style`, `python-fake-driven-testing`, or `fdt-refactor-mock-to-fake`) to code inside vendored (real-directory) entries under `.agents/skills/` unless the user explicitly asks to modify the vendored dependency itself.
- When reviewing or editing the repo, exclude vendored entries — all files under real directories in `.agents/skills/<name>/`, including embedded scripts, tests, fixtures, package manifests, and lockfiles — from normal linting, typechecking, code review, and cleanup expectations; assume those files should remain as-shipped unless the task is specifically about updating the vendored skill itself. Code review agents should limit findings for vendored skills to integration-boundary issues such as broken invocation docs, dependency/workspace leakage, missing provenance/license notices, tracked generated artifacts, or deviations from the vendoring contract.

### Code and Dev Skill Prefixes

Use `/code:*` as the Pi slash-command namespace for codebase/source-control management workflows: worktree snapshots, checkpoints, branch/stack maintenance, and Graphite/GitHub workflows that manage code state.

Use `code-*` for code/source-control workflow skills, whether published or repo-private. The code-skill family does not use an `internal-` name prefix: visibility is controlled by frontmatter, and internal/prototype skills must carry `metadata.internal: true`. The `internal-` prefix remains available for repo-private skills in other domains.

`dev-` no longer means "codebase-related." Do not introduce new `dev-*` skills for codebase/source-control work. Prefer the domain namespace (`ns-*`, `code-*`, `ns-cmux-*`, etc.) for new workflow skills; any future `dev-*` skill needs an explicit product decision.
