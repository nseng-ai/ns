# Roadmap

## Work

- [ ] Draft the superseding package-ontology ADR and complete destination inventory. Classify every TypeScript package by `public`, `incubating`, or `internal`; assign its final nested path and leaf-matching identity; enumerate splits, renames, consumers, and dependency effects; define the authoritative package-tree and Pi-host contracts. Reconcile `professional-repo-curation` with the settled replacement direction. Gate: obtain explicit user approval of the ADR and full package map before implementation begins.
- [ ] Design the atomic implementation stack from the approved map. Specify reviewable branches/commits for mechanical moves, identity cutovers, one-package-per-domain Pi extraction, dependency rewiring, documentation, and guards while preserving one coordinated landing boundary and no trunk-visible mixed-path state.
- [ ] Execute the coordinated package cutover. Move the complete inventory into `public/`, `incubating/`, or `internal/`; establish owner-specific nested ontologies; rename identities so every leaf matches its package; place `@nseng-ai/ns` at `public/ns/`; establish `@nseng-ai/pi-runtime` at `public/hosts/pi/pi-runtime/`; and update all workspace consumers, package preparation, scripts, and fixtures without compatibility aliases.
- [ ] Extract Pi integration from every ns extension that currently contains it. Remove Pi code, imports, subpackages, and entrypoints from ns extensions; create one `pi-ns-<domain>` package per retained integration under the correct `hosts/pi/extensions/` disposition; consume only curated ns extension package APIs; classify Pi-native and project-only Pi code under the approved Pi ontology.
- [ ] Land the package-tree contract and final enforcement with the cutover. Make `ts/packages/README.md` authoritative, add only warranted host-level READMEs, enforce disposition dependency closure, scope/disposition consistency, global leaf-name identity, duplicate-leaf rejection, and the ns-extension/Pi separation, then remove legacy path handling and stale terminology.
- [ ] Complete migration reconciliation and evidence. Update CONTEXT files, package READMEs, AGENTS guidance, active Objective prose, and other live references to the final ontology; verify relevant repository checks, package builds/packs, and checkout-free smokes; record the coordinated landing in this Objective and synthesize the result into `professional-repo-curation`. No registry publication is authorized.

## Parked

- Actual npm publication or release orchestration after the repository organization and package identities are ready.
- Adding integrations for hosts other than Pi; the ontology permits each future host to define an appropriate nested structure when real code exists.
- Promoting an internal package to incubating or public without a separately approved release-intent decision.
- Compatibility aliases for old package identities or paths unless an external compatibility requirement is discovered and explicitly approved.
