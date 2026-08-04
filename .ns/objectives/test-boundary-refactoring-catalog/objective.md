---
edges:
  - objective: standing-test-performance-boundaries
    annotation: Consumes that objective's evidenced update slices as the precedent source for named catalog entries.
---

# Test-Boundary Refactoring Catalog

## Thesis

Formalize every recurring test-boundary transformation evidenced in the
`standing-test-performance-boundaries` objective into named catalog entries in
`docs/conventions/test-boundary-refactorings.md`, in the style of Fowler's *Refactoring*. Today
most of these techniques exist only as undefined bullet-list phrases in that objective's scope and
updates, which makes them hard to identify, cite, and track. The seam-introduction ladder (Inject
Dependency, Inject Gateway, Introduce Gateway) already landed through the catalog stack (open PRs
#4103–#4107, #4111); this objective dispositions the remaining candidates one at a time and
extends the catalog with the accepted ones.

## Scope

- The 11-candidate slate produced by the 2026-08 inventory of all 31 updates in
  `.ns/objectives/standing-test-performance-boundaries/updates/`, after merge analysis (families:
  test relocation, test-subject restructuring, lane establishment/containment). The slate and its
  per-candidate evidence citations live in `roadmap.md`.
- Per-candidate disposition, reviewed one item at a time with the user: accept as merged, rename,
  split, or drop. Each accepted candidate becomes a catalog entry with the established shape:
  imperative-verb-phrase name, italic one-line summary, Mechanics, Constraints, Precedent
  citations into the standing objective's updates.
- Catalog section structure for the new families (the current catalog has only the
  "Seam introduction" section plus the dependency-injection vocabulary note).
- `CONTEXT.md` vocabulary synchronization in the same change whenever an entry mints a term the
  glossary should carry.
- Every new or edited catalog entry's prose is run through the `de-llm` skill
  (`skills/incubating/writing/de-llm/SKILL.md`) before landing, so entries carry no LLM stylistic
  tells.

## Non-Goals

- The audit/proof/measurement procedure family (rebaseline sweeps, dual-config discovery proof,
  detached-worktree timing protocol, boundary greps, structural lane sweeps, codify-the-standard):
  explicitly excluded from the walkthrough; see Parked in `roadmap.md`.
- Taking over the standing objective's maintenance work (finding new boundary leaks, migrating
  suites, lane engineering). This objective only names what that objective has already done.
- Editing or normalizing the standing objective's immutable `updates/` files.
- Renaming or restructuring the three already-landed seam-introduction entries, beyond adding
  sibling sections around them.

## Completion Criteria

Every candidate on the roadmap slate has an explicit recorded disposition: a landed catalog entry,
a merge into another entry, or a decline with reason. Accepted entries exist in
`docs/conventions/test-boundary-refactorings.md` with mechanics, constraints, and precedent
citations that resolve to the standing objective's update files. `CONTEXT.md` is synchronized for
any vocabulary the entries mint. The catalog's section structure covers all accepted families.

## Assumptions and Risks

- **Assumption:** the 31 updates inventoried in 2026-08 are complete evidence for the slate. New
  standing-objective updates may evidence additional techniques; those are new candidates for a
  future pass, not silent scope growth here.
- **Assumption:** the open seam-introduction PRs (#4103–#4107, #4111) land substantially as
  submitted; new entries build on that catalog text. If the stack is reworked, entry drafts must
  rebase onto the revised catalog shape.
- **Risk — premature formalization:** three candidates rest on a single update each (Separate
  Static Contract from Dynamic Loading, Check Golden Artifact for Drift, Test Real Adapter in
  Sanity Lane). The per-item disposition is the gate: thin-evidence candidates may be declined or
  parked rather than named, mirroring the catalog's own "earned the weight" doctrine.
- **Risk — vocabulary drift:** entries could restate or contradict `ts/TESTING.md` lane doctrine
  or `CONTEXT.md` terms. Entries must cite governing documents rather than restate them, per the
  catalog header rule.
- **Risk — over-granularity:** the inventory already collapsed 24 raw shapes to 11 candidates;
  the walkthrough may still find pairs that should merge (for example Collapse Matrix / Retain
  Representative Smoke). Merging during disposition is expected, not failure.

## Open Questions

- Item 3: is Retain Representative Smoke a standalone entry other entries cite, or a shared
  constraint restated per entry?
- Section structure: which families become top-level catalog sections, and what are their names?
- Does the excluded procedure family eventually get a home (`ts/TESTING.md` versus a companion
  conventions doc)? Parked until explicitly requested.
