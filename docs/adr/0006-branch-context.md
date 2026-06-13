# ADR 0006: Branch Context

## Status

Accepted

## Context

ADR 0005 originally retained `branch-context` as asdl's branch-attached-plan vocabulary. A follow-up grill session on 2026-06-12 reversed that clause: the durable concept is not a special branch type, but the standing context attached to any branch through Branch Memory.

The new vocabulary keeps ADR 0005's additive thesis intact. `enriched-plan` remains the pre-branch saved-plan intake surface. Once a plan is attached to a branch, it is one entry in that branch's context, not evidence that the branch has a special type.

## Decision

### Branch context

**Branch context** is the branch's standing working context stored in Branch Memory. A plan can be the founding entry where one exists, but the concept generalizes to additional standing entries such as notes, constraints, or implementation context.

The discriminator from raw Branch Memory is the **loading contract**: a higher-level workflow can promise to load a branch-context entry into an implementation session. Today the implementation entrypoint is the only contractual loader. Broader adoption and automatic injection are deferred.

Handoff remains a sibling concept, not a branch-context subtype. A handoff is a directed one-shot baton for a future continuation; branch context is standing context for the branch.

### Primitives over branded branch type

asdl does not claim a special branch type. `attach` and `load` are primitives usable on any branch, created any way, at any time.

The fused from-plan flow survives as documented sugar: `branch-context exec from-plan --slug <branch-context-slug> --plan-file <path> [--branch-creation plain-git|graphite]`. That sugar keeps the branch-creation policy logic from the previous branch-context flow: plain git by default, Graphite only when explicitly requested by the caller or wrapper.

### Namespace and key

Branch context uses Branch Memory namespace `branch-context`.

The canonical attached-plan entry key is fixed as `plan.md`. The old `<slug>.md` key duplicated information already scoped by the branch: the branch name carries the implementation slug, and Branch Memory already scopes entries by branch. Keeping the key fixed makes no-argument loading deterministic and makes plan presence easy to check.

There are no migration shims. This is unreleased private software, so pre-rename attached plans in namespace `branch-context` with `<slug>.md` keys and old `branch-context-output` session artifacts become orphaned. Manual recovery can read them through raw Branch Memory locators if needed.

### Surface map

| Old surface                                                                                 | New surface                                                                                 |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `@asdl/branch-context`, bin `branch-context`, `ts/packages/branch-context/`                 | `@asdl/branch-context`, bin `branch-context`, `ts/packages/branch-context/`                 |
| `branch-context exec create`                                                                | `branch-context exec from-plan --slug <slug> --plan-file <path>`                            |
| `branch-context exec load-plan <key-or-slug>`                                               | `branch-context exec load [<key>]`; no argument loads `plan.md`                             |
| attached-plan-only operation set                                                            | branch-context primitives: `attach`, `list`, `check`, `delete`                              |
| Branch Memory namespace `branch-context`, key `<slug>.md`                                   | namespace `branch-context`, plan key `plan.md`                                              |
| Pi `/branch-context:create`, `/branch-context:impl`, `/branch-context:upstack-impl-session` | `/branch-context:from-plan`, `/branch-context:impl`, `/branch-context:upstack-impl-session` |
| skills `branch-context`, `branch-context-create`, `branch-context-impl`                     | `branch-context`, `branch-context-create`, `branch-context-impl`                            |

### `attach --file` source constraint

`attach <key> --file <path>` reuses the enriched-plan file resolver. Its current outside-repo constraint is acceptable but relaxable: arbitrary branch-context entries may later need to attach files from outside the repository or saved-plan store. That relaxation is not part of this ADR.

## Consequences

- Active surfaces use branch-context vocabulary instead of planned-branch vocabulary.
- `enriched-plan` is untouched: it remains the saved-plan intake surface from ADR 0005.
- Existing branch-context Branch Memory entries and session artifacts are not migrated.
- No-argument implementation loading now means exact `plan.md`, not slug-derived or fuzzy key selection.
- Exact-key loading for non-plan entries is available for the multi-entry case; `my-notes` no longer fuzzy-matches `my-notes.md`.
- CONTEXT files are not edited by this ADR. Their branch-context language is known drift to handle in a dedicated rebaseline session.

## Rejected Alternatives

- **enriched-branch:** too brand-forward and less descriptive than branch context.
- **seed:** failed the accretion model; branch context can grow beyond its first entry.
- **primer / brief:** plausible for implementation prompts but too narrow once the contract generalized beyond impl-only loading.
- **attachment / payload:** mechanism words that do not discriminate the concept from raw Branch Memory storage or derive useful user surfaces.
- **impl-context:** too narrow because branch context can hold standing context beyond implementation-only material, and it stutters in implementation command names.
