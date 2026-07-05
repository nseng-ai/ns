# Roadmap

## Work

Subobjective order and rationale for this umbrella Objective live in `objective.md`'s Thesis (the four Objective Edges are in its frontmatter); the list is not restated here to avoid drift.

- [x] Decide the npm-distribution structure: split checkout-free `ns` publishing into its own Objective, or keep it as this Objective's spine. **Resolved 2026-07-01: SPLIT** into `checkout-free-sdl-distribution`; consumed here as a hard dependency.
  - Notes: gates sequencing; the long pole either way. Checkout-free `ns` benefits every capability, so it is its own Objective, not this spine.
- [~] **Dependency (owned by `checkout-free-sdl-distribution`):** ship a checkout-free, npm-installable `ns`. The decided design keeps `@nseng-ai/kernel` permanently private and folds its runtime — plus `@nseng-ai/objectives` and its hidden `exec` surface — into the published `@nseng-ai/ns` bundle (esbuild), replacing the source-path module loader (`ts/packages/kernel/src/runtime/module-loader.ts`); produce a bundle with no `ts/node_modules` precondition; publish a versioned package to npm.
  - Evidence: a global/`npx` install of `ns` on a machine with no ns checkout runs `ns objective list` against a foreign repo.
  - Notes: tracked here as a consumed dependency; the work lives in the split Objective and is nearly done. The `@nseng-ai/ns` host package (`ts/packages/hosts/ns-cli`) builds an esbuild bundle; `pack:local` + `publish:dry-run` + a checkout-free smoke (install a packed tarball into a foreign repo, run `ns objective list`) pass. The module-loader replacement is still `[~]` (preinstalled Objective catalog thunks + specifier-based loading), and only the actual npm publish and a real global/`npx` install verification remain open.
- [ ] **Dependency (spans `checkout-free-sdl-distribution` + `skill-management-subsystem`):** bundle the objective skill dirs into the npm package and expose a minimal `ns skills install` that copies them into the correct per-harness roots (`.claude/skills/`, `.agents/skills/`). Copy-not-symlink (areg's symlink model does not fit customers).
  - Notes: consume the platform path table, do not rebuild it; this is the concrete op the `@nseng-ai/init` `SkillMaterializer` binds to. No `ns skills` command exists yet.
- [ ] Scaffold the `@nseng-ai/init` capability package: `SkillMaterializer` gateway interface + fake + labeled stub real-impl, and the managed-block/git-posture operation surface, surfaced as top-level `ns init` (wired like `@nseng-ai/objectives`). Reuse `@nseng-ai/foundation/managed-region`; borrow areg `init` patterns without depending on it.
  - Evidence: `ns init --harness ...` scenario tests pass against fakes (block written, `.ns/objectives/` created, git posture verified, skill step invoked-and-faked).
  - Notes: bundle-independent parts build now against a run-from-source install; only the concrete skill copy is deferred to the bundle + skill-management slice.
- [ ] Implement `ns init` bundle-independent behavior: explicit `--harness` selection (no sniffed default; persist to `ns.toml` for re-runs), the `ns:objectives:*` managed `AGENTS.md` block + `CLAUDE.md → @AGENTS.md` import (idempotent/upgradeable/removable), `.ns/objectives/` creation with `.gitkeep`, and verify-and-write-never-commit git posture (require repo, verify trunk detectable).
- [ ] Wire the real `SkillMaterializer` to `skill-management-subsystem`'s copy-into-harness-roots slice once the npm bundle exists (copy bundled objective skill dirs → `.claude/skills/` + `.agents/skills/`, idempotent). Depends on `checkout-free-sdl-distribution` + a minimal `ns skills install`.
  - Notes: resolves the CLI↔skill bidirectional dependency by shipping them together; consume the platform path table, do not rebuild it.
- [ ] Author the lean, portable, harness-neutral objective instruction block (decided: objectives-exist + `ns objective list` before non-trivial work + use the objective skills/CLI; `load-orientations` and Tracking-Gate prose are opt-in/upgradeable, not day-one). This is the block content `ns init` writes.
- [ ] Write real onboarding docs content for objectives in `docs-site` (installation, quickstart, concepts/objectives, tools/objective), replacing the placeholder pages, and un-gate publication.
  - Notes: docs-site shell and stack owned by `eve-parity-docs-site`; content and gating owned here. All four pages are still placeholders and deploys remain launch-gated.
- [ ] Verify onboarding end-to-end in a throwaway non-SDL repo for **all three** of Claude Code, Codex, and Pi (decided 2026-07-01): install `ns`, install skills, bootstrap, then create → next → update → close.
  - Notes: also de-risks the standalone-portability assumption.

## Parked

- [ ] Additional harnesses beyond Claude Code / Codex / Pi (Cursor, opencode, Gemini, Windsurf).
- [ ] Customer-facing skill upgrade / drift management (versioned skill sync in a customer repo) beyond first install.
- [ ] Telemetry, feedback channel, licensing / accounts, and released-package release automation / CI.
