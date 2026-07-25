# Matt Pocock Skills — Upstream Instance Doc

This is the instance doc for `mattpocock/skills` under the generic
[upstream-skill-melding convention](../conventions/upstream-skill-melding.md): the
single commit-level pin, the import/rename/rejection tables, recorded forks, the
melded-surfaces registry, deferred follow-ups, and Pocock-specific update steps.

**Pin**: `mattpocock/skills` at commit `d574778f94cf620fcc8ce741584093bc650a61d3`
(package version 1.1.0). This is the only commit-level provenance record; melded
surfaces and lockfile entries never duplicate it.

## Layout

Matt-sourced GitHub skills live as real vendored directories under
`.agents/skills/<name>/`. Claude Code entries under `.claude/skills/<name>` are symlinks
to `../../.agents/skills/<name>`. `skills-lock.json` records the upstream source,
upstream skill path, and computed hash — but no commit. ns first-party adaptations live
under `skills/<name>/`.

## Imported upstream skills

- `grill-me`: user-invoked wrapper over `grilling`.
- `grill-with-docs`: user-invoked wrapper over `grilling` plus `domain-modeling`.
- `grilling`: reusable interview loop.
- `domain-modeling`: active glossary and ADR discipline.
- `codebase-design`: deep-module vocabulary and design guidance.
- `improve-codebase-architecture`: architecture survey using `codebase-design`, `domain-modeling`, and `grilling`.
- `pocock-review`: two-axis diff review against a fixed point, using upstream Standards and Spec sub-agent prompts (renamed on import; see below).
- `writing-great-skills`: upstream skill-authoring reference and the single source of the audit vocabulary; first-party `skill-audit` reads it at run time by context pointer (not a meld — no sync action on refresh).
- `tdd`: red → green loop reference (SKILL.md, `tests.md`, `mocking.md`); vendored as-shipped, no ns meld yet.
- `wayfinder`: tracker-backed shared map of investigation tickets for work larger than one agent session (upstream `skills/engineering/wayfinder/`). Kept `invoke-only` per ADR 0016 so it does not ambiently absorb planning language owned by ns Objectives. Carries the recorded tracker-line fork (see below). Bound to a **single-document tracker** via `docs/agents/issue-tracker.md` ("Wayfinding operations"): each wayfinder effort is one committed map file under `docs/wayfinding/` holding its tickets as sections — deliberately *not* Objectives-backed, so `/wayfinder` yields a lightweight doc while `objective-create` (wayfinding pattern, `references/wayfinding-create.md`) remains the Objectives-backed route. The Objective system's ideation pattern is an ns-native adaptation of this skill's model; the concept mapping, deliberate drops, and LM-driven sync process live in [wayfinder-objective-adaptation.md](wayfinder-objective-adaptation.md).
- `research`: background-agent research into a repo Markdown summary (model-invoked, per upstream).
- `prototype`: throwaway prototypes to answer design questions (model-invoked, per upstream).
- `diagnosing-bugs`: diagnosis loop for hard bugs and regressions (model-invoked, per upstream).
- `pocock-resolving-merge-conflicts`: upstream `resolving-merge-conflicts` (renamed on import; see below).

## Renames on import

| Upstream skill                    | ns name                            | Rationale                                                                                                                  |
| --------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `code-review` (formerly `review`) | `pocock-review`                    | Collides with the harness `/code-review` surface; ns keeps the upstream Fowler baseline under the pocock- prefix.          |
| `resolving-merge-conflicts`       | `pocock-resolving-merge-conflicts` | First-party `code-resolve-merge-conflicts` owns the ambient trigger; the pocock variant is invoke-only, reachable by name. |

## Recorded forks

Vendored dirs are byte-identical to upstream except areg-owned invocation overlays and:

- `pocock-review/SKILL.md`: the frontmatter `name:` line (rename on import).
- `pocock-resolving-merge-conflicts/SKILL.md`: the frontmatter `name:` line (rename on import).
- `wayfinder/SKILL.md`: one line — the tracker-doc sentence points at
  `docs/agents/issue-tracker.md` ("Wayfinding operations" section, local-markdown
  fallback) instead of upstream's `/setup-matt-pocock-skills` bootstrap, which is not
  imported. Re-apply after every refresh.

## Rejected upstream skills

Standing policy behind most rejections: **wherever Pocock skills use tickets or an
issue tracker for durable state, ns uses Objectives.** Re-affirmed at the v1.1 refresh:

- `handoff`: conflicts with ns's Branch Memory handoff system.
- `setup-matt-pocock-skills`: conflicts with ns `AGENTS.md`, `CONTEXT-MAP.md`, and skill-management conventions.
- `ask-matt`: routes through Matt's PRD/issue flow, not ns Objectives, branch-context, Graphite, or ns workflows.
- `to-spec`, `to-tickets` (formerly `to-prd`, `to-issues`), `triage`, `implement`: ticket/issue-tracker workflows; durable state belongs to Objectives. Port into ns workflows only after separate design.

## Melded surfaces registry

Beyond exact vendoring, upstream content has been *melded* into ns-owned surfaces.
Every melded surface carries a standardized prose lineage block naming its upstream
skill path and pointing back at this document; this table is the other end of that
contract. On every upstream refresh, walk this table and apply each row's sync action.
Rows never duplicate the commit hash — the pin at the top of this document is the
single source of commit-level provenance.

| Upstream skill                              | ns surface                                                                                                                                                                                                                        | Nature of melding                                                          | Sync action                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `grilling`                                  | `skills/pi-grill-ui/SKILL.md`                                                                                                                                                                                                     | Interview loop re-expressed in Pi structured `grill_ask` vocabulary        | Semantic merge on refresh                                                          |
| `grilling`                                  | `skills/pi-grill-with-docs-ui/SKILL.md`                                                                                                                                                                                           | Same, composed with docs-aware behavior                                    | Semantic merge on refresh                                                          |
| `grilling`                                  | `ts/packages/internal/pi-tools/src/grill/prompts.ts` (fallback blocks + `GRILL_UI_CONTRACT`), `.../grill/result.ts` (end-grill result)                                                                                            | Deliberately self-contained fallback duplicates of the backend skills      | Semantic merge on refresh; pin new behaviors in `test/grill/grill-ui.test.ts`      |
| `grilling`                                  | `skills/readme-driven-development/SKILL.md` (Grill step)                                                                                                                                                                          | Adapted interview-loop step                                                | Review on upstream `grilling` change                                               |
| `domain-modeling`                           | `skills/pi-grill-with-docs-ui/SKILL.md`                                                                                                                                                                                           | Glossary challenge, `CONTEXT.md` discipline, sparing ADRs in Pi vocabulary | Semantic merge on refresh                                                          |
| `code-review` (upstream rename of `review`) | `.ns/reviews/code-smell-review/review.md`                                                                                                                                                                                         | NS-local review prompt derived from the Fowler smell baseline              | Manually re-derive the smell baseline on refresh                                   |
| `wayfinder`                                 | Objective ideation pattern: `skills/objective/references/objective-patterns.md`, root `CONTEXT.md` vocabulary, `skills/objective-create/references/wayfinding-create.md`, step-skill hooks in `objective-next`/`objective-update` | LM-driven conceptual adaptation                                            | LM sync per [wayfinder-objective-adaptation.md](wayfinder-objective-adaptation.md) |
| `grill-me`                                  | `skills/objective-create/SKILL.md` (interview step)                                                                                                                                                                               | Inspired-by, credited inline                                               | None (credit only)                                                                 |
| `wayfinder`                                 | `docs/objective-system.md` (ideation pattern mention)                                                                                                                                                                             | Inspired-by via the Objective ideation pattern                             | None (credit only)                                                                 |

Standing policy inherited by every row: wherever Pocock skills use tickets or an issue
tracker for durable state, ns uses Objectives.

De-melded (2026-07-12): the former `writing-great-skills` melds — the `skill-audit`
adaptation reference and the bundled `skill-audit-improved` vocabulary — were
consolidated into one first-party `skills/skill-audit/` that reaches the vendored
`.agents/skills/writing-great-skills/` by context pointer instead of embedding its
content. Not a meld; no registry row, no sync action on refresh.

Dismissed near-misses from the last semantic sweep (v1.1 refresh) — references by name
or independent vocabulary, not embeddings: `skills/objective-next/references/confirmed-execution.md`
(names grilling as a steering step), `skills/objective-create/references/readme-driven-development-create.md`
(routes to grilling/pi-grill-ui by name), the `.ns/reviews/` definitions other than
`code-smell-review` (structurally independent of the two-axis review), "seam"
vocabulary in first-party testing docs (dependency-injection sense, not upstream tdd's
seam-first testing), and generic duplication/progressive-disclosure wording outside the
skill-audit family.

## Pocock-specific guidance

- **Pi structured UI self-containment.** The portable upstream `grill-me` and
  `grill-with-docs` wrappers are intentionally tiny; ns's Pi structured UI cannot depend
  on them for operational details. `skills/pi-grill-ui/SKILL.md`,
  `skills/pi-grill-with-docs-ui/SKILL.md`, and the fallback prompt blocks in
  `ts/packages/internal/pi-tools/src/grill/prompts.ts` must stay self-contained and must
  continue to require `grill_ask` for user-facing questions when available, one question
  per tool call, explicit choices, recommendations, `estimatedRemaining`,
  freeform/status/end paths, no routine validation-scope questions, status-request
  re-asking, the shared-understanding confirmation gate, and docs-aware
  `Documentation updates:` reporting for `/pi:grill-with-docs`. Operational `grill_ask`
  instructions live only in this self-contained kickoff skill/prompt content: the
  `grill_ask` tool definition carries no global `promptSnippet`/`promptGuidelines`, and
  the tool itself is inactive until an explicit structured-grill command activates it
  for the session.
- **Validation-scope policy is ns-owned.** It lives in repo/project instructions and
  first-party Pi prompts; do not rely on upstream Matt wrappers to carry it.
- **Writing-great-skills and skill-audit.** The vendored `writing-great-skills` is the
  single source of the skill-authoring vocabulary; ns's operational audit checklists
  live in `skills/skill-audit/`, which loads that vocabulary at run time by context
  pointer. Upstream vocabulary changes flow in automatically on refresh — do not copy
  vocabulary back into the audit skill.
- **Invocation semantics.** Matt Skills uses `disable-model-invocation: true` for
  user-invoked wrappers and rich descriptions for reusable model-invoked skills. ns maps
  this through `areg skill apply`; `docs/research/harness-skill-invocation.md` records
  the harness caveat that Codex may not make invoke-only skills truly zero-ambient.

## Update steps (Pocock-specific)

Follow the generic procedure in
[upstream-skill-melding.md](../conventions/upstream-skill-melding.md). Pocock
additions:

1. For `wayfinder`, run the LM-driven sync in
   [wayfinder-objective-adaptation.md](wayfinder-objective-adaptation.md): classify each
   conceptual change adopt/adapt/reject against the Objective ideation pattern and
   update that document's mapping tables.
2. If the grill/domain-modeling contract changes, semantically merge into the Pi backend
   skills and the pi-tools fallback prompts, and pin new behaviors in
   `ts/packages/internal/pi-tools/test/grill/grill-ui.test.ts`.
3. Re-apply the recorded forks listed above.

## Deferred follow-ups

- `to-spec` borrows for Objectives: seam-first testing decisions; an explicit
  no-file-paths durability rule; the prototype-snippet exception.
- `handoff` borrows for `handoff-create`: a "suggested skills" section; an explicit
  don't-duplicate/reference-by-path rule.
- ~~Consolidate `skill-audit` and `skill-audit-improved` into one skill~~ — done
  2026-07-12: consolidated into `skills/skill-audit/` and de-melded to a context
  pointer at the vendored skill; the registry collapsed to zero rows for this pairing
  (see "De-melded" note above).
- Melding assessments for other upstreams when their first update lands:
  `thermo-nuclear-code-quality-review` (vs first-party
  `review-thermonuclear-review`), `fdt-refactor-mock-to-fake` (cross-repo coherence
  with the fake-driven-testing family).
