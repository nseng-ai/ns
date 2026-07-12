---
name: docs-retro
disable-model-invocation: true
description: "Documentation retrospective on the current session: turn discovery friction into the minimum set of doc/comment changes (default verdict: drop). Use for a 'docs retro' or 'what docs would have made this faster'."
metadata:
  internal: true
---

# docs-retro

Turn a work session's discovery cost into the *minimum* set of durable documentation
changes. Most session friction should produce **zero** docs: the default verdict for
any candidate is "drop". The output is a handful of lines placed where they will be
read at exactly the right moment — or nothing.

Session-scoped; for branch-level evidence retros use `branch-retro`.

## The rubric (hard gates, in order)

1. **Minimize tokens.** Standing context (`AGENTS.md`, `CLAUDE.md`, ambient skill
   frontmatter) is paid in every session forever; lazy-loaded text (code comments,
   skill `references/`, `CONTEXT.md`) is paid only on retrieval. Never add to
   standing context unless the fact is needed before the agent knows what it is
   working on.
2. **Minimize drift risk.** Document contracts and invariants, not surfaces or
   enumerations. Point at the source of truth ("read `index.ts` for the surface")
   instead of copying it. Never document a negative ("no X exists") — negatives
   self-heal into lies the moment someone adds X.
3. **Only document the non-recomputable.** If one file read or a cheap grep
   re-derives the fact, drop it. What earns a write: cross-module contracts that
   require tracing to establish, decision-bearing facts that changed a design, and
   formats/conventions that exist only implicitly (e.g. inside a regex).
4. **Prefer co-location.** The fix ladder, best first:
   code change > test that pins the fact > comment on the exact code element >
   lazy-loaded skill reference > `CONTEXT.md` > `AGENTS.md` (last resort, justify).

## Procedure

### 1. Inventory

Walk the session — including subagent reports, which often contain the itemized
search work — and list every fact that had to be *discovered* rather than read:
what it was, where it was finally found, roughly how expensive, and whether it
changed a decision.

### 2. Classify each candidate

- Recomputable cheaply? (one read / one grep → drop)
- A negative? (drop; consider making the positive discoverable instead)
- Surface or enumeration? (drop; barrels and types self-document)
- Contract, invariant, or implicit format? (candidate)
- Decision-bearing? (strongest candidate)
- What is its **retrieval moment** — design time, implementation time, debug time?

### 3. Place survivors by retrieval moment

- Implementation-time fact → doc comment on the exact type/field/function.
- Design-time fact → one sentence in the skill/reference that is mandated reading
  at design time.
- The same fact may appear at two retrieval moments only when both genuinely
  differ and each instance is at most one sentence.

### 4. Prefer non-doc fixes

Before writing prose, check whether the discovery cost is better killed by code:
add the missing helper (making the positive discoverable), add a round-trip test
linking writer and parser, improve an error message, or rename. Code cannot drift.

### 5. Write and validate

Write the survivors (each 1–4 lines), run the repo's formatting/validation gates,
and leave changes uncommitted unless asked.

### 6. Report

- **Written:** file, one-line rationale, which rubric gate it cleared.
- **Dropped:** each candidate with its kill reason — this is the more important
  half; it lets the human veto a drop cheaply.
- **What already worked:** existing docs that answered questions instantly, so
  future retros reinforce rather than duplicate them.

## Kill-rule examples

- "Module X has no wrap helper" — negative; the session that adds one silently
  invalidates it. Drop; the helper's own doc comment is the durable artifact.
- "Package Y exports A, B, C" — enumeration; one barrel read recomputes it. Drop.
- "Renderers never receive parsed CLI flags" — cross-module framework contract,
  expensive to trace, decision-bearing. Write: comment on the field, plus one
  design-time sentence in the CLI-design reference.
- "Update filenames use `YYYYMMDDTHHMMSSZ-slug.md`" — format that existed only in
  a regex and drifted from the writer. Write: one comment on the parser naming
  the canonical form; better still, a round-trip test.
- "Run the dev CLI from the repo root" — the error message already teaches it at
  the moment of failure. Drop.

## Boundaries

- Writes only comments, docs, and (when they replace a doc) small tests; never
  behavior changes.
- Does not edit vendored skills under `.agents/skills/` (real directories).
- Read the nearest `AGENTS.md`/conventions before touching skills, `CONTEXT.md`,
  or standing context files; standing-context additions always need the human's
  explicit sign-off.
