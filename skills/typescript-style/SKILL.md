---
name: typescript-style
description: "General TypeScript style guide for strict, portable TS: erasable syntax, string-literal unions, discriminated unions, errors-as-values, minimal-core architecture, backend neutrality, and terse review."
references:
  - core-rules
  - idioms
  - checklist
  - references/README
  - references/philosophy
  - references/type-system
  - references/error-handling
  - references/case-study-backend-neutrality
  - references/case-study-context-management
  - references/case-study-extension-system
  - references/case-study-tui
  - references/review-taste-and-process
---

# typescript-style

A portable, opinionated TypeScript style guide for strict, maintainable projects. It should make sense
when copied into any TypeScript codebase: follow the local repository's tooling, runtime, and public API
constraints first; use this guide for the design defaults that are not already settled.

The examples are motivating patterns, not dependencies on a particular codebase. Adapt names, import
suffixes, formatter settings, and package layout to the project in front of you.

## Scope

Use this as a reference for:

- strict type design with string-literal unions, discriminated unions, generics, and `satisfies`;
- choosing `interface` vs. `type`, `throw` vs. returned errors, and core vs. plugin/adapter boundaries;
- designing backend-neutral abstractions, stateful runtimes, extension/plugin APIs, and terminal UIs;
- reviewing TypeScript for needless machinery, incoherent types, hidden globals, and unowned complexity.

## Core knowledge

Read **`core-rules.md`** first. It contains the default rules and when to bend them for project-local
constraints.

For copy-paste idioms while coding, read **`idioms.md`**. Before finishing implementation or review,
run **`checklist.md`**.

## One-paragraph version

Prefer strict, erasable TypeScript: no `enum`, no `namespace`, no parameter properties unless the
project already requires TS emit features. Closed sets are **string-literal unions**; runtime variants
are **discriminated unions** on a domain field and consumed by exhaustive `switch`. Use `unknown` at
boundaries and avoid `any` unless a library forces it. Encode expected failure as returned data at
async/system boundaries (`Result<T,E>`, terminal error events); throw only for programmer errors and
broken invariants. Keep the core minimal: optional behavior lives behind plugins, adapters, or
capability flags. Functions do logic; classes coordinate state. Inline one-use helpers. Be direct in
reviews and comments; explain why, not mechanics.

## Conditional loading

Top-level files (`core-rules.md`, `idioms.md`, `checklist.md`) are optimized for everyday work. The
`references/` folder holds deeper rationale and worked examples. Load only the relevant reference.

| Situation                                                                          | Read                                          |
| ---------------------------------------------------------------------------------- | --------------------------------------------- |
| Need the rationale behind a rule, or to justify a review comment                   | `references/philosophy.md`                    |
| Designing types: unions, generics, `satisfies`, declaration merging, why no enums  | `references/type-system.md`                   |
| Designing failure handling: errors-as-values, `Result`, typed errors, cancellation | `references/error-handling.md`                |
| Building a backend/provider abstraction or anything multi-backend                  | `references/case-study-backend-neutrality.md` |
| Building a stateful workflow, context manager, compaction, or scheduling loop      | `references/case-study-context-management.md` |
| Building an extension/plugin system, tool registry, or SDK surface                 | `references/case-study-extension-system.md`   |
| Building a TUI, renderer, component model, or keybinding system                    | `references/case-study-tui.md`                |
| Reviewing a PR or writing terse implementation feedback                            | `references/review-taste-and-process.md`      |

`references/README.md` is the index of the reference folder.

## How to apply this skill

1. Load `core-rules.md` and check for project-local exceptions before changing code.
2. If the project has an established convention that conflicts with this guide, follow the project and
   mention the deviation only if it matters.
3. When a domain matches, load the matching reference before designing the abstraction.
4. When making a judgment call, prefer the smallest coherent design that keeps types honest end to end.
5. Run `checklist.md` before declaring the work done.
