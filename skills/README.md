# Skill Tree Contract

This README is the authoritative mutable contract for first-party skill topology. Procedures for acquiring, exposing, auditing, or publishing skills live in the applicable skills and in [`docs/conventions/skill-conventions.md`](../docs/conventions/skill-conventions.md).

## Support disposition and ownership

Every first-party skill belongs to exactly one **support disposition**:

- **`public`**: warranted for external use and ongoing support. Public is an explicit support commitment, not an inference from portability, usefulness, package ownership, or current harness exposure.
- **`incubating`**: genuinely intended for external support, but its contract, dependencies, portability, or evidence are not ready for a public warrant.
- **`internal`**: operates this repository or its private workflows and has no current external support intent. Internal is not a publication waiting room.

The normal canonical-source shape is:

```text
skills/<disposition>/<family>/<skill>/
```

A **family** is the stable navigation and maintenance boundary for a durable product or workflow owner. It is not a visibility container, package projection, or invocation namespace. A family can span dispositions: the `prs` family contains the public `skills/public/prs/pr-make-accountable/` and the incubating `skills/incubating/prs/pr-address/`.

The only top-level product exceptions are `skills/incubating/brmem/` and `skills/incubating/slots/`. In each case the product identity is already the stable owner boundary, so a repeated one-skill family directory would add no information. These exceptions do not establish a general flat-layout option.

Other family-nested examples include:

```text
skills/incubating/objectives/objective/
skills/incubating/handoff/handoff-create/
skills/internal/code/code-graphite/
skills/internal/typescript/typescript-style/
```

### Objectives family

The Objectives family is one progressively disclosed product (ADR 0049). Its ordinary portable foundation is exactly seven canonical incubating skills: `objective`, `objective-create`, `objective-list`, `objective-next`, `objective-update`, `objective-refresh`, and `objective-close`. Each has complete CLI-free behavior and may use a concrete optional `ns objective` operation only after look-before-use detection. `objective-runner-step` and `objective-autorun` are separate incubating automation skills provisioned by the `@nseng-ai/objectives` enhancement; they are not portable-family promises. `objective-critique` is retired without an alias.

Independent installation and checkout-free evidence do not promote these skills. A move to `skills/public/objectives/` requires a later explicit support-warrant review; package disposition, acquisition channel, and Pi integration do not decide skill disposition.

## Identity, canonical source, and Harness Overlays

A skill's **skill identity** is globally flat and unique across all dispositions. The canonical directory leaf and the `name` in `SKILL.md` frontmatter must both exactly equal that identity. Disposition and family never enter invocation names.

First-party canonical sources are nested under `skills/`, while harness-facing **Harness Overlays** remain flat:

```text
skills/<disposition>/<family>/<identity>/   # normal canonical source
.agents/skills/<identity>                   # flat Harness Overlay
.claude/skills/<identity>                   # flat Harness Overlay
```

First-party entries in `.agents/skills/` are symlinks to their nested canonical sources; first-party `.claude/skills/` entries link through the flat `.agents` overlay. By contrast, real directories under `.agents/skills/` are flat, vendored third-party skills whose content remains upstream-owned. They are not first-party canonical sources and do not belong in this disposition tree.

To resolve a known first-party identity to its canonical path, follow `.agents/skills/<identity>` to its nested `skills/` target, or consult the tree by disposition and family. Contributors edit and manage the resolved canonical source. Management operations must receive explicit canonical paths, for example `skills/internal/code/code-gh/`; they must not infer a source from `skills/<identity>`. Runtime and harness lookup resolve the flat identity through `.agents/skills/<identity>` (or the corresponding `.claude` overlay), not by recursively searching the canonical tree.

## Independent classifications

Do not conflate these independent concerns:

- **support disposition**: the repository's external support warrant or intent;
- **family ownership**: the stable navigation and maintenance owner;
- **skill identity**: the globally flat harness-visible name;
- **Skill Exposure Policy**: invocation behavior (`normal`, `invoke-only`, or `command-backed`); and
- **`metadata.internal`**: repository-private visibility evidence.

A public skill can have any Skill Exposure Policy. An internal skill can be ambient. `metadata.internal: true` strongly informs an internal disposition but substitutes for neither disposition nor exposure policy.

## Dependency closure

Required operational dependencies follow this convention-only matrix:

| Consumer disposition | Allowed required dependency dispositions |
| -------------------- | ---------------------------------------- |
| `public`             | `public`                                 |
| `incubating`         | `public`, `incubating`                   |
| `internal`           | `public`, `incubating`, `internal`       |

A required operational dependency is any command, package, skill, checked-in prompt, repository convention, or harness capability needed for the documented workflow's promised behavior. Clearly optional integrations, examples, and non-normative links do not automatically create required dependencies. Review enforces this convention; there is no skill dependency manifest or topology parser.

## Moves and compatibility

Promotion or demotion is a deliberate support-intent decision and canonical path move. It does not by itself rename the skill, change family, alter Skill Exposure Policy or `metadata.internal`, publish content, or change an owning package. Review and update all explicit canonical-path consumers and required dependencies as part of the move.

The canonical tree has no mixed-layout compatibility: no first-party skill may live directly at `skills/<identity>/`, and old canonical-path aliases or fallback copies are not allowed. Flat Harness Overlays and real vendored `.agents/skills/` directories are separate supported surfaces, not compatibility copies.
