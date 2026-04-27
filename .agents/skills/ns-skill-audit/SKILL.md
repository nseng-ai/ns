---
name: ns-skill-audit
description: "Audit and improve agent skills. Use when reviewing or editing skills for token efficiency, clarity, concision, trigger quality, progressive disclosure, install layout, or CLI push-down opportunities."
---

# ns-skill-audit

Audit or tighten `SKILL.md` files for agent execution: high signal, low token
cost, clear routing.

Default goal: preserve behavior while deleting prompt burden.

## Load With

- `ns-skill-management`: when adding/removing/renaming/installing skills.
- `ns-refac-cli-push-down`: when skill has shell, parsing, data gathering, or
  long procedural mechanics.
- `ns-dignified-python` + `ns-pytest`: when touching Python or tests.
- `docs/skill-standards.md`: when this repo has it and frontmatter/type rules
  matter.

## Audit Order

1. Read target `SKILL.md`.
2. Check frontmatter and trigger surface.
3. Audit for token waste, guardrail gaps, progressive-disclosure gaps, and
   large CLI push-down wins.
4. Edit only when requested or clearly implied.
5. Verify symlinks/install state if skill was added, moved, or renamed.

## Frontmatter

Check:

- `name` matches directory/install name.
- `description` says when to use, not full workflow.
- Task skill descriptions are narrow but discoverable.
- Explicit command skills use exactly `description: "Command: <skill-name>"`.
- No duplicate skill index in `AGENTS.md`.
- Optional references are real and only loaded conditionally.

Red flags:

- Broad trigger words that make the skill load too often.
- Description repeats body content.
- Command skill describes the domain instead of using command marker.
- Missing H1 matching skill identity.
- Passive/abstract description that causes undertriggering.

## Token Cuts

Move to sibling `README.md` (human-facing, agents do not load it):

- long philosophical paragraphs;
- onboarding tone, introductions, conclusions;
- decorative diagrams that duplicate a compact version already in `SKILL.md`.

Delete outright:

- analogies;
- long examples when a checklist suffices;
- repeated rules in multiple sections;
- obvious AI behavior;
- reassurances;
- tables that compact poorly;
- before/after examples unless they prevent likely mistakes.

Prefer keeping:

- hard constraints;
- exact commands;
- file layout contracts;
- trigger/coordination rules;
- failure handling;
- examples for fragile syntax only.

Rewrite style:

- imperative fragments over paragraphs;
- one rule per bullet;
- concrete thresholds over adjectives;
- "do X when Y" over explanation.

## Clarity

Agent-facing clarity means:

- tells when to use the skill;
- tells what to read next, conditionally;
- defines ownership/boundaries;
- distinguishes must/should/may;
- names verification steps;
- says what not to do.

If a rule affects safety or correctness, keep it explicit even if verbose.

Non-obvious or surprising rules earn a one-line rationale; wrong agent choices
cost more than a few tokens.

## Progressive Disclosure

Load frequency:

- Frontmatter (`name` + `description`): always in context.
- `SKILL.md` body: loaded whenever the skill triggers.
- `references/`, `scripts/`, `assets/`, `README.md`: loaded on demand;
  `README.md` is human-only.

Optimize each level for its load frequency.

Keep in `SKILL.md`:

- core workflow;
- routing to references/scripts/assets;
- constraints needed every run.

Move out:

- long examples;
- provider/framework variants;
- schemas;
- generated templates;
- rare edge cases.

When a skill spans multiple frameworks / providers / languages, split
references by variant (e.g. `references/aws.md`, `references/gcp.md`) and
route from `SKILL.md`. Agents read only the relevant file.

Do not create extra docs by default. Add references only when the main file
would otherwise stay large or force irrelevant context.

Concrete thresholds:

- `SKILL.md` target: under ~500 lines. Approaching the limit -> split a topic
  into a reference.
- Reference file > ~300 lines -> include a table of contents at the top.

## CLI Push-Down Audit

Look for large wins, not tiny wrappers.

Push down when it removes:

- 20+ prompt lines;
- 3+ tool calls;
- shell pipelines or `jq`/`sed`/`awk`;
- loops over files/PRs/API results;
- deterministic validation/parsing;
- repeated workflow across skills.

Do not push down:

- semantic reading or naming;
- markdown parsing;
- one obvious command;
- under-30-line one-off helpers.

If pushing down, target one cohesive command returning JSON with `success`,
structured `error`, and all data needed for the next agent decision.

## Edit Rules

- Preserve user edits and intent.
- Keep unrelated refactors out.
- Do not rewrite a skill into a tutorial.
- Avoid adding references/scripts unless the audit finds real need.
- Prefer smaller, sharper `SKILL.md` over polished prose.
- When editing local nonslop skills, edit `skills/<name>/` directly.
- After edits, run `git diff --check`; use `wc -l` when reporting reductions.

## Final Report

Report:

- files changed;
- line/token reduction if meaningful;
- main audit findings;
- push-down opportunities accepted/rejected;
- verification run or skipped.
