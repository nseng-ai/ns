---
name: typescript-style
description: "General TypeScript style guide for strict TS: erasable syntax, Zod boundary schemas, function declarations for module logic, discriminated unions, errors-as-values, minimal-core architecture, backend neutrality, and terse review."
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

An opinionated TypeScript style guide for strict, maintainable projects. It is toolchain-neutral about
package managers, formatters, linters, test runners, and import suffixes, while making code-level
defaults: erasable TypeScript, Zod-first boundary validation, honest types, and small architecture.
Follow the local repository's runtime and public API constraints first; use this guide for design
defaults that are not already settled.

The examples are motivating patterns, not dependencies on a particular codebase. Adapt names, import
suffixes, formatter settings, and package layout to the project in front of you; keep Zod as the default
runtime validation library for new external boundaries unless the project has already chosen otherwise.

## Scope

Use this as a reference for:

- strict type design with Zod boundary schemas, string-literal unions, discriminated unions, generics,
  and `satisfies`;
- choosing `interface` vs. `type`, `throw` vs. returned errors, and core vs. plugin/adapter boundaries;
- designing backend-neutral abstractions, stateful runtimes, extension/plugin APIs, and terminal UIs;
- reviewing TypeScript for needless machinery, incoherent types, hidden globals, and unowned complexity.

## Core knowledge

Read **`core-rules.md`** first. It contains the default rules and when to bend them for project-local
constraints.

For copy-paste idioms while coding, read **`idioms.md`**. Before finishing implementation or review,
run **`checklist.md`**.

## One-paragraph version

Write strict, erasable TypeScript: no `enum`, no `namespace`, and no parameter properties in new code.
Closed sets are **string-literal unions**; runtime variants are **discriminated unions** using `type` by
default, with domain/external tags only when they better express the model. Use `unknown` at boundaries
and avoid `any` except isolated, commented library-forced seams. Validate external boundaries with Zod
schemas and derive types with `z.infer`. Encode expected failure as returned data at async/system
boundaries (`Result<T,E>`, terminal error events); throw only for programmer errors and broken
invariants. Top-level module logic uses `function` declarations; callbacks and expression-position
factories can use arrows. Prefer guard clauses, nullish operators for nullish semantics, and options
objects for several/optional inputs. Respect ownership-boundary immutability: do not mutate inputs,
returned values, or shared/public state in place. Keep the core minimal: optional behavior lives behind
plugins, adapters, or capability flags. Functions do logic; classes coordinate state. Inline one-use
helpers. Suppressions and empty catches explain why. Be direct in reviews and comments; explain why, not
mechanics.

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
