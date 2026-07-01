# Roadmap

## Work

- [ ] Decide the npm-distribution structure: split checkout-free `sdl` publishing into its own Objective, or keep it as this Objective's spine. Record the decision; if split, create and link the subobjective.
  - Notes: gates sequencing; the long pole either way.
- [ ] Make the `sdl` CLI publishable and checkout-free: drop `private` on `@sdl/kernel` and its required runtime workspace deps, resolve the source-path module loader so `@sdl/objective` and its hidden `exec` surface are bundled, produce a bundle with no `ts/node_modules` precondition, and publish a versioned package to npm.
  - Evidence: a global/`npx` install of `sdl` on a machine with no SDL checkout runs `sdl objective list` against a foreign repo.
- [ ] Bundle the objective skills into the npm package and expose customer install into the correct per-harness roots (`.claude/skills/`, `.agents/skills/`) through `skill-management-subsystem`'s `sdl skills` surface.
  - Notes: resolves the CLI↔skill bidirectional dependency by shipping them together; consume the platform path table, do not rebuild it.
- [ ] Design and implement customer-repo bootstrap: harness detection, skill materialization for detected harnesses, a minimal portable `AGENTS.md` managed instruction block (idempotent, upgradeable, removable) with the `CLAUDE.md → @AGENTS.md` import, `.sdl/objectives/` creation, and git-posture verification.
  - Notes: resolves the `sdl init` vs `sdl objective init` vs `sdl skills install` home and the write-vs-copy `AGENTS.md` question.
- [ ] Author the minimal, portable, harness-neutral objective instruction block, deciding whether orientations and the Tracking Gate ship day-one or opt-in.
- [ ] Write real onboarding docs content for objectives in `docs-site` (installation, quickstart, concepts/objectives, tools/objective), replacing the placeholder pages, and un-gate publication.
  - Notes: docs-site shell and stack owned by `eve-parity-docs-site`; content and gating owned here.
- [ ] Verify onboarding end-to-end in a throwaway non-SDL repo for Claude Code and Codex (Pi if feasible): install `sdl`, install skills, bootstrap, then create → next → update → close.
  - Notes: also de-risks the standalone-portability assumption.

## Parked

- [ ] Additional harnesses beyond Claude Code / Codex / Pi (Cursor, opencode, Gemini, Windsurf).
- [ ] Customer-facing skill upgrade / drift management (versioned skill sync in a customer repo) beyond first install.
- [ ] Telemetry, feedback channel, licensing / accounts, and released-package release automation / CI.
