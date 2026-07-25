# CONTEXT Vocabulary Layer Landed

## Summary

The canonical vocabulary anchor is in place: root `CONTEXT.md`, `CONTEXT-MAP.md`, and all 12 nested live CONTEXT files now speak **ns extension** / **Extension Kit** / **extension package API**. This is the first slice of the roadmap's "Land the vocabulary layer" row; READMEs, `docs/`, and skills prose remain.

### Root `CONTEXT.md` glossary restructuring

- The orthogonality sentence ("the two leading nouns are orthogonal, not synonyms") is replaced by the verdict's one-noun rule: **ns extension** covers both the technical construct and the feature area.
- **Capability** merged into the new **ns extension** entry; `capability` is listed as a retired term in *Avoid*. The entry carries the qualification rule (bare *extension* when unambiguous; **ns extension** vs **Pi extension** where Pi could be meant) as an explicit contract with "capability" and unqualified "extension" in the *Avoid* list — the Completion Criteria disambiguation item.
- **Capability Kit** renamed to **Extension Kit**, documented as the shared library for extensions defined in the ns repository. The prior "Extension Kit (reserved name)" reservation is revoked — both the body reservation line and the *Avoid* entry inverted; the entry explicitly does not claim a general third-party framework and now carries "Capability Kit (retired name)".
- **Capability API** renamed to **extension package API** per the API-term verdict, with the owner-qualified prose form ("Plans extension package API") and the explicit distinction from the `@nseng-ai/sdk` author API and Pi's runtime `ExtensionAPI`.
- Dependents reworded: Command Face, Consumer/Provider, **Herdr capability → Herdr extension**, Kit Gateway, Consumer Gateway, Capability Gateway Backend (retired-term entry, folding target now named Extension Kit), SDK-provided service, Runtime Harness, Package Tier, API-kind subpackage, Host-surface subpackage, Point, and the Extension Layering bullets.
- **First-party extension disposition: kept.** It still carries the ns-shipped-vs-third-party load that "ns extension" alone does not settle; its definition now composes with **ns extension** and adds "capability (retired term)" to *Avoid*.

### `CONTEXT-MAP.md`

Routing prose, present-context descriptions, candidate relationships, and the "Extension API" / "Domain placement / layer" flagged-ambiguity bullets adopted the new vocabulary. Physical links and package names under `ts/packages/capabilities/` and `capability-kit` remain code-plan literals.

### Nested CONTEXT files (all 12)

`ts/packages/capabilities/{branch-context,flow,handoffs,herdr,objectives,plans,reviews,slots}/CONTEXT.md`, `ts/packages/hosts/pi/CONTEXT.md`, `ts/packages/sdk/CONTEXT.md`, `ts/packages/infra/foundation/CONTEXT.md`, and `ts/packages/capability-kit/src/graphite/CONTEXT.md`. Term renames include each package's `<Name> Capability API → <Name> extension package API`, SDK's **Capability API** / **Gateway-injected capability core** entries, Pi's **Thin capability mirror → Thin extension mirror**, Herdr's **Herdr capability → Herdr extension** (+ boundary term), Objectives' **Objective Capability Dependency Boundary → Objective Extension Dependency Boundary**, and Flow's `Land Capability API → Land subpackage API` (a subpackage `/api` surface, deliberately not called an extension package API since it is not a package-level `/api` consumer seam).

### Code literals confirmed left standing

`@nseng-ai/capability-kit`, `@nseng-ai/capability-kit/<domain>` subpaths, `ts/packages/capabilities/...` and `ts/packages/capability-kit/...` paths, and the `capability` / `capability-kit` `ns.tier` values are all described as current-state strings; the root Extension Kit and Package Tier entries explicitly note the planned code-level rename targets (`extension-kit`, `extension`) without pretending the move happened. Generic-English "capability" uses (Gateway entry), retired-name *Avoid* aliases, cmux-historical aliases, and transition phrases were deliberately kept.

## Objective Impact

The ambiguity-leakage mitigation is now discoverable and reviewable where every other target derives its terms. The remaining vocabulary-layer work is the prose sweep: live READMEs, `docs/` conventions and north-star, and the skills listed in `references/blast-radius-inventory.md`. The parent's `root-readme-positioning.md` reconciliation and the code-level rename plan are the untouched roadmap rows.

## Follow-Ups

- Sweep live READMEs, `docs/`, and skills prose to the new vocabulary (same mixed-files rule).
- Reconcile `professional-repo-curation/references/root-readme-positioning.md` to **the core** / **extensions**.
- Flow's `Land subpackage API` naming sets the post-rename pattern for subpackage-level `/api` surfaces — `<Feature> subpackage API`, never the extension-package-API label; reuse it when the prose sweep hits similar surfaces.

`dprint check` passes across the repo after the edits.
