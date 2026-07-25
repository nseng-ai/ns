# Adversarial Reviews

How ns authors and maintains the review definitions under `.ns/reviews/<key>/review.md`
and keeps their skill stubs consistent. The Reviews extension loads the definitions
and runs them; this document owns the authoring convention: where a review's content
comes from, how that lineage is recorded, and how the invocation stubs under `skills/`
stay a single-template surface. Decided 2026-07-12; the product decision and its
rationale are recorded in
`.ns/objectives/skill-audit-remediation/updates/20260712T161605Z-t3-product-decisions-resolved.md`.

## What a review definition is

A review definition is an **adversarial variant** of its source material: constructive
doctrine (a style guide, an architecture survey skill, a quality checklist) inverted
into diff-grounded findings hunting. The source says how to build things well; the
review says what to flag when a diff violates that doctrine, restricted to what is
mechanically reviewable per-diff.

Review definitions are managed HITL: **agent-authored, human-reviewed, occasionally
refreshed and audited**. There is deliberately no codegen and no generation from the
Reviews capability's skill-surface derivation. The derivation from source doctrine to
per-diff rules is judgment — deciding what is mechanically reviewable in a diff, what
needs higher context, and how to phrase a rule so a cheap model applies it without
inventing findings — and no toolchain captures that. The drift failure modes that
codegen would target are addressed instead by this document's checklist plus occasional
audits.

## Lineage kinds

Every review definition has exactly one lineage kind, recorded in its provenance block:

- **skill-derived** — derived from one or more constructive documents the repo owns:
  first-party skills and/or `AGENTS.md` files. Example: `ns-typescript-style-tripwire`
  derives from the `typescript-style` skill, the `ns-typescript` overlay skill, and
  `ts/AGENTS.md`.
- **vendored-derived** — derived from a real vendored directory under
  `.agents/skills/<name>/`. The provenance block names the vendored directory and
  upstream skill path; commit-level pins are owned by the vendoring records (the
  upstream instance doc under `docs/agents/` when one exists, per
  [upstream-skill-melding.md](upstream-skill-melding.md)) and are **never duplicated in
  the review**. Examples: `code-smell-review`, `thermonuclear-review`,
  `improve-codebase-architecture`.
- **standalone** — first-party with no source document. The provenance block says so
  explicitly and credits inspirations inline where honest ones exist. Examples:
  `reinvented-abstractions-tripwire`, `dry-but-not-too-dry`.

## Provenance block

Every review.md carries a provenance block: a YAML comment block at the top of the
frontmatter, before `description:`. The worked example is
`.ns/reviews/ns-typescript-style-tripwire/review.md`, whose block names its three
sources and its regeneration procedure end to end. The block records:

- **Sources** — the lineage kind and the specific source documents (skills, AGENTS.md
  files, or vendored directories), or the explicit statement that the review is
  standalone.
- **NS-local adaptations to preserve** — the deliberate deltas from the source that a
  refresh must not flatten (scope restrictions, tone, frontmatter shape, NS-coined
  rules).
- **Derivation rules**, when the review derives from constructive doctrine: the active
  section holds only **Tier A** rules (diff-grounded, mechanically reviewable);
  higher-context design rules stay in a commented-out **Tier B** section rather than
  being deleted, so refreshes see what was already judged too contextual.
- **Refresh instructions** — how to re-derive when a source changes, ending with the
  validation commands:

  ```bash
  dprint check .ns/reviews/<key>/review.md
  pnpm --dir ts exec vitest run packages/incubator/reviews/test/unit/review-definition.test.ts
  ```

The frontmatter below the block must remain loadable by the Reviews capability;
`review-definition.test.ts` guards this.

## SKILL.md stub template

Each review's interactive surface is a lean invocation stub under `skills/`,
hand-instantiated from the template below. The only variables are the review key and
the display name. Stubs are **sanctioned duplication** of this template: each carries a
marker comment pointing back at this document, and that marker is what future audits
honor. To change the shared body, edit the template here, then re-instantiate every
stub on the checklist.

Frontmatter is not part of the template: each stub keeps its existing `name:` and
`description:` values, and the invocation-kind fields (`disable-model-invocation`,
`agents/openai.yaml`) are areg-owned harness overlays — never hand-edit them (see
[skill-conventions.md](skill-conventions.md)).

```markdown
# Review: <Display Name>

Use `.ns/reviews/<key>/review.md` as the authoritative review definition. Do not
duplicate or reinterpret the review rules from memory.

If running inside this repository and the ns command face is available, prefer:

    ns reviews review run <key>

If reviewing inline, first read `.ns/reviews/<key>/review.md`, then apply that review
definition exactly to the supplied diff or current branch changes. Stay read-only and
keep findings grounded in the diff.

For durable logging or publication, see `.ns/reviews/README.md`.

<!-- Sanctioned duplication: instantiated from the stub template in
docs/conventions/adversarial-reviews.md; edit the template, then re-instantiate. -->
```

The record/publish automation scaffolding deliberately lives once, in
`.ns/reviews/README.md`, not in every stub.

## Stub-per-review checklist

Every review key has either a stub instantiated from the template or an explicit
runner-only line here. Keep this list in sync when adding or removing reviews.

| Review key                         | Stub                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `code-smell-review`                | **runner-only** — no stub by policy; the `pocock-review` skill is already its interactive surface, and `ns reviews review run code-smell-review` covers automation |
| `dry-but-not-too-dry`              | `skills/review-dry-but-not-too-dry`                                                                                                                                |
| `improve-codebase-architecture`    | `skills/review-improve-codebase-architecture`                                                                                                                      |
| `ns-typescript-style-tripwire`     | `skills/ns-typescript-style-tripwire`                                                                                                                              |
| `reinvented-abstractions-tripwire` | `skills/reinvented-abstractions-tripwire`                                                                                                                          |
| `thermonuclear-review`             | `skills/review-thermonuclear-review`                                                                                                                               |

Stub names are not forced to a `review-` prefix; the tripwire stubs keep their existing
names, and the template's H1 (`# Review: …`) carries the review framing either way.

## Refresh and audit cadence

Refresh a review when one of its provenance-block sources changes: re-derive per the
block's instructions, preserve the recorded NS-local adaptations, keep the Tier A/Tier B
split honest, and run the block's validation commands. Standalone reviews refresh when
the doctrine they encode changes.

There is no reconcile machinery watching for drift between sources, reviews, and stubs.
The chosen alternative is occasional audits: walk the checklist above, confirm each
stub still matches the template, and confirm each provenance block still names real
sources. The `skill-audit` skill's fleet audits are the natural occasion.
