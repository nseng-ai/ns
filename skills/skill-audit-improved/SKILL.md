---
name: skill-audit-improved
description: "Self-contained skill for auditing and tightening agent skills — bundles the writing-great-skills vocabulary with ASDL's operational audit checklists. Summon by name to review a SKILL.md for predictability, token cost, triggers, progressive disclosure, and CLI push-down."
disable-model-invocation: true
---

# skill-audit-improved

<!--
  LINEAGE: each section is tagged with an HTML comment naming its dominant source.
    src: pocock       = Matt Pocock's writing-great-skills (vocabulary, failure modes, leading words)
    src: skill-audit  = the original asdl skill-audit (operational checklists)
    src: asdl         = asdl overlay / authored for this merge
  Inert comparison artifact: not registered. To install as invoke-only, run
  `areg skill apply invoke-only skill-audit-improved` (see docs/skill-conventions.md).
-->

Audit and tighten `SKILL.md` files: same **process** every run (see Vocabulary), high signal, low token cost, clear routing. Default goal: preserve behavior while deleting prompt burden.

Run the **Audit Order** top to bottom; apply the checklists as you go; name every finding with a **failure mode** from the Vocabulary.

## Load With

<!-- src: skill-audit -->

- `skill-management`: when adding/removing/renaming/installing skills.
- `cli-push-down`: when the skill has shell, parsing, data gathering, or long procedural mechanics.
- `typescript-style` + `typescript-fake-driven-testing`: when the skill carries TypeScript code or tests.
- `dignified-python` + `pytest`: when the skill carries Python code or tests.
- `docs/skill-conventions.md`: for invocation-kind (`areg`), frontmatter, naming, and vendoring rules.

## Audit Order

<!-- src: skill-audit -->

1. Read the target `SKILL.md`.
2. Check **Frontmatter** and the trigger surface.
3. Audit the body against **Token Cuts**, **Clarity**, **Progressive Disclosure**, and **CLI Push-Down**, naming each finding with a Vocabulary failure mode.
4. Edit only when requested or clearly implied; follow **Edit Rules**.
5. Verify install state (`areg skill show <name>`) if the skill was added, moved, or renamed.
6. Produce the **Final Report**.

Completion criterion: every section of the target accounted for — flagged with a named failure mode or explicitly judged clean. A change list with no verdict per section is premature completion.

## Frontmatter

<!-- src: skill-audit -->

Check:

- `name` matches directory/install name.
- `description` is a trigger (when to use), not a workflow summary.
- Invocation kind fits the skill (see Vocabulary → Invocation): model-routable skills need a real trigger description; explicit-only skills are `invoke-only` via `areg`, not a hand-pasted `Command:` stub.
- Model-invoked descriptions are narrow but discoverable; one trigger per **branch**.
- No duplicate skill index in `AGENTS.md`.

Red flags:

- Broad trigger words that fire the skill too often.
- Description repeats body content (**duplication**).
- Passive/abstract description that causes undertriggering.
- Missing H1 matching skill identity.

## Token Cuts

<!-- src: skill-audit -->

Hunt **no-ops** and **duplication** sentence by sentence (see Vocabulary); delete the whole sentence, don't trim words.

Move to a sibling `README.md` (human-facing, agents don't load it): philosophical paragraphs, onboarding/intro/conclusion tone, decorative diagrams.

Delete outright: analogies; long examples a checklist replaces; reassurances; obvious AI behavior; tables that compact poorly; before/after pairs that don't prevent a likely mistake.

Keep: hard constraints; exact commands; file-layout contracts; trigger/coordination rules; failure handling; examples for fragile syntax only.

Rewrite style: imperative fragments over paragraphs; one rule per bullet; concrete thresholds over adjectives; "do X when Y" over explanation.

## Clarity

<!-- src: skill-audit -->

A clear skill tells: when to use it; what to read next, conditionally; ownership/boundaries; must vs should vs may; verification steps; what *not* to do.

Sharpen vague **completion criteria** (see Vocabulary) — a fuzzy done condition invites premature completion. Keep safety/correctness rules explicit even when verbose. A non-obvious rule earns a one-line rationale; a wrong agent choice costs more than the tokens.

## Progressive Disclosure

<!-- src: skill-audit -->

Optimize each level for its load frequency: frontmatter (always ambient) → `SKILL.md` body (loaded on trigger) → `references/`, `scripts/`, `assets/`, `README.md` (on demand; `README.md` human-only).

Keep in `SKILL.md`: core workflow, routing pointers, constraints needed every run. Move out: long examples, provider/framework/language variants, schemas, generated templates, rare edge cases. Split variant references by axis (e.g. `references/aws.md`, `references/gcp.md`) and route from `SKILL.md`.

Don't create extra docs by default — add a reference only when the main file would otherwise stay large or force irrelevant context.

Thresholds:

- `SKILL.md` target under ~500 lines. Approaching it → disclose a topic to a reference.
- Reference file > ~300 lines → add a table of contents at the top.

## CLI Push-Down Audit

<!-- src: skill-audit -->

Look for large wins, not tiny wrappers. Push down when it removes: 20+ prompt lines; 3+ tool calls; shell pipelines or `jq`/`sed`/`awk`; loops over files/PRs/API results; deterministic validation/parsing; a workflow repeated across skills.

Do not push down: semantic reading or naming; markdown parsing; one obvious command; under-30-line one-off helpers.

If pushing down, target one cohesive command returning JSON with `success`, structured `error`, and all data the next agent decision needs.

## Edit Rules

<!-- src: skill-audit -->

- Preserve user edits and intent; keep unrelated refactors out.
- Don't rewrite a skill into a tutorial; prefer smaller, sharper `SKILL.md` over polished prose.
- Add references/scripts only when the audit finds real need.
- Edit first-party skills at `skills/<name>/` directly (`.agents/skills/<name>` is a symlink back).
- <!-- src: asdl --> Don't replace asdl-native workflows (Branch Memory, Objective, Graphite, handoff, SDL) with upstream/generic workflow patterns without a separate product decision.
- After edits, run `git diff --check`; use `wc -l` when reporting reductions.

## Final Report

<!-- src: skill-audit -->

Report: files changed; line/token reduction if meaningful; main findings (each named with a failure mode); push-down opportunities accepted/rejected; verification run or skipped.

---

## Vocabulary — the audit lens

<!-- src: pocock -->

A skill exists to wrangle determinism out of a stochastic system. **Predictability** — the agent taking the same *process* every run, not producing the same output — is the root virtue; every lever below serves it. Full definitions (with *Avoid* lists) are in the bundled [`GLOSSARY.md`](GLOSSARY.md); use the names below as the labels for audit findings.

**Invocation.** Two modes, set by the **description**'s presence (in this repo, managed by `areg` kinds — see `docs/skill-conventions.md`):

- **Model-invoked** — keeps a description, so the agent (and other skills) can fire it autonomously. Pays **context load** (the description sits in the window every turn). Choose only when the agent must reach it on its own.
- **User-invoked** — description stripped; only the human typing its name reaches it. Zero context load, but spends human **cognitive load** (the human is the index). When user-invoked skills multiply past memory, a **router skill** names the others.

**Description.** A model-invoked description is a **context pointer**, not a summary — its wording decides *when* the agent loads the skill. Front-load the leading word; one trigger per **branch**; collapse synonym lists (that's duplication); cut identity already in the body.

**Information hierarchy.** Content ranks by how immediately the agent needs it: in-skill **steps** (ordered actions, each ending on a **completion criterion**) → in-skill **reference** (consulted on demand) → **external reference** (disclosed behind a context pointer). A demanding completion criterion drives thorough **legwork**; a vague one invites premature completion. **Co-location**: keep a concept's definition, rules, and caveats under one heading.

**Progressive disclosure.** Moving reference down the ladder so the top stays legible. Licensed by **branching**: inline what every branch needs, disclose what only some reach. A must-have behind a weak pointer is a variance bug — sharpen the pointer's wording before inlining.

**Granularity / when to split.** Each cut spends a load. Split **by invocation** when a distinct **leading word** should trigger a skill on its own (pays context load). Split **by sequence** when visible **post-completion steps** tempt the agent to rush the current one.

**Leading words.** A compact concept already in the model's pretraining (*lesson*, *fog of war*, *tracer bullets*) that the agent thinks with — repeated as a token, it anchors a region of behavior in the fewest tokens, and in a description anchors invocation. Match the project's actual vocabulary. Reach for a pretrained word before coining one.

**Pruning.** Keep each meaning in a **single source of truth**. Check every line for **relevance** (does it still bear on the task?). Then run the **no-op** test sentence by sentence and delete aggressively.

### Failure modes (the finding labels)

- **Premature completion** — ending a step before it's done. Defense in order: sharpen the completion criterion first; only if it's irreducibly fuzzy *and* you observe the rush, hide post-completion steps by splitting.
- **Duplication** — the same meaning in more than one place. Costs maintenance and tokens; inflates a meaning's rank.
- **Sediment** — stale layers that accumulate because adding feels safe and removing feels risky.
- **Sprawl** — simply too long, even when every line is live. Cure with the hierarchy: disclose reference, split by branch/sequence.
- **No-op** — a line the model already obeys by default. Test: does it change behavior versus the default? A weak leading word is a no-op; fix with a stronger word, not a new technique.

## Harness & overlay notes

<!-- src: asdl -->

- **Harness caveat.** `disable-model-invocation: true` is honored zero-ambient on Claude Code and Pi, but Codex keeps the description ambient and only blocks implicit invocation. Don't invent sidecar policy in a skill; the full per-harness mechanics live in `docs/harness-skill-invocation.md`. Invocation kind is managed by `areg` (`docs/skill-conventions.md`), not by hand-editing flags.
- **Vendored skills.** When auditing a skill under a real directory in `.agents/skills/`, treat it as vendored: limit findings to integration-boundary issues unless the task is explicitly to modify the dependency (`docs/skill-conventions.md`).
