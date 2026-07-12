# First-party skill audit — consolidated findings (2026-07-12)

Full per-skill findings from the 2026-07-12 audit of all 78 first-party skills under `skills/`,
run with the consolidated `skill-audit` skill (vocabulary sourced at runtime from the vendored
`.agents/skills/writing-great-skills/` skill). Twelve thematic auditor agents each loaded the
vocabulary + glossary, `skills/skill-audit/SKILL.md`, and `docs/conventions/skill-conventions.md`,
then applied the Frontmatter / Token Cuts / Clarity / Progressive Disclosure / CLI Push-Down
checklists to every assigned skill, naming each finding with a vocabulary failure mode.

Line references cite the SKILL.md contents as of commit e2ffd398e and will drift as fixes land;
treat the quoted text, not the line number, as the anchor.

## Totals

- Skills audited: **78 / 78** (every section of every SKILL.md flagged or judged clean)
- Findings: **475** — 38 HIGH, 226 MED, 211 LOW
- By failure mode (top): duplication 289, sediment 60, no-op 41, sprawl 26, negation 17, premature completion 13
- By proposed tranche: T1 mechanical cuts 289 · T2 trigger surface 62 · T3 structure 95 · T4 CLI push-down 29
- Estimated T1-only line savings: ~800 of 9,228 total SKILL.md lines (~9%), before structural moves

Severity rubric: HIGH = ambient-context cost, misfire risk, or behavior/correctness risk;
MED = meaningful token waste or fuzzy completion criterion; LOW = polish.
Tranche tags: T1 = delete/dedupe in place · T2 = frontmatter/description/invocation-kind ·
T3 = restructure/SSOT/disclosure · T4 = new or extended CLI surface (product decision required).

## Coverage

| Skill                                      | Batch    | Findings |
| ------------------------------------------ | -------- | -------- |
| architecture-topology-report               | Batch 11 | 7        |
| branch-context                             | Batch 3  | 6        |
| branch-context-from-plan                   | Batch 3  | 4        |
| branch-context-impl                        | Batch 3  | 7        |
| branch-retro                               | Batch 10 | 5        |
| brmem                                      | Batch 3  | 5        |
| ccc-available-work                         | Batch 6  | 7        |
| ccc-branch-triage                          | Batch 6  | 7        |
| ccc-sidebar                                | Batch 6  | 3        |
| ccc-stack-map                              | Batch 6  | 5        |
| changelog-update                           | Batch 10 | 8        |
| cli-push-down                              | Batch 9  | 5        |
| code-fix-gh-stack                          | Batch 5  | 8        |
| code-gh                                    | Batch 5  | 2        |
| code-gt-linearize-descendants              | Batch 4  | 5        |
| code-gt-restack-resolve                    | Batch 4  | 10       |
| code-just-fix                              | Batch 5  | 4        |
| code-just-the-stack                        | Batch 5  | 4        |
| code-resolve-merge-conflicts               | Batch 5  | 6        |
| code-smush                                 | Batch 4  | 12       |
| code-thermostack                           | Batch 4  | 9        |
| code-workflows                             | Batch 5  | 1        |
| context-bundle-analysis                    | Batch 11 | 5        |
| create-bun-typescript-project              | Batch 8  | 5        |
| create-python-dev-cli                      | Batch 8  | 5        |
| create-python-package                      | Batch 8  | 5        |
| dignified-python                           | Batch 7  | 7        |
| dignified-python-tripwire                  | Batch 7  | 2        |
| docs-retro                                 | Batch 10 | 2        |
| enriched-plan-save                         | Batch 3  | 5        |
| handoff                                    | Batch 3  | 4        |
| handoff-create                             | Batch 3  | 7        |
| handoff-pickup                             | Batch 3  | 8        |
| ns-cli-design                              | Batch 9  | 7        |
| ns-flow-autobranch                         | Batch 6  | 5        |
| ns-flow-branch-latest-commit               | Batch 6  | 5        |
| ns-flow-cp                                 | Batch 6  | 5        |
| ns-flow-submit                             | Batch 6  | 7        |
| ns-typescript                              | Batch 9  | 9        |
| ns-typescript-style-tripwire               | Batch 9  | 1        |
| objective                                  | Batch 2  | 8        |
| objective-autorun                          | Batch 1  | 7        |
| objective-close                            | Batch 1  | 4        |
| objective-create                           | Batch 1  | 6        |
| objective-create-autoobjective             | Batch 1  | 3        |
| objective-create-readme-driven-development | Batch 1  | 4        |
| objective-create-standing                  | Batch 1  | 4        |
| objective-create-steelthread               | Batch 1  | 2        |
| objective-create-umbrella                  | Batch 1  | 4        |
| objective-create-wayfinding                | Batch 1  | 2        |
| objective-critique                         | Batch 1  | 2        |
| objective-next                             | Batch 2  | 5        |
| objective-refresh                          | Batch 2  | 4        |
| objective-retro                            | Batch 2  | 6        |
| objective-runner-step                      | Batch 2  | 4        |
| objective-update                           | Batch 2  | 10       |
| pi-grill-ui                                | Batch 11 | 3        |
| pi-grill-with-docs-ui                      | Batch 10 | 3        |
| pr-address                                 | Batch 5  | 5        |
| project-setup                              | Batch 8  | 3        |
| pytest                                     | Batch 7  | 5        |
| python-fake-driven-test-layout             | Batch 7  | 4        |
| python-fake-driven-testing                 | Batch 7  | 4        |
| readme-driven-development                  | Batch 10 | 1        |
| refactor-swarm                             | Batch 11 | 6        |
| reinvented-abstractions-tripwire           | Batch 11 | 4        |
| review-dry-but-not-too-dry                 | Batch 11 | 4        |
| review-improve-codebase-architecture       | Batch 11 | 4        |
| review-thermonuclear-review                | Batch 11 | 4        |
| setup-dprint                               | Batch 10 | 6        |
| setup-dprint-gh-ci                         | Batch 10 | 3        |
| setup-graphite                             | Batch 5  | 3        |
| setup-pypi-publish                         | Batch 8  | 3        |
| setup-python-gh-ci                         | Batch 8  | 4        |
| skill-audit                                | Batch 12 | 8        |
| skill-management                           | Batch 12 | 18       |
| typescript-fake-driven-testing             | Batch 9  | 5        |
| typescript-style                           | Batch 9  | 5        |

---

# Batch 1 — Objective create-family

## objective-create (86 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — "Required shape" tree (lines 15–23) restates the umbrella skill's storage tree, which line 9 already orders loaded first — Fix: drop the tree; keep only the creation delta (no `closed.md` at create; `orientation.md` optional/orienting-only) and point at the umbrella's storage model — Tranche: T1-mechanical-cut
2. [duplication] MED — Record Frontmatter section (lines 44–50) restates umbrella mechanics: exact-two-keys rule, mirrored two-file edit, `ns objective check` commands — all in umbrella's Record Frontmatter section — Fix: keep the creation deltas (usually absent; omit unless the interview surfaces a fact; initial-edge timing) and point for mechanics — Tranche: T1-mechanical-cut
3. [duplication] MED — roadmap bullets (lines 32–34) restate umbrella `roadmap.md` rules: validation-rows-as-evidence, sizing by decision count, "prose, not machine state" — Fix: keep only the creation delta (steering an interview validation branch into an indented `Evidence:` line); point for the rest — Tranche: T1-mechanical-cut
4. [duplication] LOW — line 28's planning-only default is restated near-verbatim in `references/execution-friendly-create.md` line 10 ("Default ordinary Objectives to planning-only unless…") — Fix: keep the gate in SKILL.md; delete the restated bullet from the reference — Tranche: T1-mechanical-cut
5. [duplication] LOW — Stop/ask restates conditions already embedded in "Slug and path" (directory exists → line 41; rename lookalike → line 40) — Fix: make Stop/ask the single home for stop conditions; slim the body sentences to check + pointer — Tranche: T3-structure
6. [duplication] LOW — description triggers "create an objective" and "start an objective for X" are one branch written twice (skill is invoke-only, so the cost is Codex-ambient only) — Fix: keep one — Tranche: T2-trigger-surface
   Clean sections: Interview (strong "relentlessly" leading word, menu mechanics non-default), Workflow, Verify (checkable and exhaustive), facade routing paragraph (line 11).
   Est. T1 line savings: 14

## objective-create-autoobjective (24 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — line 9 identity sentence ("colloquial shorthand for autonomous-pursuit design — never a schema…; the product hook … refuses records") restates `objective/references/objective-patterns.md` (Autoobjective entry) and `standing-objectives.md` line 21 — Fix: catalog owns recognition; facade keeps one clause plus pointer — Tranche: T1-mechanical-cut
2. [duplication] MED — step 1's orthogonal Horizon/Drive axes sentence is a 4th copy (also standing facade step 1, patterns catalog, standing-objectives.md) — Fix: keep only the facade's decision test (execution-after-preview is weaker; needs no autoobjective shaping); point at the catalog — Tranche: T1-mechanical-cut
3. [duplication] LOW — Layering section restates the catalog's composition matrix (steelthread combo, wayfinding-after-Crystallization) — Fix: keep only the procedure-affecting line (Question Rows are decisions, not autonomous slices) plus pointer — Tranche: T1-mechanical-cut
   Clean sections: composition pointer block (routes well to both execution references), steps 2–4 (real deltas; step 3 runner-sized rows is the pattern's core; verify checkable).
   Est. T1 line savings: 5

## objective-create-readme-driven-development (34 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [premature completion] MED — only facade in the family with no "Verify and stop" step: it never invokes objective-create's Verify nor gives its own checkable done-list; "Pass report" names outputs but not a done condition — Fix: add a final binding "Run objective-create's Verify, plus: promotion row exists and promotion named in `## Completion Criteria`" — Tranche: T3-structure
2. [no-op] LOW — "the way `pi-grill-ui` composes `grilling`" (line 9) is an analogy the next sentence makes unnecessary — Fix: delete — Tranche: T1-mechanical-cut
3. [duplication] LOW — grill_ask parenthetical "(one question per call, recommendation, `estimatedRemaining`)" restates the grilling contract owned by the grilling loop — Fix: "uses `grill_ask` when available; otherwise the grilling loop's numbered-prose fallback" — Tranche: T1-mechanical-cut
4. [duplication] LOW — "Every run creates a new Objective — never reuse or attach" also lives verbatim in the patterns catalog RDD entry — Fix: keep here (operative rule); cut from catalog or accept as pointer text — Tranche: T1-mechanical-cut
   Clean sections: Objective-per-pass bundle list, README-promotion section (the skill's best content: sharp completion demand), remaining Composition bindings.
   Est. T1 line savings: 3

## objective-create-standing (23 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — step 2 retirement wording ("retired, superseded, obsolete, no longer worth maintaining, or intentionally abandoned") and "active/closed remains enough; add no lifecycle state" restate `standing-objectives.md` lines 8–10/37–43 — the reference line 12 explicitly says "do not restate it here", then steps 2–3 restate it — Fix: keep the instruction ("`## Completion Criteria` states retirement criteria per the deep reference"), cut the enumerations — Tranche: T1-mechanical-cut
2. [duplication] MED — step 1 orthogonal-axes sentence, 4th copy (see autoobjective #2) — Fix: keep the one-line horizon test ("natural finish line → bounded pattern"); point at catalog — Tranche: T1-mechanical-cut
3. [duplication] LOW — step 3 gloss ("operating guidance, not a hidden runner queue; a standing row may remain `[~]`…") restates three `standing-objectives.md` rules — Fix: cut to the pointer — Tranche: T1-mechanical-cut
4. [duplication] LOW — Layering restates the catalog matrix ("Composes with orienting and autoobjective… Never composes with steelthread" is verbatim there) — Fix: pointer — Tranche: T1-mechanical-cut
   Clean sections: composition block (routes), step 4 verify (checkable: prose says standing, criteria read as retirement, no invented state).
   Est. T1 line savings: 5

## objective-create-steelthread (27 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — line 9 "The seams between layers are where the surprises live; the thread de-risks integration while the design is still cheap to change" is verbatim in `objective-patterns.md` (Steelthread entry) — Fix: pick one home; if kept here as the motivating frame, slim the catalog entry to recognition cues — Tranche: T1-mechanical-cut
2. [duplication] LOW — Layering restates the catalog near-verbatim (autoobjective combo, never-standing, "a steelthread roadmap row … is a milestone, not a Steelthread Objective") — Fix: keep only "never composes with standing" if procedure-affecting; point for the rest — Tranche: T1-mechanical-cut
   Clean sections: composition block; Procedure steps 1–4 (real deltas — throwaway-thread scope rule, `## Parked` semantics, child-split shaping choice; verify checkable); Failure modes (unique; "cardboard thread" is a strong leading word).
   Est. T1 line savings: 4

## objective-create-umbrella (28 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — step 2 edge mechanics (mirrored two-file edit, perspective-correct annotation, `ns objective check`) are a third statement in this skill's own load path — both `objective` (Record Frontmatter) and `objective-create` (Record Frontmatter section) are ordered loaded first — Fix: keep the parent–child deltas ("children not yet created get no edge now"; per-record perspective) and point for mechanics — Tranche: T1-mechanical-cut
2. [duplication] MED — line 9 identity ("coordinates a family of narrower Subobjectives … durable home for cross-child lessons, migration guides, and synthesized closure evidence") near-verbatim from the catalog's Umbrella entry — Fix: compress to the procedure-relevant claim; catalog owns recognition — Tranche: T1-mechanical-cut
3. [duplication] LOW — line 13 ("prose-only… Record Frontmatter stays exactly `blocked` + `edges` (ADR 0025)") restates the catalog's "What a pattern is" and the umbrella skill — Fix: delete — Tranche: T1-mechanical-cut
4. [duplication] LOW — Layering restates catalog composition facts — Fix: pointer — Tranche: T1-mechanical-cut
   Clean sections: composition block; steps 1, 3, 4 (synthesis-in-completion-criteria and `[~]` child rows are the pattern's real deltas; verify checkable); Failure mode ("fire-and-forget umbrella" — unique, good leading phrase).
   Est. T1 line savings: 6

## objective-create-wayfinding (25 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — steps 2–3 definitional sentences are near-verbatim from the catalog's Ideation entry: "Rows resolve decisions, not deliverables; only `task` rows do rather than decide, earning their place by unblocking a decision" and "Fog gathers only toward the Destination: work ruled beyond it is out of scope, not Fog" — Fix: decide the split once (catalog = recognition, facade = operative procedure) and cut the restating side — Tranche: T1-mechanical-cut
2. [duplication] LOW — Layering restates catalog composition facts (orienting, autoobjective, wayfinding dominant) — Fix: keep only "roadmap stays Question Rows until Crystallization" (procedure-affecting), point for the rest — Tranche: T1-mechanical-cut
   Clean sections: composition block (wayfinder pointer with areg fallback routes well); "record is the map" binding (line 14); step 1; step 2's no-Fog exit rule (an excellent stop condition — the facade refuses to create when the way is already clear); step 4 verify (checkable, plus a clean session boundary).
   Est. T1 line savings: 3

## objective-critique (41 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] HIGH — Section 1 silently auto-selects from branch diff ("if the current branch adds or modifies exactly one Objective record, use that one") — a restated-and-diverged copy of the umbrella's Selection rules, which say "Do not silently auto-select from candidate count or changed/touched files" and require confirmation even in the picker exception; the umbrella documents a narrow exception for `objective-update` but none for critique — Fix: either present the branch-changed record as a suggested candidate requiring confirmation, or record a critique exception in the umbrella's Selection section; one source of truth for selection — Tranche: T3-structure
2. [no-op] LOW — "Part of the Objective skill family." (line 11) adds nothing beyond the pointer sentence beside it — Fix: delete — Tranche: T1-mechanical-cut
   Clean sections: frontmatter (verdict-first/red-team leading words, no synonym branches); Section 2 (exemplary demand: "A criticism that could have been written without reading the code doesn't count"); Section 3 (exhaustive: "classify EVERY entry… None skipped"); Section 4 (checkable, exhaustive done-condition; read-only boundary explicit).
   Est. T1 line savings: 1

## objective-close (56 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — step 6 restates umbrella Record Frontmatter mechanics loaded first per line 11: the sanctioned-counterpart-exception wording and the full `check` warning semantics ("warns (non-failing) when a record stays blocked while an edge counterpart is closed") are verbatim-in-meaning from the umbrella — Fix: keep the close-specific judgments (re-judge counterpart Blocked Sentences, normally clear own `blocked:`, leave edges, "a warning naming this closure is a re-judgment you missed") and point for mechanics — Tranche: T1-mechanical-cut
2. [duplication] LOW — line 9 repeats the description's first sentence verbatim — Fix: delete one — Tranche: T1-mechanical-cut
3. [duplication] LOW — step 9 deletion-via-source-control restates the umbrella's "Deletion is source-controlled" section — Fix: one clause plus pointer — Tranche: T1-mechanical-cut
4. [duplication] LOW — Stop/ask items 4–5 restate conditions already stated as workflow steps 2–3 — Fix: keep Stop/ask as the single home; slim the workflow sentences — Tranche: T1-mechanical-cut
   Clean sections: frontmatter (close vs abandon are distinct branches; the objective-update redirect earns its place); Resolve section (states its delta and declines to restate — the family's best delta discipline); steps 7–8 (orientation graduation is unique content); Closure timing (unique, prevents a real mistake); Verify (checkable and exhaustive, including the edge re-judgment audit).
   Est. T1 line savings: 6

## objective-autorun (67 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — line 13's closing sentence ("no new step without reading the previous checkpoint and making an explicit continue decision") is Hard boundaries bullet 1 restated; it also carries a negation ("Never degrade it into an unattended batch controller") whose positive ("your repeated, judged re-invocation") is already stated — Fix: keep the ADR framing sentence and the Hard boundaries bullet; cut the rest of line 13 — Tranche: T1-mechanical-cut
2. [duplication] MED — loop step 3 says to use the objective-runner-step post-checkpoint playbook "verbatim", then restates a compressed copy of it (per-status parentheticals matching runner-step lines 82–89) — two sources for recovery behavior — Fix: keep the pointer plus only the parent-loop deltas (fresh report path per attempt; two-consecutive-failures stop); cut the per-status summaries — Tranche: T1-mechanical-cut
3. [duplication] MED — Hard boundaries quotes the forbidden-actions rule with an internal source citation (`ts/packages/capabilities/objectives/src/runner/prompt.ts`, `OBJECTIVE_RUNner_FORBIDDEN_ACTIONS_RULE`): the rule text is deliberately duplicated from the runner prompt constant, and the citation violates skill-conventions "Public Skill Authoring — No Internal References" for a skill without `metadata.internal: true` — Fix: keep the quoted safety rule (safety stays explicit), drop the internal module path/constant name, or mark the skill internal — Tranche: T2-trigger-surface
4. [duplication] LOW — description triggers "run this objective" / "drive the objective forward" / "execute the autoobjective" are one branch written three times (invoke-only, so Codex-ambient cost only); "run N runner steps" and "implement as a stack" are the genuinely distinct branches — Fix: keep one plus the two distinct branches — Tranche: T2-trigger-surface
5. [duplication] LOW — End of run enumerates the digest's section list that `references/run-digest.md` owns and specifies — Fix: "finish with the `## Autorun digest` report it specifies" — Tranche: T1-mechanical-cut
6. [duplication] LOW — step 4 "Most committed steps need none; updates are learning and decision records, not step changelogs" restates runner-step's Semantic Update judgment and umbrella `updates/` rules — Fix: pointer — Tranche: T1-mechanical-cut
7. [duplication] LOW — "Draw slice boundaries by human-legible decision count and thesis clarity, never by diff size" (step 3) restates the umbrella's roadmap sizing rule — Fix: cut — Tranche: T1-mechanical-cut
   Clean sections: Before-the-run steps 1–5 (budget-is-cap-not-quota and the preview/affirmative gate are sharp, checkable); loop steps 1–2 (commands inline is correct — fragile syntax); Stop conditions (explicit, exhaustive; "a stopped run with a clear reason is a success of the loop" earns its place); `references/run-digest.md` routing (pointer fires at a clear branch point); remaining Hard boundaries.
   Est. T1 line savings: 10

## Cross-skill findings (batch)

1. [duplication] HIGH — the pattern composition/Layering matrix is stated at six sites: the Layering sections of all five pattern facades plus `objective/references/objective-patterns.md` (steelthread×autoobjective, standing×autoobjective, never steelthread×standing, wayfinding-dominant, orienting layerable — several sentences verbatim) — Fix: the catalog is the single source of truth for composition; each facade keeps only layering facts that alter its own procedure, plus one pointer — Tranche: T3-structure
2. [duplication] HIGH — the Horizon/Drive orthogonal-axes definition lives at four sites: `objective-create-autoobjective` step 1, `objective-create-standing` step 1, `objective-patterns.md`, `standing-objectives.md` — Fix: one home (the patterns catalog); each facade keeps its one-line decision test — Tranche: T3-structure
3. [duplication] MED — pattern identity sentences are duplicated facade↔catalog for umbrella, steelthread, autoobjective, ideation/wayfinding, and RDD ("every run creates a new Objective") — the facades were designed as delta-only ("owns that pattern's creation procedure and composes this skill for record mechanics") but each re-states its catalog recognition prose — Fix: decide the split once — catalog = recognition, facade = procedure — and cut whichever side restates — Tranche: T3-structure
4. [duplication] MED — Record Frontmatter / mirrored-edge mechanics are stated four times across the family load path: `objective` (owner), `objective-create` Record Frontmatter section, `objective-create-umbrella` step 2, `objective-close` step 6 — Fix: umbrella owns mechanics; step skills keep only their operation's judgment delta (initial-edge timing at create; counterpart re-judgment at close) — Tranche: T3-structure
5. [duplication] MED — the five-facade composition boilerplate enumerating objective-create's internals ("shared vocabulary, slug confirmation and root checks, required headings, Record Frontmatter, the interview, and Verify. Load both first.") appears near-verbatim in all five facades; if objective-create reshapes its sections, five files go stale (sediment risk) — Fix: compress to "Load `objective` and `objective-create` first; they own all record mechanics." — Tranche: T1-mechanical-cut
6. [duplication] MED — two contradictory family policies coexist: step skills claim "stays self-contained for its own happy path" (`objective-create` line 9, `objective-close` line 11) while facades claim delta-only composition; the self-containment claim is what licenses the restatements in findings above — Fix: pick one policy, state it once in the `objective` umbrella, and align the step skills — Tranche: T3-structure
7. [no-op] LOW — "Part of the Objective skill family." appears in `objective-critique`, `objective-close`, and `objective-autorun`, each time beside a pointer sentence that does the work — Fix: delete all three — Tranche: T1-mechanical-cut
8. [duplication] LOW — "skill judgment, never a machine auto-flip" recurs across umbrella, create, and close — judged **not** a finding to cut: it repeats a token, not a paragraph, and functions as an intentional leading phrase anchoring Blocked-Sentence behavior; noted so a future pass doesn't misread it as duplication — Fix: none — Tranche: T1-mechanical-cut

## Coverage

objective-create — audited, 6 findings
objective-create-autoobjective — audited, 3 findings
objective-create-readme-driven-development — audited, 4 findings
objective-create-standing — audited, 4 findings
objective-create-steelthread — audited, 2 findings
objective-create-umbrella — audited, 4 findings
objective-create-wayfinding — audited, 2 findings
objective-critique — audited, 2 findings
objective-close — audited, 4 findings
objective-autorun — audited, 7 findings

---

# Batch 2 — Objective lifecycle (objective, objective-retro, objective-update, objective-next, objective-refresh, objective-runner-step)

## objective (158 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: flagged · CLIPushDown: clean
Findings:

1. [sediment] MED — "Tracking Gate" section (lines 138): claims "Changed-path evidence collection and materiality judgment both remain skill/agent responsibilities in v1", but `ns objective exec tracking-gate` (used by objective-next, lines 21–43 there) now owns deterministic evidence collection. Umbrella text describes the pre-CLI world; an agent reading only the umbrella would hand-roll git evidence — Fix: reduce the section to one sentence pointing at objective-next's Tracking Gate and the exec command — Tranche: T1-mechanical-cut
2. [duplication] MED — "Objective skill family" roster (lines 37–45): entries have grown into multi-clause behavior specs (the `objective-next` line alone restates its gate/execution flow in ~60 words; the `objective-refresh` line packs its inline-close mechanics) that duplicate each step skill's own frontmatter description and body — Fix: trim each roster line to trigger + one distinguishing clause; behavior lives in the step skill — Tranche: T1-mechanical-cut
3. [duplication] MED — "orientation.md" (lines 105–107): the re-derivation paragraph restates the preceding paragraph's structure verbatim ("Durable Direction/Getting to… temporary What you see now/Avoid… lifecycle/graduation metadata stays in roadmap.md as above") — Fix: merge into one paragraph; state the durable/temporary split once — Tranche: T1-mechanical-cut
4. [sprawl] MED — "Selection" picker-UI paragraph (line 125): ~7 lines of picker menu-ordering spec (grouping, suggested labels, second menu option, diff-unavailable fallback) that no agent running these skills executes — it specifies a UI implementation, not agent behavior — Fix: disclose to a reference or move beside the picker implementation docs; keep one sentence ("a picker may pre-group changed Objectives; the user still confirms") — Tranche: T3-structure
5. [sediment] LOW — "Repository status" (line 129): change-log voice — "has no Graphite branch projection, current-branch mode, or third active status. Related-branch names and edge-annotation detail are no longer on `list`" describes what the command used to do — Fix: state current behavior positively; drop "no longer" history — Tranche: T1-mechanical-cut
6. [sediment] LOW — rename breadcrumbs: "(formerly synthesis)", "(formerly cross-cutting)" (line 51), "(formerly objective-review-briefing)" (line 45), "(it absorbed the retired `objective-stack-impl`)" (line 44) — Fix: prune as the old names fade; the autorun parenthetical can go now — Tranche: T1-mechanical-cut
7. [duplication] LOW — line 123 fully specifies objective-update's one-candidate selection exception, which objective-update (line 33) restates with the ask prompt; two sources of truth for one exception — Fix: umbrella keeps one sentence naming that the exception exists and points at objective-update for its terms — Tranche: T1-mechanical-cut
8. [negation] LOW — "Objective PR evidence" closes on an elephant list ("not a separate ledger, `prs.md`, machine-readable registry, schema, hidden state, or workflow driver", line 101) that partially re-enumerates Non-goals (line 156) — Fix: keep one guardrail list in Non-goals; end PR evidence on the positive convention — Tranche: T1-mechanical-cut

Sections judged clean: frontmatter/description (good trigger surface for a `normal` ambient router per ADR 0016 bucket 1), Concept, Slug identity, Deletion, Conditional references (pointers route on concrete conditions), objective.md, Record Frontmatter (correct SSOT), roadmap.md, updates/, closed.md, Selection core rules, Objective consolidation, Non-goals.
Est. T1 line savings: 15

## objective-retro (259 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: flagged · CLIPushDown: flagged
Findings:

1. [sediment] HIGH — namespace contradiction, behavior/correctness risk: Storage contract (lines 32–39) declares `namespace: objective-retro` and says the retired `objective-review` namespace is "never write to" — but step 6's write commands (lines 206–207) use `--namespace objective-review` for both `brmem check` and `brmem put`, and the basis template's Structural Digest line (line 196) references `objective-review:digest/...`. An agent following the commands verbatim writes into the forbidden retired namespace — Fix: change both commands and the template locator to `--namespace objective-retro` / `objective-retro:digest/...` — Tranche: T1-mechanical-cut
2. [duplication] MED — frontmatter description is a workflow summary ("Two phases: reconstruct… then write a source-backed retrospective…") duplicating the body's intro; ambient on Codex despite `disable-model-invocation` — Fix: keep triggers + the branch-retro disambiguator; cut the phase summary — Tranche: T2-trigger-surface
3. [duplication] MED — Workflow step 1 (lines 49–55) restates the umbrella's Selection rules verbatim in meaning ("Never infer the Objective from branch name, PR, changed files, or hidden attachment metadata") right after line 16 already points at the umbrella for "selection rules" — Fix: keep the `ns objective list` command and the ask; drop the restated inference ban in favor of the pointer — Tranche: T1-mechanical-cut
4. [sprawl] MED — steps 3–4 are a deterministic reconstruction pipeline: loop over trunk commits touching `.ns/objectives/<slug>/`, resolve each sha to PRs via `gh api …--jq`, cross-check three signals, build file union (lines 74–131) — meets push-down thresholds (loops over commits/PRs, 3+ tool calls, jq pipeline). The skill's own Boundaries ban new `ns objective exec` operations, so this needs a separate product decision, but a `reconstruct-delivered` exec op returning PR set/commit set/file union JSON would delete ~40 procedural lines while judgment (confidence, gaps) stays with the agent — Fix: flag for product decision; do not change within this skill — Tranche: T4-cli-pushdown
5. [sprawl] LOW — two large inline artifact templates (basis ~50 lines, retro ~24 lines; lines 150–241). SKILL.md is well under the ~500-line threshold so inline is defensible, but they are the bulk of the file and every run needs only one shape at a time — Fix: optional disclosure to `references/templates.md` — Tranche: T3-structure
6. [sprawl] LOW — "Manual sanity check" (lines 257–259) is maintainer-facing ("When changing this skill, dry-run against `branch-context-plans-extension`… PRs #2112…") — agents running the skill never need it; the Token Cuts rule routes human-facing content to a sibling README.md — Fix: move to README.md — Tranche: T3-structure

Sections judged clean: intro/two-phase framing ("advisory archaeology" is a strong leading word), Boundaries, steps 2, 5 (concrete 750 KiB / 20,000-line cutoff), 7 (citation-required completion criterion: "a claim that could have been written without reading the basis does not count" — exemplary), 8, storage-contract prose apart from the bug.
Est. T1 line savings: 8

## objective-update (164 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: flagged
Findings:

1. [duplication] MED — sibling routing stated three times: frontmatter description ("For a verified rebaseline use objective-refresh; for an explicit close objective-close; for advice objective-next"), body line 11 (same routing re-worded), and the umbrella roster — Fix: keep routing in the description (its trigger job) and cut the body restatement in line 11 down to the consolidation redirect — Tranche: T2-trigger-surface
2. [duplication] MED — the sanctioned mirrored-edge exception is stated three times in this one skill: Mutation boundary bullet 2 (line 26), Record Frontmatter Edges bullet (line 103), Verify sole-exception clause (line 157) — plus the umbrella's Record Frontmatter SSOT — Fix: define once in Record Frontmatter section with pointer to umbrella; Verify keeps only the checkable form — Tranche: T1-mechanical-cut
3. [duplication] MED — `ns objective check` after frontmatter edits stated three times (lines 105, 143, 158) — Fix: once in Record Frontmatter, once in Verify as the checkable item; drop from Workflow step 7 — Tranche: T1-mechanical-cut
4. [duplication] MED — "Verification evidence" (line 121) restates the umbrella roadmap.md validation-rows rule nearly verbatim ("Validation may remain roadmap work only when validation/test/CI behavior, release qualification, or non-routine validation investigation is the Objective deliverable") — Fix: one operational sentence + pointer to umbrella — Tranche: T1-mechanical-cut
5. [duplication] MED — "Read and collect evidence" (lines 53–84) hand-rolls trunk/base discovery and branch-diff evidence (`gt parent --no-interactive`, `gh pr view` base fallback, three git evidence blocks) that `ns objective exec tracking-gate` already computes deterministically for objective-next (`git.trunkBranch`, `git.revisionRange`, `uncommitted.*`, `branchDiff.*`) — two mechanics for one fact set across the family — Fix: route objective-update's evidence collection through the same exec surface (extend tracking-gate or a sibling op if PR fields are missing); ~25 prompt lines retire — Tranche: T4-cli-pushdown
6. [negation] MED — "Never amend an existing update for stale evidence, corrected counts, renamed concepts, same-branch/PR verification wording, duplicate shipped/progress wording, typo cleanup, formatting cleanup, closure, or any other reason" (line 111): the closing "or any other reason" makes the nine-item elephant list decorative — Fix: collapse onto the leading word already in the heading: "Existing updates are **immutable** — never amend one; write a corrective update instead" — Tranche: T1-mechanical-cut
7. [duplication] LOW — Record Frontmatter section (lines 101–105) restates umbrella definitions ("only `blocked` and `edges` keys, ever", "At most one edge per unordered slug pair", "no machine ever flips it", "sub-state of open") around its genuinely new rule (re-judge on every update) — Fix: keep the operational re-judgment rule; point at the umbrella for definitions — Tranche: T1-mechanical-cut
8. [duplication] LOW — the objective-next→objective-update handoff is specified in both Invocation (line 17) and objective-next's Tracking Gate step 3; two homes for one contract — Fix: objective-next owns the handoff trigger; Invocation keeps one clause acknowledging it — Tranche: T1-mechanical-cut
9. [sprawl] LOW — "Stop / ask" (line 151) is a single ~90-word sentence with ~14 clauses; the banned-request enumeration ("ceremonial status ping, branch changelog, registry, UUID, hidden metadata, state-machine behavior") also duplicates umbrella Non-goals — Fix: bullet the clauses; replace the enumeration with a pointer to umbrella Non-goals — Tranche: T1-mechanical-cut
10. [no-op] LOW — Workflow step 1's opener "Resolve ambiguous invocation intent first" (via line 32) changes nothing the Invocation section didn't already establish — Fix: delete — Tranche: T1-mechanical-cut

Sections judged clean: Invocation core, Mutation boundary framing (the explicit "this skill does not restate them" discipline is a model for the family), Select exactly one Objective's ask prompts, Landed-state authoring model (strong SSOT — refresh points here correctly), Write rules incl. Question Rows (routes to patterns reference), Closure Gate criteria (checkable, exhaustive), Workflow as ordering index, Verify (exemplary completion criterion).
Est. T1 line savings: 16

## objective-next (119 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — the work-left estimate requirement appears three times: intro line 9 ("Always include a best-effort work-left estimate as remaining semantic steps, not calendar time"), Workflow step 7 (full expansion), Recommend-only output bullet 3 (re-expansion) — Fix: keep step 7 as SSOT; cut the intro clause and compress the output bullet to "include the step-7 estimate" — Tranche: T1-mechanical-cut
2. [duplication] MED — intro (line 9) pre-tells the whole skill: execution routing, stale-tracking routing, ask-when-ambiguous — all restated in Tracking Gate, Recommendation-continuation, and Workflow — Fix: cut the intro to the one-line identity; the sections carry the behavior — Tranche: T1-mechanical-cut
3. [duplication] LOW — Workflow step 3 restates the Tracking Gate section's update-and-continue flow (run gate → objective-update → reread → rerun) already specified in gate steps 3–4 — Fix: step 3 becomes "Apply the Tracking Gate (section above)" — Tranche: T1-mechanical-cut
4. [duplication] LOW — Blocked Objectives opener (line 47) restates the umbrella's Blocked Sentence semantics ("a sub-state of open"); Workflow steps 8–9's validation-rows rule restates the umbrella roadmap.md rule — Fix: trim to pointers; keep the operational judgment steps — Tranche: T1-mechanical-cut
5. [no-op] LOW — "Normal next-work recommendations do not require loading confirmed-execution guidance" (line 63): the conditional pointer's own conditions already scope this; also negation-shaped — Fix: delete — Tranche: T1-mechanical-cut

Sections judged clean: frontmatter (good triggers; "Recommend-first" is a working leading word), Resolve the Objective (correct pointer discipline), Tracking Gate (model CLI push-down — deterministic facts via `ns objective exec tracking-gate` with explicit no-fallback-to-ad-hoc-shell rule; field bullets earn their lines), Blocked Objectives judgment steps, Conditional references (concrete routing conditions), Recommendation-continuation (five checkable conditions — strong completion criterion), Workflow step 6 (the human-gated-first heuristic with its one-line rationale is exactly the clarity rule applied), Recommend-only output, Stop/ask, Verify.
Est. T1 line savings: 8

## objective-refresh (101 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: flagged
Findings:

1. [duplication] MED — inline-closure policy stated twice at full strength: intro line 15 ("Closure is the default when done… closes inline per objective-close semantics… Hold back and report closure-ready only when…") and step 10 (same content plus mechanics) — Fix: intro keeps one clause ("closure is the default when done — step 10"); step 10 is SSOT — Tranche: T1-mechanical-cut
2. [duplication] LOW — Blocked Sentence handling split across step 6's bullet (own sentence during rewrite) and step 10's bullet (own sentence + counterparts at close), with overlapping evidence/reporting language — Fix: step 6 handles the open-record case, step 10 the closure case; strip the shared preamble from one — Tranche: T1-mechanical-cut
3. [duplication] LOW — PR-evidence wording rule (line 93: "Write `merged` only when merge state is confirmed; otherwise weaken to status-neutral wording") restates the umbrella PR-evidence convention and objective-update line 44 — third copy of one rule — Fix: pointer to umbrella; keep only the forensic-verification addition — Tranche: T1-mechanical-cut
4. [sprawl] MED — "Select targets" is deterministic mechanics: diff/status pipelines over `.ns/objectives/`, path→slug reduction, trunk resolution with disagreement detection, merge-base baseline, detached-HEAD check (lines 21–36) — pipelines + a per-branch fact set that overlaps tracking-gate's computed facts; a `ns objective exec refresh-targets` returning `{slugs, trunk, baseline, dirtySlugs}` would retire ~15 procedural lines and unify trunk/baseline resolution with objective-next's — Fix: propose exec op; skill keeps the selection policy, CLI keeps the facts — Tranche: T4-cli-pushdown

Sections judged clean: frontmatter (description doubles as differentiation from objective-update, earning its length), never-commit absolute (safety rule, rightly explicit), Refresh loop framing ("contract — extract, verify, rewrite, diff" and "forensic" are excellent leading words; the from-scratch-rewrite-not-paragraph-patching rule is a strong positive phrasing), write invariants, steps 1–9 and 11 (the "No filler" rule is a clean anti-ceremony criterion), Verify claims (probe table is load-bearing reference), Report, and the closing completion criterion ("Done when an immediate rerun would modify nothing") — the sharpest completion criterion in the batch.
Est. T1 line savings: 5

## objective-runner-step (108 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — "Hard boundaries" (line 101) quotes the canonical forbidden-actions wording verbatim from `ts/packages/capabilities/objectives/src/runner/prompt.ts` (`OBJECTIVE_RUNNER_FORBIDDEN_ACTIONS_RULE`) — a second copy of code-owned text that will drift, and the skill carries no `metadata.internal: true`, so the internal module path + symbol name violate the Public Skill Authoring no-internal-references rule (docs/conventions/skill-conventions.md) — Fix: replace the quote with a paraphrase ("the runner never pushes, submits, creates/updates PRs, or performs any write-capable external action; the parent owns any later push/submit after separate human authorization") and drop the path/symbol — Tranche: T1-mechanical-cut
2. [duplication] MED — report-path constraints stated three times: intro line 15 ("both MUST live outside the repository worktree… fresh report path (begin refuses an existing file)"), the `--report-path` flag entry (line 41), and the exit-2 row (line 68) — Fix: flag entry is SSOT; exit table keeps the terse cause; cut the intro restatement — Tranche: T1-mechanical-cut
3. [duplication] LOW — begin preconditions listed twice: "Expectations" bullet 2 (line 48) and the runner-begin exit-1 table row (line 67) enumerate the same four refusal causes — Fix: Expectations keeps the LBYL framing sentence; the table owns the enumeration — Tranche: T1-mechanical-cut
4. [duplication] LOW — the between-begin-and-finish worktree freeze appears three times (step 2 warning, Semantic Updates "never between begin and finish", line 106 "you, the parent, never mutate the worktree between begin and finish") — a safety rule earns explicitness (skill-audit Clarity), but three copies exceed it — Fix: keep step 2 (where the risk occurs) and one closing reminder; cut the Semantic Updates restatement to a clause — Tranche: T1-mechanical-cut

Sections judged clean: frontmatter (precise triggers, correct sibling routing), intro (parent/bookends/checkpoint leading words carry the whole mental model), three-phase step (exact commands, envelope fields), flag list, Expectations bullets 1 and 3 (emergent stacking explained with a one-line rationale — clarity rule applied), Reading the Runner Checkpoint (the two-zone trust framing — "runner-attested" vs "unverified claims" — is a standout predictability device), exit-code tables, Post-checkpoint playbook (four options with a biased default), Semantic Updates judgment, "One slice per step, one attempt per dispatch."
Est. T1 line savings: 6

## Cross-skill findings (batch)

1. [sediment] HIGH — umbrella Tracking Gate vs objective-next: the umbrella still asserts skill-owned evidence collection ("remain skill/agent responsibilities in v1") while objective-next routes it through `ns objective exec tracking-gate` and explicitly forbids hand-rolled pipelines. Two contradictory sources for one gate — Fix: umbrella becomes a one-sentence pointer; objective-next is SSOT — Tranche: T1-mechanical-cut
2. [duplication] MED — umbrella family roster restates each step skill's description/behavior at spec length, and step skills (objective-update line 11, several frontmatter descriptions) restate sibling routing back — the roster's routing job and the leaves' identity job have merged into double-write — Fix: roster = trigger + one distinguishing clause per skill; leaves drop body-level sibling routing where the description covers it — Tranche: T1-mechanical-cut
3. [duplication] MED — the mirrored-edge sanctioned exception + `ns objective check`-after-frontmatter-edit pair is restated in umbrella (SSOT), objective-update (3x), and objective-refresh (2x) — six statements of one two-part rule across the family — Fix: umbrella Record Frontmatter owns it; each mutating skill keeps one operational sentence + its checkable Verify item — Tranche: T1-mechanical-cut
4. [duplication] MED — inline-close "per objective-close semantics" mechanics (`## Closure` prose + minimal `closed.md` + counterpart Blocked Sentence re-judgment) restated in umbrella roster, objective-update Closure Gate, and objective-refresh (intro + step 10). The natural SSOT is the objective-close skill (outside this batch); everything else should invoke it by name without re-listing mechanics — Tranche: T1-mechanical-cut
5. [duplication] MED — validation-only roadmap rows rule lives in three homes (umbrella roadmap.md, objective-update Verification evidence, objective-next steps 8–9) and the status-aware PR wording rule in three (umbrella PR evidence, objective-update, objective-refresh) — Fix: umbrella owns both; leaves point — Tranche: T1-mechanical-cut
6. [duplication] MED — evidence-collection mechanics diverge across the family: objective-next consumes `ns objective exec tracking-gate` JSON while objective-update and objective-refresh hand-roll overlapping trunk/base/diff facts with `gt parent`, `git merge-base`, and diff pipelines. One deterministic fact set, three mechanics — Fix: extend the tracking-gate/exec surface to serve update and refresh — Tranche: T4-cli-pushdown
7. [duplication] LOW — Selection rules restated despite umbrella SSOT: objective-retro step 1 (full inference ban) and the objective-update one-candidate exception specified in both umbrella and objective-update — Fix: leaves keep the command + ask; umbrella keeps the rules — Tranche: T1-mechanical-cut
8. [sediment] LOW — rename breadcrumbs across the family ("formerly synthesis/cross-cutting/objective-review-briefing", "retired objective-stack-impl", retired `objective-review` namespace note) — prune on a schedule; the retro namespace note stays load-bearing until its HIGH bug fix lands — Tranche: T1-mechanical-cut
9. Leading-word note (positive baseline): the family already runs on strong leading words — *landed-state* (update), *forensic*, *contract*, *rebaseline* (refresh), *parent*, *bookends*, *checkpoint*, *runner-attested* (runner-step), *advisory archaeology* (retro), *Frontier*/*crystallized* (next). The main collapse opportunity is objective-update finding #6 (*immutable* retiring a nine-item negation list).

## Coverage

objective — audited, 8 findings
objective-retro — audited, 6 findings
objective-update — audited, 10 findings
objective-next — audited, 5 findings
objective-refresh — audited, 4 findings
objective-runner-step — audited, 4 findings

---

# Batch 3 — Branch-context / handoff / memory

## branch-context (41 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — description lists "change source branch" and "move/copy/retarget saved plan" as separate triggers, but `references/diagnostics-admin.md` treats them as one operation ("When wording clearly says retarget or change source branch"). One branch written twice in an ambient description. Fix: collapse to "change/retarget a saved plan's source branch, move/copy saved plans" — Tranche: T2-trigger-surface
2. [duplication] MED — description tail "Not for generic planning, branch creation, or implementation unless branch-context intent is explicit" restates body "Do not use this skill for" bullet 1 nearly verbatim (skill-audit red flag: description repeats body). Fix: keep the description anti-trigger (misfire guard), cut body bullet 1 — Tranche: T1-mechanical-cut
3. [duplication] LOW — line 20 ("Admin and repair requests include changing or retargeting…, moving or copying…, inspecting the plan store, and repairing…") re-enumerates the description's admin triggers in the body; the References pointer already says "Load for repair, inspection, or admin." Fix: cut line 20 — Tranche: T1-mechanical-cut
4. [duplication] MED — safety bullet "If plan content appears stale…explain the discrepancy before changing scope" is stated at three sites: here, branch-context-impl step 3, and references/diagnostics-admin.md ("Stale plan content: report the observed mismatch…"). Fix: keep it at the execution site (impl) and in diagnostics; cut from umbrella posture — Tranche: T1-mechanical-cut
5. [sediment] LOW — Skill family bullet for branch-context-impl carries the clause "its implementation workflow includes the contract protocol for new-format Attached plans" — routing detail duplicating impl's own body. Fix: cut clause — Tranche: T1-mechanical-cut
6. [clarity] MED — description and references/lifecycle.md both name `/ns:branch-context:upstack-impl-from-plan`, but the Skill family section routes only save/from-plan/impl; an agent continuing an upstack handoff has no route. Fix: one clause in Skill family naming which step skill(s) cover the upstack variant — Tranche: T3-structure

Sections judged clean: intro (line 8), Default safety posture (other bullets), References (pointers carry load conditions and route correctly; both references verified to exist and match their advertised content).
Est. T1 line savings: 5

## branch-context-from-plan (47 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] LOW — description triggers "create a branch and attach branch context", "branch this saved plan", "attach this plan to a branch" are one branch phrased three ways (skill is invoke-only, so zero ambient on Claude Code/Pi; Codex keeps it ambient). Fix: keep at most two distinct phrasings — Tranche: T2-trigger-surface
2. [duplication] LOW — description tail "Part of the branch-context skill family; see the `branch-context` umbrella…" repeats body line 9 verbatim in substance (same pattern in branch-context-impl and enriched-plan-save). Fix: cut from description; identity/routing lives in the body — Tranche: T2-trigger-surface
3. [duplication] MED — "attached key = `<branch-context-slug>.md`" is stated three times in-file (Commands note line 31, workflow step 2, step 4's trailing clause) plus in the umbrella's lifecycle.md storage contract. Fix: state once in step 2; cut line 31 and step 4's clause "the attached-plan key still comes from…" — Tranche: T1-mechanical-cut
4. [duplication] LOW — step 3 inlines the repo Graphite default and also points at lifecycle.md `## Branch creation policy`, which states the same rule ("In this repo, direct skill/CLI execution should include `--branch-creation graphite`"). Deliberate happy-path inline; trim the pointer sentence to the bare pointer — Tranche: T1-mechanical-cut

Sections judged clean: Commands (exact, verified — `data.branchCreation`/`refName`/`sourceFile` match ts/packages/capabilities/branch-context/src/core/operations.ts), Workflow steps 1/2/5 (slug rule sharp, report list checkable), Recovery ("retry once before asking" is a crisp bound; collision cases each end on an action).
Est. T1 line savings: 4

## branch-context-impl (37 lines)

Verdicts: Frontmatter: flagged · TokenCuts: clean · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] HIGH — the prompt-file field is named twice in-file and the copies disagree: line 19 says `data.implementationPromptFile` (correct — verified against ts/packages/capabilities/branch-context/src/core/operations.ts:145) but step 2 says `data.implementation_prompt_file` (no such field). An agent following step 2 literally cannot find the prompt file. Fix: correct step 2 to `data.implementationPromptFile`; name the field once — Tranche: T1-mechanical-cut
2. [duplication+clarity] MED — step 5 carries two overlapping STOP lists: "universal STOP triggers: excerpt mismatch; …" and later "Stop only if loader evidence, `git branch --show-current`, and the Branch Memory target disagree; … or content/excerpt anchors no longer match live code." Excerpt mismatch appears in both, and the "Stop only if" scope (meant for the stale-branch-name carve-out) reads as globally narrowing the first list. Fix: one STOP list plus one explicitly-scoped branch-name exception — Tranche: T3-structure
3. [sprawl] MED — line 19 is a single ~9-sentence wall mixing key-selection defaults, fallback order, legacy `plan.md`, JSON envelope, and stdout-limit flag guidance; co-location suffers and the `--include-content` guardrail is buried. Fix: break into bullets under Command — Tranche: T3-structure
4. [clarity] MED — the Workflow numbers mix ordered actions (1, 2, 8) with standing rules (3–7, 9), and step 7's "Before finishing, compare changed files…" closeout precedes the implement step (8). Fix: reorder implement before closeout, or split "Steps" from "Rules" — Tranche: T3-structure
5. [clarity] LOW — step 4 "compare excerpts against live repo state before step 1" — ambiguous between this workflow's step 1 (already executed) and the plan's first step. Fix: "before executing the plan's first step" — Tranche: T1-mechanical-cut
6. [no-op→vague criterion] LOW — step 8 "run the plan's validation commands when practical" — vague bound that undercuts step 5's hard gate treatment (gate fails twice = STOP). Fix: "run each declared verification gate; note any skipped gate and why" — Tranche: T1-mechanical-cut
7. [duplication] LOW — description tail "Part of the branch-context skill family; see the umbrella…" repeats body line 9 (family-wide pattern) — Tranche: T2-trigger-surface

Sections judged clean: Command block (mktemp pattern exact), steps 3 (open-question reversal rule is behavior-bearing), 6, 9, Recovery (each case ends on an action; explicit-key rule sharp).
Est. T1 line savings: 2

## brmem (270 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [clarity] MED — the boundary paragraph (lines 18-22) routes plan storage to the branch-context family but never routes resume/continuation content to the handoff family, though namespace `handoff` is workflow-owned the same way and brmem's own description triggers ("stashing branch-scoped notes/context, carrying scratch state across sessions") overlap handoff-create intent. Misroute risk: durable resume notes written as generic base entries. Fix: add the handoff family to the prefer-higher-level sentence — Tranche: T2-trigger-surface
2. [sediment] MED — "Install and runtime" (lines 40-49) spends ~10 lines on shim internals (source shim resolution, workspace Node version, `ts/node_modules`) needed only on the rare missing/broken-binary branch. Fix: compress to two lines: "If `brmem` is missing, run `just install-brmem` (or `just install-tools`) from an ns checkout; repair a broken checkout with `just ts-install`" — Tranche: T1-mechanical-cut
3. [sediment+negation] LOW — "instead of invoking the old uv-based Python fallback" (line 48-49) names a retired mechanism to prohibit it; the positive install command suffices. Fix: drop the clause — Tranche: T1-mechanical-cut
4. [duplication] LOW — put section's "Add `--format json` when the caller needs a machine-readable success or failure envelope" (line 98-99) restates the Cross-command Output rule (lines 87-90). Fix: cut the sentence — Tranche: T1-mechanical-cut
5. [no-op] LOW — "Each command's own semantics live in its section below; the rules that follow apply across commands." (lines 66-68) — structural signposting the headings already convey. Fix: cut — Tranche: T1-mechanical-cut

Sections judged clean: frontmatter (triggers are the vocabulary users actually type; allowed-tools scoped), Mental model (definitions match handoff/branch-context usage), Choosing a command table (compact, routes), Cross-command rules, list/get (the "get every returned Entry, preserving content verbatim" criterion is checkable and exhaustive), check (exit-code semantics non-obvious, keep), export, copy (`*` matches `/` caveat is fragile-syntax territory, keep), gc (posture against auto-running in workflows is behavior-bearing), delete, exec resolve-prompt (abort-on-2 rule sharp), Report template. 270 lines < 500; no disclosure needed. No CLI push-down: the skill is the CLI reference.
Est. T1 line savings: 11

## enriched-plan-save (100 lines)

Verdicts: Frontmatter: flagged · TokenCuts: clean · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [sediment] HIGH — step 5 report fields are snake_case (`data.file_path`, `data.repo_key`, `data.source_branch`, `data.branch_key`) but the CLI emits camelCase: `data.filePath`, `data.repoKey`, `data.sourceBranch`, `data.branchKey` (verified in ts/packages/capabilities/plans/src/cli.ts and ts/packages/capabilities/plans/test/scenario/cli.test.ts:631 asserting `data.filePath`). The skill's field list drifted from the CLI. Fix: correct all five to camelCase — Tranche: T1-mechanical-cut
2. [clarity] LOW — "For Pi/tool wrappers that derive the slug themselves, do not invent one." (line 21-22) — elliptical; unclear referent and condition. Fix: "When invoked by a wrapper that already supplies `--slug`, use it as-is" — Tranche: T1-mechanical-cut
3. [duplication] LOW — "The saved-plan slug is a local filename locator, not necessarily the later branch slug or Branch Memory key" restates the umbrella lifecycle.md path-convention line verbatim in substance. Tolerable for standalone runs; single-source candidate — Tranche: T1-mechanical-cut
4. [duplication] LOW — the refactor bullet inlines "including the final stale-term grep/equivalent check", which is `references/refactor-execution-strategy.md`'s own closing rule — pointer plus partial copy of the target. Fix: pointer only — Tranche: T1-mechanical-cut
5. [duplication] LOW — description tail "Part of the branch-context skill family; see the umbrella…" repeats body line 9 (family-wide pattern) — Tranche: T2-trigger-surface

Sections judged clean: Command block; Workflow step 1 (long but every branch needs it — dense, behavior-bearing, well-paired negations like the waiver-as-positive-routing rule; "self-contained" and "trust-nothing closeout" are strong leading words already doing work); step 2 freshness gate (conditions concrete; model examples labeled per skill-conventions); steps 3-4; "Stop after saving" + Boundaries (positive stop paired with hard-guardrail prohibition — sanctioned pattern, judged clean); Recovery. Workstream HTML markers are tooling anchors, judged live.
Est. T1 line savings: 3

## handoff (52 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [clarity] MED — Admin operations opens "Beyond create/pickup/list, the deterministic `ns handoff ...` command face covers inventory and cleanup directly — these have no step skill", then lists `ns handoff list` first — but the Skill family bullet routes list to `handoff-pickup` ("pick up, choose, summarize, or list"). Internal contradiction over which surface owns list. Fix: drop `ns handoff list` from the no-step-skill list or scope the claim to delete/gc — Tranche: T3-structure
2. [duplication] MED — the delete/gc surface and the "no `/handoff:delete` Pi command" fact are stated at three-four sites: here, references/lifecycle.md:68, references/diagnostics-admin.md:91, and handoff-pickup line 87. Fix: umbrella Admin operations as single source; the others point here — Tranche: T3-structure
3. [duplication] MED — the handoff anti-definition ("not in-session compaction, not a generic transcript summary, not a temp-file note") appears at four sites: here (line 10), handoff-create line 18, handoff-pickup line 13, references/lifecycle.md Terms. Fix: single source here; step skills keep one positive sentence ("directed durable work context for a specific future continuation") — Tranche: T1-mechanical-cut
4. [duplication] LOW — safety bullet "Use handoff vocabulary first; mention Branch Memory locators only as technical evidence…" restated in handoff-create line 30, handoff-pickup line 17, and diagnostics-admin line 28. Fix: keep at the two execution sites; compress the umbrella bullet to a pointer — Tranche: T1-mechanical-cut

Sections judged clean: frontmatter (vocabulary-anchored triggers — "handoff artifact", "continuation focus" — plus a routing clause an umbrella earns; conforms to skill-conventions bucket 1), Skill family (the resume-from disambiguation is behavior-bearing), Do not use, remaining safety bullets, References (load conditions route).
Est. T1 line savings: 4

## handoff-create (123 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: flagged
Findings:

1. [duplication] LOW — description clause "use brmem only as the storage command" is an instruction, not a trigger, and repeats body lines 30 and 103-105 (invoke-only, so cost is Codex-only). Fix: cut from description — Tranche: T2-trigger-surface
2. [duplication] MED — Create contract's anti-definition list ("not in-session compaction, a generic transcript/session summary, a temp-file note, or a task database") duplicates the umbrella/lifecycle/pickup copies (see handoff finding 3). Fix: one positive sentence + umbrella pointer — Tranche: T1-mechanical-cut
3. [no-op] MED — slug Format bullet is a deterministic normalization spec in prose ("lowercase; punctuation/whitespace to `-`; remove remaining non-alphanumerics except `-`; collapse repeated `-`; trim leading/trailing `-`") — deterministic validation the CLI should own; the agent's real job is only the semantic word choice. Fix: teach `ns handoff create` to normalize/validate a supplied slug (one cohesive addition to an existing command, not a tiny wrapper); shrink the bullet to "kebab-case, usually 3-8 words" — Tranche: T4-cli-pushdown
4. [duplication] LOW — branch-resolution block (explicit `--branch`, else `git branch --show-current`, stop on detached HEAD) appears in substance at three sites: here, handoff-pickup, umbrella lifecycle.md "Branch and list scope". Step-skill standalone design justifies the two execution copies; lifecycle's is the redundant one — Tranche: T1-mechanical-cut
5. [no-op] LOW — "Keep the artifact brief and factual." — weak leading words the canonical template already enforces. Fix: cut, or strengthen to a single word (*terse*) — Tranche: T1-mechanical-cut
6. [duplication] LOW — "Avoid owners, due dates, task databases, hidden metadata, or workflow-state machinery" partially restates Create contract's "not…a task database". Fix: one exclusion list at one site — Tranche: T1-mechanical-cut
7. [duplication] LOW — "Picking up relies on the semantic slug rather than a separate summary or index" restates handoff-pickup's storage-contract line and lifecycle.md's "do not invent a separate index or manifest". Fix: cut; the routing sentence to handoff-pickup suffices — Tranche: T1-mechanical-cut

Sections judged clean: ask-and-stop focus question (exact text, checkable, strong anti-premature-completion gate), remaining slug bullets (avoid/prefer pair is negation correctly paired with positive examples), Compose artifact template (canonical shape earns its lines), no-hidden-temp-files paragraph (prevents a likely real mistake), Store safely (here-doc delimiter rule is fragile-syntax territory; collision handling sharp), raw-brmem recovery scoping, Report, final umbrella routing.
Est. T1 line savings: 6

## handoff-pickup (146 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: flagged
Findings:

1. [duplication] MED — intro (lines 13-17) spends three paragraphs restating scope, family routing, the handoff anti-definition, resume-from routing, and the vocabulary rule — mostly copied from the umbrella and its own description. Fix: compress to 2-3 sentences: role, umbrella pointer, "resume-from wording is pickup intent" — Tranche: T1-mechanical-cut
2. [sprawl] MED — three fenced no-handoffs message templates (lines 69-86, ~14 lines) for one trivial behavior whose phrasing is not fragile. Fix: one rule — "Report no handoffs found, naming the scope searched, in handoff vocabulary" — Tranche: T1-mechanical-cut
3. [duplication] MED — line 87 (delete/gc routing) duplicates the umbrella's Admin operations, lifecycle.md, and diagnostics-admin.md; pickup is not the delete step. Fix: cut to "For delete or cleanup, load the `handoff` umbrella" — Tranche: T1-mechanical-cut
4. [no-op] MED — Select step 4 is a deterministic matching algorithm in prose (split slug on `-`/`_`/`.`, ignore `.md`, prefer all-term matches, pick unique match) — deterministic parsing/matching that `ns handoff pickup` could own by accepting search words and returning the match or a JSON candidates list. Fix: push term-matching into the CLI; skill keeps only "if multiple candidates remain, ask" — Tranche: T4-cli-pushdown
5. [sprawl] LOW — line 67 is one ~8-sentence paragraph mixing JSON field names, grouping rules, deleted-branch callouts, per-choice display fields, and Pi command formatting; co-location suffers. Fix: bullets — Tranche: T3-structure
6. [duplication] LOW — line 103 ("Do not accept `/`-containing handoff selectors… Flat `<semantic-slug>.md` keys are the handoff contract") restates this file's own Storage contract (lines 19-25) and lifecycle.md's rule. Fix: cut or fold into Storage contract — Tranche: T1-mechanical-cut
7. [duplication] LOW — 10-line fenced ambiguity-prompt example (lines 105-115) is a long example the step-5 rule already replaces ("Print branch and candidate slugs; do not require the user to know storage keys"). Fix: cut — Tranche: T1-mechanical-cut
8. [duplication] LOW — description clause "use brmem only as storage/recovery machinery" is instruction-in-description (same pattern as handoff-create). Fix: cut — Tranche: T2-trigger-surface

Sections judged clean: Storage contract, Choose the branch scope (shared with create by standalone design), List handoffs command variants (exact commands; `--include-deleted` condition sharp), Select steps 1-3 and 5 (explicit-identity-before-inference precedence is behavior-bearing), Read and present summary (field names verified against ts/packages/capabilities/handoffs — `entryLocator`, `branchState`, `updatedAt` all real; the stop-and-wait criterion at the action site (line 125) is the load-bearing anti-premature-continuation gate — keep it and line 144's conditional variant), Report bullets, stale-artifact section.
Est. T1 line savings: 28

## Cross-skill findings (batch)

1. [sediment] HIGH — two verified JSON field-name drifts against the CLIs in one batch (branch-context-impl step 2 `data.implementation_prompt_file` vs actual `implementationPromptFile`; enriched-plan-save step 5 snake_case vs actual camelCase). Same root cause: envelope field lists hand-copied into skills with no check. Fix: correct both now (T1); consider a deterministic check (CLI push-down: a validation script or `--describe-output` surface skills can cite instead of hand-copying) — Tranche: T1-mechanical-cut / T4-cli-pushdown
2. [duplication] MED — branch-context umbrella's `references/diagnostics-admin.md` "Common recovery cases" restates 6 of 8 Recovery bullets from branch-context-from-plan and branch-context-impl nearly verbatim ("Target branch exists…", "Graphite setup fails after branch creation: report the partial branch state…", etc.). The umbrella itself declares step skills carry recovery inline, making the reference's copies the redundant ones. Fix: replace duplicated cases with pointers to each step skill's Recovery; keep only orphan cases (stale plan content, ambiguous admin wording) — Tranche: T3-structure
3. [duplication] MED — handoff family restates four shared mechanics across 3-4 sites each: the handoff anti-definition (4 sites), vocabulary-first rule (4), delete/gc surface + no-Pi-delete fact (3-4), branch-resolution boilerplate (3). Fix: single-source each in the umbrella/lifecycle.md; step skills keep one positive sentence plus pointer — Tranche: T3-structure
4. [clarity] MED — routing asymmetry: brmem's boundary carves out the branch-context family but not the handoff family, while both handoff step skills demote brmem to "storage command only". A "stash resume context across sessions" request triggers brmem's description and bypasses handoff-create. Fix: brmem boundary names both families — Tranche: T2-trigger-surface
5. [duplication] LOW — description tail "Part of the branch-context skill family; see the `branch-context` umbrella…" is copy-pasted across all three branch-context leaf descriptions while each body carries the same sentence. Fix: strip from all three descriptions in one pass — Tranche: T2-trigger-surface
6. [duplication] LOW — slug derivation rule ("kebab-case, 3-7 specific words, no dates/random IDs/generic-only names") + "retry once before asking" recovery duplicated verbatim between enriched-plan-save and branch-context-from-plan. Deliberate standalone design per the umbrella, but finding 1 shows this class of copy drifts; if kept, treat as a paired edit site — Tranche: T3-structure
7. Leading-word note — the families already run on strong leading words (*directed*, *continuation focus*, *self-contained*, *trust-nothing closeout*, "Inspect before mutating"); the main collapse opportunities found are handoff-create's "brief and factual" → *terse* and branch-context-impl's diffuse stop logic, which should anchor on its existing *STOP* token via the single-list restructure (impl finding 2).

## Coverage

branch-context — audited, 6 findings
branch-context-from-plan — audited, 4 findings
branch-context-impl — audited, 7 findings
brmem — audited, 5 findings
enriched-plan-save — audited, 5 findings
handoff — audited, 4 findings
handoff-create — audited, 7 findings
handoff-pickup — audited, 8 findings

---

# Batch 4 — Heavy Graphite stack surgery

## code-smush (464 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: flagged · CLIPushDown: flagged
Findings:

1. [duplication] HIGH — Replacement-construction mechanics ("new refs at boundary SHAs, `gt track --parent` on new branches only, input stack untouched, old stack = close-candidate set") stated at FOUR sites: intro (lines 12–19), Packaging rule bullet 2 (88–96), Phase 4 (285–288), and Repackaging steps 2–5 (401–415). — Fix: make Packaging rule + Phase 4 the single source; collapse "Repackaging and multi-branch input" to deltas only (derive current Slice Map, then "run Phases 2–7 on new branches") and cut the intro's pre-statement of the rule ("Which construction path applies is a deterministic rule… see Packaging rule below" can be one pointer sentence). — Tranche: T1-mechanical-cut
2. [duplication] MED — Safety rule 2 (51–55) restates rule 1's PR-mutation ban verbatim ("never creates, updates, closes, or otherwise mutates a pull request" appears in both rules 1 and 2). — Fix: merge rule 2 into rule 1, keeping only the repackaging-specific close-candidate reporting clause. — Tranche: T1-mechanical-cut
3. [duplication] MED — "Discarded candidate costs nothing: delete the new branches and re-propose" stated three times: safety rule 3 (63–65), Packaging rule (95–96), Recovery (440–442). — Fix: keep the Recovery copy; delete the other two. — Tranche: T1-mechanical-cut
4. [duplication] MED — Generation-token mechanics ("the greedy `<run>` segment absorbs the token, so the grammar/regex are unchanged") stated in Packaging rule (102–104) and again in Branch-name grammar (141–144); "State the chosen replacement run name in the proposal" stated at 110, Phase 2 (257–258), and Repackaging step 2 (407–408). — Fix: define the token once in the grammar section; keep one proposal-content mention (Phase 2 list). — Tranche: T1-mechanical-cut
5. [duplication] MED — `gt rename` mechanics/constraints stated three times: Packaging rule bullet 1 (86–87), grammar Rules bullet 1 (167–172), Phase 4 recipe comment (297). — Fix: grammar Rules bullet becomes the single source; Packaging rule keeps only "this is the only path where `gt rename` is used". — Tranche: T1-mechanical-cut
6. [duplication] MED — No-durable-state stated twice: Vocabulary's Slice Map entry ("Never stored; re-derived… on every run", 33–35) duplicates safety rule 5 (67–71). — Fix: Vocabulary entry keeps "the derived view of cut points…"; delete its storage clause. — Tranche: T1-mechanical-cut
7. [duplication] LOW — Stale-`index.lock` procedure stated in Phase 6 (340–343) and again in Recovery (448–450). — Fix: keep Phase 6 inline (it's the operative gate); Recovery references it. — Tranche: T1-mechanical-cut
8. [duplication] LOW — Input contract (122–125) restates the Packaging-rule routing for multi-branch/previously-packaged input. — Fix: cut to "(routed by the Packaging rule)". — Tranche: T1-mechanical-cut
9. [duplication] LOW — Description duplicates body content ("Proposes the full Slice Map and waits for go-ahead before any mutation" = safety rule 3; "local-only (never submits…)" = rule 1). Skill is command-backed (zero-ambient on CC/Pi) but Codex keeps the description ambient, so it still costs there. — Fix: trim description to trigger + one-line identity: "Use when the user explicitly asks to smush/package/repackage a stack into Decision/Span PRs. Opt-in, experimental, local-only." — Tranche: T2-trigger-surface
10. [sprawl] MED — 464 lines, brushing the ~500 threshold, with zero `references/`. Recovery (436–453), Absorbing feedback (423–434), and Known limits (455–464) are branch-only material (fire only on failure, post-packaging edits, or scoping questions); no run needs all three. — Fix: disclose the three sections to `references/recovery-and-feedback.md` behind pointers ("On any mutation mistake or failed `gt` op, read references/…"); combined with the dedup above this pulls SKILL.md to ~350 lines. — Tranche: T3-structure
11. [duplication→cli] MED — Phase 0 preconditions (182–200) are 5 deterministic checks (clean status, quiescence, stack-map warnings, merge rev-list, linearity/fork check) = 5+ tool calls per run — over the push-down threshold. However safety rule 7 and Known limits explicitly park packaging-specific push-downs (owned by the objective's prototype row). — Fix: respect the park; record `ns slot gt exec smush-preflight --format json` as the parked candidate in the owning objective, not in the skill. — Tranche: T4-cli-pushdown
12. [duplication→cli] MED — Phase 3 backup-ref recipe (271–278) is duplicated verbatim in code-gt-linearize-descendants step 7 (see cross-skill #1). A generic `ns slot gt exec backup-refs` is NOT "packaging-specific", so it falls outside rule 7's ban and inside `slot gt`'s sanctioned Graphite exception. — Fix: shared push-down command `ns slot gt exec backup-refs --prefix smush --format json` (branches in, backup ref names out as JSON). — Tranche: T4-cli-pushdown

Sections judged clean: Vocabulary (as in-skill reference, apart from #6), Phase 1 (Decision Inventory / coupling pass / demotion rule — sharp, checkable criteria; the Feasibility invariant earns its rationale), Phase 2 proposal list, Phase 5 (green-boundary criterion is checkable and exhaustive; escalating-remedy order is crisp), Phase 7. Hard-guardrail prohibitions in the Safety contract are legitimate negations (paired with positives: "by allowlist, not denylist").

Est. T1 line savings: ~45

## code-gt-restack-resolve (312 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: flagged
Findings:

1. [duplication] HIGH — Trigger surface stated THREE times: the description (frontmatter), the entire "## When to use" section (75–82), and the "User intent" column of the Choose-scope table (120–124). The When-to-use section is pure re-statement. — Fix: delete "## When to use" wholesale (~9 lines); description + scope table already carry every trigger. — Tranche: T1-mechanical-cut
2. [duplication] MED — TEMPORARY TS-toolchain rule stated twice: the section prose (56–74) and the verbatim block in the Agent prompt template (239–244). The section itself admits "the operative rule text lives in the TEMPORARY block… below". — Fix: shrink the section to ~3 lines (what the shape is + "operative text travels in the template"); the template block is the single source. — Tranche: T1-mechanical-cut
3. [sediment] LOW — The TEMPORARY section is designed-to-expire ("remove once the toolchain commits have fully landed") with no checkable expiry condition an auditor can evaluate. — Fix: add a one-line verification recipe to the HTML comment (e.g. "expired when `git log trunk --grep oxfmt` shows the rollout commits merged and no active stack predates them") or an owning-objective pointer. — Tranche: T3-structure
4. [duplication] MED — Single-PR/tip rule stated three times: Scope and non-goals (89–91), Choose scope Rules bullet 1 (127–136), and Multi-slot consolidation (149–152, including the ancestor-checked-out exception repeated verbatim from 135–136). — Fix: Choose scope Rules bullet is the single source; Scope-and-non-goals keeps one pointer clause; section 3 says "skip per the single-PR rule". — Tranche: T1-mechanical-cut
5. [duplication] MED — Subagent model tier stated twice: Engine parameters bullet (46) and the full "Subagent model routing" section (197–217). The Engine-parameters continue/bail/escalation bullets (40–50) also reappear verbatim as "Orchestrator-decided facts" in the template (229–233). — Fix: Engine parameters keeps only parent-facing items (post-completion checks); model tier lives solely in Subagent model routing; the template is the single source for the facts that travel. — Tranche: T1-mechanical-cut
6. [negation] LOW — "Never copy cheap-model guidance such as `openai-codex/gpt-5.6-luna:medium` into this workflow" (216–217) names the exact elephant, putting the banned model string into every context. — Fix: cut; the positive rule ("strong/smart implementation tier, never the cheap/fast review tier") at 46 and 202–203 already binds. — Tranche: T1-mechanical-cut
7. [premature completion] MED — Done step (300–305): "run a final scoped verification… **at least when** any conflict was resolved mid-stack" is a fuzzy bound — the agent cannot tell whether verification is required on a conflict-free full restack. — Fix: make it binary: "if any conflict was resolved anywhere in the restack, run the scoped verification from the stack tip; otherwise skip it." — Tranche: T3-structure
8. [duplication] LOW — Template hard constraints "Do not abort the rebase/restack" and "Do not use whole-file checkout except for generated files as allowed by the engine" (258–266) restate engine policy the subagent reads anyway (`code-resolve-merge-conflicts` abort policy / safe-set), despite the skill's own rule "Do not restate or improvise per-file resolution policy here" (21–22). Defensible as belt-and-braces for a subagent, but it is a second source of truth for engine policy. — Fix: keep only driver-level constraints (one `gt continue`, audit boundary, no user prompt); drop the two engine-policy restatements. — Tranche: T1-mechanical-cut
9. [sediment] MED — Frontmatter `model: opus` (line 5) is a Claude-Code-only knob on a skill whose body carefully keeps model routing harness-neutral (per skill-conventions "Skill Model Examples"); it also silently upgrades the whole parent session, not just conflict subagents, which nothing in the body explains. — Fix: either delete it or add a one-line rationale; the Subagent model routing section already handles per-dispatch selection. — Tranche: T2-trigger-surface
10. [duplication→cli] HIGH — Preflight + scope determination (103–156) is a deterministic fact-gathering phase: clean-tree check, gt-tracked check (`gt parent`/`gt children --no-interactive`), rebase-in-progress detection, has-upstack-children probe, in-scope slot-conflict detection — 4–6 tool calls before any judgment. The Pi wrapper already re-implements part of this deterministically ("checks for an interrupted rebase, runs plain `gt restack` when safe", 29–31), so the logic exists in two places today. `slot gt` is the sanctioned Graphite-dependency exception, so this pushes down cleanly. — Fix: one `ns slot gt exec restack-preflight [--downstack] --format json` returning `{clean, tracked, rebaseInProgress, hasUpstackChildren, slotConflicts[], effectiveScope}`; the skill keeps only the command, expected fields, and the decision table; the Pi wrapper calls the same command. — Tranche: T4-cli-pushdown

Sections judged clean: intro/driver role statement (8–25), Harness entry points, Loop (the "one conflict stop = one engine run = one `gt continue` = one subagent" count invariant is a strong compact anchor; the unverified-evidence rule at 176–182 is load-bearing and non-obvious), Agent prompt template structure and output contract, Bail-out.

Est. T1 line savings: ~35

## code-thermostack (156 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: flagged
Findings:

1. [duplication] MED — Description is a workflow summary ("perform a thermonuclear… review, rank findings…, propose…, and only after explicit approval create a local child fix stack") that repeats the body's six phases; skill-audit's Frontmatter red flag verbatim. Skill is invoke-only (zero-ambient CC/Pi) but Codex keeps it ambient. — Fix: cut to identity + triggers: "Turn a thermonuclear code-quality review of the current Graphite stack into an approved local child fix stack. Use for Thermostack, thermo stack, thermonuclear follow-up stack." — Tranche: T2-trigger-surface
2. [duplication] MED — The empty-diff trap ("review `STACK_BASE_REF...HEAD`, not the checked-out branch against itself") stated three times: intro (line 9), Preflight step 5 (41), and the review-subagent prompt (50). The prompt copy must travel; Preflight 5 is the operative parent gate. — Fix: delete the intro restatement; the intro keeps only the one-sentence identity. — Tranche: T1-mechanical-cut
3. [duplication] LOW — Ordering rule ("most trunk-likely to most speculative unless a hard dependency forces inversion") stated in intro (9) and section 3 (80–81). — Fix: keep section 3; cut from intro. — Tranche: T1-mechanical-cut
4. [duplication] LOW — The remote-safety list ("submit PRs, push, land, close GitHub state, or mutate remotes") appears in Safety boundaries (14), the implementation clause (25), and the Final report requirement (157). Clauses 2 and 3 are deliberate (verbatim-travel and attestation), so this is at the floor of acceptable — but the three sites must stay word-identical; note as a maintenance coupling, no cut. — Fix: add an HTML comment marking the clause as verbatim-synced across the three sites. — Tranche: T3-structure
5. [duplication→cli] HIGH — Preflight step 4 (40): determine `STACK_BASE_REF` by "walk[ing] parent relationships until the first non-stack/trunk ancestor" — a hand-rolled loop over branches, while sibling skills already consume `ns slot gt exec stack-branches --format json` for exactly this topology. Steps 2–6 together are ~6 deterministic tool calls (branch, clean, tracked, base walk, diff stat, thermo-* prefix collision scan). — Fix: route step 4 through the existing `ns slot gt exec stack-branches --format json` (or add a `stack-base` field/command) instead of the manual walk; longer term one `thermostack-preflight` command returning `{branch, clean, tracked, stackBaseRef, diffStat, existingThermoBranches[]}`. — Tranche: T4-cli-pushdown
6. [premature completion] MED — Section 5 step 7: "Run targeted validation from the batch's validation hints **plus any nearby project checks needed for confidence**" — an unbounded, agent-judged demand; the agent cannot tell done from not-done. — Fix: make it checkable: "run the batch's validation hints; additionally run `just <scoped check>` for every file type the batch touched." — Tranche: T3-structure
7. [no-op] LOW — Section 5 step 2's hedge: "If `gt create` behavior appears different from creating an empty branch on a clean worktree, re-check `gt create --help` and stop rather than improvising" — an authoring-time uncertainty fossil; `gt create -m` on a clean tree deterministically creates an empty child, and "appears different" is unobservable. — Fix: delete the sentence; the general stop-on-ambiguity rule (Safety boundaries) already covers surprises. — Tranche: T1-mechanical-cut
8. [sediment] LOW — Preflight step 6: "branches matching the exact base prefix already exist (**for example** `$BASE_BRANCH/thermo-*`)" — "exact" and "for example" contradict; the pattern is the grammar section 3 defines, not an example. — Fix: "branches matching `$BASE_BRANCH/thermo-*` already exist". — Tranche: T1-mechanical-cut
9. [duplication] LOW — Preflight step 3 restates the cross-skill plumbing-not-display rule (see cross-skill #2). — Fix: per cross-skill #2. — Tranche: T3-structure

Sections judged clean: Safety boundaries (stop rule is sharp: "preserve the completed clean prefix, leave state visible, report the exact blocker"), Subagent contract (explicitly claims and enforces single-source-of-truth for subagent rules — the batch's best example of the discipline), section 2 prompt block, section 3 confidence buckets (exactly-these-buckets is checkable), section 4 Preview gate (explicit-approval examples given), section 6 Final report (exhaustive list).

Est. T1 line savings: ~10

## code-gt-linearize-descendants (65 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: flagged
Findings:

1. [premature completion / consent gap] HIGH — The skill auto-runs `gt submit --no-interactive` (safety contract bullet 6, step 10) after ONE upfront confirmation, but the proposal contents (step 4) never list submit consequences — after a stack rewrite, submit force-pushes and re-bases every affected PR on the remote. The user confirms a local stack shape and gets remote PR mutations; every sibling skill in this batch is local-only with loud never-submit rules, so a user's prior is the opposite. Also, a submit action is misfiled inside "Safety contract". — Fix: move the submit instruction out of the Safety contract into step 10 only (it's stated in both places today — duplication), and add "will run `gt submit --no-interactive`, force-pushing PRs X/Y/Z" to the step-4 proposal so the single confirmation covers it. — Tranche: T3-structure
2. [duplication] LOW — Safety bullet 6 and step 10 state the identical submit instruction; intro's "ask once for confirmation" duplicates step 5. — Fix: covered by finding 1; cut the intro clause. — Tranche: T1-mechanical-cut
3. [duplication→cli] HIGH — Step 2 evidence gathering is a loop over descendants: recursive `gt children --no-interactive`, per-branch `gt parent`, per-branch `git log`/`git diff --stat`/focused diffs, per-branch `gh pr view --json` — easily 3+ calls per descendant, over every push-down threshold (loops over branches AND PRs, bundles gh+git+gt). The skill also bypasses the existing `ns slot gt exec stack-branches`/`stack-map-branches` commands its siblings use. `slot gt` is the sanctioned Graphite exception, so a `ns slot gt exec descendants-report <branch> --format json` (topology + per-branch commit shape + diff stats + PR metadata) is clean under the boundary; the semantic inference in step 3 rightly stays in the prompt. — Fix: push step 2 down to one JSON command; step 2 becomes the command plus expected fields. Interim: at minimum route topology through the existing `stack-branches` exec command. — Tranche: T4-cli-pushdown
4. [premature completion] MED — Step 8: "duplicate drop **only after the kept stack is correct**: `gt delete <duplicate-branch> -f -q`" — "correct" is a fuzzy bound guarding a force-delete. — Fix: bind it: "only after the rewritten stack matches the confirmed proposal, `gt restack` reports nothing to do, and `git status` is clean." — Tranche: T3-structure
5. [duplication→cli] MED — Step 7 backup recipe is verbatim the code-smush Phase 3 recipe (stamp, `backup/<op>-$stamp/`, `/`→`__` encoding) — see cross-skill #1. — Fix: shared `backup-refs` push-down command. — Tranche: T4-cli-pushdown

Sections judged clean: frontmatter (trigger-form description, one trigger per branch, name/H1 match), intro identity sentence, step 3 inference rubric (keep/move/reorder/duplicate/escalate is a crisp decision table), step 4 proposal contents, step 9 conflict routing to `code-resolve-merge-conflicts`, step 11 report.

Est. T1 line savings: ~4

## Cross-skill findings (batch)

1. [duplication→cli] HIGH — Backup-ref recipe duplicated verbatim across code-smush Phase 3 and code-gt-linearize-descendants step 7 (timestamp, `backup/<op>-$stamp/<safe-name>`, `/`→`__` encoding). Meets the "reused by 2+ skills" push-down bar; a generic command is not "packaging-specific" so it escapes smush's own no-new-CLI park, and `slot gt`/plain-git implementation respects the Graphite boundary. — Fix: `ns slot gt exec backup-refs --prefix <op> --format json` taking branch names, returning created backup refs; both skills shrink to one invocation line. — Tranche: T4-cli-pushdown
2. [duplication] MED — The plumbing-not-display invariant ("use `gt parent`/`gt children --no-interactive` and `ns slot gt exec stack-*`; never parse `gt ls`/`gt log`/`gt branch info` display output") is restated with divergent wording in all four skills (smush safety rule 6, restack-resolve Preflight, thermostack Preflight step 3, linearize step 2). No single source of truth exists — the vendored `graphite` skill cannot host repo policy. — Fix: state it once in an ns-owned external reference (e.g. `docs/conventions/` alongside the graphite-dependency boundary doc, or a shared gt-read-side section) and reduce each skill to a one-line pointer + the commands it actually runs. — Tranche: T3-structure
3. [duplication] MED — Safety-preamble family (clean worktree gate, propose-then-confirm, backup-before-mutation, never-submit/never-close-PRs) restated per skill with drifting vocabulary ("go-ahead" / "approval" / "confirmation"; "Safety contract" / "Safety boundaries" / "Scope and non-goals") — and one substantive divergence: linearize auto-submits where the other three are loudly local-only (its finding 1). — Fix: align the vocabulary on one term set; consider a shared external-reference safety contract that each skill extends with its deltas (smush: allowlist+no-fetch; linearize: submits after confirmation). — Tranche: T3-structure
4. [sediment] MED — Read-side routing inconsistency: smush and restack-resolve consume the already-pushed-down `ns slot gt exec stack-branches`/`stack-map-branches`/`quiescence` commands, while thermostack hand-walks parent relationships and linearize hand-recurses `gt children` for the same topology facts. The push-down investment already exists; two of four skills don't route to it. — Fix: retrofit thermostack Preflight 4 and linearize step 2 onto the existing exec commands before building any new ones. — Tranche: T4-cli-pushdown
5. [duplication] LOW — Subagent-orchestration boilerplate (parent-owns-workflow role statement, verbatim-clause-travel, inspect-result-before-trusting, degraded-inline-fallback labeling) appears in structurally parallel form in restack-resolve (Loop, model routing) and thermostack (Subagent contract). Convergent design rather than copy-paste, but the pattern is a candidate for one shared reference if a third orchestrating skill appears. — Fix: no action now; note the threshold. — Tranche: T3-structure

## Coverage

code-smush — audited, 12 findings
code-gt-restack-resolve — audited, 10 findings
code-thermostack — audited, 9 findings
code-gt-linearize-descendants — audited, 5 findings

---

# Batch 5 — Code-ops / PR loops

## code-resolve-merge-conflicts (221 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: flagged
Findings:

1. [duplication] LOW — Description carries a full trigger list ("Use when a rebase/merge hits conflicts…") on an invoke-only skill (zero ambient), and the body's "When to use" section (lines 39–45) restates it. Per writing-great-skills, a user-invoked description is a one-line human summary with trigger lists stripped. — Fix: shrink description to one line; keep "When to use" in body as the single trigger source. — Tranche: T2-trigger-surface
2. [sediment] MED — Invocation-kind/policy tension: `docs/conventions/skill-conventions.md` bucket 1 names "merge-conflict resolution" as the canonical example of an ambient-eligible (`normal`) safety-sensitive workflow, yet this skill is invoke-only (`disable-model-invocation: true` + `agents/openai.yaml`). Either the policy example or the kind is stale. — Fix: reconcile via `areg skill apply` decision or update the conventions example. — Tranche: T2-trigger-surface
3. [duplication] LOW — Driver contract closing sentence (lines 76–81): "Everything else … is engine policy and not overridable. The escalation destination/channel is the only escalation behavior a driver may override" restates item 4 of the list immediately above. — Fix: delete the second sentence. — Tranche: T1-mechanical-cut
4. [duplication] MED — The `unverified` labeling rule appears twice: step 4 Fail ("If reproduction is blocked, call the claim `unverified`", lines 154–155) and step 5 ("If the claim cannot be observed … label it `unverified`", lines 168–171). Same meaning, two sources of truth. — Fix: state once in step 5; step 4 points at it ("label per step 5"). — Tranche: T1-mechanical-cut
5. [duplication] LOW — Conflict-marker sweep stated in step 3c (lines 132–135) and re-invoked verbatim in step 4 Pass ("run the conflict-marker sweep from step 3c"). The re-invocation is a pointer, acceptable, but 3c already says "Before staging" — the two orderings overlap. — Fix: keep the sweep only in step 4's Pass path (the single pre-stage gate) or only in 3c; not both. — Tranche: T1-mechanical-cut
6. [sprawl] MED — CLI push-down: step 1–3a mechanics — detect mode from `git status`, enumerate conflicted files, detect auto-generated headers, compute the per-file intent-diff command — is a deterministic multi-call gather (3+ tool calls, loops over files, repeated at every conflict stop and by every driver skill). — Fix: one `ns` command emitting JSON `{mode, stoppedCommit, files: [{path, autoGenerated, intentDiff}]}`; classification/editing stays in prompt. — Tranche: T4-cli-pushdown
   Sections judged clean: intro/engine framing, Operation modes table, conflict-marker-sides note, Graphite check, intent-diff section (strong leading word), workflow steps 2/6/7/8, escalation channels, Bail-out (prohibitions are hard guardrails paired with positives).
   Est. T1 line savings: 8

## code-fix-gh-stack (105 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: flagged
Findings:

1. [duplication] HIGH — Description is a workflow summary ("Run a disciplined … loop: query PR checks, fix the lowest…, submit…, repeat until green"), not a trigger, while the actual trigger sentence sits in the body (line 10: "Use this skill when the user asks to fix, green, repair, or stabilize a Graphite/GitHub PR stack"). This is the exact skill-audit red flag "description repeats body content" on a model-invoked skill — ambient cost plus undertriggering risk. — Fix: swap — make line 10 the description; delete the summary and line 10 from the body. — Tranche: T2-trigger-surface
2. [duplication] MED — "Purpose" section (lines 12–15) restates the description and the H1. — Fix: delete the section. — Tranche: T1-mechanical-cut
3. [no-op] MED — Step 7: "resolve conflicts carefully" — a weak adverb where a routing pointer exists; sibling code-just-the-stack routes conflicts to `code-gt-restack-resolve` / `code-resolve-merge-conflicts`. — Fix: replace with the pointer ("use `code-gt-restack-resolve` from the conflicted state"). — Tranche: T3-structure
4. [duplication] MED — Step 1 topology triad ("`gt branch info` … never as machine-readable topology; `gt parent`/`gt children` for immediate edges; `gt ls` only as human visual confirmation") restates guidance that also lives in the setup-graphite admonition payload and the vendored graphite skill. — Fix: keep only `ns slot gt exec stack-branches --format json` + one pointer to the graphite skill's diagnosis commands. — Tranche: T3-structure
5. [sediment] LOW — Step 1: "or equivalent stack-check tooling" hedges against a primitive that exists (`ns address exec branch-pr-checks`). Vague routing invites improvised `gh` loops. — Fix: delete the hedge; route firmly through the primitive. — Tranche: T1-mechanical-cut
6. [duplication] LOW — Step 4's gate list (dprint/ts-format/ts-check/ts-test/integration/style-guard) restates the repo's `just` recipe map that also lives in `ts/AGENTS.md` and diverges from sibling gate tables (see cross-skill finding 3). — Fix: point at the single gate-map source; keep only "reproduce locally with the narrowest matching `just` gate". — Tranche: T3-structure
7. [sprawl] MED — Step 9 wait/re-query is an agent-driven poll loop over PRs and checks (loops over PRs/checks threshold). — Fix: a `wait-for-checks`-style primitive beside `branch-pr-checks` that polls with timeout and returns settled JSON; serves pr-address's boundary partner too. — Tranche: T4-cli-pushdown
8. [premature completion] LOW — Done definition bullet "Graphite mergeability is not blocked by stack inconsistency" has no checkable observation (no command named), unlike the other three bullets. — Fix: name the check (e.g. `gt branch info --no-interactive` restack status per branch) or cut the bullet. — Tranche: T3-structure
   Sections judged clean: steps 2, 3, 5, 6, 8 (guardrail paired with positive), Stop conditions.
   Est. T1 line savings: 8

## code-just-fix (97 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [sediment] HIGH — The failure taxonomy and Success template are stale against the actual `just` suite. Skill: "lint (`ruff check`), format (`ruff format --check`, `dprint check`), type errors (`ty check`), test failures (`pytest`)" (line 24) and the Success template (lines 71–77) list only Python gates. The justfile's `_check-core` is `dprint-check _ts-deps-check _ts-format-check _ts-lint _ts-check _ts-test _objective-check` — no ruff/ty/pytest anywhere in the core suite. Behavior risk: the agent categorizes against gates that don't run and misses ts-lint/ts-check/objective-check. — Fix: rewrite step 2 and the Success template from the current `_check-core` recipe list (or generically: "categorize by the failing just recipe"). — Tranche: T1-mechanical-cut
2. [duplication] MED — "Rules" section (lines 45–47) restates step 3's root-cause/never-weaken rule and step 4's final re-run ("run `just` one final time" duplicates "Re-run `just` after all fixes… until green"). — Fix: fold the suppression ban (line 46) into step 3 and delete the section. — Tranche: T1-mechanical-cut
3. [sediment] MED — Frontmatter `description: "Command: code-just-fix"` is a legacy explicit-only stub; skill-conventions says current `areg skill apply` keeps real human-readable descriptions, and skill-audit flags hand-pasted `Command:` stubs directly. Breaks `areg skill find` scope surfacing. — Fix: real one-line description ("Run the project `just` suite and fix every failure at the root cause"); kind stays areg-managed. — Tranche: T2-trigger-surface
4. [no-op] LOW — Step 3: "run `just fix` and `just dprint-fix`" — `just fix` already runs `dprint-fix` (justfile line 37: `fix: dprint-fix ts-format-fix ts-lint-fix`). — Fix: "run `just fix`". — Tranche: T1-mechanical-cut
   Sections judged clean: H1/intro, Invocation steps 1/4/5, Planning-mode behavior (short live branch), Iteration Limits (concrete thresholds, checkable), Progress Tracking, Stuck report format. CLI push-down: parsing `just` output into structured failures is deterministic in principle but the win is uncertain (fragile log parsing, single consumer); judged not worth a command.
   Est. T1 line savings: 7 (plus the stale-gate rewrite)

## code-just-the-stack (73 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] LOW — Invoke-only skill whose description carries a full trigger list ("Use when the user says just-the-stack, run just across this stack…") that the intro paragraph (line 21) then restates as a workflow summary. Zero ambient cost, but two sources of the same identity. — Fix: one-line description; intro stays. — Tranche: T2-trigger-surface
2. [duplication] LOW — Related skills: "follow the `code-just-fix` posture: fix the root cause honestly, use formatter/autofix recipes…, never skip, weaken, or suppress" restates code-just-fix's rules beside the pointer to them. — Fix: keep the pointer, cut the restatement to "fix root causes; never weaken checks". — Tranche: T1-mechanical-cut
3. [duplication] LOW — The `--no-interactive` fallback dance is written twice: step 4 for `gt restack` and step 5 for `gt up`, word for word ("If this installed Graphite rejects `--no-interactive`…, retry once…; stop if Graphite opens or requires an interactive prompt"). — Fix: hoist one rule ("For any `gt` navigation/restack command: try `--no-interactive`; if rejected, retry once without; stop on any interactive prompt") and drop both inline copies. — Tranche: T1-mechanical-cut
4. [duplication] LOW — Cross-sibling inconsistency: code-fix-gh-stack derives topology from `ns slot gt exec stack-branches --format json`; this skill walks blind with `gt bottom`/`gt up`. Walking is fine for stateful checkouts, but knowing the path upfront would sharpen the final report and the step-2 scope definition. — Fix: optional — record the path once via `stack-branches` in Preflight. — Tranche: T3-structure
   Sections judged clean: authorization/boundary paragraph (strong ownership statement), Workflow steps 1–6 (concrete stop conditions, checkable criteria — "stop if the same gate fails twice", "verify `git status --short` is clean"), Final report. CLI push-down: the loop is inherently stateful checkout-and-edit work; no push-down warranted beyond finding 4.
   Est. T1 line savings: 5

## code-workflows (53 lines)

Verdicts: Frontmatter: flagged · TokenCuts: clean · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [sediment] MED — Frontmatter `description: "Command: code-workflows"` is the same legacy stub as code-just-fix; conventions say descriptions stay human-readable even on explicit-only kinds, and the stub blanks `areg skill find` scope. — Fix: real one-line description naming the routed family ("Router for rare code workflows: delete-stack, stackify-branch, stacker-agent, parity-review, gh-ci-debug"). — Tranche: T2-trigger-surface
   Sections judged clean: routing rules (the gh-ci-debug menu exclusion is a live asymmetry between the Routes table and menu, correctly explained), Routes table (all five reference files verified present), Menu prompt. This is a textbook router skill per the vocabulary; body is already minimal.
   Est. T1 line savings: 0

## code-gh (30 lines)

Verdicts: Frontmatter: clean · TokenCuts: clean · Clarity: clean · ProgDisclosure: flagged · CLIPushDown: clean
Findings:

1. [sediment] MED — The reference table's line counts are stale and now mislead loading decisions: table says `gh.md` ~1480 (actual 1374), `graphql.md` ~1000 (actual 1617), `graphql-schema-core.md` ~500 (actual 1382 — nearly 3x the stated size), `api-backend-audit.md` ~850 (actual 608). — Fix: refresh or drop the counts (drop is cheaper to keep relevant; the "Navigate with" column is the load-bearing part). — Tranche: T1-mechanical-cut
2. [sprawl] MED — Two routed references exceed the ~300-line TOC threshold with no TOC: `graphql-schema-core.md` (1382 lines) and `api-backend-audit.md` (608 lines); `gh.md` and `graphql.md` have TOCs. — Fix: add a top TOC to both. — Tranche: T3-structure
   Sections judged clean: frontmatter (real trigger description, one trigger per branch), intro, Always-on facts (rate-limit numbers inline are a deliberate always-on fact; the Graphite guardrail is needed in-skill because `gh.md` contains generic `git push`/`gh pr create` examples — see cross-skill finding 1 for the wording convergence).
   Est. T1 line savings: 0 (count fix, not cuts)

## pr-address (121 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: flagged · CLIPushDown: clean
Findings:

1. [sediment] MED — "Retired workflow" section (lines 106–116) is a 14-command tombstone. Verified: `prepare-run`, `resolve-thread-batch`, `finalize-run` have zero hits in `ts/packages` — the commands no longer exist, so invoking them fails fast on its own. The section is also negation-shaped: it names all fourteen elephants, and closes with the odd double-negative "Do not describe the current primitive commands as retired." — Fix: shrink to two lines ("The old payload-session/classification/batch orchestration engine is retired and its commands removed; the primitives above are the current surface"). — Tranche: T1-mechanical-cut
2. [duplication] MED — "Current primitive surface": the mutation-primitive list (lines 96–100) and the prose paragraphs (lines 102–104) state the same three commands twice within six lines, and the full flag syntax duplicates `references/cli-reference.md`. — Fix: keep the list with the "prefer these over raw GraphQL/REST" rule as one line per command; leave full envelopes/syntax to the reference. — Tranche: T1-mechanical-cut
3. [duplication] MED — The download-feedback authorization semantics ("it is a report, not an automatic triage prompt… once the human asks to address feedback, that includes authorization to edit and resolve threads") live in both SKILL.md (line 23) and `references/cli-collection.md` (download-feedback section, near-verbatim). Also duplicated there: the engine-retired/primitives-not-retired sentence. — Fix: single source in SKILL.md; strip the policy prose from the reference, which should stay a command catalog. — Tranche: T3-structure
4. [no-op] LOW — "The skill slug remains `pr-address` for discoverability" (line 8) changes no agent behavior. — Fix: delete (lineage belongs in a comment or README). — Tranche: T1-mechanical-cut
5. [sediment] LOW — References section pointers carry no load condition ("cli-collection.md — current command families and safety notes"): weak context-pointer wording for on-demand routing. — Fix: condition-shaped pointers ("load cli-reference.md when you need the JSON envelope or exact flags"). — Tranche: T3-structure
   Sections judged clean: frontmatter (real trigger description), Initial feedback download, Disposition structures (exemplary — strong leading words Omnibus/Split-out/Downstack-surgery with Avoid lists), the workflow-boundary paragraph (explicit ownership handoff to code-fix-gh-stack; the "do not wait/poll" prohibition is a hard boundary guardrail paired with the positive stop rule), Stack feedback disposition plan, Single PR autonomous pass, Thread resolution. CLI push-down: prose already routes through `ns address exec` primitives everywhere it should; disposition planning is semantic and correctly stays in prompt.
   Est. T1 line savings: 12

## setup-graphite (175 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — "Idempotency" section (lines 169–175) restates skip behavior already stated inside steps 2, 4, and 5 ("If both checks report the skill is present, skip Step 3"; "If the heading already exists, skip Step 6 and Step 7"). Pure recap, three sources of truth for each skip. — Fix: delete the section; the steps carry it. — Tranche: T1-mechanical-cut
2. [duplication] LOW — Intro paragraph (lines 20–24) restates the description's install-skill-plus-admonition summary. Harmless ambient-wise (unlisted leaf keeps a rich description by convention, verified: no `.agents/skills/setup-graphite` mirror exists), but the body copy can be one sentence. — Fix: trim intro to the NOT-installed disclaimer plus one framing line. — Tranche: T1-mechanical-cut
3. [duplication] LOW — The admonition payload (lines 121–149) embeds the gt-over-git invariant and the diagnosis triad that also live in this repo's own agent instructions and code-fix-gh-stack. Template-vs-instance duplication is partly inherent (it is payload for other repos), but the wording has already drifted from the sibling copies. — Fix: accept as payload, but treat this block as the canonical wording and converge siblings on it (see cross-skill findings 1–2). — Tranche: T3-structure
   Sections judged clean: frontmatter (unlisted leaf with `metadata.category: project-setup` and a real trigger description — exactly what conventions bucket 6 requires), Steps 1–8 (concrete commands, checkable stop conditions, canonical `--agent codex claude-code -y` install flag matches conventions), Step 8 verify/report. CLI push-down: the steps are one-shot bootstrap checks, mostly single obvious commands; no push-down meets thresholds.
   Est. T1 line savings: 9

## Cross-skill findings (batch)

1. [duplication] HIGH — The just-gate map exists in three diverging variants: code-fix-gh-stack step 4 (dprint/ts-format/ts-check/ts-test/integration/style-guard), code-resolve-merge-conflicts step 4 table (ts-check/ty/pytest/check), and code-just-fix step 2 (ruff/ruff-format/ty/pytest — already drifted fully stale vs the justfile). Drift has demonstrably occurred. — Fix: one source of truth for "failing signal → narrowest `just` gate" (ts/AGENTS.md or a shared external reference); siblings carry a pointer plus at most the mixed/uncertain fallback (`just check`). — Tranche: T3-structure
2. [duplication] MED — The "gt submit --no-interactive; never raw `git push` for Graphite-tracked branches" invariant is restated in four places with four wordings: code-fix-gh-stack step 8, code-just-the-stack step 6, code-gh Always-on facts, setup-graphite payload. As a safety guardrail one line per skill is defensible, but the wording should converge on a single canonical sentence (setup-graphite's payload block is the natural canon) so drift can't soften one copy. — Tranche: T3-structure
3. [duplication] MED — The topology-diagnosis triad (`gt branch info` presentation-only / `gt parent`+`gt children` for edges / `gt ls` human-only) is spelled out in code-fix-gh-stack step 1 and the setup-graphite payload, and again in the vendored graphite skill. code-fix-gh-stack should collapse to `stack-branches` + a pointer. — Tranche: T3-structure
4. [sediment] MED — Legacy `description: "Command: <name>"` stubs survive on exactly two of the eight (code-just-fix, code-workflows) while their siblings (code-just-the-stack, code-resolve-merge-conflicts, setup-graphite — same invoke-only/unlisted kinds) carry real descriptions. One batch `T2` pass writes real descriptions for both; invocation kind untouched (areg-managed). — Tranche: T2-trigger-surface
5. [sprawl] MED — Check-polling push-down serves two siblings at once: code-fix-gh-stack step 9's wait/re-query loop, and pr-address's boundary ("code-fix-gh-stack explicitly owns waiting, re-querying checks"). One `wait-for-checks` primitive beside `ns address exec branch-pr-checks` (poll until settled/timeout, emit JSON) removes the only agent-driven polling loop in the family. — Tranche: T4-cli-pushdown
6. [duplication] LOW — Conflict-handling routing is inconsistent across the fix-loop family: code-just-the-stack routes conflicts to `code-gt-restack-resolve`/`code-resolve-merge-conflicts`; code-fix-gh-stack step 7 improvises ("resolve conflicts carefully… `gt add`… `gt continue`"), restating a slice of the engine skill's job. Converge on the pointer pattern. — Tranche: T3-structure
7. (Positive, no failure mode) The pr-address ↔ code-fix-gh-stack ownership boundary ("one bounded pass" vs "owns waiting and iterative repair") is stated explicitly in pr-address and is the cleanest cross-skill seam in the batch — preserve it verbatim through any edits.

## Coverage

code-resolve-merge-conflicts — audited, 6 findings
code-fix-gh-stack — audited, 8 findings
code-just-fix — audited, 4 findings
code-just-the-stack — audited, 4 findings
code-workflows — audited, 1 finding
code-gh — audited, 2 findings
pr-address — audited, 5 findings
setup-graphite — audited, 3 findings

---

# Batch 6 — ns-flow + ccc (ns-flow-autobranch, ns-flow-branch-latest-commit, ns-flow-cp, ns-flow-submit, ccc-available-work, ccc-branch-triage, ccc-sidebar, ccc-stack-map)

## ns-flow-autobranch (54 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — The stash/`gt create`/checkpoint sequence is named three times: intro (line 16 "do not recreate the stash, Graphite, or checkpoint sequence by hand"), Workflow (line 42 "The Flow CLI owns the dirty-worktree transaction: stash… `gt create`… checkpoint"), Failure handling (line 48 "Do not manually replay the stash, `gt create`, or checkpoint sequence"). One guardrail meaning, three homes; also mild re-explaining of what the CLI already owns (the wrapper drift the family must avoid). — Fix: keep the Workflow sentence as the single source; reduce intro to "delegate to `ns flow autobranch`" and Failure handling to "surface output and stop; recovery only on explicit user choice." — Tranche: T1-mechanical-cut
2. [duplication] LOW — Clean-worktree routing stated twice: When to use (line 20 "For a clean latest-commit split, use `ns-flow-branch-latest-commit`") and Workflow (line 42 "It refuses clean worktrees with guidance to use `ns flow branch-latest-commit`"). — Fix: drop the Workflow restatement; the CLI prints that guidance itself. — Tranche: T1-mechanical-cut
3. [duplication] LOW — Pi mirror `/ns:flow:autobranch` named at line 16 and again at line 54 ("mirrored in Pi as `/ns:flow:autobranch`"). — Fix: state once, in Boundaries. — Tranche: T1-mechanical-cut
4. [no-op] MED — Line 44: "Branch slug derivation uses the NS slug model contract and `NS_SLUG_MODEL`. Checkpoint message generation uses… `NS_CHECKPOINT_MODEL` with legacy `NS_DEV_CHECKPOINT_MODEL` fallback." Documents CLI-internal configuration the agent never acts on during the workflow — re-explains what the CLI owns. — Fix: delete; the CLI and its help own its env config (see cross-skill finding 2). — Tranche: T1-mechanical-cut
5. [no-op] LOW — Line 24 "Optionally inspect state first: `git status --short --branch`". "Optionally" makes it non-binding; agents already check status before mutating commands. — Fix: delete, or make it a real precondition ("confirm the worktree is dirty; if clean, route to `ns-flow-branch-latest-commit`"), which would also absorb finding 2. — Tranche: T1-mechanical-cut
   Sections judged clean: frontmatter (real trigger description, `allowed-tools`, `metadata.internal`), When to use (explicit-ask gate + mutation warning), Boundaries pointer routing (frontmatter `references:` entry + body pointer both resolve to `references/autobranch-family-boundaries.md`).
   Est. T1 line savings: 7

## ns-flow-branch-latest-commit (54 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: flagged · CLIPushDown: clean
Findings:

1. [duplication] MED — Same triple-statement pattern as its sibling: the recovery-branch/reset/`gt create`/verify sequence appears at line 16 ("do not recreate the recovery branch, reset, Graphite, or verification sequence by hand"), line 42 (CLI transaction description), and line 48 ("Do not manually replay the recovery branch, reset, `gt create`, child reset, verification, or cleanup sequence"). — Fix: single source in Workflow; trim intro and Failure handling as in ns-flow-autobranch. — Tranche: T1-mechanical-cut
2. [duplication] LOW — Dirty-worktree routing stated twice (line 20 vs line 42 "It refuses pending worktree changes with guidance to use `ns flow autobranch`"). — Fix: drop the Workflow restatement. — Tranche: T1-mechanical-cut
3. [duplication] LOW — Pi mirror named at line 16 and line 54. — Fix: state once. — Tranche: T1-mechanical-cut
4. [no-op] MED — Line 44 "Branch slug derivation uses the NS slug model contract and `NS_SLUG_MODEL`." CLI-internal config, not agent-actionable. — Fix: delete. — Tranche: T1-mechanical-cut
5. [sprawl] MED — Frontmatter `references:` and body Boundaries both point across skill directories: `../ns-flow-autobranch/references/autobranch-family-boundaries.md`. The pointer routes today only because both skills are always installed as siblings; installed or copied independently, it dangles, and the shared boundary file lives inside one skill of the pair rather than at a neutral home. — Fix: promote the family boundary file to external reference (e.g. `docs/conventions/` or a shared family location) or accept the coupling explicitly in the file; do not duplicate the file. — Tranche: T3-structure
   Sections judged clean: frontmatter description/allowed-tools/internal flag, When to use, Failure handling posture (surface-and-stop is the right wrapper behavior even though its wording duplicates, per finding 1).
   Est. T1 line savings: 6

## ns-flow-cp (52 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [sediment] MED — Frontmatter `description: "Command: ns-flow-cp"` is the older explicit-only stub pattern that `docs/conventions/skill-conventions.md` explicitly deprecates ("Descriptions stay human-readable… current `areg skill apply` does not rewrite descriptions"). Costs nothing ambient (invoke-only) but breaks `areg skill find` discoverability and family consistency — the autobranch pair already carries real descriptions. — Fix: replace with a real one-line human-readable description ("Create a quick `[cp]` checkpoint commit for the current diff by delegating to `ns flow cp`."). — Tranche: T2-trigger-surface
2. [duplication] MED — The no-hand-rolling guardrail lives twice: line 13 ("do not reimplement checkpointing with ad-hoc `git add` / `git commit` logic") and Rules line 50 ("Never hand-roll the checkpoint commit when `ns flow cp` is available"). — Fix: keep the Rules bullet; strip the intro clause. — Tranche: T1-mechanical-cut
3. [duplication] MED — `--amend`/`--no-verify` ban stated twice: Workflow bullet ("creates one new commit without `--amend` or `--no-verify`") and Rules ("Never run `git commit --amend` or `git commit --no-verify` for this workflow"), plus a third echo in Failure handling ("do not amend, and do not bypass hooks"). — Fix: keep the Rules bullet as single source; the Workflow bullet describes CLI internals the CLI owns — cut it; trim Failure handling to "surface output and stop." — Tranche: T1-mechanical-cut
4. [no-op] MED — Lines 39–42 env-var block (`NS_CHECKPOINT_MODEL` default, `NS_DEV_CHECKPOINT_MODEL` legacy fallback): CLI-internal configuration the agent never sets during this workflow; also duplicated across three ns-flow skills (see cross-skill finding 2). — Fix: delete the block. — Tranche: T1-mechanical-cut
5. [no-op] LOW — Workflow bullets "captures the pending worktree snapshot, including untracked files" and "prints `git log -1 --oneline` plus the full checkpoint message" describe output the agent will see anyway; no behavior change. The load-bearing bullets (refuses trunk, refuses clean worktree) are worth keeping. — Fix: cut the two descriptive bullets, keep the two refusal bullets. — Tranche: T1-mechanical-cut
   Sections judged clean: When to use (crisp positive/negative split with a good audience framing — "later agents scanning `git log`, not humans reading PR descriptions" is a strong steer), Co-Authored-By rule (real behavior change vs. this repo's default commit-trailer instruction — earns its line).
   Est. T1 line savings: 9

## ns-flow-submit (76 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: flagged · CLIPushDown: clean
Findings:

1. [sediment] MED — Frontmatter `description: "Command: ns-flow-submit"` — same deprecated stub as ns-flow-cp. — Fix: real one-line description ("Submit or update the current Graphite stack by delegating to `ns flow submit`."). — Tranche: T2-trigger-surface
2. [duplication] MED — Managed-region/regeneration semantics stated three times: Workflow bullet (line 33–35 "skips PR description regeneration when the stored patch-id/prompt fingerprint is unchanged… replaces only the managed generated body region, preserving human text outside it"), line 66 ("preserves unchanged generated descriptions by comparing the GitHub PR diff patch id, prompt hash, and generator version… preserves human-authored body text outside that region"), and Boundaries line 76 ("managed generated content is machine-owned, while human PR body text outside the managed region is preserved"). — Fix: single source at line 66 beside `ns flow regenerate-pr`; cut the Workflow bullet and the Boundaries clause. — Tranche: T1-mechanical-cut
3. [no-op] MED — Workflow bullets that narrate CLI output rather than steer the agent: "reports formatter-owned guidance for restack-required, empty-branch, and post-submit description-generation failures" and "when model access is available, appends an `AI interpretation` section…". The agent sees this output when it happens; the lines change nothing. — Fix: delete both bullets (Failure handling already says to surface the `AI interpretation` section). — Tranche: T1-mechanical-cut
4. [no-op] MED — Lines 47–58 env-var reference block (`NS_CHECKPOINT_MODEL`, `NS_DEV_CHECKPOINT_MODEL`, `NS_DEV_PR_DESCRIPTION_MODEL`, `NS_DEV_PR_DESCRIPTION_PROMPT`, `.ns/prompts/pr-description.md`, `NS_SUBMIT_FAILURE_MODEL`): 12 lines of CLI-internal configuration on the main path of a wrapper skill; no run of this skill sets these. — Fix: delete (CLI help owns its config); if genuinely wanted, disclose to a family reference — do not keep inline. — Tranche: T1-mechanical-cut
5. [duplication] LOW — Boundaries "This skill submits/updates PRs; require explicit user intent" restates When to use ("Use only when the user explicitly asks to submit or update"). — Fix: cut the Boundaries bullet. — Tranche: T1-mechanical-cut
6. [sediment] LOW — Line 13 calls it "the repo-local `ns flow submit` command" while siblings say "public `ns flow autobranch` CLI" / "shared `ns flow cp` CLI" — three different framings of the same CLI family, at least one stale. — Fix: pick one term family-wide. — Tranche: T1-mechanical-cut
7. [duplication] LOW — Restack handling appears in a Workflow bullet path (lines 38–44) and is re-gated in Failure handling ("Do not bypass the… restack guidance"). Minor, but the non-interactive rerun rule ("rerun only with explicit user approval") is the load-bearing part and should be the single statement. — Fix: keep the explicit restack block; drop the Failure-handling echo. — Tranche: T1-mechanical-cut
   Sections judged clean: When to use, `ns flow regenerate-pr` escape hatch (line 60–63, once deduplicated per finding 2), Boundaries "does not land/merge PRs" (a real scope line).
   Est. T1 line savings: 20

## ccc-available-work (186 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: flagged · CLIPushDown: flagged
Findings:

1. [sediment] MED — Mental model says "Work in two layers:" then lists three numbered items (lines 21–25: collect/audit, filter/present, render stack-first) — the count went stale when rendering was added. A wrong count in the framing sentence undermines the structure it announces. — Fix: "Work in three layers" or fold rendering into layer 2. — Tranche: T1-mechanical-cut
2. [duplication] MED — Row-visibility rule stated twice: lines 140–141 ("Relevance ranks candidates; it does not hide branch candidates. Stale, restack-needed, unknown, and already-open branches stay visible in stack order…") and line 180 ("Do not hide candidates only because they are stale or already open. Stale and opened rows stay visible in stack order."). — Fix: keep the Row states statement (positive phrasing); cut line 180. — Tranche: T1-mechanical-cut
3. [duplication] MED — Occupancy-authority rule stated twice: line 121 ("Workspace title and description labels are useful hints but are not authoritative occupancy evidence") and inside the `OPENED` state definition, line 132 ("Occupancy is authoritative only from workspace `current_directory` Git HEAD, not workspace title/description"). — Fix: keep it once, in the `OPENED` definition (co-location: the rule lives with the state it governs). — Tranche: T1-mechanical-cut
4. [duplication] LOW — Line 17 "If the user asks for cleanup or continuation after the report, treat that as a separate follow-up task with the appropriate skill" reproduces the closing line of `../ccc-stack-map/references/cmux-read-only-posture.md` verbatim, immediately after pointing at that file. — Fix: cut; the pointer routes there. — Tranche: T1-mechanical-cut
5. [cli-push-down] HIGH — Data sources steps 1–9 (lines 31–96) are a deterministic evidence-collection pipeline: `cmux tree --all --json`, a per-window loop of `cmux workspace list`, a per-workspace loop of `git -C` probes, trunk resolution with a `sed` pipeline, `git for-each-ref`, `ns slot gt exec stack-branches`, `ns objective list`, plus per-candidate `gh pr list`/`git log`/`git diff`. This clears every push-down threshold at once (20+ prompt lines, far more than 3 tool calls, loops, shell pipeline). The skill itself names the target ("Future CCC exec helper boundary", line 182: a read-only CCC `exec` manifest helper in `ts/packages/capabilities/ccc`) but defers it. — Fix: promote that helper from "future" to the actual cut — one command returning the cmux/branch/Objective/Graphite manifest JSON; the skill keeps candidate modeling, availability judgment, and rendering. — Tranche: T4-cli-pushdown
6. [sediment] LOW — "v1" scoping notes scattered through the body: line 64 "In v1, Graphite evidence is current-stack/worktree-scoped", line 117 "future work, not required for v1", line 186 "Do not implement that helper as part of this v1 skill-only workflow." Time-relative labels that will silently go stale; the last two are maintainer-facing, not run-facing. — Fix: keep the Graphite-scope fact (drop "In v1"); compress the future-helper section to two lines once finding 5 lands or move maintainer notes to a sibling `README.md`. — Tranche: T1-mechanical-cut
7. [leading-word] LOW — Line 30 "Use a quick pass first, then deepen only where relevance is ambiguous or the shortlist needs support" spends a sentence gesturing at a two-phase depth policy the model already knows as *triage*. — Fix: "Triage first; deepen only ambiguous candidates." — Tranche: T1-mechanical-cut
   Sections judged clean: frontmatter (rich trigger description is fine at zero ambient for an invoke-only skill; `metadata.internal` present), Default posture pointer routing (resolves, wording fires on every run), Candidate model (flat reference, well co-located), Availability rules (checkable `OPENED` definition), Row states (the "Do not use BLOCKED/WAITING…" prohibition is a justified hard guardrail paired with the positive exclusive state set), Output template (concrete, checkable rendering contract).
   Est. T1 line savings: 12

## ccc-branch-triage (196 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: flagged
Findings:

1. [sediment] MED — Frontmatter lacks `metadata.internal: true` while every other skill in this batch (and the rest of the ccc family) carries it. cmux triage is repo-internal tooling; per `docs/conventions/skill-conventions.md`, internal skills must carry the flag — this looks like drift, not decision. — Fix: add `metadata.internal: true` (via the normal skill-management path). — Tranche: T2-trigger-surface
2. [duplication] MED — The "never parse `gt ls`/`gt log` human-facing output" rule appears twice inside this skill: Safety contract line 20 and inventory step 5 line 76 ("Use `gt ls` only as a human visual cross-check"). — Fix: keep it in the Safety contract; step 5 already lists the structured sources, so drop its restatement. — Tranche: T1-mechanical-cut
3. [duplication] MED — Titles-are-advisory stated three times: intro line 9 ("Workspace titles and descriptions are advisory only"), step 4 line 66 ("Treat titles/descriptions as labels that may drift, not as identity"), and implicitly again in the `↯label` badge definition. — Fix: single source in step 4 where the join is defined; the badge definition may reference it. — Tranche: T1-mechanical-cut
4. [premature completion] MED — No completion criterion for the triage itself. "Process outstanding Graphite/GitHub branches one at a time" never says when the run is done — nothing binds the agent to classify *every* branch before presenting options, so a partial inventory reads as done. — Fix: add a checkable, exhaustive bound: "every local branch and every open PR head assigned to exactly one classification category; unclassifiable rows reported as Needs inspection." — Tranche: T3-structure
5. [cli-push-down] HIGH — Read-only inventory steps 1–5 (lines 24–77): `git status`, two `gh pr` JSON calls, `git worktree list --porcelain`, per-workspace `git -C` loops, `cmux tree`/`cmux workspace list` loops, `gt parent`/`gt children` per branch, `ns slot gt exec stack-branches` — loops plus far more than 3 tool calls, repeated every triage run. The skill's own "Future CLI push-down" section (line 192) names `ccc exec branch-triage` / `ccc exec branch-inventory` returning joined JSON. Mutation procedures stay supervised in the skill; the inventory is the win. — Fix: implement the inventory exec helper; skill consumes its manifest and keeps classification judgment and the confirmation gates. — Tranche: T4-cli-pushdown
6. [sediment] LOW — "v1" markers (lines 17 "do not allocate one automatically in v1", 166 "Never close GitHub PRs automatically in v1", 196 "Do not implement deterministic CLI support in v1") — same stale-label pattern as ccc-available-work; the guardrails are fine, the version tags will rot. — Fix: drop "in v1" from the guardrails (they hold until changed); keep the future-CLI section as the only forward-looking note. — Tranche: T1-mechanical-cut
7. [duplication] LOW — Description frontmatter compresses the body accurately but repeats the cwd+branch join mechanism ("detect branches open in cmux by workspace cwd + Git branch") that lines 9 and 66 also carry. Zero ambient cost (invoke-only), so LOW — trim only if touching the description anyway. — Fix: optional trim during finding-1 edit. — Tranche: T2-trigger-surface
   Sections judged clean: Safety contract (dense but each line is a distinct hard guardrail; the prohibitions are justified, confirmation-gated mutation is the positive frame), cmux badges (compact reference, though see cross-skill finding 3), Classification model and its five categories (well co-located reference), Mutation procedures (landing/retire/restack are appropriately supervised and route conflicts to `code-gt-restack-resolve` rather than duplicating it), Root rerun prompt (concrete template — good predictability lever).
   Est. T1 line savings: 8

## ccc-sidebar (55 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [sediment] MED — Line 29: "Do not use local cmux source under `~/code/githubs/manaflow-ai/cmux`; if cmux command behavior is unclear, inspect the installed CLI help." A machine-specific home-directory path baked into a skill — stale the moment the checkout moves, and it names into context a location no run should touch (negation carrying a hard-coded path). The positive half ("inspect the installed CLI help") is the whole instruction. — Fix: "If cmux command behavior is unclear, inspect the installed CLI's help; never read cmux source." — Tranche: T1-mechanical-cut
2. [duplication] LOW — The objective-summary carve-out lives in both the description ("/ns:ccc:sidebar:objective-summary is handled directly by deterministic extension code and should not invoke this skill") and body line 25 (same content, expanded). For an invoke-only skill the description costs nothing ambient, and misrouting from the extension is the failure being defended, so this is tolerable — but it is still one meaning in two places. — Fix: keep the body as source of truth; shorten the description clause to "not for objective-summary (extension-owned)." — Tranche: T2-trigger-surface
3. [negation] LOW — Apply section stacks four prohibitions in a row (line 44: "Do not assign shell variables. Do not write an env prelude. Do not pass `--workspace`… Do not run raw `cmux` commands."). Each defends a real observed failure and is hard to phrase positively, so they stay — but the paragraph leads with the elephant four times. — Fix: lead with the positive contract ("Run exactly one `ccc exec cmux-workspace-summary` command, plain quoting, no flags beyond the three shown") and keep only the prohibitions the positive doesn't already exclude (likely just "do not run raw `cmux` commands"). — Tranche: T1-mechanical-cut
   Sections judged clean: frontmatter (`metadata.internal`, accurate trigger for its two extension callers), Input contract, Choose the source to summarize (both branches crisply defined with evidence sources), Required fields (exemplary completion criteria — exact prefixes, 45-char bound, self-check before running), Apply section's success check (`exit_code: 0`, `data.success: true` — checkable) and the "respond briefly with the applied title" ending.
   Est. T1 line savings: 3

## ccc-stack-map (108 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: flagged · CLIPushDown: flagged
Findings:

1. [sediment] MED — Line 17: "This is an internal local skill and should be installed with `metadata.internal: true` / `INSTALL_INTERNAL_SKILLS=1` when managed by `npx skills`." Maintainer-facing install metadata inside the agent-facing body, and the frontmatter already carries `metadata.internal: true` — the line instructs nobody who will ever run this skill. — Fix: delete (install policy lives in skill-conventions and frontmatter). — Tranche: T1-mechanical-cut
2. [sprawl] MED — Colorization section (lines 65–79): a 9-bullet ANSI palette plus medium-detection rules, on the main path of every run — while the section itself says to prefer plain text in Markdown fences, which is where this output overwhelmingly lands. Only the ANSI-terminal branch ever needs the palette. — Fix: keep the two-line policy (colorize only when ANSI-safe; never color-only meaning) and disclose the palette to `references/display-and-code-sketch.md`, which already exists for display iteration. — Tranche: T3-structure
3. [duplication] LOW — No-Attention-section rule stated twice: line 36 ("Do not include an `Attention:` or findings section unless the user explicitly asks") and Rendering workflow step 8 self-check ("final self-check that the default output has no `Attention:` section"). The self-check is a checkable completion criterion, so it earns its place; the pair is borderline reinforcement. — Fix: keep step 8; soften line 36 to the positive ("Default output is overlay-only" already says it — the following sentence can go). — Tranche: T1-mechanical-cut
4. [sediment] LOW — Line 32: "For ad-hoc collection, a minimal in-session snippet is acceptable; do not add a bundled executable script for the first version of this skill." Another "first version" maintainer note in run-facing text. — Fix: delete; it constrains skill authors, not the running agent. — Tranche: T1-mechanical-cut
5. [cli-push-down] MED — Data sources 1–4 are the same deterministic cmux+git+Graphite collection loop as the other two ccc report skills (per-window, per-workspace `git -C` probes, `stack-branches` exec). Alone it is near the threshold; as the third copy of the family pipeline it should ride the same `ccc exec` manifest helper (see cross-skill finding 1) rather than get its own wrapper. — Fix: consume the shared inventory helper when it lands; until then, no change. — Tranche: T4-cli-pushdown
   Sections judged clean: frontmatter (strong trigger-phrase list; zero ambient as invoke-only; `metadata.internal` present), Default posture pointer (routes to `references/cmux-read-only-posture.md`, wording fires reliably), Default overlay output (concrete template with hard separators — a real predictability lever), Badge semantics (each badge has a computable definition; the `●`/`◎` tiebreak rule is explicit), Rendering workflow (ordered steps ending on a checkable self-check), Optional reference pointer (line 108 — conditions named, routes correctly).
   Est. T1 line savings: 5

## Cross-skill findings (batch)

1. [duplication] HIGH — The cmux occupancy-collection procedure is written out three times, near-verbatim: `cmux tree --all --json` → per-window `cmux workspace list --window <ref> --json` → per-cwd `git -C <cwd> symbolic-ref --short HEAD` / `rev-parse --short HEAD` fallback with `DETACHED@<sha>` rendering / `status --porcelain` — in ccc-available-work (Data sources 1–3), ccc-branch-triage (step 4), and ccc-stack-map (Data sources 1–3). Three sources of truth for one join procedure will drift (they already differ in small wording), and it is exactly the deterministic loop the push-down thresholds target. — Fix: one read-only `ccc exec` inventory/manifest command (the helper both ccc-available-work and ccc-branch-triage already name as "future") consumed by all three skills; interim cheaper fix: a shared reference file beside `cmux-read-only-posture.md`. — Tranche: T4-cli-pushdown
2. [duplication] MED — `NS_CHECKPOINT_MODEL` + legacy `NS_DEV_CHECKPOINT_MODEL` fallback semantics documented in three ns-flow skills (autobranch line 44, cp lines 39–42, submit lines 47–50), and `NS_SLUG_MODEL` in two (autobranch, branch-latest-commit). CLI-internal configuration restated per wrapper — each copy is also a no-op for the running agent. — Fix: delete from all four skills; the CLI owns its env config (single source: CLI help/docs). — Tranche: T1-mechanical-cut
3. [duplication] MED — Badge/marker vocabulary overlaps between ccc-branch-triage ("cmux badges": `open`/`active`/`caller`/`DIRTY`/`dup`/`↯label`/`DETACHED@`) and ccc-stack-map ("Badge semantics": `○`/`●`/`◎`/`DIRTY`/`dup`/`↯label`/`2t`) — same concepts, two divergent notations (words vs glyphs), each defined independently. Not pure duplication (different renderings), but the shared meanings (`DIRTY`, `dup`, `↯label`, detached-HEAD display) are defined twice and have already drifted in definition detail (e.g. `↯label` matching rules are spelled out only in stack-map). — Fix: define the shared badge meanings once (shared reference or the exec helper's manifest fields) and let each skill own only its rendering. — Tranche: T3-structure
4. [duplication] MED — The "never parse `gt ls`/`gt log`/human-facing Graphite output for machine facts; use `ns slot gt exec stack-branches --format json`" rule is restated in all three ccc report skills (available-work line 70, branch-triage lines 20+76, stack-map line 30) and twice within branch-triage. One meaning, four+ homes. — Fix: fold into the shared posture/inventory reference (it is a posture rule as much as read-only-ness is); each skill keeps at most a one-line pointer-adjacent mention. — Tranche: T3-structure
5. [sprawl] MED — Cross-skill reference pointers reach into sibling skill directories: ns-flow-branch-latest-commit → `../ns-flow-autobranch/references/autobranch-family-boundaries.md`; ccc-available-work → `../ccc-stack-map/references/cmux-read-only-posture.md`. Both files are genuinely shared family material homed inside one arbitrary member, so the pointer breaks if a skill is installed/copied alone and the "owning" skill is a false owner. — Fix: promote both to external reference at a neutral home (e.g. `docs/`) per the glossary's External Reference pattern for material shared across skills, and update the pointers. — Tranche: T3-structure
6. [sediment] LOW — ns-flow family describes the same CLI three ways: "public `ns flow autobranch` CLI", "shared `ns flow cp` CLI", "the repo-local `ns flow submit` command". Also the four wrappers share a boilerplate skeleton (intro delegation sentence + "cross-harness path for /ns:flow:X" + surface-and-stop failure handling) that is correct in kind — a thin wrapper is the right shape here — but the skeleton's wording has drifted copy to copy. — Fix: normalize one term and one skeleton wording across the family when applying the per-skill T1 cuts. — Tranche: T1-mechanical-cut
7. [duplication] LOW — Failure-handling posture ("surface CLI output and stop; do not replay by hand; recovery only on explicit user choice") is restated per ns-flow skill with slight variations. Acceptable inline (each skill must carry its own guardrail when loaded alone), so LOW — dedupe only the per-skill triple-statements (per-skill findings), not across skills. — Fix: none across skills; handled by per-skill cuts. — Tranche: T1-mechanical-cut

## Coverage

ns-flow-autobranch — audited, 5 findings
ns-flow-branch-latest-commit — audited, 5 findings
ns-flow-cp — audited, 5 findings
ns-flow-submit — audited, 7 findings
ccc-available-work — audited, 7 findings
ccc-branch-triage — audited, 7 findings
ccc-sidebar — audited, 3 findings
ccc-stack-map — audited, 5 findings

---

# Batch 7 — Python style/testing

## pytest (357 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — The "Anti-patterns" section (lines 238–266) restates rules already given in full prose sections: test classes (= "Style: functional only", 25–48), autouse/fixture-factories/data-builders/trivial-yield-fixtures (= the "deliberately excluded" list, 61–64), `@patch` decorator stack (= 147–173), `MagicMock()` without spec (= 175–191), mocking third-party internals (= 208–214). Two sources of truth for ~8 rules. — Fix: keep the Anti-patterns checklist as the single home for each rule; compress the corresponding prose sections to the checklist bullet plus (where fragile) one example — Tranche: T1-mechanical-cut
2. [duplication] MED — "Relationship to python-fake-driven-testing" (13–22) spends 10 lines on a boundary already stated twice: the description's last sentence and "When NOT to use this skill" (348–357). — Fix: delete the section; keep the one-line intro (9–11) and the When-NOT list as the routing surface — Tranche: T1-mechanical-cut
3. [no-op] LOW — Trivial examples that the rule text fully replaces: BAD/GOOD class example (29–43), `_definition()` helper (80–89), monkeypatch env example (142–145), spec GOOD/BAD pair (183–191). Per skill-audit, keep examples only for fragile syntax — the `@contextmanager` try/finally example (100–121) and the BAD decorator-stack (168–173) qualify; these four do not. — Fix: delete the four trivial examples — Tranche: T1-mechanical-cut
4. [no-op] LOW — "Mirror the `src/` layout if it's useful. Don't if it isn't." (285) and lead-in "When you reach for a mock, follow these rules." (132) change no behavior. — Fix: delete both sentences — Tranche: T1-mechanical-cut
5. [sprawl] LOW — "Import mode" + its three subsections (287–337) carry ~50 lines of rationale prose for four hard rules. Under the 500-line threshold so not urgent, but the rationale (upstream doc quotes, monorepo story) is disclosure material. — Fix: compress each rule to bullet + one-line rationale, or disclose rationale to `references/import-mode.md` — Tranche: T3-structure

Sections judged clean: frontmatter (command-backed; real trigger description sanctioned by skill-conventions), "The reliable subset", "Setup hierarchy" (clear preference order with move-down criterion), remaining Mocking subsections, "Naming", "Approved plugins" (sharp default-no rule), "When NOT to use this skill" (routing, correctly negation-as-boundary), `references/fixtures.md` pointer routes correctly (44-line target).
Est. T1 line savings: ~70

## dignified-python (130 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: flagged · CLIPushDown: clean
Findings:

1. [duplication] HIGH — "## Core Knowledge (ALWAYS Loaded)" containing only bare `@dignified-python-core.md` (49–51). No harness guarantees `@`-expansion inside SKILL.md, so the skill's core standards (375 lines) can silently never load — a must-have target behind a weakly worded context pointer is a variance/misfire bug (per writing-great-skills: fix the wording). `dignified-python-core.md` line 7 repeats the same false claim ("loaded with every skill invocation"). — Fix: replace with an imperative pointer: "Read `dignified-python-core.md` first, before writing any Python — it covers the 80% case."; fix the core file's self-description — Tranche: T2-trigger-surface
2. [sediment] HIGH — "Auto-invoke when users ask about:" (27) heads the "When to Use This Skill" list (26–37). The skill is `command-backed` per areg (model-invocation disabled): auto-invocation is impossible; this is a stale layer from a model-invoked era, and it misstates the trigger surface to any maintainer/agent reading it. — Fix: delete the section (the description already carries the human-facing trigger summary) — Tranche: T2-trigger-surface
3. [no-op] MED — "When to Use This Skill vs. Others" table (39–47): every row answers "✅ Yes", so the comparison carries zero information and merely re-lists the section above it (also duplication). — Fix: delete the table — Tranche: T1-mechanical-cut
4. [duplication] MED — Frontmatter `references:` list (5–18) is a nonstandard key (not in skill-conventions), duplicating the body's Reference Routing plus Version Detection; two lists to keep in sync. — Fix: delete unless a harness demonstrably consumes it — Tranche: T1-mechanical-cut
5. [sprawl] MED — Disclosed files exceed the ~300-line TOC threshold with no TOC: `versions/python-3.10.md` (521), `-3.11.md` (539), `-3.12.md` (665), `-3.13.md` (658), `dignified-python-core.md` (375). — Fix: add a TOC at the top of each — Tranche: T3-structure
6. [sediment] LOW — Empty frontmatter blocks (`---`\n`---`) atop `dignified-python-core.md`, `cli-patterns.md`, `subprocess.md`, and all four `versions/*.md`. — Fix: delete the empty blocks — Tranche: T1-mechanical-cut
7. [duplication] LOW — `references/README.md` (290 lines) is a third index of the same routing (frontmatter list, body routing, README). Human-facing README is a sanctioned home, but three indexes will drift. — Fix: after cutting the frontmatter list, keep README as the sole human index or trim it to a pointer — Tranche: T3-structure

Sections judged clean: description (human-facing under command-backed; identity + audience is fine), "Version Detection" (checkable: ordered probe list, "load exactly one matching file"), "Reference Routing" (well-worded conditional pointers, one trigger per branch; all 8 targets exist).
Est. T1 line savings: ~30 (plus ~10 across sibling files' empty frontmatter)

## dignified-python-tripwire (27 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [no-op] LOW — "In Pi-hosted sessions, use this skill's same review instructions or the same ns command face above; no separate reviews runner alias is required." (19) — tells the agent to do what it would do anyway and negates an alias that doesn't exist (sediment from an older runner setup). — Fix: delete the sentence — Tranche: T1-mechanical-cut
2. [premature completion] LOW — Completion criterion is delegated: "apply that review definition exactly to the supplied diff" is only as exhaustive as `.ns/reviews/dignified-python-tripwire/review.md` (target verified to exist, 107 lines). If that file lacks an exhaustiveness bar, add one line here: "every changed Python file checked against every rule". — Fix: verify/add the exhaustiveness bar — Tranche: T3-structure

Sections judged clean: frontmatter (one-line human-facing description, correct for command-backed), authoritative-definition pointer (routes correctly; the "do not reinterpret from memory" prohibition is a hard guardrail properly paired with the positive), the `ns reviews review run` / `record-findings` / `publish-findings` command blocks (exact commands, keep). This is the tripwire pattern done right: a tiny trigger skill with zero body-content duplication of `dignified-python`.
Est. T1 line savings: 2

## python-fake-driven-test-layout (204 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [sediment] MED — "If `python-fake-driven-testing` tells you to put a test in a directory not listed here (`tests/e2e/`, `tests/services/`, `tests/commands/`, `tests/unit/fakes/`), translate via this table" (142–144). fdt's current SKILL.md lists exactly the table's paths; this clause defends against drift that has since been fixed and re-injects four dead directory names. — Fix: cut to "this skill is the source of truth for placement." — Tranche: T1-mechanical-cut
2. [no-op] LOW — "The subdirectory split is purely an organization concern — pytest doesn't care." (152–153) and "the directory layout doesn't preclude markers, it just doesn't depend on them" (176–177). — Fix: delete both — Tranche: T1-mechanical-cut
3. [duplication] LOW — Intro paragraph (9–15) pre-states the four subdirectories + optional conformance that the diagram (18–33) and "What goes where" restate. — Fix: trim intro to one sentence + the classification rule — Tranche: T1-mechanical-cut
4. [duplication] MED — Mapping table (133–141) is one side of a cross-skill duplication with fdt's "Test Layers" Location fields; see Cross-skill finding 2.

Sections judged clean: frontmatter/description (precise triggers, explicit defers — model description hygiene good even though command-backed), "Where gateway code lives" (sharp file-name contract; Forbidden list is a hard guardrail paired with the positive move; rationale block earns its lines), all five "What goes where" entries (each with a checkable boundary test, e.g. the tmp_path/symlink-loop discriminator), "Pytest configuration", "Running subsets" (exact commands), "Multi-package monorepos" (clear promotion rule), "Cross-references" (one-line routing each, appropriate since the skill loads alone).
Est. T1 line savings: ~12

## python-fake-driven-testing (111 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: flagged · CLIPushDown: clean
Findings:

1. [duplication] HIGH — `references/python-specific.md` (839 lines) duplicates and *contradicts* the `pytest` skill's doctrine: "Basic Fixtures" (lines 12–46) demonstrates fixtures as data/dependency builders — a named anti-pattern in `pytest` (helpers-first setup hierarchy); "Using pytest-mock" (173–196) teaches `mocker` where `pytest` says "don't introduce it just for convenience"; it also re-teaches parametrize, tmp_path, monkeypatch, and "Mocking What You Own" (= pytest's "Don't mock what you don't own"). The SKILL.md's own boundary line says "For pytest mechanics, use `pytest`", yet routing line 89–90 sends agents into this contradicting material. Behavior risk: an agent following the reference writes tests the sibling skill forbids. — Fix: gut the pytest-mechanics sections from `python-specific.md`, keep only fake-driven-specific content (framework testing over fakes, Protocol test doubles), and route mechanics to the `pytest` skill — Tranche: T3-structure
2. [duplication] MED — "Test Layers" Location fields (33–49) restate the placement that `python-fake-driven-test-layout`'s mapping table declares itself "the source of truth" for; fdt's own intro concedes "when path guidance conflicts, that skill wins" — i.e., an acknowledged second source of truth. — Fix: either drop the Location fields and add one line "placement: see `python-fake-driven-test-layout`", or (if inline paths are judged worth it for standalone loads) mark the layout table as authoritative in both files with a sync note — Tranche: T3-structure
3. [duplication] LOW — Intro (9–11) restates the frontmatter description nearly verbatim ("gateway interfaces, real/fake implementations, … mock-to-fake conversion"). — Fix: cut to the boundary/routing paragraph only — Tranche: T1-mechanical-cut
4. [sprawl] MED — 8 of 10 reference files exceed the ~300-line TOC threshold with no TOC: `patterns.md` (1000), `anti-patterns.md` (931), `workflows.md` (865), `python-specific.md` (839), `gateway-architecture.md` (654), `testing-strategy.md` (620), `fast-scenario-testing.md` (448), `non-ideal-states.md` (329). — Fix: add a TOC at the top of each (and finding 1's gutting shrinks `python-specific.md`) — Tranche: T3-structure

Sections judged clean: frontmatter (tight trigger description, one trigger per branch), "Core Model" (sharp naming guidance with positive examples before the avoid-list), "Scenario Tests" (numbered required shape; checkable assertions list; the private-field prohibition is a guardrail correctly paired with the positive "public mutation-tracking properties"), "Reference Routing" (10 well-worded conditional pointers; spot-checked `gateway-architecture.md#keep-gateways-narrow` — anchor exists), "Guardrails" (the layer-4/layer-3 defaults and the "If a test imports a `Fake*`, it is Layer 4" discriminator are model completion-criterion sharpness).
Est. T1 line savings: ~3

## Cross-skill findings (batch)

1. [duplication] HIGH — `python-fake-driven-testing/references/python-specific.md` vs the `pytest` skill: two authoritative homes for pytest mechanics that give *opposite* guidance on fixtures-as-builders and pytest-mock (detail in python-fake-driven-testing finding 1). This is the batch's worst finding: whichever skill an agent happens to load determines which doctrine it follows. — Fix: single source of truth = `pytest` skill for mechanics; strip them from the fdt reference — Tranche: T3-structure
2. [duplication] MED — Layer→directory placement lives in both fdt "Test Layers" (Location fields) and layout's mapping table, with dueling source-of-truth claims (layout: "this table is the source of truth"; fdt: "that skill wins"). One place should own the mapping. — Fix: layout owns it; fdt keeps layer names/purposes and one routing line — Tranche: T3-structure
3. [duplication] LOW — The pytest↔fdt↔layout relationship prose is stated at four sites: pytest "Relationship" section (10 lines), pytest "When NOT to use", fdt intro, layout intro + "Cross-references". Each skill legitimately needs its own one-line boundary (skills load alone), but pytest's 10-line essay is the outlier. — Fix: one boundary line per skill; delete pytest's Relationship section — Tranche: T1-mechanical-cut
4. [clean] dignified-python vs dignified-python-tripwire — the tripwire/content split is clean: the tripwire is 27 lines of pure trigger+routing to `.ns/reviews/dignified-python-tripwire/review.md` and duplicates no dignified-python body content. Explicitly judged not a finding.
5. [sediment] LOW — All five skills are `command-backed` per areg, yet dignified-python's body still carries model-invocation-era trigger scaffolding ("Auto-invoke when…", the vs-Others table) while the other four bodies do not — the family's trigger surfaces should uniformly live in descriptions (human-facing) with bodies free of auto-invoke language. — Fix: covered by dignified-python findings 2–3 — Tranche: T2-trigger-surface

## Coverage

pytest — audited, 5 findings
dignified-python — audited, 7 findings
dignified-python-tripwire — audited, 2 findings
python-fake-driven-test-layout — audited, 4 findings
python-fake-driven-testing — audited, 4 findings

---

# Batch 8 — Project scaffolding

## create-python-dev-cli (223 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: flagged
Findings:

1. [duplication] LOW — Description carries two trigger lists renaming the same branches: "Use when the user wants to add a dev CLI … set up a -dev package …" (line 4) and later "Run when the user says things like 'add a dev CLI' … 'set up a -dev package' …". One branch written twice. Zero ambient cost (kind `unlisted`), but it still bloats what the router/`areg skill find` surfaces. Fix: keep one trigger list; drop the trailing "Run when the user says…" clause. — Tranche: T1-mechanical-cut
2. [duplication] LOW — Description also restates the body's deliverables ("Creates the full package structure inside packages/<project>-dev/ with click CLI, static imports for shell completion, output routing, context injection, a starter clean-pyproject command…"), duplicating the Stack table and target structure (lines 26–80). For an unlisted leaf a scope summary is wanted, but one compact sentence suffices. Fix: compress the deliverables clause to one line. — Tranche: T1-mechanical-cut
3. [no-op] LOW — "Follow these steps in order. Create all files, then run verification at the end." (lines 83–84). Numbered steps already impose order, and verification IS steps 8–10; the sentence changes no behavior. Same sentence appears verbatim in the two sibling create-* skills. Fix: delete both sentences. — Tranche: T1-mechanical-cut
4. [duplication] LOW — Step 7's "This delegates cache cleaning to the dev CLI as the single source of truth" (line 192) restated in After-scaffolding item 4 "The justfile clean target now delegates to <DEV_PROJECT_NAME> clean-pyproject" (line 223). Fix: keep the Step 7 rationale, cut item 4 or vice versa. — Tranche: T1-mechanical-cut
5. [sprawl] MED — Steps 2–7 are fully deterministic given the six collected variables: mkdir sequences, template instantiation across 8 files, and five mechanical TOML edits to the root pyproject (lines 92–192). Meets push-down thresholds (3+ tool calls, deterministic generation, workflow repeated across the create-* family). Because this skill runs in target repos with no ns CLI available, the push-down target is a skill-bundled script (`scripts/scaffold.sh` or a uv one-file script) taking the variables as args and emitting JSON, leaving the skill with collect/confirm + run + verify. Weigh against one-shot frequency before building. — Tranche: T4-cli-pushdown

Sections judged clean: Stack table, Preconditions, Information to collect (derivations are checkable), Target directory structure, Step 6 `[tool.ty.src]` conditional note (earns its rationale), Steps 8–10 completion criteria ("All three must succeed", "fix the issue before considering scaffolding complete" — checkable), template pointers all route (`templates/*.md` exist and are named per step).

Est. T1 line savings: 6

## create-python-package (181 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] LOW — Same double-trigger-list pattern in the description (line 4): "Use when the user wants to create a new Python package, set up a Python project…" plus "Run when the user says things like 'set up a new Python project', 'create a package called X'…" — synonyms renaming one branch, twice. Fix: single trigger list. — Tranche: T1-mechanical-cut
2. [no-op] LOW — Precondition "`.agents/`, `.claude/`, and `skills/` directories may or may not exist" (line 45). "May or may not" constrains nothing and changes no behavior — likely a leftover from a version that touched those dirs. Fix: delete. (Duplicated in create-bun-typescript-project line 53.) — Tranche: T1-mechanical-cut
3. [duplication] MED — Verification runs twice with a format pass wedged between: Step 8 `uv sync && just check` "Both must succeed" (lines 152–160), Step 9 `ruff format` (163–168), Step 10 `just check` again (170–172). If the templates conform, Steps 9–10 are dead weight; if they don't, Step 8's check fails spuriously before the format pass. Sibling create-bun gets the order right (install → fix → verify once). Fix: reorder to sync → format → single `just check`; collapse Steps 8–10 into two steps. Saves ~8 lines and removes a spurious-failure path. — Tranche: T3-structure
4. [no-op] LOW — "Follow these steps in order. Create all files, then run verification at the end." (lines 93–94), and After-scaffolding item 3 "Push to GitHub when ready." (line 181) — neither changes agent behavior. Fix: delete. — Tranche: T1-mechanical-cut
5. [negation] LOW — "No pre-commit, no mypy, no tox, no Makefile." (line 37). Legitimate hard guardrail on stack scope and compact, so it stays — but pair-check that the Stack table above it already states the positive tools, which it does; judged an earned prohibition, flagged only for the record. Fix: none required. — Tranche: T1-mechanical-cut

Sections judged clean: Stack table, Information to collect (defaults explicit, required fields marked), Target directory structure incl. HAS_CLI variant, Step 5 LICENSE (deterministic, canonical-source pointer), Step 6 README overwrite guard (checkable condition: "already exists with real content"), Step 7 template pointer routes, After-scaffolding items 1–2. CLI push-down: template instantiation here is smaller and per-file; below the meaningful-win bar on its own (see cross-skill finding 3).

Est. T1 line savings: 12

## create-bun-typescript-project (229 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] LOW — Description (line 4) triple-duty problem: two trigger lists ("Use when the user wants to…" + "Run when the user says things like…") and a full stack recital ("package.json (Bun, no build step), strict ESM tsconfig.json, oxlint + oxfmt orchestrated by ultracite, bun test --sequential, bunfig.toml, and .gitignore") duplicating the body's Stack table (lines 33–43). Fix: one trigger list + one-line scope. — Tranche: T1-mechanical-cut
2. [duplication] MED — "No build step / Bun runs TypeScript directly" stated as a full sentence four times: intro (lines 21–23), Stack table row (line 35), description (line 4), After-scaffolding item 3 (line 228). This is a meaning repeated as sentences, not a leading word repeated as a token. Fix: state once in the intro; elsewhere let "no build step" appear only as the bare token if at all. Leading-word opportunity: the bare phrase "no-build" used as a token would carry the whole convention. — Tranche: T1-mechanical-cut
3. [sediment] MED — After-scaffolding item 2's aside "— e.g. `bun add zod` for schema validation; Zod 4's `z.toJSONSchema` works out of the box" (lines 226–227). Zod is not part of this stack, not mentioned anywhere else, and bears no relevance to scaffolding; a stray layer from some past session. Fix: cut the parenthetical, keep "`bun add <dep>`". — Tranche: T1-mechanical-cut
4. [no-op] LOW — "Follow these steps in order. Create all files, then run verification at the end." (line 124) and precondition "`.agents/`, `.claude/`, and `skills/` directories may or may not exist" (line 53) — same no-ops as siblings. Fix: delete. — Tranche: T1-mechanical-cut
5. [duplication] LOW — Conventions bullet "A few lint rules (e.g. no-useless-return) surface as errors that fix will not auto-resolve — fix those by hand" (lines 91–93) restated in Step 10 "Resolve any non-auto-fixable lint errors by hand" (line 200). Fix: keep the Conventions version (it names the example), make Step 10 a bare `bun run fix`. — Tranche: T1-mechanical-cut

Sections judged clean: Bun-centric boundary paragraph (lines 27–29 — an earned guardrail with a positive alternative, prevents misapplication to Node/pnpm repos), Conventions section (fragile-syntax rules that genuinely fail check/typecheck — exactly what Token Cuts says to keep), Preconditions otherwise, Info-to-collect + BUN_VERSION derivation, directory structures, Steps 2–8 template pointers (all five `templates/*.md` exist and route), Steps 9–11 ordering (install → fix → verify, the correct order), Step 11 completion criteria ("All three must succeed" + HAS_CLI conditional check — checkable and exhaustive).

Est. T1 line savings: 10

## setup-pypi-publish (110 lines)

Verdicts: Frontmatter: clean · TokenCuts: clean · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [sediment] HIGH — Step 2 generates `build: clean` (lines 43, 55) but the skill also says "Check whether a justfile exists. If it does not, create one" (line 36) with no instruction to define a `clean` recipe. A freshly created justfile gets a `build` recipe depending on an undefined `clean` — `just build` fails immediately. The dependency is an inherited assumption that the justfile came from create-python-package (whose template defines `clean`). Fix: either drop `: clean` when creating a fresh justfile, or state "if the justfile lacks a `clean` recipe, emit `build:` without the dependency (or add a minimal clean recipe)". — Tranche: T3-structure
2. [duplication] LOW — Step 4 Verify re-lists the raw build commands (`uv build` / `uv build --package pkg1` …, lines 103–107) that Step 2 just wrote into the justfile. Verifying with raw commands also fails to exercise the artifact the skill produced. Fix: verify with `just build` — one line, and it tests the recipe itself. — Tranche: T1-mechanical-cut
3. [premature completion] LOW — Step 4's criterion "Report which wheels and sdists were produced, or surface any errors" (line 110) checks build only; the publish path (auth wiring, `uvx uv-publish` resolvable) is never exercised or even smoke-checked (`uvx uv-publish --help`). Acceptable since real publishing shouldn't run during setup, but the done-bar could state that explicitly ("publish is verified only at first real release"). Fix: one clarifying line. — Tranche: T3-structure

Sections judged clean: frontmatter (single trigger list, no workflow recital, `allowed-tools` scoped tight), "Why uvx uv-publish" (a non-obvious rule earning its 3-line rationale), Step 1 preconditions (checkable, explicit stop condition), the `--package`-once-per-line Important note (fragile-syntax keeper), Step 3 auth options (credentials guardrail is a hard prohibition correctly paired with the two positive options). No templates dir needed — all inline blocks are ≤8 lines, below disclosure threshold. No push-down: work is branchy and user-facing, no pipeline meets thresholds.

Est. T1 line savings: 4

## setup-python-gh-ci (146 lines)

Verdicts: Frontmatter: flagged · TokenCuts: clean · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: flagged
Findings:

1. [duplication] LOW — Description (line 4): "set up CI, add GitHub Actions, create a CI workflow, configure continuous integration, or add automated testing" — at least three of these are synonyms renaming one branch. Fix: collapse to "set up GitHub Actions CI for a Python project (uv + just)" plus one distinct alternate phrasing. — Tranche: T1-mechanical-cut
2. [sediment] MED — Step 1's hardcoded "known list of active Python minor versions: 3.10, 3.11, 3.12, 3.13, 3.14" (line 45) is staleness by design — it drifts every October (3.15 lands 2026-10) and 3.10 is already EOL-adjacent. Fix: keep determinism but add a self-repair clause ("if the newest listed version is older than the current CPython release, extend the list and note it to the user"), or maintain the list as the one line to update with a dated comment. — Tranche: T3-structure
3. [sprawl] MED — Steps 2–3 are two deterministic detection pipelines totaling ~70 lines: SHA-pin resolution (command -v + gh auth status + 2 `gh api` calls + fallback branch, lines 52–85) and default-branch detection (git symbolic-ref → gh repo view → local heuristic → ask, lines 87–109). Each independently meets push-down thresholds (3+ tool calls, shell pipelines, deterministic with structured fallback). Since this skill runs in arbitrary target repos, push down into a skill-bundled script (e.g. `scripts/resolve-ci-facts.sh`) emitting `{setup_uv_ref, ref_is_sha_pinned, default_branch, default_branch_source}` JSON; the skill keeps only the confirm-with-user and template-substitution semantics. ~40-line reduction. — Tranche: T4-cli-pushdown
4. [premature completion] LOW — Step 6's completion criterion is existence-only: `ls` the two files then "Report to the user that CI is set up" (lines 141–146). Nothing checks the generated YAML parses or that placeholders were all substituted. Fix: add a checkable bar — grep for any remaining `<…>` placeholders and a YAML parse (`uv run python -c "import yaml,sys; yaml.safe_load(open(...))"`), or `actionlint` if present. — Tranche: T3-structure

Sections judged clean: What it creates, Preconditions (checkable, explicit stop), Step 1's confirm-with-user gates (lines 47–50), the two embedded rationales ("moved tag cannot silently change CI behavior", the `/commits/{ref}` tag-dereference note — both non-obvious and one-passage each, exactly what Clarity licenses), Step 4's conditional comment-block removal on the fallback path, Steps 4–5 template pointers (both `templates/*.md` exist and route), `allowed-tools` scoped to the commands actually used.

Est. T1 line savings: 2

## project-setup (63 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [sediment] HIGH — Install-state vs. body contradiction. The body claims "Ambient router… this router is their only ambient surface" (lines 9–13), and skill-conventions bucket 6 requires "exactly one ambient router skill (`normal`)" for an unlisted family — but `areg skill show project-setup` reports kind `invoke-only` (`modelInvocation: disabled`; it is absent from the ambient skill inventory). As installed, the entire 8-leaf family has zero ambient surface: the model can never discover any scaffolding skill from user language like "set up a new Python project". Either the router was never promoted (fix: `areg skill apply normal project-setup` — note areg currently reports `replacement-missing` advice on this skill, to be resolved through areg, not hand-edited frontmatter) or invoke-only is intentional and the body's "ambient" claims are stale sediment that must be rewritten. This is the misfire-risk category: a rich trigger description (line 4) that nothing ever loads. — Tranche: T2-trigger-surface
2. [duplication] MED — "Skill family" bulleted list (lines 20–27) and "Routes" table (lines 31–40) enumerate the same 8 leaves twice, each with a scope one-liner; the bullets are a strict subset of the table's scope contracts. Fix: delete the bulleted list, keep the table (it carries the dprint/graphite cross-references and boundaries); fold the "two kinds of one-shot work" framing into one intro sentence. Saves ~10 lines. — Tranche: T1-mechanical-cut
3. [duplication] LOW — Unlisted mechanics explained twice: intro "they carry no harness registration anywhere (no ambient description on Claude Code, Codex, or Pi, and no /skill typeahead entry)" (lines 9–12) vs. Routing bullet 3 "they do not appear in any harness typeahead (Claude Code /name, Codex $name, Pi /skill:name) and cannot be invoked by name" (lines 51–54). Fix: keep the Routing-section version (it sits beside the actionable "always enter them through this router"), cut the intro's parenthetical. — Tranche: T1-mechanical-cut

Sections judged clean: frontmatter description (correct shape for the family's ambient trigger surface — rich, one trigger per leaf-family branch, no workflow recital; its problem is finding 1, not its wording), Routing bullets 1–2 (dependency-order rule for multi-route requests; pointer + `areg skill find` fallback routes correctly — verified all 8 leaves exist, including setup-dprint/setup-dprint-gh-ci/setup-graphite), Boundary section (one-shot vs. day-to-day is a real distinction, prohibition paired with the positive alternative; "one-shot" is doing good leading-word work here).

Est. T1 line savings: 12

## Cross-skill findings (batch)

1. [duplication] MED — LICENSE step is verbatim-identical between create-python-package Step 5 (lines 117–124) and create-bun-typescript-project Step 6 (lines 149–157): same skip-on-`none` rule, same copyright-year/holder instruction, same choosealicense.com pointer. The README-overwrite guard is likewise near-verbatim between the two (package lines 127–129 / bun lines 159–162). The router declares leaves "self-contained for its own happy path", which licenses some duplication — but these two blocks are pure shared doctrine with no per-stack variation. Fix: a shared external reference (e.g. `skills/project-setup/references/common-scaffold-steps.md`) both leaves point at, or accept and record the self-containment trade-off explicitly. — Tranche: T3-structure
2. [duplication] LOW — Family-wide description pattern: all three create-* leaves carry the double trigger list ("Use when the user wants… Run when the user says things like…") plus a stack recital. Since the leaves are unlisted, their descriptions exist solely for the router and `areg skill find` — one trigger list and a one-line scope each is the right shape. Fix in one pass across the three. — Tranche: T2-trigger-surface
3. [sprawl] MED — The create-* trio shares one deterministic mechanical core: mkdir tree → instantiate `templates/*.md` with placeholder substitution → run toolchain verify. Per cli-push-down this is "a workflow repeated across skills" (the strongest push-down trigger), but the target cannot be an ns CLI — these skills execute inside freshly scaffolded external repos. Viable shape: a per-skill (or family-shared) bundled `scripts/instantiate.{sh,py}` that takes the variable map and writes all files, returning JSON, leaving each SKILL.md as collect → confirm → run script → verify. Evaluate against one-shot run frequency before investing; the current inline step lists are functional and templates are already properly disclosed. — Tranche: T4-cli-pushdown
4. [sediment] MED — Verify-sequence drift across the trio: create-bun has the correct install → fix → verify order; create-python-package has verify → format → verify (its finding 3); create-python-dev-cli has verify → format with no re-check after formatting (Step 9 `ruff format` runs after Step 8's success gate, then Step 10 `just check` — actually consistent, three steps where two suffice). Fix: converge all three on install → format/fix → single verify. — Tranche: T3-structure
5. [no-op] LOW — Two sentences duplicated verbatim across leaves and dead on arrival everywhere: "Follow these steps in order. Create all files, then run verification at the end." (×3) and "`.agents/`, `.claude/`, and `skills/` directories may or may not exist" (×2). Delete in one sweep. — Tranche: T1-mechanical-cut
6. [duplication] LOW — Each leaf's scope lives in two places: its own description and the router's Routes-table row (near-verbatim for create-python-package and create-bun). Accepted by the bucket-6 design (router carries triggers; leaf descriptions feed `areg skill find`), so not a defect — but any scope edit is now a two-place change. Record the pairing in the router's comment or keep the leaf description as the source the router paraphrases tersely. — Tranche: T2-trigger-surface
7. Leading-word opportunity, LOW — The family's completion bar is restated as sentences everywhere ("Both must succeed", "All three must succeed", "fix the issue before considering scaffolding complete", "passes `just check` on first run"). A single leading word — the scaffold goes **green** — could anchor the verify gate across all six skills in one token per site, converting a fuzzy "complete" into a binary observable. — Tranche: T1-mechanical-cut
8. setup-pypi-publish ↔ setup-python-gh-ci: checked for CI-boilerplate duplication — none found; they touch disjoint surfaces (justfile recipes + auth vs. `.github/` workflow files). Clean pair.

## Coverage

create-python-dev-cli — audited, 5 findings
create-python-package — audited, 5 findings
create-bun-typescript-project — audited, 5 findings
setup-pypi-publish — audited, 3 findings
setup-python-gh-ci — audited, 4 findings
project-setup — audited, 3 findings

---

# Batch 9 — TypeScript + CLI design

## ns-typescript (199 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean

Findings:

1. [duplication] HIGH — "Test lanes and shared-cache safety" (lines 137–159) near-verbatim duplicates `ts/AGENTS.md` "Test isolation hard gates" (lines 12–30): the five `NS_TS_BAN_SHARED_TEST_*` bans, the remediation preferences, the isolated-vs-integration distinction, "default `just` omits isolated tests", and the `ts/TESTING.md` pointer all live in both. `ts/AGENTS.md` also routes readers to this skill, so the detail is loaded twice on every ts/ edit. — Fix: pick one owner (ts/AGENTS.md is always-read for ts/ work; the skill is the model-invoked surface — ownership decision for maintainer, not unilateral) and reduce the other to a one-line pointer. — Tranche: T3-structure
2. [duplication] HIGH — Time seams stated at three sites: skill "Time seams" (line 132), the `NS_TS_BAN_RAW_PRODUCTION_TIMERS` hard-ban bullet (line 173), and `ts/AGENTS.md` "Time seams" (line 38), all naming the same seams (`Clock`, `TimerScheduler`, `systemClock`, `unrefTimerScheduler`, manual test helpers). — Fix: single source for the package-path inventory; the hard-ban bullet should carry only the ban id + a pointer. — Tranche: T3-structure
3. [duplication] HIGH — "Hard bans enforced by TypeScript style guard tests" (161–186) duplicates typescript-style: `NS_TS_BAN_AS_UNKNOWN_AS`, `NS_TS_BAN_IMPORT_ALIAS_FOR_FIRST_PARTY`, `NS_TS_BAN_EMPTY_INTERFACE_EXTENDS`, `NS_TS_BAN_IMPORTED_BINDING_LOCAL_ALIAS` all appear with full rule text in `skills/typescript-style/core-rules.md` (lines 52, 57, 90, 113) and `checklist.md`; the "Preferred fixes" list (179–186) restates core-rules.md:90–92 almost verbatim. — Fix: rule semantics live in typescript-style; ns-typescript keeps only guard ids, the guard-lane command, and the review-only status of `NS_TS_BAN_IMPORTED_BINDING_LOCAL_ALIAS` (ownership split to confirm with maintainer). — Tranche: T3-structure
4. [duplication] MED — Internal repetition inside "Optional properties under `exactOptionalPropertyTypes`" (67–118): two code examples of the identical conditional-spread idiom (72–77 and 86–91); "not a convenience escape hatch" said twice (103–104, 112); `ExplicitUndefined` guidance twice (98–104, 115–116); "omit via conditional spread" stated three times (69–70, 111, 117–118). The "Review guidance" bullet list largely restates the prose above it. — Fix: one example (fragile syntax, keep one), merge Review guidance into the rules it restates. — Tranche: T1-mechanical-cut
5. [duplication] MED — Compiler baseline lists all 19 tsconfig flags verbatim, duplicating `ts/tsconfig.json` (drift risk; change one place, must change the other). — Fix: keep only the flags the skill gives behavioral guidance about (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`, unused-locals/params) plus a pointer to `ts/tsconfig.json` as the contract. — Tranche: T1-mechanical-cut
6. [duplication] MED — "Encoded contracts over ambient bags" (121–128) opens by restating the portable rule that already lives in `core-rules.md:96` ("Encode contracts; do not rely on ambient bags… typed fields, parameters, gateway methods, or curated APIs"). — Fix: keep only the ns-specific extension-API rule and the `ctx.renderCapabilities` example; open with "Per the typescript-style ambient-bags rule:". — Tranche: T1-mechanical-cut
7. [duplication] LOW — Toolchain bullet "Default tests: Vitest 4 … specialized integration, isolated, and TypeScript style guard lanes are explicit commands" (20–21) overlaps both the Test lanes section and the closing validation-gates block. — Fix: cut the lane clause from the toolchain bullet. — Tranche: T1-mechanical-cut
8. [no-op] LOW — "The unused-local and unused-parameter flags are deliberately stricter than many WIP workflows." (50) is exposition; only "Prefer small, complete changes that leave no dead scaffolding" changes behavior. — Fix: delete the first sentence. — Tranche: T1-mechanical-cut
9. [negation] LOW — "Do not turn this into a blanket ban: … but do not widen …" (114–116) is a double-negation tangle. — Fix: phrase positively: "Option/input/override/compatibility bags may accept explicit `undefined`; permanent explicit-`undefined` uses `ExplicitUndefined<Reason, T>`." — Tranche: T1-mechanical-cut

Sections judged clean: frontmatter/description (trigger-rich, correct `normal` kind per ADR 0016 standards bucket); Import convention (crisp, reference pointer routes well with an explicit do-not-migrate condition); closing validation-gates block (checkable, exhaustive completion criterion — the strongest in the batch).

Est. T1 line savings: 22

## ns-typescript-style-tripwire (17 lines)

Verdicts: Frontmatter: clean · TokenCuts: clean · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean

Findings:

1. [duplication] LOW — H1 "Tripwire: ns TypeScript style" doesn't match the skill name `ns-typescript-style-tripwire` (skill-audit red flag: missing H1 matching skill identity). Cosmetic; identity is still unambiguous. — Fix: rename H1 to `ns-typescript-style-tripwire`. — Tranche: T2-trigger-surface

This is the model tiny trigger skill: invoke-only (overlay + `agents/openai.yaml`), one-line human-facing description, body routes to the authoritative `.ns/reviews/ns-typescript-style-tripwire/review.md` and the `ns reviews review run` command without restating a single review rule. The "do not duplicate or reinterpret from memory" prohibition is a hard guardrail correctly paired with its positive (use review.md as authoritative). The review.md itself carries explicit provenance + regeneration instructions for its deliberate merge of typescript-style and ns-typescript, so that duplication is managed, not sediment.

Est. T1 line savings: 0

## typescript-style (91 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean

Findings:

1. [duplication] MED — Frontmatter description is a topic inventory ("erasable syntax, Zod boundary schemas, function declarations…"), not a trigger: no "use when" clause at all, and it overlaps the Scope section and intro paragraph (same meaning at three sites: description, intro 21–26, Scope 34–40). As an ambient `normal` skill this is context load doing identity work the body already does. — Fix: rewrite description as triggers ("Use when writing, designing, or reviewing TypeScript…"), collapse intro/Scope overlap to one place. — Tranche: T2-trigger-surface
2. [duplication] MED — "One-paragraph version" (52–64) condenses `core-rules.md` while "How to apply this skill" step 1 mandates loading `core-rules.md` before changing code — the same meaning at two ranks of the ladder, and the paragraph will drift as core-rules evolves. — Fix: either declare it the no-load fast path and drop the mandatory step-1 load for trivial edits, or delete the paragraph and trust the pointer. — Tranche: T3-structure
3. [duplication] LOW — Project-precedence stated three times: intro ("Follow the local repository's runtime and public API constraints first", 25–26), step 1 ("check for project-local exceptions"), step 2 ("If the project has an established convention that conflicts… follow the project"). — Fix: keep step 2, cut the others. — Tranche: T1-mechanical-cut
4. [no-op] LOW — "The examples are motivating patterns, not dependencies on a particular codebase. Adapt names, import suffixes, formatter settings…" (28–30) is reassurance; the load-bearing part is only the Zod-default sentence. — Fix: keep the Zod sentence, delete the reassurance. — Tranche: T1-mechanical-cut
5. [duplication] MED — A "portable" guide whose `core-rules.md`/`checklist.md` embed ns guard identifiers (`NS_TS_BAN_*` at core-rules 52, 57, 90, 113) — repo enforcement mechanics inside the portable layer, mirrored again in ns-typescript (see cross-skill 1). — Fix: part of the cross-skill ownership split. — Tranche: T3-structure

Sections judged clean: Conditional loading table (exemplary progressive disclosure — situation-conditioned pointers, references/README as index); "How to apply" steps 3–5 (checkable completion criterion: "Run checklist.md before declaring the work done"); Core knowledge routing.

Est. T1 line savings: 8

## typescript-fake-driven-testing (117 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: clean

Findings:

1. [duplication] MED — Body line 8 ("Use for TypeScript testing architecture when code touches external systems such as CLIs, filesystems, HTTP APIs…") restates the frontmatter description's trigger — the skill-audit red flag "description repeats body content", inverted. — Fix: delete line 8; the reader has already triggered. — Tranche: T1-mechanical-cut
2. [duplication] MED — Anti-patterns section (109–117) restates rules already stated in-body: "Scripted mocks as the primary scenario fake" ↔ line 66; "Subprocess-shaped gateway interfaces in core logic" ↔ lines 39–42; "Parsing raw external wire formats outside real adapters" ↔ lines 15/42; "Full call-history assertions in scenario tests" ↔ line 74. — Fix: keep the anti-pattern list as the review checklist and cut the negative restatements from the earlier sections (or vice versa) — one home per meaning. — Tranche: T1-mechanical-cut
3. [sediment] MED — ns-specific naming history embedded in a generically-named, portable-sounding skill: "incumbent generic names win absent confusion (foundation's exec seam is `CommandExecApi`; the name `ExecGateway` is retired)" (line 13). Repo lore belongs in the ns overlay or `docs/conventions/consumer-gateways-and-command-shape.md`, which already documents the foundation exec seam. — Fix: move the parenthetical to the conventions doc; keep only the generic suffix rule here. — Tranche: T3-structure
4. [premature completion] MED — Vague completion criterion for the review branch: the description triggers on "reviewing TS code" but no exhaustiveness bar binds the flat reference ("every gateway/fake in the diff checked against Gateway style, Fake style, and Anti-patterns"). Demand can bind flat reference; here nothing does. — Fix: add one demand line, e.g. "When reviewing: every gateway, fake, and test file in the diff judged against each section here." — Tranche: T2-trigger-surface
5. [duplication] LOW — Core model bullet 2 (line 13) packs gateway definition + suffix naming + `Clock`/`TimerScheduler` category + incumbent-name rule into one 4-line bullet; the clock/timers-as-gateways point partially overlaps ns-typescript's Time seams (complementary — category doctrine here, ns paths there — so overlap is acceptable, but co-location within the bullet is poor). — Fix: split into gateway-definition and naming bullets. — Tranche: T1-mechanical-cut

Sections judged clean: Result unions incl. "Shape, not names" (fragile-syntax examples earning their keep; the "never add a dependency… solely to share these types" guardrail is paired with its positive); Test layers; Fake style constructor-state example.

Est. T1 line savings: 10

## ns-cli-design (193 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean

Findings:

1. [duplication] MED — Hard gate 8 vs "Raw-exit is a narrow exemption" section (172–179): near-verbatim repeat — "opts out of the envelope, `resultSchema`, and `--json-schema`", the TUI/streaming/passthrough whitelist, and "ordinary finite-result commands must use the Clinkr envelope" all appear twice. — Fix: gate 8 becomes one line + pointer; the section keeps only what the gate lacks (the exit-2 mapping rule for genuinely raw commands). — Tranche: T1-mechanical-cut
2. [duplication] MED — Additive-change rule at three sites: gate 4 tail ("the machine envelope may not, except additively"), line 87–88 ("Machine formats, flags, subcommands, output formats, and config are long-lived interfaces; change them additively"), and line 169–170 (the same sentence again, verbatim). — Fix: one authoritative statement; delete the other two. — Tranche: T1-mechanical-cut
3. [duplication] MED — Hard gate 7 vs "Naming and exec placement" bullet (164–168): the hidden-`exec`-subgroup rule stated twice; the second adds only the naming detail (plain noun/verb phrases) and the hidden-affects-help-only clarification. — Fix: keep the mechanics in the gate, keep only the naming additions in the section. — Tranche: T1-mechanical-cut
4. [duplication] LOW — Gate 3 (stdout/stderr split) restated as the first Streams bullet (75–76). — Fix: cut the bullet. — Tranche: T1-mechanical-cut
5. [sediment] LOW — Objective-lifecycle-coupled pointers: provenance cites `.ns/objectives/agent-cli-design-discipline/references/clinkr-agent-era-gap-audit.md` (27) and "Before you ship" mandates `objective-update` under `agent-cli-design-discipline` (192–193); both go stale the day that objective closes. — Fix: keep provenance in ADRs/survey doc; make the objective-update line conditional on the objective still being open, or move it out of the skill. — Tranche: T3-structure
6. [duplication] LOW — Frontmatter `references` lists only `clinkr-api-map` and `checklist` while the body routes to five reference files (`human-tier.md`, `agent-exec-tier.md`, `danger-tiers.md` unlisted) — the metadata and the routing table disagree. — Fix: reconcile the frontmatter list with `references/`. — Tranche: T2-trigger-surface
7. [duplication] LOW — Invoke-only skill carrying a full trigger-list description ("Invoke when designing, authoring, or reviewing… Covers hard gates, the human tier…"). Repo convention explicitly permits keeping a real description on invoke-only skills, and Claude Code/Pi strip it — but Codex keeps it ambient (harness caveat), so the "Covers…" identity half is pure context load there. — Fix: keep the trigger half, trim the "Covers…" table-of-contents half. — Tranche: T2-trigger-surface

Sections judged clean: completion criterion is the batch's best-in-class ("done only when every item in `references/checklist.md` passes" — checkable and exhaustive); Danger tiers (crisp `--yes` ≠ `--force` distinction, conformance examples explicitly labeled exception-vs-pattern); Output volume (ADR 0012) and "Design around the framework, don't pretend" (hard guardrails correctly paired with the positive "implement it command-locally and say so"); the tier references route conditionally and cleanly.

Est. T1 line savings: 14

## cli-push-down (103 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean

Findings:

1. [duplication] LOW — "Collapse repeated command sequences into one tested call" (Good targets) vs "Bundles data currently gathered by several `gh`, git, filesystem, or API calls" (Size threshold) — one meaning across two lists. — Fix: keep it in Size threshold only. — Tranche: T1-mechanical-cut
2. [duplication] LOW — "Prefer one cohesive workflow command over staged micro-commands. The best command returns everything needed for the agent's next decision." (43–44) is the positive restatement of two Avoid bullets ("Returns too little, forcing follow-up calls", "Splits one workflow into many tiny commands"). Per the negation cure, keep the positive and drop the two negative bullets. — Tranche: T1-mechanical-cut
3. [no-op] LOW — "Output should be stable enough for agents/tests. No prose-only output." (68) — first clause is what "Emit JSON to stdout" plus the field contract already imply. — Fix: delete the sentence. — Tranche: T1-mechanical-cut
4. [duplication] HIGH — CLI Contract mandates a top-level `success: bool` envelope (61–78) that directly conflicts with the repo's own Clinkr envelope (ns-cli-design hard gates 4–5, ADR 0011: discriminated union keyed on `status`, camelCase, kebab-case error values). In this repo, every push-down target is an ns CLI, so following this section verbatim produces a hard-gate violation. Step 4 already says "Implement in project CLI framework" but the contract section overrides it with an absolute shape. — Fix: make the contract explicitly a fallback: "Use the project's CLI framework envelope if one exists (in ns: the Clinkr envelope per ns-cli-design); otherwise use this shape." — Tranche: T2-trigger-surface
5. [duplication] MED — Refactor Workflow step 5 "Mock APIs/subprocess/filesystem" contradicts typescript-fake-driven-testing (fakes as the primary test double; module mocks an anti-pattern) and the ns shared-lane `vi.mock` hard ban. — Fix: reword to "Test happy path, failures, edge cases against fake gateways for APIs/subprocess/filesystem (per the project's testing skill)." — Tranche: T2-trigger-surface

Sections judged clean: Hard Ban: Markdown Parsing (a prohibition that earns its place — hard guardrail paired with two positive alternatives); Prompt After Push-Down; Review Checklist; the goal line ("Meaning stays in agent; mechanics move to CLI") is a strong compressed leading formulation; measurable completion criterion ("target 50%+ reduction for that block").

Est. T1 line savings: 6

## Cross-skill findings (batch)

1. [duplication] HIGH — Style-guard hard bans have three living homes: `typescript-style/core-rules.md` + `checklist.md` (rule text with `NS_TS_BAN_*` ids), `ns-typescript` "Hard bans" section (rule text + ids + preferred-fixes list), and `.ns/reviews/ns-typescript-style-tripwire/review.md`. The review.md copy is exempt — it carries explicit provenance and regeneration instructions, so it is a managed derivative, not sediment. The other two are unmanaged duplication: change a ban's semantics and you must edit two skills. — Fix: split ownership — rule semantics in typescript-style, enforcement mechanics (guard-lane command, ban ids as pointers, review-only status of `NS_TS_BAN_IMPORTED_BINDING_LOCAL_ALIAS`) in ns-typescript. Ownership call belongs to the maintainer, especially since typescript-style is upstream-melded content. — Tranche: T3-structure
2. [duplication] HIGH — `ns-typescript` vs `ts/AGENTS.md`: the five shared-lane test bans, the time-seams inventory, the tsgo-only typecheck rule, and the autofixer guidance are all stated in both, and `ts/AGENTS.md` additionally instructs agents to read ns-typescript — so every ts/ edit loads the same material twice. Given ts/AGENTS.md is unconditionally read for ts/ work and the skill is the ambient-routable surface, one of them should hold the detail and the other a pointer; which side owns it is a maintainer decision (skill-as-owner keeps AGENTS.md lean; AGENTS.md-as-owner guarantees non-skill harnesses see it). — Tranche: T3-structure
3. [duplication] HIGH — Conflicting machine-output doctrines inside one repo's skill set: cli-push-down's `success: bool` contract vs ns-cli-design/ADR 0011's `status`-keyed Clinkr envelope (finding cli-push-down#4). The same `success`-envelope wording is also embedded in skill-audit's "CLI Push-Down Audit" section ("returning JSON with `success`, structured `error`"), propagating the conflict into a third skill. — Fix: cli-push-down defers to the project framework envelope; skill-audit routes instead of restating (see 4). — Tranche: T2-trigger-surface
4. [duplication] MED — skill-audit (outside this batch, flagged for its owner) both lists `cli-push-down` under "Load With" and restates its content in the "CLI Push-Down Audit" section: the 20+ lines / 3+ calls thresholds, the one-obvious-command and under-30-line exclusions, the markdown-parsing exclusion, and the JSON contract. Two sources of truth for push-down criteria. — Fix: skill-audit keeps only "load cli-push-down and apply its thresholds"; the criteria live in cli-push-down. — Tranche: T3-structure
5. [duplication] MED — cli-push-down step 5's mock-first testing instruction vs typescript-fake-driven-testing's fake-first doctrine and the ns `NS_TS_BAN_SHARED_TEST_MODULE_STATE` ban (finding cli-push-down#5): an agent following the push-down workflow literally writes tests the style guard rejects. — Tranche: T2-trigger-surface
6. [duplication] MED — Gateway-shape doctrine lives in both typescript-fake-driven-testing ("capability-shaped, not mechanism-shaped", raw-stdout anti-pattern) and `docs/conventions/consumer-gateways-and-command-shape.md` ("Domain-first gateway shape": do not promote raw substrate primitives), and the skill additionally embeds the ns-specific `CommandExecApi`/`ExecGateway`-retired naming fact that the conventions doc's territory (foundation exec seam) already covers. — Fix: generic doctrine stays in the skill; ns naming history and tiering stay in the doc; the skill drops the repo parenthetical. — Tranche: T3-structure
7. [duplication] LOW — ns-typescript and typescript-style overlap on trigger surface: ns-typescript's description claims "the `as unknown as` hard ban" while typescript-style's core-rules owns the same rule — harmless double-fire risk, resolves itself if cross-skill finding 1's ownership split lands. — Tranche: T2-trigger-surface
8. Explicitly judged clean: ns-typescript "Time seams" vs typescript-fake-driven-testing's clocks/timers-as-gateways — complementary altitudes (category doctrine vs ns package paths), not duplication; ns-typescript-style-tripwire vs ns-typescript — the tripwire points instead of restating, exactly the intended sibling shape; ts/AGENTS.md "CLI work" vs ns-cli-design — the two ambient hard gates in AGENTS.md are a deliberate tripwire that routes to the skill for the rest, an acceptable managed overlap (though gate wording should be kept byte-identical or cross-referenced to prevent drift).

## Coverage

ns-typescript — audited, 9 findings
ns-typescript-style-tripwire — audited, 1 finding
typescript-style — audited, 5 findings
typescript-fake-driven-testing — audited, 5 findings
ns-cli-design — audited, 7 findings
cli-push-down — audited, 5 findings

---

# Batch 10 — Docs / retro / dprint setup

## setup-dprint (174 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: flagged · CLIPushDown: clean
Findings:

1. [duplication] MED — The "does not add CI / run setup-dprint-gh-ci" routing is stated 3×: frontmatter description ("Does NOT add GitHub Actions CI -- use setup-dprint-gh-ci"), intro lines 20–21 ("This skill does NOT add a GitHub Actions workflow. After running this skill, run `setup-dprint-gh-ci`…"), and the whole "Next steps" section (lines 171–174). — Fix: keep the description clause (needed for router/`areg skill find` since this is an unlisted project-setup leaf) and the "Next steps" section; delete intro lines 20–21. — Tranche: T1-mechanical-cut
2. [negation] LOW — Description and intro steer by prohibition ("Does NOT add GitHub Actions CI"). It is a boundary guardrail and is paired with the positive route, so it earns its place, but the intro repetition re-names the elephant. — Fix: covered by finding 1; optionally rephrase description as "Local setup only; CI workflow lives in setup-dprint-gh-ci." — Tranche: T2-trigger-surface
3. [duplication] MED — Step 3's inline `dprint.json` template (lines 49–75) is a split-brain config template: structure inline, plugin URLs in `references/plugin-catalog.md`, and the catalog *re-duplicates* the `"markdown"/"toml": {"lineWidth": 100}` blocks the inline template already carries. Two sources of truth for the default config. Inline config templates belong in assets. — Fix: move the complete template to `skills/setup-dprint/assets/dprint.json` (URLs included); Step 3 becomes "copy `assets/dprint.json`"; keep `plugin-catalog.md` only for the notes/rationale or fold it into the asset as comments-adjacent doc. — Tranche: T3-structure
4. [duplication] LOW — Line 75 "Replace the plugin URLs with the actual URLs from `references/plugin-catalog.md`" restates line 45 "Load `references/plugin-catalog.md` for plugin URLs and default config blocks." — Fix: delete line 75 (subsumed by finding 3 anyway). — Tranche: T1-mechanical-cut
5. [negation] LOW — Step 7 line 168 "Do NOT overwrite existing config values -- only add what's missing" repeats what steps 7.3–7.4 already state positively ("Check which plugins are missing… add"). — Fix: delete the sentence; the positive additive procedure already encodes it. — Tranche: T1-mechanical-cut
6. [no-op] LOW — Step 5 Makefile branch ("Add `dprint check` to a `format-check` or `lint` target") is vague relative to the justfile branch's exact recipes; it leaves the agent doing what it would do by default. — Fix: give the same exact-recipe treatment as the justfile branch or state the target-selection rule concretely. — Tranche: T3-structure

Sections judged clean: frontmatter name/H1/category/allowed-tools (unlisted leaf with real human-readable description — conforms to skill-conventions bucket 6); Steps 1, 2, 4, 6 (checkable completion criteria; Step 6 `dprint fmt` + `dprint check` is a sharp verification gate); Step 7 flow (explicit branch target from Step 2, verification at the end); CLI push-down — one-off setup work with semantic build-system detection, no candidate.
Est. T1 line savings: 8

## setup-dprint-gh-ci (91 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: flagged · CLIPushDown: clean
Findings:

1. [duplication] MED — The "requires dprint.json / run setup-dprint first" precondition is stated 3×: description, intro lines 20–21, and Step 1 (lines 23–33). Step 1 is the operative check. — Fix: keep description clause + Step 1; delete intro lines 20–21 ("This skill only sets up CI. It assumes…"). — Tranche: T1-mechanical-cut
2. [duplication] LOW — Intro lines 17–18 ("runs `dprint check` on pushes to the default branch and on non-draft pull requests") restates the description verbatim, and Step 5's "Key details" bullets (lines 75–80) restate the same triggers a third time plus properties readable from the template itself. — Fix: cut intro sentence; trim "Key details" to the one actionable fact (`dprint/check@v2.2`, no manual install) or delete — the agent copies `references/dprint-ci.yml` verbatim and the branch substitution is already specified above. — Tranche: T1-mechanical-cut
3. [sprawl] LOW — `references/dprint-ci.yml` is a copy-verbatim artifact, not on-demand documentation; the skill tiers distinguish `references/` (read) from `assets/` (copy). — Fix: move to `assets/dprint-ci.yml` and update the Step 5 pointer. — Tranche: T3-structure

Sections judged clean: frontmatter (real description on an unlisted leaf, name/H1 match, allowed-tools scoped to the exact commands used); Step 1 including its one-line rationale ("keeping that in one skill keeps the config defaults consistent" — earns its line per the non-obvious-rule rule); Steps 2–4 (explicit stop/ask boundaries, no silent clobber); Step 6 verification (checkable completion criterion). CLI push-down: Step 3's three-command default-branch detection meets the 3-calls threshold numerically but is an under-30-line one-off in a rarely-run setup skill — rejected as a tiny wrapper.
Est. T1 line savings: 7

## readme-driven-development (24 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] LOW — Lineage paragraph (line 11) restates the Grill mechanics that Loop step 2 already carries ("one question at a time, recommended answers, facts looked up in the codebase" = "one question at a time, with a recommended answer… Explore the codebase instead of asking"). Provenance is convention-mandated, but the behavioral summary inside it is a second source of truth. — Fix: shrink to pure provenance, ideally as an HTML comment matching skill-audit's own lineage pattern: `<!-- Lineage: Grill step melded from upstream grilling (mattpocock/skills); pin + registry: docs/agents/matt-pocock-skills.md -->`. — Tranche: T1-mechanical-cut

Sections judged clean: frontmatter (user-invoked, one-line human description, no trigger-list waste; name/H1 match); intro (line 9 — the "as if it already exists" framing is a live steering rule, not exposition); Loop steps 1–4 (each ends on a checkable criterion; step 2's bar "no contradictions, no silently invented commitments" is sharp); Rules ("Coherence, not completeness, is the bar" is an explicitly checkable, deliberately non-exhaustive completion criterion — exemplary; "Execution state lives elsewhere" is a clean positive boundary). No disclosure or push-down candidates at 24 lines.
Est. T1 line savings: 2

## changelog-update (172 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: flagged · CLIPushDown: flagged
Findings:

1. [sediment] HIGH — Frontmatter is the retired explicit-only experiment that `docs/conventions/skill-conventions.md` explicitly deprecates: `description: "Command: changelog-update"` stub plus the commented-out real description (lines 4–6). Conventions: "current `areg skill apply` does not rewrite descriptions… a skill made `invoke-only` or `command-backed` can keep its real description" — the harness overlays already remove it from ambient context, so the stub saves nothing and breaks human/`areg skill find` discoverability. — Fix: restore the real description as the `description` value, delete the comment block, confirm kind with `areg skill show changelog-update`. — Tranche: T2-trigger-surface
2. [duplication] MED — "When to use" section (lines 22–28) is a five-bullet trigger list that duplicates the (commented-out) description's triggers, on a user-invoked skill where triggers are inert at run time — the human already invoked it. — Fix: delete the section once the description is restored (finding 1). — Tranche: T1-mechanical-cut
3. [duplication] MED — "Entry format" section (lines 152–173) duplicates `references/changelog-format.md` §Entry Format almost line for line (unreleased-with-hash example, released-stripped example). Two sources of truth for the entry contract. — Fix: keep only the "Writing guidelines" bullets in SKILL.md (they steer composition, needed every run) and point to the reference for format; delete the duplicated examples. — Tranche: T1-mechanical-cut
4. [duplication] MED — Phase 5 "Category order" list (lines 131–138) and rule 4 ("Create category headers only if they have new entries") duplicate `references/changelog-format.md` §Category Order including "Only include category headers that have entries." — Fix: replace with one pointer line ("category order and header rules: `references/changelog-format.md`"). — Tranche: T1-mechanical-cut
5. [duplication] LOW — Lines 18–19 "Uses pure git commands -- no external tools or language-specific dependencies" is repeated verbatim at the top of `references/commit-fetching.md`. — Fix: keep it in SKILL.md (it is a live tool-selection boundary); cut the reference's copy. — Tranche: T1-mechanical-cut
6. [sediment] LOW — "When a release is cut later, the hashes are stripped" + example (lines 160–164) describes a release-cutting branch this skill never executes; it already lives in the format reference. — Fix: delete with finding 3. — Tranche: T1-mechanical-cut
7. [duplication] MED (cross-file, T4-relevant) — Phase 2 delegates to `references/commit-fetching.md`: marker regex parsing, tag fallback, base verification, `git log --first-parent`, then a per-commit loop of two `git show` calls plus PR-number extraction — loops over commits, 3+ tool calls, deterministic parsing. Textbook push-down candidate: one command emitting JSON `{base, head, commits: [{hash, subject, body, files_changed, pr_number}]}` with `success`/`error`, collapsing Phase 2 and most of `commit-fetching.md` (~110 reference lines). Tension to decide first: the skill's stated identity is "pure git, no external tools" — push-down into an ns CLI breaks that portability claim, so this is accept-only-if the skill is ns-scoped; if portability is the product decision, record the rejection. — Fix: product decision, then either `ns changelog exec collect-commits` (or equivalent) or an explicit rejection note. — Tranche: T4-cli-pushdown
8. [sediment] LOW — Frontmatter `references:` key (lines 7–10) is not a documented frontmatter field in skill-conventions and no harness consumes it; the body already routes to all three files. — Fix: delete the key, or confirm a harness actually reads it. — Tranche: T1-mechanical-cut

Sections judged clean: Phase 1 (explicit stop rule, checkable); Phase 2 stop condition; Phase 3 (routes cleanly to `commit-categorization.md`); Phase 4 proposal template (inline is correct — used every run; the "CRITICAL: Do NOT edit yet" prohibition is a hard guardrail paired with the positive wait-for-approval gate, an earned negation); Phase 5 update rules 1–3, 5 and report block (checkable completion criteria throughout).
Est. T1 line savings: 30

## docs-retro (103 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — Description on a user-invoked (`disable-model-invocation: true`) skill carries a full workflow summary plus a trigger list ("inventory what had to be discovered, filter through the cost/benefit rubric (tokens, drift, recomputability, co-location)… Use for a 'docs retro', 'what docs would have made this faster'…"). Per writing-great-skills, a user-invoked description is a one-line human summary with trigger lists stripped; the rubric enumeration duplicates the body's "The rubric" section, and the length is paid ambiently on Codex, which cannot go zero-ambient. — Fix: cut to one line, e.g. "Documentation retrospective on the current session: turn discovery friction into the minimum set of doc/comment changes (default verdict: drop)." — Tranche: T2-trigger-surface
2. [negation] LOW — "Standalone skill; not part of the retros family." (line 16) defines the skill by what it is not and names the thing to avoid. — Fix: cut, or phrase the boundary positively ("Session-scoped; for branch-level evidence retros use branch-retro."). — Tranche: T1-mechanical-cut

Sections judged clean: intro (the "default verdict is drop" framing is a strong, live prior — keep); The rubric gates 1–4 (each is a hard, checkable gate; the fix ladder in gate 4 is a crisp ordered preference); Procedure 1–6 ("list *every* fact" is an exhaustive inventory bound; step 6's Written/Dropped/What-already-worked report is a checkable, exhaustive completion criterion — the "Dropped is the more important half" line earns its rationale); Kill-rule examples (each prevents a likely misclassification — pass the keep-examples test); Boundaries (explicit mutation and vendored-skill limits, sign-off gate). ProgDisclosure: 103 lines, everything is every-run reference — nothing to push down. CLIPushDown: inventory is semantic transcript reading — no candidate.
Est. T1 line savings: 3

## branch-retro (172 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — Description is written as a model-invoked trigger ("Use when the user asks for a branch/session retrospective…") on a user-invoked skill, and the body's "When to use" section (lines 24–28) restates the same triggers a second time. Inert on Claude Code/Pi, paid ambiently on Codex. — Fix: shrink description to a one-line human summary; delete the first paragraph of "When to use", keeping only the implement-recommendations gate (lines 29–31), which is a live rule. — Tranche: T2-trigger-surface
2. [sediment] MED — "How Retro is invoked" (lines 32–37): "The standalone `retro` command and the old skill-local `retro-run` source runner are retired" is migration-era history; the section's first sentence (the two `ns retro exec` commands) duplicates the Evidence collection section, which shows both commands with full flags. — Fix: delete the whole section. — Tranche: T1-mechanical-cut
3. [duplication] LOW — "Default mode is read-only" appears 3×: description ("without editing files unless requested"), intro line 22, and the Mutation boundary section. — Fix: Mutation boundary is the single source of truth; cut the intro clause (the description clause survives finding 1's rewrite as at most three words). — Tranche: T1-mechanical-cut
4. [no-op] LOW — Preflight step 1 "Verify `command -v ns` succeeds in an ns checkout with the Retro extension available" — the second half is not checkable by the stated command ("with the Retro extension available" has no probe); the collect-evidence error envelope in the next section already catches it. — Fix: reduce to "Verify `command -v ns` succeeds" or name the actual probe. — Tranche: T1-mechanical-cut
5. [duplication] LOW (T4 note) — Preflight steps 2–3 spend three tool calls deriving `--repo`/`--branch` that the CLI could default from cwd/HEAD, and step 4's session-id charset rules are validation the CLI could own (or the flag could be optional with a generated default). Meets the 3-calls threshold but is small; flag for the next `ns retro` CLI iteration rather than a dedicated change. — Fix: teach `collect-evidence` to default repo/branch and generate the payload session id; Preflight collapses to the stop conditions. — Tranche: T4-cli-pushdown

Sections judged clean: frontmatter allowed-tools (tight, matches the commands used) and the PUBLIC SKILL comment (convention-mandated, and the body honors it — CLI operations only); Evidence collection (exact command, explicit error/stop rule on the JSON envelope, "targeted reads only" is an earned guardrail paired with the positive `read-evidence-detail` procedure); Interpretation rules (the six-kind table is live flat reference that prevents over-claiming — hedging language is deliberate, not a no-op); Recommendation rules (dense but every bullet changes behavior vs. default; see cross-skill finding 2 for the overlap with docs-retro); Report template (checkable completion criterion); Mutation boundary (positive routing to implementation workflows). CLIPushDown otherwise exemplary — this skill is the model of evidence-gathering already pushed down.
Est. T1 line savings: 14

## pi-grill-with-docs-ui (54 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — `status_request` handling is specified twice: line 19 ("do not treat it as an answer. Give the compact status report, include the `Documentation updates:` line described below, then re-ask the same pending question") and the "Docs-aware status checkpoints" section (lines 50–54) restating don't-count-as-answer, the report fields, the `Documentation updates:` line, and re-ask-the-exact-same-question. — Fix: line 19 becomes a pure pointer ("If `grill_ask` reports `status_request`, follow Docs-aware status checkpoints below"); the section stays the single source of truth. — Tranche: T1-mechanical-cut
2. [no-op] LOW/Clarity — Line 15 keeps the upstream user-voice verbatim: "Interview **me** relentlessly… until **we** reach shared understanding" inside a skill body addressed to the agent, where the interviewee is the user. The pronouns invite a mis-read in the fallback-prompt context this skill exists for. — Fix: re-voice to the agent ("Interview the user relentlessly…"); keep *relentlessly* — it is the load-bearing leading word. — Tranche: T1-mechanical-cut
3. [duplication] LOW — Lineage paragraph (line 13) is visible body prose; skill-audit's own pattern is an HTML lineage comment. Content is convention-mandated (melded surface), placement costs invocation tokens as instruction-shaped text. — Fix: convert to an HTML comment, preserving the "semantically merge, don't copy" instruction. — Tranche: T1-mechanical-cut

Sections judged clean: frontmatter (internal backend skill; description states identity and the extension seam — correct for a user-invoked internal skill); self-containment sentence (line 11 — this is the documented product reason the sibling duplication below is sanctioned; keep); `grill_ask` protocol paragraphs 17 and 21 (exact option/field contract, fallback path — live every run); Bounded docs-first preflight (ordered, bounded, with a sharp facts-vs-decisions rule; the validation-scope carve-out is an earned guardrail paired with positive recording guidance); During the session (glossary challenge, CONTEXT.md-stays-a-glossary rule, three-condition ADR gate — each checkable); leading words *relentlessly* and *lazily* ("Create documentation lazily") are working. No disclosure needed at 54 lines; no push-down surface.
Est. T1 line savings: 4

## Cross-skill findings (batch)

1. [duplication] MED — setup-dprint ↔ setup-dprint-gh-ci restate each other's boundary at three sites per skill (description, body intro, Next steps/Step 1). The pairing itself is good granularity (distinct one-shot leaves); the restatement is the waste. — Fix: one routing site per skill each way: setup-dprint's "Next steps" section + description clause; setup-dprint-gh-ci's Step 1 precondition + description clause. Body intros deleted (counted in per-skill T1 savings). — Tranche: T1-mechanical-cut
2. [duplication] MED — docs-retro's rubric (drift risk, source-of-truth pointing, standing-context cost, prefer code over prose) and branch-retro's "Recommendation rules" (drift risk as first-class cost, state the source of truth, prefer executable/tested affordances over prose, discovery-path requirement for docs) carry the same doc-economics meaning in two skills, independently worded — a two-place edit whenever the doc-cost philosophy changes. docs-retro declares itself "not part of the retros family," so neither can invoke the other (both user-invoked). — Fix: extract the shared doc-economics rules to an external reference (e.g. `docs/conventions/` or a shared skill reference file) both point at, keeping only skill-specific application inline; or explicitly record that the two are intended to diverge. — Tranche: T3-structure
3. [duplication] MED (sanctioned — record, don't cut) — pi-grill-with-docs-ui lines 15, 17, 21, 32 (first two sentences), and 34 are verbatim copies of pi-grill-ui lines 15, 17, 19/21, 23, and 25 (interview framing, `grill_ask` option contract, `ui_unavailable` fallback, facts-vs-decisions rule, validation-scope carve-out). Sanctioned by the stated self-containment requirement (Pi fallback prompts), but it is a two-place edit for any grill_ask protocol change, and the two files' status_request wording has already drifted (pi-grill-ui inlines the field list; pi-grill-with-docs-ui splits it into a section). — Fix: no cut; verify both files are listed against each other in the melded-surfaces registry (`docs/agents/matt-pocock-skills.md`) so protocol edits are propagated deliberately, and apply finding-2's re-voicing ("Interview me") to both files in the same pass. — Tranche: T3-structure
4. [duplication] LOW — setup-dprint's inline `dprint.json` template vs `references/plugin-catalog.md` default-config blocks (single-skill split-brain, logged as setup-dprint finding 3; noted here because the fix — an `assets/` template — should match setup-dprint-gh-ci's copy-a-template pattern so the two siblings use one idiom). — Tranche: T3-structure
5. [sediment] LOW — Retro/changelog frontmatter styles have diverged across the batch: changelog-update uses the retired `Command:` stub, branch-retro and docs-retro carry model-style trigger descriptions on user-invoked skills, readme-driven-development has the correct one-line form. One convention (real, one-line, human-readable description; kind managed by `areg`) applied across all four in one T2 pass. — Tranche: T2-trigger-surface

## Coverage

setup-dprint — audited, 6 findings
setup-dprint-gh-ci — audited, 3 findings
readme-driven-development — audited, 1 finding
changelog-update — audited, 8 findings
docs-retro — audited, 2 findings
branch-retro — audited, 5 findings
pi-grill-with-docs-ui — audited, 3 findings
Cross-skill — 5 findings

---

# Batch 11 — Review / analysis / grill

## review-dry-but-not-too-dry (27 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — Lines 9 and 11 state the same pointer twice: "Use `.ns/reviews/dry-but-not-too-dry/review.md` as the authoritative review definition" then "First read `.ns/reviews/dry-but-not-too-dry/review.md`, then apply that review definition exactly". One context pointer, two sentences. — Fix: collapse to one sentence: "Read `.ns/reviews/dry-but-not-too-dry/review.md` and apply it exactly to the supplied diff or current branch, in this session, read-only, findings grounded in the diff." — Tranche: T1-mechanical-cut
2. [negation] LOW — Line 9: "Do not duplicate or reinterpret the review rules from memory" names the failure; the positive ("apply that review definition exactly") already exists on line 11. — Fix: delete the negation sentence; the positive survives in the collapsed sentence from finding 1. — Tranche: T1-mechanical-cut
3. [sediment] MED — Line 19: "In Pi-hosted sessions, use this skill's same review instructions or the same ns command face above; no separate reviews runner alias is required." A changelog note about an alias that no longer exists; changes no behavior (no-op under the test). — Fix: delete the line. — Tranche: T1-mechanical-cut
4. [duplication] MED — Entire body (lines 9–27) is verbatim scaffolding shared with 5 other skills (see Cross-skill finding 1); the record-findings/publish-findings block (21–27) is a conditional branch only some runs reach. — Fix: per cross-skill finding 1 — single-source the scaffolding. — Tranche: T3-structure
   Est. T1 line savings: 4

## review-improve-codebase-architecture (27 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — Same double-pointer as review-dry-but-not-too-dry (lines 9/11). — Fix: same one-sentence collapse. — Tranche: T1-mechanical-cut
2. [negation] LOW — Line 9 "Do not duplicate or reinterpret…" — Fix: delete; positive kept. — Tranche: T1-mechanical-cut
3. [sediment] MED — Line 19 Pi-alias changelog note. — Fix: delete. — Tranche: T1-mechanical-cut
4. [duplication] MED — Body is the shared 6-way scaffolding (Cross-skill finding 1). — Fix: single-source. — Tranche: T3-structure
   Est. T1 line savings: 4

## review-thermonuclear-review (27 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — Same double-pointer, lines 9/11. — Fix: one-sentence collapse. — Tranche: T1-mechanical-cut
2. [negation] LOW — Line 9 "Do not duplicate or reinterpret…" — Fix: delete. — Tranche: T1-mechanical-cut
3. [sediment] MED — Line 19 Pi-alias note. — Fix: delete. — Tranche: T1-mechanical-cut
4. [duplication] MED — Shared 6-way scaffolding (Cross-skill finding 1). — Fix: single-source. — Tranche: T3-structure
   Est. T1 line savings: 4

## reinvented-abstractions-tripwire (27 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — The tripwire is supposed to be the tiniest trigger surface in the family, but its body is byte-identical to the deep-review scaffolding (same double-pointer lines 9/11, same automation block, same record/publish block). It duplicates full review-skill body content instead of being a minimal pointer. — Fix: reduce to frontmatter + H1 + one pointer sentence; automation/recording lines come from the shared scaffolding source (Cross-skill finding 1). — Tranche: T3-structure
2. [negation] LOW — Line 9 "Do not duplicate or reinterpret…" — Fix: delete. — Tranche: T1-mechanical-cut
3. [sediment] MED — Line 19 Pi-alias note. — Fix: delete. — Tranche: T1-mechanical-cut
4. [premature completion] LOW — SKILL.md itself carries no completion criterion (e.g. "every changed file assessed against the tripwire"); it fully defers to `.ns/reviews/reinvented-abstractions-tripwire/review.md`, which does carry the mandate. Acceptable for a pointer skill, but the pointer sentence could carry the exhaustiveness demand in five words ("to every changed file"). — Fix: fold "to every changed file in the diff" into the collapsed pointer sentence. — Tranche: T2-trigger-surface
   Est. T1 line savings: 4

## architecture-topology-report (214 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: flagged · CLIPushDown: clean
Findings:

1. [duplication] MED — Description (frontmatter, lines 4–11) repeats body content: "For the no-target case the `scripts/topology` launcher renders the whole report instantly with no agent in the loop; reach for the agent only to score against a named target" restates the Instant-path section. Description-repeats-body is a named red flag, and Codex keeps this description ambient even for invoke-only skills. — Fix: cut the final description sentence; keep identity + triggers only. — Tranche: T2-trigger-surface
2. [duplication] MED — Raw-mode dispatch ("no target → run the launcher, don't author a spec") is stated four times: description, Instant-path section (lines 32–51), step 1 closing paragraph (lines 83–88), and step 3 (lines 150–156). Line 51 "Only drop to the agent…" plus the Instant-path section is sufficient. — Fix: in step 1, keep only "If no target is supplied, run the launcher (Instant path above)"; delete the synthesizer-convention detail (lines 84–88) or move it beside the step-3 synthesizer paragraph (co-location). — Tranche: T1-mechanical-cut
3. [duplication] MED — Circle-drill-down rendering detail appears twice: step 2's `topologyCircles` bullet (lines 116–122, "nodes sized by circle LOC, placed in tier lanes, tier-hue shades per enclosing package…") and step 4's visual-register paragraph (lines 197–203, "tier-hue fills shaded per enclosing package — and click-to-zoom…"). — Fix: keep the step-2 bullet to what the JSON field *contains*; strip rendering detail. Step 4 (or HTML-REPORT.md) owns presentation. — Tranche: T1-mechanical-cut
4. [duplication] MED — Step 4's three-visual-registers paragraph (lines 195–203) compresses design rationale the skill itself says lives in HTML-REPORT.md and "you don't need to read to write a spec" (lines 191–194). Inlining a digest of material explicitly excluded from the authoring path is duplication against the disclosed reference. — Fix: cut to one sentence ("The generator mixes D3 graph, Mermaid cycle diagrams, and Tailwind sections; presentation detail is generator-owned — see references/HTML-REPORT.md"), keeping only the spec-relevant fact that tier presentation comes from declared `ns.tier`. ~8 lines. — Tranche: T1-mechanical-cut
5. [sediment] LOW — Line 21: "and now a *standing application*" — a changelog marker ("now") describing a past design change, not behavior. Line 46 "No skill load, no spec authoring, sub-second to launch" is promotional reassurance (no-op). — Fix: delete both fragments. — Tranche: T1-mechanical-cut
6. [sprawl] MED — `references/HTML-REPORT.md` is 353 lines with no table of contents; skill-audit threshold is a TOC above ~300 lines, and the SKILL.md routes readers to only one subsection ("Spec contract") of it. — Fix: add a TOC at the top of `references/HTML-REPORT.md`. — Tranche: T3-structure
7. [no-op → clean elsewhere] LOW — Context pointer wobble at lines 28–29: "that is the sibling `improve-codebase-architecture` skill" names the review key, not the actual skill name `review-improve-codebase-architecture`. A misnamed pointer fires unreliably. — Fix: use the real skill name. — Tranche: T2-trigger-surface
   Notes on judged-clean sections: Instant path (CLI push-down already done properly — launcher + extract/synthesize/build scripts; no further push-down warranted); step 2 evidence-base bounds ("Cap it at a couple of targeted greps", "never run the test suite… read the relevant config / justfile files directly instead" — negation but a hard guardrail correctly paired with the positive); step 3 invariant mapping (exhaustive criterion "for each target invariant… a status with no evidence is noise"); step 5 chat summary; "keystone" is a working leading word — all clean.
   Est. T1 line savings: 15

## context-bundle-analysis (194 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: flagged
Findings:

1. [duplication] MED — Description (line 4) repeats body content: the full four-mode taxonomy "(poisoning, distraction, confusion, clash)" and four-action menu "(prune, quarantine, handoff, no-action)" are body material restated in the trigger surface; the skill is invoke-only, so the trigger clauses ("Use when the user asks…") are also carrying weight only on Codex, where this long description stays ambient. — Fix: trim description to identity + one trigger clause: "Analyze a frozen context-profiler bundle and deliver advisory context-failure findings. Use when the user asks to analyze a context bundle/profile or run a context-rot analysis." — Tranche: T2-trigger-surface
2. [duplication] LOW — Intro (lines 15–17) "It never mutates the profiled session — its only side effect is writing one new `analysis.md` file" restates the Contract's Output rule (lines 49–52 "Writing `analysis.md` is the only permitted write…"). — Fix: delete from the intro; the Contract is the single source of truth. — Tranche: T1-mechanical-cut
3. [no-op] LOW — Line 14 "The profiler is diagnostic-only by design; this skill is the advisory layer on top of it" partially restates line 4's "advisory" framing and the second-pass-interpreter rule at lines 42–44. — Fix: keep the sharper "strictly a second-pass interpreter" sentence; trim the intro clause. — Tranche: T1-mechanical-cut
4. [premature completion] LOW — Reading procedure step 3 says "Sample excerpts only from episodes flagged `stale`, `rot`, or `wasteful`" but no criterion binds coverage of that set; only the "What was NOT examined" template forces accounting after the fact. — Fix: add the exhaustiveness demand to step 3: "every flagged episode is either sampled or listed in 'What was NOT examined'". — Tranche: T2-trigger-surface
5. [duplication→CLI] MED — Deterministic data gathering done by hand every run: keying offset/limit reads of a 100k+-token `messages.jsonl` off each episode's `turnRange`, plus cross-boundary greps — a loop over findings, 3+ tool calls, and the misstep risk is exactly the skill's own hard rule (accidentally reading too much). — Fix: bundle a small script (e.g. `scripts/episode-slice.mjs <bundle> <episode-label|turn-range> [--head N --tail N]`) that emits bounded per-episode excerpts and per-episode line/turn stats; the semantic choice of *which* episodes to sample stays with the agent. Not a tiny wrapper — it enforces the "never read the full transcript" guardrail mechanically. — Tranche: T4-cli-pushdown
   Notes on judged-clean sections: Contract (sharp input/output boundary; home-search prohibition is a hard safety guardrail paired with the positive "take the path from the user"); Evidence discipline (each rule changes behavior — not no-ops); Failure-mode taxonomy ("the table is a prior, not a lookup" is a good check); Anti-pattern rules (two negations, both irreducible guardrails paired with positives); Verdict rubric (checkable per-finding fields); analysis.md template (every run needs it — correctly inline); Citation depth (conditional pointer wording routes correctly; sources.md at 279 lines is under the TOC threshold) — all clean.
   Est. T1 line savings: 4

## refactor-swarm (138 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [no-op] LOW — Line 9: "A 28-file rename lands in about a minute of wall time versus 10+ minutes of sequential edits" — promotional benchmark; changes no run-time behavior. — Fix: delete the sentence. — Tranche: T1-mechanical-cut
2. [no-op] LOW — Line 27: "But the absence of one is not a reason to give up on a large mechanical refactor" — reassurance. — Fix: delete the clause; the two bullets that follow carry the decision. — Tranche: T1-mechanical-cut
3. [duplication] MED — Batching strategy table (lines 125–132) restates Steps 2–4 (source wave first, test wave after clean results, parallel within / checkpoint between). A table that compacts poorly per the Token Cuts checklist. — Fix: delete the table; keep two lines — the causal-independence rationale and the 30+-file sub-batching rule (the only new facts). — Tranche: T1-mechanical-cut
4. [duplication] LOW — Example section (lines 134–138): the closing two sentences ("If you wanted all 'user signed up' events… unified judgment… not the right tool") restate "When NOT to use" bullet 2 verbatim in spirit. The example's first half (a boundary-sitting case) earns its place; the moral doesn't. — Fix: cut the final two sentences. — Tranche: T1-mechanical-cut
5. [duplication/routing] MED — No distinction from the sibling `refactor-swarm-workflow` artifact anywhere in SKILL.md. The workflow's description does the distinguishing one-sidedly ("Distinct from the refactor-swarm skill…"); an agent holding only this skill cannot route to the engine variant, and an agent holding both gets no tiebreak. — Fix: add one routing line near the top: "A workflow-tool execution engine exists as `refactor-swarm-workflow` (planned-spec, adversarial-verify variant); this skill is the in-session two-wave Task procedure — use the workflow when a pre-planned refactor spec exists." — Tranche: T2-trigger-surface
6. [no-op] LOW — Line 121: "makes the prompt easier to debug when an agent goes off the rails — you can see which bucket the misstep fell into" — second rationale sentence for a rule already carrying one ("Keeping these two lists separate makes the boundary… explicit"). — Fix: delete the second sentence. — Tranche: T1-mechanical-cut
   Notes on judged-clean sections: Frontmatter (trigger description sharp; 5+ files / file-local / light-judgment are concrete thresholds); When to use / When NOT to use (boundary lists are legitimate guardrails, each paired with an alternative); Step 2 model-tier guidance (complies with skill-conventions' both-harness example rule); Step 3 abort-before-test-wave (checkable checkpoint criterion); Step 5 Verify (tiered, exhaustive — grep for old identifier, suite for judgment refactors, diff sample for high stakes); Agent prompt template (core asset, fragile-syntax class — keep). CLI push-down: the orchestration is Task/Grep-native, and the push-down already exists as the sibling workflow tool — no further push-down warranted.
   Est. T1 line savings: 10

## pi-grill-ui (25 lines)

Verdicts: Frontmatter: clean · TokenCuts: flagged · Clarity: clean · ProgDisclosure: clean · CLIPushDown: clean
Findings:

1. [duplication] MED — Lines 15, 17, 21, and 25 are verbatim or near-verbatim identical to `skills/pi-grill-with-docs-ui/SKILL.md` (lines 15, 17, 21, 34): the relentless-interview charter, the grill_ask protocol spec (2–5 options, estimatedRemaining, freeform/status/end paths), the ui_unavailable prose fallback, and the full validation-scope guardrail paragraph. Both skills must stay self-contained (fallback-prompt requirement, stated line 11), so a runtime pointer is off the table — but nothing records the sibling coupling, so a grill_ask protocol change silently drifts one of the two. — Fix: extend the lineage block (line 13) to name `pi-grill-with-docs-ui` as a sync sibling: "shared paragraphs must be updated in both" — a recorded two-place source of truth rather than an accidental one. — Tranche: T3-structure
2. [negation] LOW — Line 25 opens "Do not ask routine validation-scope or test-coverage questions…" — negation-led, though it pairs the positive fallback ("record validation guidance as: run relevant targeted validation…"). — Fix: lead with the positive ("Validation scope belongs to the implementation agent; record it as guidance…") and keep the prohibition as the trailing guardrail. ~1 line saved. — Tranche: T1-mechanical-cut
3. [negation] LOW — Line 15: "Do not enact the plan until the user confirms shared understanding has been reached" — the completion criterion phrased as prohibition; the condition itself (user confirmation) is checkable, so this is polish. — Fix: "Enact the plan only after the user confirms shared understanding." — Tranche: T1-mechanical-cut
   Notes on judged-clean sections: Frontmatter (internal, invoke-only, human-facing description states the extension split — clean); line 11 self-containment rationale (one line, prevents a wrong deduplication — earns its place); line 13 lineage block (required by upstream-skill-melding conventions); line 19 status_request handling (exhaustive, checkable field list); line 23 fact-vs-decision split (sharp boundary). No disclosure or push-down applicable at 25 lines with a self-containment mandate.
   Est. T1 line savings: 1

## Cross-skill findings (batch)

1. [duplication] HIGH — Six-way verbatim body scaffolding across the review family: `review-dry-but-not-too-dry`, `review-improve-codebase-architecture`, `review-thermonuclear-review`, `reinvented-abstractions-tripwire` (this batch) plus `dignified-python-tripwire` and `ns-typescript-style-tripwire` (other batches) share lines 9–27 byte-identically modulo the review key. Six sources of truth for one meaning: any change to the review-run/record/publish flow is a six-file edit, and drift is invisible. The reviews capability already derives skill surfaces programmatically (`reviewSkillEntryFromDefinition` in `ts/packages/capabilities/reviews/src/core/skill-reviews.ts`). — Fix (pick one): (a) generate the six SKILL.md bodies from a template owned by the reviews capability, making the review key the only variable; or (b) shrink each SKILL.md to H1 + one pointer sentence and disclose the shared automation/record/publish scaffolding to a single external reference (e.g. `.ns/reviews/README.md`, which already exists) pointed at by all six. Option (a) fits the platform-and-consumer convention better since the skill surfaces are already code-derived. — Tranche: T3-structure
2. [duplication] MED — pi-grill-ui ↔ pi-grill-with-docs-ui share four load-bearing paragraphs verbatim with no recorded coupling (detail in pi-grill-ui finding 1). Self-containment is mandated, so the fix is a recorded sibling-sync note in both lineage blocks (or build-time generation from one melded source), not a pointer. — Tranche: T3-structure
3. [duplication/routing] MED — refactor-swarm ↔ refactor-swarm-workflow distinction is one-sided: only the workflow's description distinguishes the pair. Add the reciprocal routing line to refactor-swarm (detail in refactor-swarm finding 5). — Tranche: T2-trigger-surface
4. [sediment] MED — The Pi-alias sentence ("…no separate reviews runner alias is required") recurs in all four review-family skills in this batch (and presumably the other two): one obsolete-alias changelog note, sedimented six times. Deleting it is a single template edit if cross-skill finding 1 lands first. — Tranche: T1-mechanical-cut

## Coverage

review-dry-but-not-too-dry — audited, 4 findings
review-improve-codebase-architecture — audited, 4 findings
review-thermonuclear-review — audited, 4 findings
reinvented-abstractions-tripwire — audited, 4 findings
architecture-topology-report — audited, 7 findings
context-bundle-analysis — audited, 5 findings
refactor-swarm — audited, 6 findings
pi-grill-ui — audited, 3 findings

---

# Batch 12 — Meta (skill-management, skill-audit)

## skill-management (326 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: flagged · CLIPushDown: flagged

Findings:

1. [sediment] HIGH — Trigger surface promises "publish skills" (description line 4, intro line 24) but no publish workflow exists anywhere in `skills/skill-management/SKILL.md` or `references/commands.md` (grep for "publish" hits only description/intro). `docs/conventions/skill-conventions.md:16` repeats the same unbacked claim. A human summoning the skill for publishing hits a dead end — misfire risk on the trigger surface. — Fix: document a publish flow in `references/commands.md` or delete "publish" from description, intro, and the conventions doc. — Tranche: T2-trigger-surface
2. [duplication] MED — Description repeats body content (skill-audit's own red flag): "`--agent codex claude-code -y` flag, and `-a`/`--copy` gotchas" restate Core rules lines 72–79 and commands.md. Ambient on Codex (command-backed skills stay ambient there). — Fix: trim description to triggers ("add, edit, remove, rename, update, or list skills with `npx skills`; local `skills/<name>/` layout"). — Tranche: T2-trigger-surface
3. [duplication] MED — Symlink-layout meaning stated 4×: intro prose (26–32), Core rules bullets 1 and 5 (62–65, 76–78), Mental model diagrams (92–113), and again inside each workflow. — Fix: make Mental model the single source; compress intro and core-rule restatements to one line each pointing at it. — Tranche: T1-mechanical-cut
4. [duplication] MED — "Positioning" (34–49) restates `docs/conventions/skill-conventions.md` §Skill Management Channels almost concept-for-concept, including "complementary by decision — do not try to converge them" (conventions line 12). The conventions doc should own the layering (it is the repo-wide routing statement); the skill needs only a 2–3-line scope note + pointer. Caveat: this is a public skill, so the pointer must name the boundary ("`ns skills`/`ns update` and `areg` are out of scope") without depending on the internal doc. — Tranche: T1-mechanical-cut
5. [duplication] MED — Model-tier-examples core rule (82–86) restates conventions §Skill Model Examples in full, then cites it ("See docs/conventions/skill-conventions.md 'Skill Model Examples'"). Conventions doc should own; also, a public skill referencing an internal repo doc contradicts both conventions §Public Skill Authoring and this skill's own anti-pattern "public skill prose that requires internal docs" (line 170). — Fix: one-line rule, drop the internal-doc citation. — Tranche: T1-mechanical-cut
6. [duplication] MED — areg invocation-kind boundary stated twice in-skill (Positioning 44–46; the paragraph at 253–257) and owned by conventions §Skill Invocation Kinds. The 253–257 paragraph is also mis-located (co-location failure) under "Update GitHub-sourced skills" though it is a general boundary. — Fix: keep one sentence in Positioning; delete 253–257. — Tranche: T1-mechanical-cut
7. [duplication] MED — Troubleshoot bullets (303–307) duplicate `references/commands.md` "Known CLI quirks" (212–230) one-for-one (internal-skills env var, absolute paths, lockfile churn, symlink clobber), and several also restate Core rules. — Fix: failure handling belongs in SKILL.md per the Token Cuts keep-list — keep the 5 bullets, delete the quirks section from commands.md (or vice versa; pick one home). — Tranche: T1-mechanical-cut
8. [negation] MED — "Anti-patterns" (315–326) is 11 lines of prohibitions, each restating a rule already stated positively elsewhere (bullet 1 = quirk 3; bullet 2 = Core rule 2; bullet 3 = commands.md `check`; bullets 4–5 = remove/rename workflows). Duplication wearing negation's clothes. — Fix: delete the section. — Tranche: T1-mechanical-cut
9. [duplication] MED — Workflow 1: public and internal flows are two near-identical ~20-line code blocks differing only in `INSTALL_INTERNAL_SKILLS=1`, the extra `.claude` symlink replacement, and `readlink` vs `ls`. — Fix: one flow plus a 3-line "if internal" delta. — Tranche: T1-mechanical-cut
10. [premature completion] MED — Rename workflow (274–287): "Update skills-lock.json key and source" and "Update cross-references and settings allowlists" are unchecked, vague completion criteria — no verify step (every other workflow has one), no way to tell done from not-done for "cross-references". — Fix: add a checkable bound, e.g. `rg -l '<old>' skills/ .claude/ docs/ .pi/` returns empty + `areg check` passes. — Tranche: T3-structure
11. [sprawl] MED — "Umbrella skill families" (117–170, 54 lines) is skill-design guidance, not `npx skills` management; the description carries no umbrella/family trigger, so this branch is unreachable from the trigger surface. It also self-duplicates: the Avoid list (164–170) restates the section's own bullets (132–134, 141–142). — Fix: disclose to `references/umbrella-families.md` with a routed pointer, or relocate to `docs/conventions/skill-conventions.md` beside the bucket-6 router guidance (which already covers adjacent ground); dedupe the Avoid list either way. — Tranche: T3-structure
12. [duplication] LOW — "GitHub-sourced skills do NOT get a `skills/<name>` entry" at line 114 and again at 230–231. — Fix: keep the workflow-2 statement, cut line 114. — Tranche: T1-mechanical-cut
13. [duplication] LOW — "Prefer explicit `npx skills add <source> --skill <name>`" update guidance stated at 240–251, again at 259–261, and again in commands.md `update` (114–116). — Fix: one statement in Workflow 4; commands.md keeps only the subcommand fact. — Tranche: T1-mechanical-cut
14. [duplication] LOW — Skill visibility section (309–313) triple-states `metadata.internal` with the workflow-1 note (197) and commands.md §Skill visibility (232–252). — Fix: delete the section; workflow-1 note + commands.md pointer suffice. — Tranche: T1-mechanical-cut
15. [sediment] LOW — `references/commands.md:43`: stray comment "Retired internal stack-address skills are historical only; use /pr:download-stack-feedback…" sits inside the local-bootstrap code example and has nothing to do with it. — Fix: delete the line. — Tranche: T1-mechanical-cut
16. [duplication] LOW — commands.md "Reference: install flag" (254–268) restates the `add` flag-table row (27), Core rule 4, quirk 2, and the Windsurf gotcha (158–160) — four homes for one flag inside one skill. — Fix: keep the flag table + Windsurf gotcha; delete 254–268. — Tranche: T1-mechanical-cut
17. [cli-push-down] HIGH — The add-local bootstrap (install → `rm -rf`/`ln -s` symlink swap → lockfile normalization → hash validation → 4-command verify → stage), the internal variant, remove, and rename are deterministic multi-step shell pipelines: 7+ steps, 5+ tool calls, validation rules (`computedHash` 64-hex, repo-relative `source`) that `areg check` already enforces in code. `areg` already exists as the skill-registry CLI. Hand-running these is the correctness risk the rules at 66–79 and quirks 3/6/7 exist to patch. — Fix: teach areg the mutations (e.g. `areg skill add-local <name>`, `remove-local`, `rename <old> <new>`) returning JSON with `success`/`error`; SKILL.md workflows collapse to one command each (~100 lines retired across SKILL.md + commands.md), and lockfile/symlink normalization stops being prose. — Tranche: T4-cli-pushdown
18. [no-op] LOW — Frontmatter `allowed-tools` includes `Bash(git *)`, `Bash(mv *)`, `Bash(grep *)` — far broader than the skill's operations; not a token cost but a needless permission surface. — Fix: narrow to the commands the workflows use. — Tranche: T3-structure

Clean sections: Goal (51–59; exemplary checkable end-state), Mental model diagrams (88–113 apart from finding 12), Workflow 2 (apart from finding 12), Workflow 3 (fold into Core rule 1), Workflow 5, Inspect command list (291–299) and its routed pointer to commands.md (301, resolves).

Est. T1 line savings: ~65 (SKILL.md) + ~25 (commands.md)

## skill-audit (143 lines)

Verdicts: Frontmatter: flagged · TokenCuts: flagged · Clarity: flagged · ProgDisclosure: clean · CLIPushDown: clean

Pointer verification (all resolve): `.agents/skills/writing-great-skills/SKILL.md` and `GLOSSARY.md` exist; `docs/conventions/skill-conventions.md`, `docs/research/harness-skill-invocation.md`, `docs/agents/matt-pocock-skills.md` exist; Load With targets (`skill-management`, `cli-push-down`, `typescript-style`, `typescript-fake-driven-testing`, `dignified-python`, `pytest`) all exist as skills. Install state consistent with the LINEAGE claim: command-backed, Pi exclusion in `.pi/settings.json:67`, surface `skill:audit` registered at `ts/packages/tools/areg/src/command-backed-skill-registry.ts:161`.

Findings:

1. [sediment] MED — Per-section `<!-- src: skill-audit -->` / `<!-- src: ns -->` LINEAGE tags (11 of them). `docs/agents/matt-pocock-skills.md:89–93` records the 2026-07-12 de-meld: "Not a meld; no registry row, no sync action on refresh." Lineage blocks are the melded-surfaces contract (`docs/conventions/upstream-skill-melding.md`); this file is no longer a melded surface, so per-section provenance has no consumer. The header comment's runtime-load guard ("vocabulary deliberately NOT embedded… upstream refreshes need no re-sync") and the areg command-backed note remain load-bearing. — Fix: delete the 11 per-section tags; shorten the header comment to the guard + areg line, pointing at matt-pocock-skills.md for history. — Tranche: T1-mechanical-cut
2. [duplication] MED — Residual overlap with the vendored vocabulary it now points at: line 78 "delete the whole sentence, don't trim words" restates writing-great-skills Pruning (its line 59); line 94 "a fuzzy done condition invites premature completion" restates the vocabulary's completion-criterion clause (its line 34). Both sentences already sit next to "(see Vocabulary)" pointers. — Fix: cut the restating clauses, keep the pointers. — Tranche: T1-mechanical-cut
3. [duplication] MED — "Harness & overlay notes" (140–143) restates skill-conventions.md: the Codex-ambient caveat ≈ "Codex can't go zero-ambient" (conventions line 44) and "Invocation kind is managed by areg… not by hand-editing flags" ≈ "areg supersedes generic authoring guidance" (line 40); the vendored-skills bullet restates conventions §Vendored Skill Code and root AGENTS.md's review boundary. Conventions doc should own all three; Load With already routes there (line 39). — Fix: compress the section to two pointer lines. — Tranche: T1-mechanical-cut
4. [duplication] LOW — "Name every finding with a failure mode" stated 3× (lines 23, 29, 48). — Fix: keep it once, in Audit Order step 4. — Tranche: T1-mechanical-cut
5. [duplication] LOW — `docs/conventions/skill-conventions.md` is pointed at 4× in 143 lines (LINEAGE line 18, Load With line 39, twice in Harness notes 142–143). — Fix: single pointer in Load With (falls out of findings 1 and 3). — Tranche: T1-mechanical-cut
6. [leading-word opportunity] LOW — Line 21 "same **process** every run (see Vocabulary)" spends a clause gesturing at the vocabulary's root term. — Fix: use the leading word itself: "Audit `SKILL.md` files for **predictability** (see Vocabulary)…". — Tranche: T1-mechanical-cut
7. [duplication] LOW — Frontmatter description carries mechanism, not trigger: "applied through the vendored writing-great-skills vocabulary" is implementation detail already in the body, and the description stays ambient on Codex. — Fix: "Audit and tighten agent skills. Summon by name to review a SKILL.md for predictability, token cost, triggers, progressive disclosure, and CLI push-down." — Tranche: T2-trigger-surface
8. [negation] LOW — "Don't invent sidecar policy in a skill" (line 142) is a bare prohibition with no positive pairing. — Fix: phrase positively ("route sidecar/harness policy to docs/research/harness-skill-invocation.md") — subsumed by finding 3. — Tranche: T1-mechanical-cut

Clean sections: Vocabulary pointer (25–29; the term enumeration is pointer-sharpening, not duplication — it tells the reader what the lens contains before loading it); Load With (31–39, apart from finding 5); Audit Order (41–53; completion criterion at line 53 is checkable and exhaustive — exemplary); Frontmatter checks (55–72, apart from cross-skill finding 2 below); Token Cuts (74–86, apart from finding 2); Clarity (88–94, apart from finding 2); Progressive Disclosure (96–109; thresholds concrete, routing sound); CLI Push-Down (111–119; no push-down candidates in this skill — `wc -l`/`git diff --check` are single obvious commands); Edit Rules (121–130, apart from cross-skill finding 3 below); Final Report (132–136).

Est. T1 line savings: ~15

## Cross-skill findings (batch)

1. [duplication] MED — "Do not maintain a duplicate skill index in `AGENTS.md`" lives in both targets (skill-management core rule line 80; skill-audit frontmatter check line 65) but in neither's natural owner — skill-conventions.md doesn't state it at all. — Fix: give it a home in skill-conventions.md; skill-management drops it, skill-audit keeps the one-line audit check. — Tranche: T1-mechanical-cut
2. [duplication] MED — Repo-vs-skill ownership drift around skill-conventions.md: the areg boundary, the Codex-ambient caveat, the vendored-review boundary, and the edit-at-`skills/<name>/` rule each live in the conventions doc plus one or both audited skills (skill-audit Harness notes + Edit Rules line 128; skill-management Positioning + line 253–257). Single source: conventions doc owns policy; skills carry pointers plus only the operational one-liner they need at run time. — Tranche: T1-mechanical-cut
3. [sediment] MED — The "publish" promise chain: skill-management description/intro and skill-conventions.md:16 both claim publishing is documented in skill-management; no publish procedure exists. Fixing the skill (finding 1 above) requires also fixing conventions line 16 or the drift reappears. — Tranche: T2-trigger-surface
4. [duplication] LOW — The six failure-mode names are enumerated in skill-audit's Vocabulary pointer (defensible pointer-sharpening) and again in skill-conventions.md §Auditing (line 20), while the vendored writing-great-skills is the declared single source. The conventions-doc enumeration is the weaker copy. — Fix: conventions keeps "use the vocabulary's failure-mode names" without listing them. — Tranche: T1-mechanical-cut
5. [cli-push-down] LOW — skill-audit's Audit Order step 6 (`areg skill show <name>`) and skill-management's verify blocks both hand-describe install-state checks that `areg check` already performs; if finding 17 (areg mutations) lands, both skills' verify prose collapses to "run `areg check`". — Tranche: T4-cli-pushdown
6. Verified clean — both skills' command-backed install state is consistent: `disable-model-invocation: true` + `agents/openai.yaml` present, Pi exclusions at `.pi/settings.json:47,67`, registry surfaces `skill:management` / `skill:audit` at `ts/packages/tools/areg/src/command-backed-skill-registry.ts:161–162`, and mirror symlink chains resolve (`.agents/skills/<name>` → `../../skills/<name>` → `.claude` chain).

## Coverage

skill-management — audited, 18 findings
skill-audit — audited, 8 findings
