# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This repo uses a multi-context domain-doc layout.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — use it to find the context relevant to the topic.
- Relevant per-context **`CONTEXT.md`** files.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- Context-specific **`docs/adr/`** directories when they exist.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Multi-context repo:

```text
/
├── CONTEXT-MAP.md
├── docs/adr/                         ← system-wide decisions
└── packages/
    ├── brmem/
    │   └── CONTEXT.md                ← Branch Memory context
    └── asdl-objectives/
        └── CONTEXT.md                ← Objectives context
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in a relevant glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
