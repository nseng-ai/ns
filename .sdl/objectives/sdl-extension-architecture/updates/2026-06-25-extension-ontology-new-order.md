# Extension ontology rebaseline: Extension vs Capability, the Capability Kit, and the acyclic Extension Dependency Graph

## Summary

A grilling/design session reworked the extension-system ontology and layering vocabulary; this branch (open PR #2151, "Rebaseline flow architecture docs and add extension layering ADR") executed the doc/vocabulary changes plus one package rename. The architectural cycle-break was deliberately deferred to this Objective.

Decisions — the "new order":

- **Extension vs Capability are orthogonal.** An *Extension* is the technical construct (a package plugged into the SDK via `defineExtension()`, third-party-buildable); a *Capability* is a first-party feature area implemented *as* an Extension. Construct/topology terms use "Extension"; tier/feature terms use "Capability." "Extension" is kept as the unit noun (not renamed to "Capability Package").
- **Capability Kit rename.** `@sdl/extension-kit` → `@sdl/capability-kit` (dir `ts/packages/sdl-capability-kit`), term "Extension Kit" → "Capability Kit." "Extension Kit" is now a **reserved** name for a hypothetical future substrate for building *all* extensions (third-party included); it must not name the first-party kit.
- **Capability API** replaces "Peer API" (the curated `@sdl/<cap>/api` in-process export; subpath unchanged). "sibling"/"peer"/"peer dependency" → directed **consumer/provider**.
- **No mandatory triple.** A Capability mandatorily exposes a Command Face over a gateway-injected Domain Core; it adds a Capability API *only where a consumer depends on it* in-process (~3 of ~10 capabilities ship an `/api`). The old ADR 0012 "uniform triple" framing was corrected.
- **Bare "extension API" is banned anti-vocabulary** — always qualify "SDL extension API" (`@sdl/sdl/sdk`) or "Pi runtime extension API."
- **CCC holds no privileged tier:** it is the *highest-fan-out consumer* in the Extension Dependency Graph, not an "orchestrator/apex/kernel" extension.
- **The Extension Dependency Graph must be acyclic.** ADR 0009's title became "…and the Extension Dependency Graph"; the acyclic invariant lives in the ADR body, with a planned `just ts-guard` topological check.
- **Pi↔CCC reclassified as debt.** The `@sdl/pi` ↔ `@sdl/ccc` bidirectional package cycle (previously called an "intentional cycle") is now tracked debt under the acyclic invariant.

Delivered on this branch: the vocabulary/doc edits across `CONTEXT.md`, `CONTEXT-MAP.md`, ADR 0009, ADR 0012, package `CONTEXT.md`/`README.md` files, and `ts/packages/sdl/docs/sdk-reference.md`; the `@sdl/extension-kit` → `@sdl/capability-kit` package rename (git-tracked dir move, flow imports, style-guard allowlist + fixture). A follow-up vocabulary audit converted residual "Peer API"/"sibling"/bare "extension API" occurrences in the package README/CONTEXT tier (`@sdl/sdl`, slot, `@sdl/pi`, domain-primitives-transitional) and the slot test/source comments that the first pass had missed. Full `just` suite green (332 files, 3302 tests; style guard, tsgo, oxfmt, oxlint all pass).

Deliberately NOT done on this branch (this Objective's work): the architectural cycle-break (relocate objectives domain out of `@sdl/pi`, pick a single Pi/CCC delegation direction, land the `ts-guard` acyclicity check). `.sdl/objectives/**` history was not rewritten and still references the old names as historical fact. ADR 0012 keeps its stable filename slug (`…-extension-kit.md`); only its title prose changed.

## Objective Impact

- Refreshed the durable end-state vocabulary in `objective.md` (Architecture Model, Scope endgame, Completion Criteria Phase 2) and `roadmap.md` (forward Plan text + Phase 2 steps 1, 2, 4, 5) to the new order: Extension/Capability split, `@sdl/capability-kit`/Capability Kit with "Extension Kit" reserved, Capability API, consumer/provider, the acyclic Extension Dependency Graph, and CCC as the highest-fan-out consumer with no privileged tier.
- Added a Phase 2 Completion Criterion and folded a roadmap deliverable into step 5 for the acyclic Extension Dependency Graph: break the `@sdl/pi` ↔ `@sdl/ccc` cycle and enforce acyclicity with a `just ts-guard` topological check.
- Recorded the `@sdl/pi` ↔ `@sdl/ccc` bidirectional package cycle as a tracked risk (reclassified from intentional cycle to debt) and added an assumption for the vocabulary canon and an open question for which single delegation direction breaks the cycle.
- This is a vocabulary/model rebaseline plus newly-named debt; **no previously-completed Phase 2 roadmap row changed status.** Historical roadmap Evidence bullets and prior `updates/` entries are left intact as historical fact (step 1's title notes the rename and points here).

## Follow-Ups

- Execute the cycle-break (Phase 2 roadmap step 5): relocate the objectives domain from `@sdl/pi` into its owning Capability, re-consume via its Capability API, pick the Pi/CCC delegation direction, and land the `ts-guard` acyclicity check.
- Per-capability migrations (Phase 2 step 4) should adopt the refreshed vocabulary (Command Face / Domain Core / Capability API).
- Land PR #2151; the refreshed Objective narrative is authored as if its docs/rename changes are on the default branch.
