---
name: skill-audit
disable-model-invocation: true
description: "Audit and tighten agent skills. Summon by name to review a SKILL.md for predictability, token cost, triggers, progressive disclosure, and CLI push-down."
---

# skill-audit

<!--
  The audit vocabulary is deliberately NOT embedded here: it is read at run time
  from the vendored writing-great-skills skill (.agents/skills/writing-great-skills/,
  upstream mattpocock/skills; pin and de-meld history: docs/agents/matt-pocock-skills.md),
  so upstream refreshes need no re-sync of this file.
  Declared command-backed through Skill Exposure Policy. Keep Harness Overlay
  artifacts managed with `ns skill-exposure apply command-backed skills/internal/skill-system/skill-audit`.
-->

Audit and tighten `SKILL.md` files for **predictability** (see Vocabulary): high signal, low token cost, clear routing. Default goal: preserve behavior while deleting prompt burden.

Run the **Audit Order** top to bottom, applying the checklists as you go.

## Vocabulary — the audit lens

Read `.agents/skills/writing-great-skills/SKILL.md` before auditing. It defines the lens this audit thinks with — **predictability**, invocation and the two loads, the description as **context pointer**, the **information hierarchy**, **progressive disclosure**, granularity, **leading words**, pruning — and the **failure modes**: **duplication**, **sediment**, **sprawl**, **no-op**, **negation**, **premature completion**. Deep definitions (with *Avoid* lists) are in its sibling `GLOSSARY.md`; consult on demand.

## Load With

- `skill-management`: when adding/removing/renaming/installing skills.
- `cli-push-down`: when the skill has shell, parsing, data gathering, or long procedural mechanics.
- `typescript-style` + `typescript-fake-driven-testing`: when the skill carries TypeScript code or tests.
- `docs/conventions/skill-conventions.md`: for Skill Exposure Policy, frontmatter, naming, and vendoring rules.

## Audit Order

1. Load the audit lens: read the file named in **Vocabulary**.
2. Read the target `SKILL.md`.
3. Check **Frontmatter** and the trigger surface.
4. Audit the body against **Token Cuts**, **Clarity**, **Progressive Disclosure**, and **CLI Push-Down**, naming each finding with a Vocabulary failure mode.
5. Edit only when requested or clearly implied; follow **Edit Rules**.
6. Verify install/layout with `npx skills list`; when exposure policy changed, run `ns skill-exposure show <explicit-path>` and `check <explicit-path>`.
7. Produce the **Final Report**.

Completion criterion: every section of the target accounted for — flagged with a named failure mode or explicitly judged clean. A change list with no verdict per section is premature completion.

## Frontmatter

Check:

- `name` matches directory/install name.
- `description` is a trigger (when to use), not a workflow summary.
- Exposure policy fits the skill (see Vocabulary → Invocation): model-routable skills need a real trigger description; explicit-only skills use `invoke-only` through `ns skill-exposure` on an explicit path, not a hand-pasted `Command:` stub.
- Model-invoked descriptions are narrow but discoverable; one trigger per **branch**.
- No duplicate skill index in `AGENTS.md`.

Red flags:

- Broad trigger words that fire the skill too often.
- Description repeats body content (**duplication**).
- Passive/abstract description that causes undertriggering.
- Missing H1 matching skill identity.

## Token Cuts

Hunt **no-ops** and **duplication** sentence by sentence (see Vocabulary).

Move to a sibling `README.md` (human-facing, agents don't load it): philosophical paragraphs, onboarding/intro/conclusion tone, decorative diagrams.

Delete outright: analogies; long examples a checklist replaces; reassurances; obvious AI behavior; tables that compact poorly; before/after pairs that don't prevent a likely mistake.

Keep: hard constraints; exact commands; file-layout contracts; trigger/coordination rules; failure handling; examples for fragile syntax only.

Rewrite style: imperative fragments over paragraphs; one rule per bullet; concrete thresholds over adjectives; "do X when Y" over explanation.

## Clarity

A clear skill tells: when to use it; what to read next, conditionally; ownership/boundaries; must vs should vs may; verification steps; what *not* to do.

Sharpen vague **completion criteria** (see Vocabulary). Keep safety/correctness rules explicit even when verbose. A non-obvious rule earns a one-line rationale; a wrong agent choice costs more than the tokens.

## Progressive Disclosure

Optimize each level for its load frequency: frontmatter (always ambient) → `SKILL.md` body (loaded on trigger) → `references/`, `scripts/`, `assets/`, `README.md` (on demand; `README.md` human-only).

Keep in `SKILL.md`: core workflow, routing pointers, constraints needed every run. Move out: long examples, provider/framework/language variants, schemas, generated templates, rare edge cases. Split variant references by axis (e.g. `references/aws.md`, `references/gcp.md`) and route from `SKILL.md`.

Don't create extra docs by default — add a reference only when the main file would otherwise stay large or force irrelevant context.

Thresholds:

- `SKILL.md` target under ~500 lines. Approaching it → disclose a topic to a reference.
- Reference file > ~300 lines → add a table of contents at the top.

## CLI Push-Down Audit

Look for large wins, not tiny wrappers. Load `cli-push-down` and apply its size thresholds, exclusions, and JSON-contract rules; those criteria have one home there, not here.

## Edit Rules

- Preserve user edits and intent; keep unrelated refactors out.
- Don't rewrite a skill into a tutorial; prefer smaller, sharper `SKILL.md` over polished prose.
- Add references/scripts only when the audit finds real need.
- Edit first-party skills at their explicit canonical nested source under `skills/<disposition>/.../<name>/`; resolve `.agents/skills/<name>` when the approved source is not already supplied. The flat overlay is a symlink back, not the canonical topology.
- Treat real directories at `.agents/skills/<name>/` as vendored upstream content; retain their flat layout and limit ordinary audits to integration-boundary findings unless explicitly asked to modify the dependency.
- Don't replace ns-native workflows (Branch Memory, Objective, Graphite, handoff, ns) with upstream/generic workflow patterns without a separate product decision.
- After edits, run `git diff --check`; use `wc -l` when reporting reductions.

## Final Report

Report: files changed; line/token reduction if meaningful; main findings (each named with a failure mode); push-down opportunities accepted/rejected; verification run or skipped.

## Harness & overlay notes

- Per-harness invocation mechanics (including Codex keeping descriptions ambient) live in `docs/research/harness-skill-invocation.md`; Skill Exposure Policy and Harness Overlays are managed by `ns skill-exposure` per the conventions doc in **Load With**.
- Vendored skills (real directories under `.agents/skills/`): limit findings to integration-boundary issues unless the task is explicitly to modify the dependency (conventions doc in **Load With**).
