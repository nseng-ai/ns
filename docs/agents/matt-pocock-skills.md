# Matt Pocock Skills — Upstream Instance Doc

This is the instance doc for `mattpocock/skills` under the generic
[upstream-skill-melding convention](../conventions/upstream-skill-melding.md): the
single commit-level pin, the import/rename/rejection tables, recorded forks, the
melded-surfaces registry, deferred follow-ups, and Pocock-specific update steps.

**Pin**: `mattpocock/skills` at commit `8b36d4fb2635b3c21998dcd8144439c9e5ba7302`
(package version 1.2.2). This is the only commit-level provenance record; melded
surfaces and lockfile entries never duplicate it.

## Layout

Matt-sourced GitHub skills live as real vendored directories under
`.agents/skills/<name>/`. Claude Code entries under `.claude/skills/<name>` are symlinks
to `../../.agents/skills/<name>`. `skills-lock.json` records the upstream source,
upstream skill path, and computed hash — but no commit.

Since upstream v1.2, every upstream skill ships its own `agents/openai.yaml` (Codex
`interface.*` metadata, plus `policy.allow_implicit_invocation: false` for user-invoked
skills). For skills whose invocation mode is `normal`, that upstream sidecar is kept as-shipped.
For explicit-mode skills (`invoke-only`, `skill-backed-command`), the sidecar seam is
repo-owned: remove the upstream file and maintain the checked-in replacement directly
after refresh, dropping upstream's `interface.*` metadata. This is part of the recorded
Harness Overlay exception to byte-identity. ns first-party adaptations live under their explicit nested canonical paths in
`skills/<disposition>/<family>/<name>/` (with approved top-level product exceptions).

## Imported upstream skills

- `grill-me`: user-invoked wrapper over `grilling`.
- `grill-with-docs`: user-invoked wrapper over `grilling` plus `domain-modeling`.
- `grilling`: reusable interview loop.
- `domain-modeling`: active glossary and ADR discipline.
- `codebase-design`: deep-module vocabulary and design guidance.
- `improve-codebase-architecture`: architecture survey using `codebase-design`, `domain-modeling`, and `grilling`.
- `pocock-review`: two-axis diff review against a fixed point, using upstream Standards and Spec sub-agent prompts (renamed on import; see below).
- `writing-for-agents` (upstream rename of `writing-great-skills` at v1.2; ns follows the upstream name, no local rename): reference for documents consumed by agents. Upstream merged `GLOSSARY.md` into `SKILL.md` and split skill-only mechanics into `SKILL-MECHANICS.md`.
- `tdd`: red → green loop reference (SKILL.md, `tests.md`, `mocking.md`); vendored as-shipped, no ns meld yet.
- `wayfinder`: tracker-backed shared map of investigation tickets for work larger than one agent session (upstream `skills/engineering/wayfinder/`). Kept `invoke-only` per ADR 0016 so it does not ambiently absorb planning language owned by ns Objectives. Carries the recorded tracker-line fork (see below). Bound to a **single-document tracker** via `docs/agents/issue-tracker.md` ("Wayfinding operations"): each wayfinder effort is one committed map file under `docs/wayfinding/` holding its tickets as sections — deliberately *not* Objectives-backed, so `/wayfinder` yields a lightweight doc while `objective-create` (wayfinding pattern, `references/wayfinding-create.md`) remains the Objectives-backed route. The Objective system's ideation pattern is an ns-native adaptation of this skill's model; the concept mapping, deliberate drops, and LM-driven sync process live in [wayfinder-objective-adaptation.md](wayfinder-objective-adaptation.md).
- `research`: background-agent research into a repo Markdown summary (model-invoked, per upstream).
- `prototype`: throwaway prototypes to answer design questions (model-invoked, per upstream).
- `diagnosing-bugs`: diagnosis loop for hard bugs and regressions (model-invoked, per upstream).
- `pocock-resolving-merge-conflicts`: upstream `resolving-merge-conflicts` (renamed on import; see below).
- `wait-what`: one-word corrective for model verbosity — re-pitch the last message with context, Simplified Technical English, and `CONTEXT.md` vocabulary. Kept `invoke-only`, matching upstream's user-invoked intent.

## Renames on import

| Upstream skill                    | ns name                            | Rationale                                                                                                                  |
| --------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `code-review` (formerly `review`) | `pocock-review`                    | Collides with the harness `/code-review` surface; ns keeps the upstream Fowler baseline under the pocock- prefix.          |
| `resolving-merge-conflicts`       | `pocock-resolving-merge-conflicts` | First-party `code-resolve-merge-conflicts` owns the ambient trigger; the pocock variant is invoke-only, reachable by name. |

## Recorded forks

Vendored dirs are byte-identical to upstream except repo-owned invocation metadata (maintained and reviewed directly) and:

- `pocock-review/SKILL.md`: the frontmatter `name:` line (rename on import).
- `pocock-resolving-merge-conflicts/SKILL.md`: the frontmatter `name:` line (rename on import).
- `grilling/SKILL.md`: one sentence — the uniform-polarity rule (a plain "yes" must
  endorse the recommended answer; never a "no"-recommendation followed by "Do you
  agree?"). Prevents mixed-polarity compound questions in the portable prose loop.
  Since the v1.2 round-by-round rework, the sentence lives inside the "Work the tree in
  **rounds**" paragraph, after "number each question and give your recommended answer".
  Re-apply after every refresh.
- `wayfinder/SKILL.md`: one line — the tracker-doc sentence points at
  `docs/agents/issue-tracker.md` ("Wayfinding operations" section, local-markdown
  fallback) instead of upstream's `/setup-matt-pocock-skills` bootstrap, which is not
  imported. Re-apply after every refresh.
- `domain-modeling/SKILL.md` and `CONTEXT-FORMAT.md`: ns defers new glossary terms until
  the corresponding code or other authoritative ground truth changes, then requires the
  `CONTEXT.md` update in the same change; documentation-only edits repair existing drift.
- `improve-codebase-architecture/SKILL.md`: its domain-modeling handoff follows the same
  code-first glossary synchronization rule instead of updating `CONTEXT.md` during the
  design conversation.

## Rejected upstream skills

Standing policy behind most rejections: **wherever Pocock skills use tickets or an
issue tracker for durable state, ns uses Objectives.** Re-affirmed at the v1.1 refresh:

- `handoff`: conflicts with ns's Branch Memory handoff system.
- `setup-matt-pocock-skills`: conflicts with ns `AGENTS.md`, `CONTEXT-MAP.md`, and skill-management conventions.
- `ask-matt`: routes through Matt's PRD/issue flow, not ns Objectives, branch-context, Graphite, or ns workflows.
- `to-spec`, `to-tickets` (formerly `to-prd`, `to-issues`), `triage`, `implement`: ticket/issue-tracker workflows; durable state belongs to Objectives. Port into ns workflows only after separate design.
- `wizard`: interactive Bash wizard for human-only steps; not imported because it adds another overlapping interaction workflow without a concrete ns need.
- `to-questionnaire`: grills the send rather than the subject; not imported because its workflow overlaps existing grilling surfaces and would add confusion.

## Melded surfaces registry

Beyond exact vendoring, upstream content has been *melded* into ns-owned surfaces.
Every melded surface carries a standardized prose lineage block naming its upstream
skill path and pointing back at this document; this table is the other end of that
contract. On every upstream refresh, walk this table and apply each row's sync action.
Rows never duplicate the commit hash — the pin at the top of this document is the
single source of commit-level provenance.

| Upstream skill                              | ns surface                                                                                                                                                                                                                                                                    | Nature of melding                                                          | Sync action                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `grilling`                                  | `skills/internal/pi-host/pi-grill-ui/SKILL.md`                                                                                                                                                                                                                                | Interview loop re-expressed in Pi structured `grill_ask` vocabulary        | Semantic merge on refresh                                                          |
| `grilling`                                  | `skills/internal/pi-host/pi-grill-with-docs-ui/SKILL.md`                                                                                                                                                                                                                      | Same, composed with docs-aware behavior                                    | Semantic merge on refresh                                                          |
| `grilling`                                  | `ts/packages/internal/hosts/pi/tools/pi-tools/src/grill/prompts.ts` (`GRILL_UI_CONTRACT`), `.../grill/result.ts` (end-grill result)                                                                                                                                           | Structured interaction contract layered on the required backend skills     | Semantic merge on refresh; pin new behaviors in `test/grill/grill-ui.test.ts`      |
| `grilling`                                  | `skills/internal/agent-engineering/readme-driven-development/SKILL.md` (Grill step)                                                                                                                                                                                           | Adapted interview-loop step                                                | Review on upstream `grilling` change                                               |
| `domain-modeling`                           | `skills/internal/pi-host/pi-grill-with-docs-ui/SKILL.md`                                                                                                                                                                                                                      | Glossary challenge, `CONTEXT.md` discipline, sparing ADRs in Pi vocabulary | Semantic merge on refresh                                                          |
| `code-review` (upstream rename of `review`) | `.ns/reviews/code-smell-review/review.md`                                                                                                                                                                                                                                     | NS-local review prompt derived from the Fowler smell baseline              | Manually re-derive the smell baseline on refresh                                   |
| `wayfinder`                                 | Objective ideation pattern: `skills/incubating/objectives/objective/references/objective-patterns.md`, root `CONTEXT.md` vocabulary, `skills/incubating/objectives/objective-create/references/wayfinding-create.md`, step-skill hooks in `objective-next`/`objective-update` | LM-driven conceptual adaptation                                            | LM sync per [wayfinder-objective-adaptation.md](wayfinder-objective-adaptation.md) |
| `grill-me`                                  | `skills/incubating/objectives/objective-create/SKILL.md` (interview step)                                                                                                                                                                                                     | Inspired-by, credited inline                                               | None (credit only)                                                                 |
| `wait-what`                                 | `skills/public/prs/pr-make-accountable/SKILL.md` (controlled-English drafting pass)                                                                                                                                                                                           | ASD-STE100-inspired drafting-pass adaptation                               | Review on upstream `wait-what` change                                              |
| `wayfinder`                                 | `docs/objective-system.md` (ideation pattern mention)                                                                                                                                                                                                                         | Inspired-by via the Objective ideation pattern                             | None (credit only)                                                                 |

Standing policy inherited by every row: wherever Pocock skills use tickets or an issue
tracker for durable state, ns uses Objectives.

**v1.2 refresh status (partial).** Sync actions walked at the v1.2 refresh:
`domain-modeling` rows — upstream content unchanged since v1.1, no-op;
`code-review` → `.ns/reviews/code-smell-review/review.md` — upstream changed only
issue/PRD→issue/spec wording, Fowler smell baseline byte-unchanged, no-op;
`wayfinder` — adopted decision-focused Question Row wording, adapted parallel
`research`-skill dispatch and its one-row-per-session exception, and rejected upstream's
tracker bootstrap and prescribed throwaway-branch mechanics. Deferred (see Deferred
follow-ups): all `grilling` semantic-merge rows (the v1.2 round-by-round frontier rework
is being trialed via the refreshed vendored skill before melding), the `grilling` →
`readme-driven-development` review row, and the post-refresh semantic sweep.

Dismissed near-misses from the last semantic sweep (v1.1 refresh) — references by name
or independent vocabulary, not embeddings: `skills/incubating/objectives/objective-next/references/confirmed-execution.md`
(names grilling as a steering step), `skills/incubating/objectives/objective-create/references/readme-driven-development-create.md`
(routes to grilling/pi-grill-ui by name), the `.ns/reviews/` definitions other than
`code-smell-review` (structurally independent of the two-axis review), "seam"
vocabulary in first-party testing docs (dependency-injection sense, not upstream tdd's
seam-first testing), and generic duplication/progressive-disclosure wording in first-party skills.

## Pocock-specific guidance

- **Pi structured UI backends.** The portable upstream `grill-me` and
  `grill-with-docs` wrappers are intentionally tiny; ns's Pi structured UI uses the
  canonical `skills/internal/pi-host/pi-grill-ui/SKILL.md` and
  `skills/internal/pi-host/pi-grill-with-docs-ui/SKILL.md` backends for operational
  details. Commands fail closed when the required repo skill cannot be loaded, before
  editor or tool activation. Keep the sibling backend skills synchronized, and keep
  `GRILL_UI_CONTRACT` in
  `ts/packages/internal/hosts/pi/tools/pi-tools/src/grill/prompts.ts` aligned with them:
  `grill_ask` for user-facing questions when available, one question per tool call,
  explicit choices, recommendations, `estimatedRemaining`, freeform/status/end paths,
  no routine validation-scope questions, status-request re-asking, the
  shared-understanding confirmation gate, and docs-aware `Documentation updates:`
  reporting for `/pi:grill-with-docs`. The `grill_ask` tool definition carries no global
  `promptSnippet`/`promptGuidelines`, and the tool itself is inactive until an explicit
  structured-grill command activates it for the session.
- **Validation-scope policy is ns-owned.** It lives in repo/project instructions and
  first-party Pi prompts; do not rely on upstream Matt wrappers to carry it.
- **Code-first glossary synchronization is an ns-owned fork.** Upstream domain-modeling
  updates `CONTEXT.md` as terms resolve. In ns, proposed vocabulary remains in the plan
  or discussion until code or other authoritative ground truth changes; update
  `CONTEXT.md` in that same change, with documentation-only edits reserved for repairing
  drift from already-existing ground truth. Preserve this behavior when refreshing the
  vendored `domain-modeling` and `improve-codebase-architecture` skills and when
  semantically merging the docs-aware Pi backend.
- **Writing-for-agents.** The vendored `writing-for-agents` (formerly
  `writing-great-skills`) remains available as an upstream reference for documents
  consumed by agents. Do not reintroduce a separate first-party audit vocabulary.
- **Invocation semantics.** Matt Skills uses `disable-model-invocation: true` for
  user-invoked wrappers and rich descriptions for reusable model-invoked skills. ns maps
  this through directly maintained frontmatter, Codex sidecars, and Pi exclusions;
  `docs/research/harness-skill-invocation.md` records the harness caveat that Codex may
  not make invoke-only skills truly zero-ambient.

## Update steps (Pocock-specific)

Follow the generic procedure in
[upstream-skill-melding.md](../conventions/upstream-skill-melding.md). Pocock
additions:

1. For `wayfinder`, run the LM-driven sync in
   [wayfinder-objective-adaptation.md](wayfinder-objective-adaptation.md): classify each
   conceptual change adopt/adapt/reject against the Objective ideation pattern and
   update that document's mapping tables.
2. If the grill/domain-modeling contract changes, semantically merge into the sibling Pi
   backend skills and `GRILL_UI_CONTRACT`, and pin new behaviors in
   `ts/packages/internal/hosts/pi/tools/pi-tools/test/grill/grill-ui.test.ts`.
3. Re-apply the recorded forks listed above.

## Deferred follow-ups

- `to-spec` borrows for Objectives: seam-first testing decisions; an explicit
  no-file-paths durability rule; the prototype-snippet exception.
- `handoff` borrows for `handoff-create`: a "suggested skills" section; an explicit
  don't-duplicate/reference-by-path rule.
- Propose the `grilling` uniform-polarity sentence upstream to `mattpocock/skills`;
  the recorded fork dissolves if accepted.
- Melding assessments for other upstreams when their first update lands:
  `thermo-nuclear-code-quality-review` (vs first-party
  `review-thermonuclear-review`), `fdt-refactor-mock-to-fake` (cross-repo coherence
  with the fake-driven-testing family).
- **v1.2 refresh remainder**:
  - Semantically merge the v1.2 `grilling` round-by-round **frontier** rework into the
    melded surfaces (`pi-grill-ui`, `pi-grill-with-docs-ui`, `GRILL_UI_CONTRACT` +
    grill tests, `readme-driven-development` Grill step) after trialing the refreshed
    vendored skill. Open design question: `grill_ask` is one-question-per-tool-call —
    adopt rounds as batched sequential calls or record a deliberate divergence.
  - Run the post-refresh **semantic sweep** for skills with real content changes
    (`grilling`, `prototype`, `tdd`, `code-review`, `improve-codebase-architecture`,
    `writing-for-agents`, `wayfinder`).
