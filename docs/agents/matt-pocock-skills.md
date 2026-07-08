# Matt Pocock Skills Upstream Adaptation Guide

## Purpose

This guide explains how ns imports and adapts skills from `mattpocock/skills` without overwriting ns-native agent workflows.

Implementation-time upstream source: `mattpocock/skills` at commit `d574778f94cf620fcc8ce741584093bc650a61d3` (package version 1.1.0).

## Current relationship

Matt-sourced GitHub skills live as real vendored directories under `.agents/skills/<name>/`. Claude Code entries under `.claude/skills/<name>` are symlinks to `../../.agents/skills/<name>`. `skills-lock.json` records the upstream source, upstream skill path, and computed hash.

ns first-party adaptations live under `skills/<name>/`. Their `.agents/skills/<name>` entries are symlinks back to `../../skills/<name>`, and `.claude/skills/<name>` symlinks through `.agents`.

## Imported upstream skills

- `grill-me`: user-invoked wrapper over `grilling`.
- `grill-with-docs`: user-invoked wrapper over `grilling` plus `domain-modeling`.
- `grilling`: reusable interview loop.
- `domain-modeling`: active glossary and ADR discipline.
- `codebase-design`: deep-module vocabulary and design guidance.
- `improve-codebase-architecture`: architecture survey using `codebase-design`, `domain-modeling`, and `grilling`.
- `pocock-review`: two-axis diff review against a fixed point, using upstream Standards and Spec sub-agent prompts.
- `writing-great-skills`: upstream skill-authoring reference; ns audit behavior is folded into first-party `skill-audit`.
- `wayfinder`: tracker-backed shared map of investigation tickets for work larger than one agent session (upstream `skills/in-progress/`, vendored from a post-1.0.1 upstream state). Kept `invoke-only` per ADR 0016 so it does not ambiently absorb planning language owned by ns Objectives. Expects a "Wayfinding operations" section in `docs/agents/issue-tracker.md` and falls back to a local-markdown tracker when that doc is absent; references upstream `/prototype`, which is not imported. The Objective system's ideation pattern is an ns-native adaptation of this skill's model; the concept mapping, deliberate drops, and LM-driven sync process live in [wayfinder-objective-adaptation.md](wayfinder-objective-adaptation.md).

## Melded surfaces registry

Beyond exact vendoring, upstream content has been *melded* into ns-owned surfaces.
Every melded surface carries a standardized prose lineage block naming its upstream
skill path and pointing back at this document; this table is the other end of that
contract. On every upstream refresh, walk this table and apply each row's sync action.
Rows never duplicate the commit hash — the pin at the top of this document is the
single source of commit-level provenance.

| Upstream skill                              | ns surface                                                                                                                                                                                                    | Nature of melding                                                                                          | Sync action                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `grilling`                                  | `skills/pi-grill-ui/SKILL.md`                                                                                                                                                                                 | Interview loop re-expressed in Pi structured `grill_ask` vocabulary                                        | Semantic merge on refresh                                                          |
| `grilling`                                  | `skills/pi-grill-with-docs-ui/SKILL.md`                                                                                                                                                                       | Same, composed with docs-aware behavior                                                                    | Semantic merge on refresh                                                          |
| `grilling`                                  | `ts/packages/internal/pi-tools/src/grill/prompts.ts` (fallback blocks + `GRILL_UI_CONTRACT`), `.../grill/result.ts` (end-grill result)                                                                        | Deliberately self-contained fallback duplicates of the backend skills                                      | Semantic merge on refresh; pin new behaviors in `test/grill/grill-ui.test.ts`      |
| `grilling`                                  | `skills/readme-driven-development/SKILL.md` (Grill step)                                                                                                                                                      | Adapted interview-loop step                                                                                | Review on upstream `grilling` change                                               |
| `domain-modeling`                           | `skills/pi-grill-with-docs-ui/SKILL.md`                                                                                                                                                                       | Glossary challenge, `CONTEXT.md` discipline, sparing ADRs in Pi vocabulary                                 | Semantic merge on refresh                                                          |
| `code-review` (upstream rename of `review`) | `.ns/reviews/code-smell-review/review.md`                                                                                                                                                                     | NS-local review prompt derived from the Fowler smell baseline                                              | Manually re-derive the smell baseline on refresh                                   |
| `writing-great-skills`                      | `skills/skill-audit/references/writing-great-skills-adaptation.md`                                                                                                                                            | Adapted audit concepts                                                                                     | Update adapted concepts when upstream vocabulary changes                           |
| `writing-great-skills`                      | `skills/skill-audit-improved/`                                                                                                                                                                                | Bundled vocabulary with inline `src: pocock` markers (permitted finer-grained supplement to this registry) | Re-derive `src: pocock`-marked content on refresh                                  |
| `wayfinder`                                 | Objective ideation pattern: `skills/objective/references/objective-patterns.md`, root `CONTEXT.md` vocabulary, `skills/objective-create-wayfinding/`, step-skill hooks in `objective-next`/`objective-update` | LM-driven conceptual adaptation                                                                            | LM sync per [wayfinder-objective-adaptation.md](wayfinder-objective-adaptation.md) |
| `grill-me`                                  | `skills/objective-create/SKILL.md` (interview step)                                                                                                                                                           | Inspired-by, credited inline                                                                               | None (credit only)                                                                 |
| `wayfinder`                                 | `docs/objective-system.md` (ideation pattern mention)                                                                                                                                                         | Inspired-by via the Objective ideation pattern                                                             | None (credit only)                                                                 |

Standing policy inherited by every row: wherever Pocock skills use tickets or an issue
tracker for durable state, ns uses Objectives.

Dismissed near-misses from the last semantic sweep (v1.1 refresh) — references by name
or independent vocabulary, not embeddings: `skills/objective-next/references/confirmed-execution.md`
(names grilling as a steering step), `skills/objective-create-readme-driven-development/SKILL.md`
(routes to grilling/pi-grill-ui by name), the `.ns/reviews/` definitions other than
`code-smell-review` (structurally independent of the two-axis review), "seam"
vocabulary in first-party testing docs (dependency-injection sense, not upstream tdd's
seam-first testing), and generic duplication/progressive-disclosure wording outside the
skill-audit family.

## ns-owned overlays

- `skills/pi-grill-ui` and `skills/pi-grill-with-docs-ui` are Pi structured grill UI backend skills. They must stay self-contained because fallback prompts must work even when skill expansion fails.
- `ts/packages/hosts/pi/src/grill-ui.ts` fallback prompt snippets must preserve the same structured grill behavior as the backend skills.
- ns's validation-scope policy lives in repo/project instructions and first-party Pi prompts; do not rely on upstream Matt wrappers to carry it.
- `CONTEXT-MAP.md` routing is ns-specific and should be preserved in docs-aware Pi/ns layers.
- Branch-context, handoff, Objective, Graphite, CCC, and ns workflows are ns-native. Do not replace them with Matt workflow skills without a separate product decision.

## What to copy exactly

Copy Matt-sourced reusable skills exactly when they remain general-purpose building blocks and do not conflict with ns workflow ownership. Install or refresh them with the `skill-management` skill and canonical flags:

```bash
npx skills add mattpocock/skills --agent codex claude-code -y --skill <name>
```

Then update ns metadata with the current skill-management workflow; do not use the removed `areg update-skills` command.

Use exact vendored copies for shared vocabulary or loops such as `grilling`, `domain-modeling`, `codebase-design`, and `writing-great-skills` unless ns intentionally forks them.

## What to adapt locally

Adapt locally when ns needs repo-specific behavior, tool use, or workflow ownership:

- Pi structured grill UI requirements (`grill_ask`, status paths, one-question tool calls, fallback prompts).
- ns validation-scope policy.
- `CONTEXT-MAP.md` routing and ns glossary conventions.
- Skill audit behavior and local skill-management conventions.
- Any workflow touching Branch Memory, Objectives, branch-context, handoffs, Graphite, CCC, or ns.

## Invocation semantics

Matt Skills 1.0 uses `disable-model-invocation: true` for user-invoked wrappers such as `grill-me`, `grill-with-docs`, and `writing-great-skills`. Reusable model-invoked skills keep rich descriptions so other skills can route to them.

ns follows the same split where possible. `docs/research/harness-skill-invocation.md` records the harness caveat: Claude Code and Pi can suppress ambient invocation with `disable-model-invocation: true`; Codex may not make invoke-only skills truly zero-ambient through the same flag.

## Pi structured UI guidance

The portable upstream `grill-me` and `grill-with-docs` wrappers are intentionally tiny. ns's Pi structured UI cannot depend on those wrappers for operational details.

Keep these surfaces self-contained:

- `skills/pi-grill-ui/SKILL.md`
- `skills/pi-grill-with-docs-ui/SKILL.md`
- `ts/packages/hosts/pi/src/grill-ui.ts` fallback prompt blocks
- `ts/packages/hosts/pi/test/grill-ui.test.ts`

They must continue to require `grill_ask` for user-facing questions when available, one question per tool call, explicit choices, recommendations, `estimatedRemaining`, freeform/status/end paths, no routine validation-scope questions, status-request re-asking, and docs-aware `Documentation updates:` reporting for `/pi:grill-with-docs`.

## Writing-great-skills and skill-audit

`writing-great-skills` is imported as upstream provenance and a broader reference. ns's operational audit checklist lives in `skills/skill-audit/`, especially `skills/skill-audit/references/writing-great-skills-adaptation.md`.

When the upstream skill-authoring vocabulary changes, update the ns reference with the adapted concepts rather than turning `skill-audit/SKILL.md` into a tutorial.

## Future upstream update checklist

1. Read upstream `CHANGELOG.md`.
2. Compare upstream files for imported skills.
3. Classify changes as exact vendor refresh, ns overlay update, fork required, or reject/defer.
4. For `wayfinder`, additionally run the LM-driven sync in [wayfinder-objective-adaptation.md](wayfinder-objective-adaptation.md): classify each conceptual change as adopt/adapt/reject against the Objective ideation pattern and update that document's mapping.
5. Check invocation semantics, especially `disable-model-invocation` and Pi/Claude/Codex behavior.
6. Update Pi backend and fallback prompts if the grill/domain-modeling contract changes.
7. Update `skill-audit` adaptation reference if skill-authoring concepts change.
8. Run skill inventory plus formatting and targeted test checks.
9. Inspect `skills-lock.json` for unrelated churn before accepting it.

## Rejected / not-yet-imported upstream skills

- `handoff`: conflicts with ns's Branch Memory handoff system.
- `setup-matt-pocock-skills`: conflicts with ns `AGENTS.md`, `CONTEXT-MAP.md`, and skill-management conventions.
- `ask-matt`: routes through Matt's PRD/issue flow, not ns Objectives, branch-context, Graphite, or ns workflows.
- `to-prd`, `to-issues`, `triage`, `implement`: should be ported into ns workflows only after separate design.
- `diagnosing-bugs`, `tdd`, `prototype`: candidates for later adaptation, not part of the Skills 1.0 adoption.
