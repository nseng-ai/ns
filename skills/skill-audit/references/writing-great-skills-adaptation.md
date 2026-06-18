# Writing-Great-Skills Adaptation

Adapted from Matt Pocock's vendored `writing-great-skills` skill. Use this as ASDL's operational audit lens; the upstream skill remains provenance and broader reference.

## Predictability

Audit for predictable process, not identical output. A good skill causes agents to take the same route through discovery, decisions, validation, and reporting even when the resulting code or prose differs.

## Invocation mode

ASDL maps upstream invocation language to harness behavior:

- **Ambient-discoverable / model-invoked**: keep a rich frontmatter description when the agent must choose the skill itself or another skill must route to it.
- **Explicitly invoked / user-invoked**: use `disable-model-invocation: true` when humans or wrapper prompts invoke the skill directly and ambient context would be waste.

Harness caveat: `docs/harness-skill-invocation.md` documents that Claude Code and Pi can suppress ambient skill context with `disable-model-invocation: true`; Codex may not make that truly zero-ambient. Document the caveat instead of inventing sidecar policy in a skill.

## Context load vs cognitive load

Every ambient description spends context load every turn. Every invoke-only skill spends human cognitive load because the user or wrapper must remember it. Use a router skill only when many invoke-only skills become hard to remember.

## Description as context pointer

A model-invoked description is not a summary; it is a pointer that decides when the model loads the skill. Check whether it uses the words users, docs, commands, and sibling skills actually use. Collapse synonym lists that describe one branch; keep distinct branches.

## Information hierarchy

Keep common execution steps in `SKILL.md`. Move branch-specific reference behind explicit context pointers. Do not hide rules that every run needs, and do not inline rare variants that most runs do not need.

Completion criteria prevent premature completion. Before splitting a workflow, first sharpen the done condition so the agent can tell whether the step is complete.

## Failure modes to name in audits

- **Single source of truth**: one behavior lives in one place.
- **Duplication**: the same meaning appears twice, increasing drift and prominence.
- **Sediment**: old layers remain because adding felt safer than deleting.
- **Sprawl**: the skill is long enough that live content needs progressive disclosure or a split.
- **No-op**: a line does not change agent behavior versus the default.
- **Premature completion**: a step's done condition is vague enough that the agent rushes ahead.

## Leading words

Prefer project vocabulary and compact words that guide behavior. A good leading word anchors both invocation and execution; a fuzzy phrase repeated across several sections is often a sign that one sharper term should replace it.

## Matt upstream adaptation check

When auditing a Matt-sourced update, classify each change as:

1. exact vendored refresh;
2. ASDL overlay update;
3. fork/wrapper required; or
4. reject/defer.

Do not copy upstream workflow skills over ASDL-native Branch Memory, Objective, Graphite, handoff, or SDL workflows without a separate product decision.
