---
edges:
  - objective: flow-stack-workflows
    annotation: Sibling README effort; that record lands the agent-workflows tier inside the canonical Flow README while this record owns the surrounding value-led restructure and must integrate that tier at promotion rather than clobber it.
---

# Value-led Flow README (readme-driven)

## Thesis

The canonical Flow README (`ts/packages/capabilities/flow/README.md`) is a solid
adopter contract — requirements, command/dependency matrix, failure markers, env
vars, extension points — but nothing in it answers "why would I want this" or "what
does a day with Flow look like." Restructure it value-first around four pillars
settled in discussion (managing large stacks, reducing decision fatigue,
customizing for your team / standardization, eliminating tedium), organized as
workflows-as-situations rather than command descriptions, with the contract
material preserved below the fold. Developed readme-driven:
`references/README-draft.md` is the canonical design contract, and where the
draft's claims outrun the software, the software changes. The first such case is
model selection: the README's env-var table documents ambient, undiscoverable,
unversioned per-shell policy, so model selection moves to shared top-level
`[models]` settings with operation-to-profile resolution, `fast` as the default,
no environment ladder, and no inspection command; the README then documents
the shipped mechanism.

## Scope

- Readme-driven-development passes over `references/README-draft.md` (seeded from
  the current canonical README), restructuring to the agreed skeleton: Why Flow
  (pillars) → the everyday loop (`cp` → `submit` → `land` → `pull-trunk`, worked
  example) → working in parallel (`autobranch`/`autoslot`/`branch-latest-commit`)
  → keeping stacks clean (`squash-stack`, `regenerate-pr`, `changes`) → making
  Flow yours (extension points as "policy without policing") → reference material
  below the fold. The loop narrative carries a boundary reference to `ns address`
  for the review-conversation step.
- **Semantic Update (model policy):** the former `[flow.models]` plus
  environment ladder is superseded by shared top-level `[models]`. Profiles and
  operation overrides are typed settings; omitted operations resolve to `fast`,
  projects may redefine `fast`, listed model selectors are removed, and no
  inspection command ships in v1. Typed settings remain distinct from points.
- Rewriting the draft's "Model-backed workflows" section against the shipped
  mechanism; the draft cannot promote while it documents unshipped behavior.
- Promotion: the settled draft promotes over
  `ts/packages/capabilities/flow/README.md`, integrating whatever workflows tier
  `flow-stack-workflows` has landed there by then, and the Objective reference is
  repointed at the promoted doc (per the `generic-flow-extension` precedent).

## Non-Goals

- The agent-workflow fold-ins and the README workflows tier itself: owned by
  `flow-stack-workflows` (edge). This record's restructure must give that tier a
  home in the new structure, not produce its content.
- No new point kinds and no ADR 0031 changes: model selection is settings, not
  points; this record does not extend the point system.
- No review-domain content beyond the `ns address` boundary reference; pr-address
  and its workflows stay out per the stack-state domain test.
- No unbacked value claims: the stacks pillar is framed as "cheap to operate at
  stack scale" — stack topology stays Graphite's job, and the README never
  implies Flow abstracts or manages topology.

## Completion Criteria

- The README draft is settled through readme-driven passes: coherent, believable
  product documentation with the pillar-led structure, workflows framed as
  situations, and the existing contract material (requirements, command matrix,
  pre-submit checks, failure marker, customization points) preserved below the
  fold.
- `[flow.models]` is shipped: manifest-declared schema, the three-layer
  resolution ladder implemented and tested, legacy env names handled per the
  ladder decision, and the active source inspectable.
- The promoted README documents only shipped behavior — in particular the model
  section matches the settings mechanism, not the current env-var table.
- The promotion roadmap row is done: the draft has replaced
  `ts/packages/capabilities/flow/README.md` with the workflows tier integrated,
  and `references/README-draft.md` repoints at the promoted doc.
- Repo validation (`just`) green as completion evidence per implementation slice.

## Assumptions and Risks

Assumptions:

- **The four pillars are the right value taxonomy.** Settled in the originating
  discussion; if grilling during a readme pass disproves a pillar (most likely
  "managing large stacks," which is deliberately scoped to operating cost, not
  topology), reframe explicitly in the draft rather than quietly dropping it.
- **Settings, not points, is the right surface for model selection.** Points
  accept exactly hook | prompt; a model ref is a typed value, and the points
  guide carves typed config out to manifest-declared settings. Revisiting this
  means reopening a platform decision, not a Flow-local one.
- **The env layer must survive.** Model availability is per-user (credentials,
  provider access); a repo-pinned model must not hard-break contributors without
  that provider.
- **The current README's contract material is accurate enough to carry.** The
  restructure moves it below the fold; drift found en route gets fixed in place,
  not rewritten wholesale.

Risks:

- **Concurrent edits to the same canonical README.** `flow-stack-workflows` lands
  its workflows tier into `ts/packages/capabilities/flow/README.md` while this
  draft evolves separately; promotion must merge, not clobber. Mitigated by the
  edge and by the promotion row explicitly requiring integration.
- **The settings work outgrows the record.** `[flow.models]` touches manifest
  schema and config loading; if implementation balloons past a thin settings
  table plus ladder, split it into its own Objective rather than stalling the
  README.
- **RDD is experimental with one precedent.** `generic-flow-extension` is the
  only completed promotion; follow its mechanics (draft slims to a pointer at
  promotion) rather than inventing new ones.

## Open Questions

- Do the pillars appear as explicit named bullets in "Why Flow," or as one tight
  paragraph the workflow sections demonstrate? (First grill pass; leaning
  explicit-but-terse.)
- Primary reader: human adopter first with agent behavior woven in
  (recommended), or agent-first? (First grill pass.)
- `[flow.models]` schema details: key names (`changes`, `checkpoint`, `slug`,
  `pr-description`, `submit-failure`), validation, and which CLI surface reports
  the active source.
- Legacy env names: dropped outright (breaking changes are allowed) or kept as
  deprecated ladder entries for a window?
