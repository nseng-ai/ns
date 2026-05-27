# Spec Distillation — a working method

Status: **Living document.**

## Intent of this document

We are deriving these lessons _empirically_, by performing spec distillation on a specific real feature and noting what works. But this document is deliberately **generalized**: the concrete feature is kept out of it, and every lesson is written so it applies to any feature undergoing the same prototype → spec → production process.

The goal is meta: to decide whether spec distillation is repeatable and valuable enough to justify building **durable artifacts** around it — a reusable skill, a polished methodology doc, supporting tooling, or some combination — that would accelerate and de-risk similar work in the future. This file accumulates the evidence and the generalized method; the skill-vs-artifact decision (see §7) stays open until we have taken at least one spec all the way through to production.

It is a generalized method for turning a working prototype into a precise, implementation-free specification, refined iteratively as we apply it to more features. It describes the process in general terms; it is not tied to any one feature.

---

## 1. What "spec distillation" is

Spec distillation is the deliberate middle step in a three-stage lifecycle:

```
prototype  ──distill──▶  spec  ──implement──▶  production code
```

- **Prototype** — a feature built fast to prove the idea. Working but entangled: behavior, intent, and incidental implementation choices are fused together across code, tests, and scattered notes.
- **Spec** — a user-facing, implementation-free contract. Describes _what_ the feature does and _why_, with enough precision that it could be reimplemented from scratch and the result would be indistinguishable to users and downstream consumers.
- **Production code** — a clean reimplementation (or disciplined refactor) that satisfies the spec.

The distillation step is the act of separating **durable contract** from **incidental implementation**, writing the former down precisely, and deliberately discarding the latter.

### Why it's valuable

- A prototype's _behavior_ is usually right; its _structure_ usually isn't. A spec lets you keep the proven behavior and throw away the structure without fear.
- It converts tacit knowledge — living in code, tests, and the prototyper's head — into an explicit, reviewable artifact.
- It produces a conformance target: the production rewrite gets a checklist, not a vibe.
- It surfaces decisions that were made implicitly during prototyping and forces them to be ratified or revised on purpose.

---

## 2. Core principles

The load-bearing ideas, ordered by how much they shape the work.

### P1 — Tests are the source of truth for _behavior_; provenance docs are the source of truth for _intent_.

When a prototype's design notes and its tests disagree about what the feature _does_, the tests win — they are executable and current. When you need to know _why_ a choice was made, or what was deliberately excluded, the notes win. Use both; trust neither alone.

### P2 — Tag every fact as **contract** or **implementation** as you read.

This tagging _is_ the distillation. The spec keeps contract and abstracts away implementation. The test for which bucket a fact goes in:

> If a user or a downstream consumer can observe it, it's **contract**. If it's a swappable mechanism that produces the same observable behavior, it's **implementation**.

A generic guide:

| Fact                                                              | Bucket                  | Why                                          |
| ----------------------------------------------------------------- | ----------------------- | -------------------------------------------- |
| Command/endpoint names, flags, arguments, defaults                | contract                | the user invokes them                        |
| Output field names, response/envelope shape, exit/status codes    | contract                | consumers parse them                         |
| Visible labels, symbols, ordering, and formatting of human output | contract                | users see them                               |
| Machine-readable error/status codes and message strings           | contract _with caveats_ | observable, but often incidental — see P4    |
| Storage engines, on-disk formats, libraries, language, frameworks | implementation          | swappable; behavior survives replacement     |
| Internal data structures and algorithms                           | implementation          | only their _observable results_ are contract |
| Helper / class / module / function names                          | implementation          | invisible to users                           |

### P3 — Verify literal values; never let a paraphrase become a normative clause.

Summaries — including ones produced by subagents — drift on exactly the details a spec must nail. A second-hand description of a derived value's rule can invert its actual meaning. **Anything that becomes a MUST in the spec gets traced back to a literal source**: a test assertion, an output string, a type definition. Read the literal value; don't trust the gloss.

### P4 — Decide the normativity of incidental strings on purpose.

Prototypes are full of strings that are technically observable but were never _designed_ as contract: error codes, log and warning wording, internal status labels. Don't silently freeze them, and don't silently drop them. For each, make an explicit ruling in the spec:

- **Stabilize** it — declare it a documented enum or format the production code must preserve, or
- **Mark it informative** — human-readable, not part of the integration contract, free to change.

A sound default: stabilize machine-readable codes/identifiers; mark human-readable prose informative. Confirm the default with the spec owner.

### P5 — Lock scope and output location _before_ writing.

Prototypes rarely have clean edges; the target feature is usually entangled with neighbors. Ambiguous scope wastes the most expensive step — writing. Confirm the boundary (what's in, what's adjacent context) and the deliverable's home with the owner up front. These two questions genuinely change the artifact.

### P6 — Build a worked end-to-end example. It is both a verification tool and a spec artifact.

Constructing one concrete input mapped through to every output form forces you to reconcile all the rules simultaneously. This is where contradictions and paraphrase errors surface. Derive the example from a real test so it's grounded, not invented. Keep it in the spec — it's the fastest way for a reader to grasp the feature and for an implementer to self-check.

### P7 — Capture intent, rationale, and non-goals — not just mechanics.

A spec that lists only behavior invites scope creep and re-litigation of settled decisions. Pull the _why_ behind non-obvious rules, and the explicit non-goals, into the spec as design constraints and rationale. The prototype's provenance notes are usually the richest source of these.

### P8 — End with an acceptance checklist.

Turn the spec into a conformance test: a flat list of MUST-satisfy bullets the production rewrite can be graded against. If a behavior can't be phrased as a checkable bullet, the spec is probably still too vague there.

---

## 3. The process

A working sequence. Steps overlap in practice; the contract/implementation tagging (P2) runs continuously throughout.

0. **Frame & scope.** Identify the feature boundary. Confirm scope and output location with the owner (P5).
1. **Orient.** Inventory every artifact: the entry-point code, its tests, supporting modules, adjacent surfaces (wrappers, extensions, or sibling components — possibly in other languages), and any self-documentation. Do a fast survey pass first so the deep reads can be parallelized.
2. **Mine provenance.** Read the feature's own design / planning / decision notes if they exist. Treat them as a _hypothesis_ of the contract and a record of intent — not as the spec. Note where they are aspirational, stale, or implementation-framed.
3. **Read implementation for behavior**, tagging contract vs implementation as you go (P2). Delegate breadth (wide test sweeps, framework or dependency contracts) to subagents; read the highest-signal contract sources yourself (the entry point, the output-shape tests, any public-facing wrapper).
4. **Ground in tests.** Extract literal expected values — exact outputs, strings, response shapes, error cases, status codes. Reconcile against the provenance notes (P1). Verify anything normative against a literal source (P3).
5. **Reconcile via a worked example** (P6).
6. **Write the spec.** Behavior-only, contract-preserving, implementation-abstracting. Make explicit rulings on borderline-contract strings (P4). Include terminology, preconditions, surface, semantics, formats, errors, edge cases, the worked example, and non-goals/rationale (P7).
7. **Acceptance checklist** (P8).

### A reusable spec skeleton

```
1. Purpose & audience (+ where it sits in the larger system)
2. Domain concepts & terminology (precise definitions)
3. Preconditions & environment (+ explicit non-requirements)
4. Surface (synopsis, arguments, options, defaults)
5. Behavior & semantics (the heart — mirror the conceptual pipeline)
6. Shared output vocabulary (symbols, labels, annotations, ordering)
7. Output / response formats (one subsection each; full schema for machine formats)
8. Failure behavior (exit/status codes, error taxonomy, shape per format)
9. Diagnostics / warnings (categories, canonical wording, normativity ruling)
10. Worked end-to-end example (one input → every output)
11. Non-goals
12. Acceptance checklist
```

---

## 4. Anti-patterns / pitfalls

- **Trusting a summary over the source** for a normative detail (P3).
- **Mishandling incidental strings** — freezing prototype error codes or message wording as if they were designed contract, _or_ dropping them entirely. Rule on each (P4).
- **Leaking the mechanism** — describing _how_ state is stored or computed instead of the observable guarantee. State the guarantee (e.g. "derived from the system's own records, never by scraping another tool's display output"), not the storage engine or library.
- **Writing before scope is fixed** (P5).
- **Spec'ing mechanics without intent**, leaving non-goals and rationale stranded in the prototyper's head (P7).

---

## 5. Artifacts the process produces

- The **spec** (primary).
- A **contract/implementation ledger** — the running tags from P2 (may live in working memory, or be made an explicit table for complex features).
- A **normativity ledger** — the P4 rulings (which strings are stabilized vs informative).
- An **acceptance checklist** (part of the spec).
- This **method doc** (meta).

---

## 6. Open questions / to refine

- **Provenance hygiene.** When a prototype's own notes are implementation-leaky or stale, what's the discipline for using them without importing their leaks?
- **Completeness check.** How do we _prove_ a spec covers the prototype's behavior — a coverage pass against the test suite? against the code's branches?
- **Spec → production gap analysis.** Does the method need a distinct step that grades the prototype against the new spec, separating behaviors the spec deliberately _changes_ from those it _preserves_?
- **Tooling opportunity.** Could a deterministic helper assemble the artifact inventory (entry points, tests touching the feature, self-docs) so the work starts from a map instead of building one?
- **Subagent brief.** Should we standardize a subagent task that _returns literal values with file:line references_, not paraphrases, to make P3 cheaper and safer?

---

## 7. Decision: skill vs. durable artifact

**Deferred.** Revisit after taking at least one spec through to production. Candidate forms:

- a `spec-distillation` skill (the procedure + the skeleton + the standardized subagent brief), and/or
- a durable methodology doc (this file), polished.
