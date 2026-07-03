# Roadmap

## Work

- [x] Inventory active Node runtime compatibility surfaces.
      Inventory evidence identified the two active Bun shebang runtime blockers, the `bunx` Vercel fallback, the generic runner `node|bun` handling that should remain classified, the erasable-only guardrail gap, the Pi extension/workspace import paths, and the Graphite metadata sqlite policy decision point.

- [x] Harden TypeScript CLI entrypoints for Node v24.12+ native type stripping.
      `asdl-dev` and `planned-branch` now use Node shebangs while their package `bin` entries continue to point at TypeScript source. Node v24.12.0 direct execution and pnpm exec smoke commands validated the supported path without build artifacts.

- [x] Enforce or validate erasable-only TypeScript runtime source.
      The TypeScript workspace enables `compilerOptions.erasableSyntaxOnly: true`, and the TypeScript check passes under the supported Node baseline.

- [x] Harden project-local Pi extension runtime compatibility under Node.
      Checked-in Vitest smoke coverage now spawns Node directly to import `.pi/extensions/*.ts` adapters and representative workspace package exports from `@asdl/pi-extensions` and `@asdl/ccc` package-local directories.

- [x] Decide and implement the Graphite metadata reader runtime policy.
      The Objective reaffirms the external `sqlite3` CLI reader. `sqlite3` is available locally, `node:sqlite` import still emits an experimental warning, and existing adapter-bound unavailable/read-failure behavior remains the preferred policy.

- [x] Update active runtime command documentation and record final compatibility evidence.
      Active CCC/Pi guidance now says pnpm/Vitest tests instead of Bun tests. Remaining Bun hits are classified as generic runner safety handling, explicit anti-Bun-test guidance, or out-of-scope broad cleanup, and final evidence is recorded in the Semantic Update and closure context.

## Parked

- [ ] Introduce build-to-JavaScript artifacts only if Node native type stripping cannot satisfy a concrete project-local CLI or Pi extension runtime path.
- [ ] Expand from project-local runtime compatibility to published-package or non-workspace install guarantees only if the repository decides those are supported distribution modes.
- [ ] Replace deliberate Bun-centric project templates only in the Bun-reference reconciliation Objective if that Objective brings templates into scope.
