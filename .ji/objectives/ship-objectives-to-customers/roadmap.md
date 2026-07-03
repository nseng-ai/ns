# Roadmap

## Work

- [x] Decide the npm-distribution structure: split checkout-free `sdl` publishing into its own Objective, or keep it as this Objective's spine. **Resolved 2026-07-01: SPLIT** into `checkout-free-sdl-distribution`; consumed here as a hard dependency.
  - Notes: gates sequencing; the long pole either way. Checkout-free `sdl` benefits every capability, so it is its own Objective, not this spine.
- [ ] **Dependency (owned by `checkout-free-sdl-distribution`):** make the `ji` CLI publishable and checkout-free — drop `private` on `@sdl/kernel` and its required runtime workspace deps, resolve the source-path module loader so `@sdl/objective` and its hidden `exec` surface are bundled, produce a bundle with no `ts/node_modules` precondition, and publish a versioned package to npm.
  - Evidence: a global/`npx` install of `ji` on a machine with no SDL checkout runs `ji objective list` against a foreign repo.
  - Notes: tracked here as a consumed dependency; the work lives in the split Objective.
- [ ] **Dependency (spans `checkout-free-sdl-distribution` + `skill-management-subsystem`):** bundle the objective skill dirs into the npm package and expose a minimal `ji skills install` that copies them into the correct per-harness roots (`.claude/skills/`, `.agents/skills/`). Copy-not-symlink (areg's symlink model does not fit customers).
  - Notes: consume the platform path table, do not rebuild it; this is the concrete op the `@ji/init` `SkillMaterializer` binds to.
- [ ] Scaffold the `@ji/init` capability package: `SkillMaterializer` gateway interface + fake + labeled stub real-impl, and the managed-block/git-posture operation surface, surfaced as top-level `ji init` (wired like `@sdl/objective`). Reuse `@sdl/core/managed-region`; borrow areg `init` patterns without depending on it.
  - Evidence: `ji init --harness ...` scenario tests pass against fakes (block written, `.ji/objectives/` created, git posture verified, skill step invoked-and-faked).
  - Notes: bundle-independent parts build now against a run-from-source install; only the concrete skill copy is deferred to the bundle + skill-management slice.
- [ ] Implement `ji init` bundle-independent behavior: explicit `--harness` selection (no sniffed default; persist to `ji.toml` for re-runs), the `ji:objectives:*` managed `AGENTS.md` block + `CLAUDE.md → @AGENTS.md` import (idempotent/upgradeable/removable), `.ji/objectives/` creation with `.gitkeep`, and verify-and-write-never-commit git posture (require repo, verify trunk detectable).
- [ ] Wire the real `SkillMaterializer` to `skill-management-subsystem`'s copy-into-harness-roots slice once the npm bundle exists (copy bundled objective skill dirs → `.claude/skills/` + `.agents/skills/`, idempotent). Depends on `checkout-free-sdl-distribution` + a minimal `ji skills install`.
  - Notes: resolves the CLI↔skill bidirectional dependency by shipping them together; consume the platform path table, do not rebuild it.
- [ ] Author the lean, portable, harness-neutral objective instruction block (decided: objectives-exist + `ji objective list` before non-trivial work + use the objective skills/CLI; `load-orientations` and Tracking-Gate prose are opt-in/upgradeable, not day-one). This is the block content `ji init` writes.
- [ ] Write real onboarding docs content for objectives in `docs-site` (installation, quickstart, concepts/objectives, tools/objective), replacing the placeholder pages, and un-gate publication.
  - Notes: docs-site shell and stack owned by `eve-parity-docs-site`; content and gating owned here.
- [ ] Verify onboarding end-to-end in a throwaway non-SDL repo for **all three** of Claude Code, Codex, and Pi (decided 2026-07-01): install `ji`, install skills, bootstrap, then create → next → update → close.
  - Notes: also de-risks the standalone-portability assumption.

## Parked

- [ ] Additional harnesses beyond Claude Code / Codex / Pi (Cursor, opencode, Gemini, Windsurf).
- [ ] Customer-facing skill upgrade / drift management (versioned skill sync in a customer repo) beyond first install.
- [ ] Telemetry, feedback channel, licensing / accounts, and released-package release automation / CI.
