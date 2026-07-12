---
name: skill-audit
disable-model-invocation: true
description: "Audit and tighten agent skills — ns's operational audit checklists applied through the vendored writing-great-skills vocabulary. Summon by name to review a SKILL.md for predictability, token cost, triggers, progressive disclosure, and CLI push-down."
---

# skill-audit

<!--
  LINEAGE: sections tagged with an HTML comment naming their dominant source.
    src: skill-audit = the original ns skill-audit (operational checklists)
    src: ns          = ns overlay / authored for this skill
  The audit vocabulary is deliberately NOT embedded here: it is read at run time
  from the vendored writing-great-skills skill (.agents/skills/writing-great-skills/,
  upstream mattpocock/skills; pin: docs/agents/matt-pocock-skills.md), so upstream
  refreshes need no re-sync of this file.
  Installed as a command-backed support skill via areg. Keep invocation artifacts
  managed by `areg skill apply command-backed skill-audit` (see docs/conventions/skill-conventions.md).
-->

Audit and tighten `SKILL.md` files: same **process** every run (see Vocabulary), high signal, low token cost, clear routing. Default goal: preserve behavior while deleting prompt burden.

Run the **Audit Order** top to bottom; apply the checklists as you go; name every finding with a **failure mode** from the Vocabulary.

## Vocabulary — the audit lens

<!-- src: ns — pointer only; the content lives in the vendored skill and is never copied here -->

Read `.agents/skills/writing-great-skills/SKILL.md` before auditing. It defines the lens this audit thinks with — **predictability**, invocation and the two loads, the description as **context pointer**, the **information hierarchy**, **progressive disclosure**, granularity, **leading words**, pruning — and the **failure modes** that label every finding: **duplication**, **sediment**, **sprawl**, **no-op**, **negation**, **premature completion**. Deep definitions (with *Avoid* lists) are in its sibling `GLOSSARY.md`; consult on demand.

## Load With

<!-- src: skill-audit -->

- `skill-management`: when adding/removing/renaming/installing skills.
- `cli-push-down`: when the skill has shell, parsing, data gathering, or long procedural mechanics.
- `typescript-style` + `typescript-fake-driven-testing`: when the skill carries TypeScript code or tests.
- `docs/conventions/skill-conventions.md`: for invocation-kind (`areg`), frontmatter, naming, and vendoring rules.

## Audit Order

<!-- src: skill-audit -->

1. Load the audit lens: read the file named in **Vocabulary**.
2. Read the target `SKILL.md`.
3. Check **Frontmatter** and the trigger surface.
4. Audit the body against **Token Cuts**, **Clarity**, **Progressive Disclosure**, and **CLI Push-Down**, naming each finding with a Vocabulary failure mode.
5. Edit only when requested or clearly implied; follow **Edit Rules**.
6. Verify install state (`areg skill show <name>`) if the skill was added, moved, or renamed.
7. Produce the **Final Report**.

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

If pushing down, target one cohesive command returning JSON in the project CLI framework's envelope (Clinkr's status-keyed envelope here; `success`/`error` shape only as a no-framework fallback), with all data the next agent decision needs.

## Edit Rules

<!-- src: skill-audit -->

- Preserve user edits and intent; keep unrelated refactors out.
- Don't rewrite a skill into a tutorial; prefer smaller, sharper `SKILL.md` over polished prose.
- Add references/scripts only when the audit finds real need.
- Edit first-party skills at `skills/<name>/` directly (`.agents/skills/<name>` is a symlink back).
- <!-- src: ns --> Don't replace ns-native workflows (Branch Memory, Objective, Graphite, handoff, ns) with upstream/generic workflow patterns without a separate product decision.
- After edits, run `git diff --check`; use `wc -l` when reporting reductions.

## Final Report

<!-- src: skill-audit -->

Report: files changed; line/token reduction if meaningful; main findings (each named with a failure mode); push-down opportunities accepted/rejected; verification run or skipped.

## Harness & overlay notes

<!-- src: ns -->

- **Harness caveat.** `disable-model-invocation: true` is honored zero-ambient on Claude Code and Pi, but Codex keeps the description ambient and only blocks implicit invocation. Don't invent sidecar policy in a skill; the full per-harness mechanics live in `docs/research/harness-skill-invocation.md`. Invocation kind is managed by `areg` (`docs/conventions/skill-conventions.md`), not by hand-editing flags.
- **Vendored skills.** When auditing a skill under a real directory in `.agents/skills/`, treat it as vendored: limit findings to integration-boundary issues unless the task is explicitly to modify the dependency (`docs/conventions/skill-conventions.md`).
