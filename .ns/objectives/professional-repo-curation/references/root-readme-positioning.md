# Root README positioning and outline

Settled through an interactive positioning session (2026-07-25). This is the content
basis for the umbrella roadmap's "Root README reframing" row. It is a working
reference, not the README itself; wording is directional, structure is settled
unless a later session explicitly revises it.

## Identity

- **Name expansion:** `ns` stands for **nonslop**. This is the primary identity, not a
  secondary philosophy.
- **Discipline:** nonslop engineering — software work produced with explicit intent,
  deliberately selected context, controlled execution, and verifiable evidence.
- **Category:** infrastructure for the agentic development lifecycle (ADLC). Explicitly
  *not* another coding agent or model wrapper — the engineering discipline around agents.
- **Thesis (headline only in README; argued in `why-ns.md`):** context management is the
  fundamental skill of AI-native engineering; the smarter the model, the more the context
  matters and the more damage the wrong context does.
- **Audience:** professional engineers/teams; first concrete audience is the owner's team
  members (target-org colleagues).

## Two-document split

- **README.md** — the landing page. Persuades by assertion + demonstration: sharp
  two-sentence thesis claim, concrete nouns, terminal capture, quickstart. Never argues.
  Conversion goal: run the quickstart.
- **why-ns.md** — the manifesto. Persuades by argument: a concrete slop failure story,
  the capability-amplifies-damage claim (lead argument), the CPU/algorithm analogy
  (supporting aside only), the nonslop principles each grounded in a primitive.
  Conversion goal: send it to your tech lead. Scope test: stays ~90% accurate even if
  every package were rewritten. Not a docs landfill.

## Presentation taxonomy — three axes plus skills

1. **The core (the headline claim).** Universal capabilities — every team has the
   problem, no incumbent owns the solution: **objectives, handoffs, flow, pr-feedback**.
   Presented as felt problem → primitive → one command:
   - Objectives — "The agent forgot what we were actually doing."
   - Handoffs — "I have to re-explain everything to a fresh session."
   - Flow — "Shipping ceremony keeps yanking me out of the work." Flow is about the
     engineer's *flow state*: reducing naming fatigue (cp/autobranch/submit), managing
     parallelism method-agnostically (clones, worktrees, or the slots extension all
     valid).
   - PR feedback — "Addressing review comments is toil."
2. **Extensions — built with ns, shipped in this repo.** slots, reviews,
   plans/branch-context. Framing: same extension points a consumer would use; proof the
   SDK is real; opt-in. Reviews is deliberately *not* core (crowded review-tool
   ecosystem); plans/worktrees are not core (most people have solutions).
3. **Harness integrations — pi is the first example.** The toolkit is harness-neutral
   (CLI-first, git-native durable state). This repo also hosts harness-specific
   extensions that surface the toolkit in a harness; pi (`/ns:*` commands, subagents,
   TUI) is the worked example of a pattern, not a requirement. Integrating another
   harness = writing adapters, not re-implementing capabilities.
4. **Tools.** Standalone executables needing no lifecycle adoption: herdr (a tool with a
   pi extension, not a capability-extension), areg, packagechk. May ship their own
   harness extensions.
5. **Skills — packaged, version-controlled context.** The lowest adoption rung (one-file
   install, no CLI). Public storefront is the curated universal discipline/workflow set
   only; `code-*` and repo-internal skills are internal for now. Skills need a
   portability pass (they assume `just`/Graphite/ns CLIs) before becoming the public
   on-ramp. Framing guard: skills are how you try ns; capabilities are why you stay —
   never lead with skills or ns gets shelved as a skills-list repo.

Design stance to state once explicitly: **bring your own X** — ns core is small and
universal; everything opinionated is an optional extension, including ours.

## README outline (settled)

1. Hero: nonslop engineering; four core capabilities as felt problems; "not another
   coding agent"; links to why-ns and quickstart; terminal capture.
2. **Quickstart** — single first-success workflow, pure CLI (no pi dependency, enacting
   the harness-agnostic claim). Leading candidate: **pr-feedback** against the reader's
   own open PR.
3. **The core** — the four, each: problem → primitive → command → package README link.
4. **Design stance** — bring-your-own-X; git-native durable state; 3–4 sentences.
5. **Extensions** — slots, reviews, plans/branch-context; one line each; closes with
   "build your own the same way" → SDK.
6. **Harness integrations** — pi as the first example; capture opportunity here.
7. **Tools** — herdr, areg, …
8. **Skills** — curated universal set.
9. **Adoption ladder** — skill → pr-feedback/flow CLI → objectives+handoffs → harness
   integration → extensions/tools → SDK.
10. **Status & structure** — supported surface vs incubator, graduation gate, `just`,
    CONTRIBUTING link.
11. Footer — why-ns, package docs, license.

## Content rules learned during drafting

- Concrete nouns beat category language; no abstraction-stacked hero sentences.
- Every abstract claim pairs with a primitive/command/example or gets cut.
- No second taxonomy: do not teach a lifecycle-stage framework (Intent → Context → …)
  in the README; the package/capability taxonomy is the only one a reader learns.
- Assert in the README, argue in why-ns.
- Honest status is mandatory (private/unreleased; two-zone model) per this umbrella's
  root-README row — this is a curation-honest README, not a launch README.
- retros excluded from presentation for now.

## Open decisions

- Confirm pr-feedback as the quickstart, and verify a cold-checkout install path exists
  to power it (none verified yet).
- Which workflow gets the terminal capture.
- Final hero wording.
- Whether verification language in the hero attaches to flow ("verified flow") or stays
  in why-ns now that reviews left the hero.
