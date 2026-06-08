# Roadmap

## Work

- [ ] Inventory active Node runtime compatibility surfaces.
      Include CLI shebangs and `bin` entries, package scripts that launch TypeScript source, Pi extension imports across workspace packages, `import.meta.main` behavior, active Bun-only runtime APIs or fallbacks, `erasableSyntaxOnly` coverage, and the current Graphite metadata reader. Evidence should separate runtime blockers from broad Bun-reference cleanup.

- [ ] Harden TypeScript CLI entrypoints for Node v24.12+ native type stripping.
      Replace Bun shebang or launch assumptions for `asdl-dev`, `planned-branch`, and any related project-local CLI paths with a Node-compatible supported path. Preserve explicit `.ts` imports and avoid build artifacts unless evidence requires them.

- [ ] Enforce or validate erasable-only TypeScript runtime source.
      Add the guardrail needed so runtime entrypoints cannot accidentally start using non-erasable TypeScript syntax. Evidence should include the relevant TypeScript check and representative Node import or execution probes.

- [ ] Harden project-local Pi extension runtime compatibility under Node.
      Smoke representative project-local Pi extension modules and source-export package boundaries under Node, including extension code that imports CLI modules or workspace package exports. Record any package-boundary constraints for future work.

- [ ] Decide and implement the Graphite metadata reader runtime policy.
      Either reaffirm the current external `sqlite3` CLI reader with evidence, or replace it behind the Graphite metadata adapter boundary. If `node:sqlite` is adopted, warning suppression must be targeted to that boundary.

- [ ] Update active runtime command documentation and record final compatibility evidence.
      Update only active docs or agent guidance that describe Node/Bun runtime launch paths for this slice. Record validation evidence, remaining classified Bun references, and follow-ups for Bun-reference reconciliation.

## Parked

- [ ] Introduce build-to-JavaScript artifacts only if Node native type stripping cannot satisfy a concrete project-local CLI or Pi extension runtime path.
- [ ] Expand from project-local runtime compatibility to published-package or non-workspace install guarantees only if the repository decides those are supported distribution modes.
- [ ] Replace deliberate Bun-centric project templates only in the Bun-reference reconciliation Objective if that Objective brings templates into scope.
