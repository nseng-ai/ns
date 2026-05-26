# Plan: Trim `dev-gh/SKILL.md` (ns-skill-audit)

**Status:** Ready, not yet applied (user chose "hold — plan only").
**Target:** `skills/dev-gh/SKILL.md` (canonical first-party source; `.agents/skills/dev-gh` and `.claude/skills/dev-gh` are symlinks to it).
**Author of plan:** `ns-skill-audit` pass, 2026-05-26.
**Expected outcome:** body 360 → ~45 lines (~315 lines / ~87% cut), plus a tightened frontmatter `description`. Zero behavior change.

---

## 1. Context

`dev-gh` is an internal (`metadata.internal: true`), public-authored skill that wraps the GitHub CLI (`gh`). It ships a 360-line `SKILL.md` plus four large references:

| Reference                           | Size        | Owns                                                                                                                                                                                                          |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `references/gh.md`                  | ~1480 lines | mental model, three-layer architecture, context resolution, terminology, full command reference (PRs/issues/repos/releases), auth & config, output formatting, git/CI integration, scripting, troubleshooting |
| `references/graphql.md`             | ~1000 lines | GraphQL use cases (Projects V2, Discussions, batch/multi-repo, nesting, advanced search), patterns, complete examples                                                                                         |
| `references/graphql-schema-core.md` | ~500 lines  | exact GraphQL field/type/mutation shapes                                                                                                                                                                      |
| `references/api-backend-audit.md`   | ~850 lines  | REST vs GraphQL per-command backend map; rate-limit numbers and optimization                                                                                                                                  |

The references stay **untouched**. This plan only rewrites `SKILL.md`.

### Why this is the strongest audit target

The `SKILL.md` **body is loaded into context on every trigger**, while references load on demand. `ns-skill-audit` explicitly targets, for the body:

- onboarding tone / introductions / "philosophical" prose → delete or move to a human-only `README.md`;
- repeated rules and obvious AI behavior → delete;
- content that belongs in references (long examples, schemas, command catalogs) → move out, keep only routing.

The `dev-gh` body violates all of these: it is ~95% restatement of the four references, wrapped in "when the user asks X, load `references/gh.md` and re-list these commands" scaffolding.

---

## 2. Evidence (verified during the audit)

Confirmed the body's content is genuinely duplicated downstream, so deletion = zero information loss:

- `references/gh.md` carries the mental model and command surface:
  - `# GitHub CLI (gh) Mental Model`, `## Core Mental Model`, `### The Three-Layer Architecture`, `#### Layer 1: High-Level Commands (Porcelain)`, `### Context Resolution`, `## Terminology`, `## Authentication & Configuration`, `## Command Reference` (with `gh pr` create/view/checkout/merge subsections, etc.).
  - i.e. the body's Overview, Core Concepts/Three-Layer/Mental Model, Common Operations, Output Formatting, Auth & Config, Integration, Troubleshooting are all re-statements of `gh.md`.
- `references/api-backend-audit.md` carries the rate-limit numbers verbatim:
  - `## Rate Limit Guidance` → "Authenticated requests: 5,000 requests/hour", "Search API: 30 requests/minute", "Point-based system: 5,000 points/hour", `gh api rate_limit --jq '.resources'`.
- `references/graphql.md` carries the GraphQL use-cases that the body's `### GraphQL API Reference` re-lists.

### Anchor links that a collapse breaks

The body contains two internal self-anchor links pointing at the section the plan removes:

- line 137: `- See [GraphQL API Reference](#graphql-api-reference) section below`
- line 226: `3. **GraphQL**: Complex queries beyond REST API (see [GraphQL API Reference](#graphql-api-reference))`

Both must be redirected to `references/graphql.md` (no dangling anchors left behind).

---

## 3. Decisions (locked)

1. **Frontmatter `description`: tighten.** (User-approved optional extra.) Reduces always-in-context tokens and removes the passive opener; keeps discovery keywords.
2. **Coordination pointers (`dev-gh-ci-debug`, `graphite`): excluded.** (User declined.) Keeps the change purely subtractive plus the description rewrite — no invented content.
3. **No `README.md` created.** The deleted prose is generic `gh` facts already in `gh.md`, not project-specific philosophy worth preserving for humans. `ns-skill-audit`: "Do not create extra docs by default."
4. **`metadata.internal: true` and the PUBLIC SKILL HTML comment stay.**

---

## 4. Frontmatter change

**Current:**

```
description: This skill should be used when working with GitHub CLI (gh) for pull requests, issues, releases, and GitHub automation. Use when users mention gh commands, GitHub workflows, PR operations, issue management, or GitHub API access. Essential for understanding gh's mental model, command structure, and integration with git workflows.
```

**Proposed:**

```
description: "Use when working with the GitHub CLI (gh): pull requests, issues, releases, repos, automation, or GitHub REST/GraphQL API access. Routes to detailed gh command and API references."
```

Rationale: preserves the trigger keywords (`gh`, pull requests, issues, releases, automation, API, workflows-via-automation) so discovery/triggering is unchanged; drops the passive "This skill should be used when…" opener and the redundant "Essential for understanding the mental model" tail that `ns-skill-audit` flags as description-repeats-body.

---

## 5. Body disposition (delete table)

| Current lines | Section                                                                                                                                 | Disposition                                 | Why                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 12–14         | Overview                                                                                                                                | delete                                      | intro prose; duplicates frontmatter + `gh.md`                                                                        |
| 16–27         | When to Use This Skill (9 bullets)                                                                                                      | delete                                      | restates the frontmatter `description`                                                                               |
| 29–46         | Core Concepts / Three-Layer / Context Resolution / Mental Model                                                                         | delete                                      | lives in `gh.md` §Core Mental Model, §Terminology                                                                    |
| 48–77         | Using the Reference Documentation (+ grep patterns)                                                                                     | fold into reference map                     | grep patterns survive in the table's "Navigate with" column                                                          |
| 78–218        | Common Operations, Workflow Guidance, Output Formatting, Authentication & Configuration, Integration Guidance, Scripting and Automation | delete                                      | ~140 lines of "load `gh.md` and re-list commands" — restatement + obvious behavior                                   |
| 220–293       | Advanced Features + `### GraphQL API Reference`                                                                                         | delete; replace with 1-line GraphQL trigger | 40-line decision list duplicates `graphql.md`; this is where the two `#graphql-api-reference` anchors get redirected |
| 295–310       | Rate Limits and API Backend                                                                                                             | reduce to 1 always-on fact line             | numbers live in `api-backend-audit.md`                                                                               |
| 311–322       | Troubleshooting                                                                                                                         | delete                                      | in `gh.md` troubleshooting section                                                                                   |
| 324–360       | Command Discovery, Resources                                                                                                            | fold into reference map                     | the §Resources block becomes the table                                                                               |

**Kept verbatim:** H1 (`# GitHub CLI (gh)`) and the `<!-- PUBLIC SKILL ... -->` HTML comment.

---

## 6. Target body (~45 lines incl. frontmatter)

```markdown
---
name: dev-gh
description: "Use when working with the GitHub CLI (gh): pull requests, issues, releases, repos, automation, or GitHub REST/GraphQL API access. Routes to detailed gh command and API references."
metadata:
  internal: true
---

<!-- PUBLIC SKILL: Do not reference asdl-internal module paths or class names in this file. Describe CLI operations, not implementation. See AGENTS.md § "Public Skill Authoring". -->

# GitHub CLI (gh)

Router for `gh` work (PRs, issues, repos, releases, API). Load the reference
that matches the task, then act. Mental model, command syntax, and examples
live in the references, not here.

## References

Load on demand; navigate the big files with the grep patterns shown.

| File                                       | Load when                                                                                                                       | Navigate with                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `references/gh.md` (~1480)                 | any standard task: PRs, issues, repos, releases, auth/config, output formatting, git/CI integration, scripting, troubleshooting | `gh pr` · `gh issue` · `gh repo` · `gh api` · `gh release` · `Pattern [0-9]:` · `Authentication` |
| `references/graphql.md` (~1000)            | porcelain can't do it: Projects V2, Discussions, batch/multi-repo, deep nesting, advanced search                                | `Projects V2` · `Discussion` · `Batch` · `Pagination` · `Example [0-9]`                          |
| `references/graphql-schema-core.md` (~500) | exact GraphQL field/type/mutation shapes                                                                                        | type name (`PullRequest`, `ProjectV2`, …)                                                        |
| `references/api-backend-audit.md` (~850)   | rate-limit issues; REST vs GraphQL choice; per-command backend map                                                              | command name · `Rate Limit`                                                                      |

## Always-on facts

- For standard `gh` questions, load `references/gh.md` before answering from memory.
- Use GraphQL only when porcelain (`gh pr`, `gh issue`, …) can't express the task; Projects V2 and Discussions have no porcelain or REST path — see `references/graphql.md`.
- Rate limits differ by backend: REST 5,000 req/hr · GraphQL 5,000 points/hr · Search 30 req/min. Check `gh api rate_limit --jq '.resources'`; details in `references/api-backend-audit.md`.
```

Notes on what the body retains and why:

- **Reference map table** replaces the scattered "load X" instructions and the §Resources block; the "Navigate with" column preserves the two grep-hint lists (old lines 70–76 and 288–293) — genuine progressive-disclosure aids for 1000+ line files.
- **Always-on facts** is the only inline content that earns space because it changes behavior every run: the anti-hallucination guard (load `gh.md` first), the GraphQL trigger rule (also the redirect target for the two broken anchors), and the one-line rate-limit fact.

---

## 7. Risks / guardrails

- All four `references/*.md` are untouched — the substance survives there.
- The two `#graphql-api-reference` anchors are removed and redirected to `references/graphql.md`; no dangling links.
- Reference sizes in the table are approximate (matching the originals' "~1480"/"~1000"/"~500"/"~850" labels); not load-bearing.
- Edit the canonical source at `skills/dev-gh/SKILL.md`; the symlinks resolve automatically.

---

## 8. Execution checklist

1. Rewrite `skills/dev-gh/SKILL.md` to the target in §6 (frontmatter description + lean body).
2. Confirm no remaining `](#graphql-api-reference)` or other intra-file anchors: `grep -n "](#" skills/dev-gh/SKILL.md` → expect no matches.
3. `dprint check skills/dev-gh/SKILL.md` (autofix with `just dprint-fix` if it reports formatting).
4. `git diff --check`.
5. Report: `wc -l` before/after, sections deleted, anchors redirected, references untouched, verification run.

---

## 9. How to resume

Trigger `ns-skill-audit` on `dev-gh`, or say "apply the dev-gh trim plan". Everything needed to execute without re-deriving is in this file.
