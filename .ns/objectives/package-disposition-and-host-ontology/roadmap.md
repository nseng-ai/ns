# Roadmap

## Work

- [x] Draft and approve the superseding package-ontology ADR and complete destination inventory. ADR 0045 and `references/package-destination-map.md` classify all 26 baseline workspace manifests, define the 34-package target, settle Pi extraction and owner nesting, enumerate identity/dependency/release consequences, and provide the approved replacement direction for `professional-repo-curation`. The user explicitly approved the full map and ADR on 2026-07-25. The parent record was reconciled through its own tracking workflow on 2026-07-26 (`professional-repo-curation` update `2026-07-26T000342Z-adopt-disposition-ontology-direction.md`): its objective, roadmap, and always-loaded orientation now carry the disposition-ontology direction instead of the flat incubator. No package move or publication was authorized.
- [ ] Design the atomic implementation stack from the approved map. Specify reviewable branches/commits for mechanical moves, identity cutovers, one-package-per-domain Pi extraction, dependency rewiring, documentation, and guards while preserving one coordinated landing boundary and no trunk-visible mixed-path state.
- [ ] Execute the coordinated package cutover. Move the complete inventory into `public/`, `incubating/`, or `internal/`; establish owner-specific nested ontologies; rename identities so every leaf matches its package; place `@nseng-ai/ns` at `public/ns/`; establish incubating `@nseng-ai/pi-runtime` at `incubating/hosts/pi/runtime/pi-runtime/`; and update all workspace consumers, package preparation, scripts, and fixtures without compatibility aliases.
- [ ] Extract Pi integration from every ns extension that currently contains it. Remove Pi code, imports, subpackages, and entrypoints from ns extensions; create one `pi-ns-<domain>` package per retained integration under the correct `hosts/pi/extensions/` disposition; consume only curated ns extension package APIs; classify Pi-native and project-only Pi code under the approved Pi ontology.
- [ ] Land the package-tree contract and final enforcement with the cutover. Make `ts/packages/README.md` authoritative, add only warranted host-level READMEs, enforce disposition dependency closure, scope/disposition consistency, global leaf-name identity, duplicate-leaf rejection, and the ns-extension/Pi separation, then remove legacy path handling and stale terminology.
- [ ] Complete migration reconciliation and evidence. Update CONTEXT files, package READMEs, AGENTS guidance, active Objective prose, and other live references to the final ontology; verify relevant repository checks, package builds/packs, and checkout-free smokes; record the coordinated landing in this Objective and synthesize the result into `professional-repo-curation`. No registry publication is authorized.

## Parked

- Actual npm publication or release orchestration after the repository organization and package identities are ready.
- Adding integrations for hosts other than Pi; the ontology permits each future host to define an appropriate nested structure when real code exists.
- Promoting an internal package to incubating or public without a separately approved release-intent decision.
- Compatibility aliases for old package identities or paths unless an external compatibility requirement is discovered and explicitly approved.
