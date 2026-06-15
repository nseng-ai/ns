# Roadmap

## Work

- [x] Record the out-of-sequence selection in the parent TypeScript migration Objective.
  - Updated `port-asdl-toolkit-to-typescript` so `areg` is no longer merely parked pending evidence, and explained why this Objective intentionally jumps ahead of the default `handoff`/`objective` sequence.
  - Evidence: parent migration ledger, roadmap, and Semantic Update `updates/2026-06-14T210247Z-areg-promoted-out-of-sequence.md` identify `areg-typescript-port` as the active capability slice and preserve the remaining sequence implications.
- [x] Inventory current `areg` contracts before porting implementation.
  - Classified durable versus incidental behavior for CLI commands, hidden `exec skillx` JSON, help/usage output, exit codes, managed project files, `skills-lock.json`, `asdl.toml` and legacy `areg.json`, local skill layout checks, command-conversion behavior, and external `git`/`gh`/`npx` boundaries.
  - Evidence: `areg-contract-inventory.md` cites current Python source/tests and records accepted TypeScript divergences before implementation relies on them.
- [x] Establish the TypeScript package shell and gateway seams.
  - Added `ts/packages/areg` as `@asdl/areg` with strict TypeScript, Vitest tests, standalone `areg` CLI shell, TypeScript runtime diagnostics, hidden `exec skillx` group structure, and package-local fake-driven gateway seams for Git-root/tool checks, GitHub skill listing, `npx skills`, and transient skillx workspaces.
  - Deferred filesystem and project-configuration gateways to the first command slices that consume them; keep all seams package-local unless repeated use proves a shared `@asdl/core` or `@asdl/clinkr` extraction.
  - Evidence: Semantic Update `updates/2026-06-14T213335Z-areg-package-shell-gateway-seams.md` records focused validation and deferred seam boundaries.
- [x] Port the hidden `exec skillx` helpers as the first deterministic slice.
  - Implemented TypeScript `areg exec skillx parse|list|fetch|cleanup` with accepted Clinkr envelope semantics, parser/list/fetch/cleanup behavior, GitHub listing error classification, `npx skills add` transient workspace behavior, and cleanup path safety.
  - Evidence: Semantic Update `updates/2026-06-14T225500Z-exec-skillx-clinkr-envelope-divergence.md`; fake-backed tests, CLI scenario coverage, and real-adapter protocol/safety tests exercise success and failure payloads.
- [x] Port `areg check` and skill/lockfile validation.
  - Implemented visible TypeScript `areg check [--path PATH]` with Clinkr human/JSON behavior, a package-local constrained project inspection gateway, lockfile/frontmatter parsing, local and remote skill structure checks, invoke-only/Pi replacement checks, lock hash checks, orphan/dangling checks, and `AGENTS.md`/`CLAUDE.md` pairing checks.
  - Evidence: focused `@asdl/areg` type-check and Vitest suite passed with scenario/unit/gateway coverage for success, malformed lockfiles, invalid hashes, local/remote layout failures, SKILL.md/frontmatter failures, invoke-only/Pi replacement failures, orphan/dangling entries, pairing failures, fake gateway copy behavior, and real adapter symlink/traversal facts.
- [x] Port `areg init` project bootstrap behavior.
  - Implemented visible TypeScript `areg init [target] [--agent AGENT ...] [--yes] [--no-append]` with Git-root requirements, bootstrap skill install, agent resolution, managed `AGENTS.md`/`CLAUDE.md` blocks, `asdl.toml` `[areg].agents`, legacy config fallback, symlink/path safety, and non-destructive planning before `npx` install.
  - Evidence: focused `@asdl/areg` type-check and Vitest suite passed with scenario/unit/gateway coverage for command shape, default and explicit agents, TOML preservation, legacy migration, prompts, `--yes`, `--no-append`, malformed markers, invalid config, Git-root rejection, npx non-destructiveness, JSON output, and real init gateway symlink/path revalidation.
- [x] Port `areg update-skills` as the curated lockfile workaround.
  - Implemented visible TypeScript `areg update-skills` with GitHub-sourced lockfile selection, `--skill`/`--source` filtering, `--dry-run`, shared agent resolution, a dedicated read-only update inspection gateway, one `npx skills add` call per selected skill, and aggregate failure reporting with structured Clinkr data.
  - Evidence: Semantic Update `updates/2026-06-15T012054Z-areg-update-skills-typescript-port.md`; focused `@asdl/areg` type-check and Vitest suite passed with scenario/gateway coverage for sorted one-by-one updates, local-skill skipping, filters, no-match/early-error paths, dry-run, agent precedence, missing/malformed lockfiles, missing `npx`, partial failures, JSON envelopes, fake copy behavior, and real update inspection.
- [x] Reimplement the skill invocation kinds system in TypeScript.
  - Implemented the flattened `areg skill apply|list|show` surface, replacing the planned `skill kind` subgroup and removing final `areg command convert|revert|list` compatibility from the current Objective spec.
  - `areg skill apply` now plans and applies the managed artifact matrix for `normal`, `invoke-only`, `command-backed`, and `ambient-only`, including frontmatter edits, Codex sidecar writes/deletes, Pi settings reconciliation, replacement verification, dry-runs, and deletion confirmation/`--yes` behavior.
  - Added package-local fake and real gateway apply-plan seams with path/symlink safety, plus a minimal Clinkr final-variadic positional extension so `apply <kind> <skill...>` is represented directly.
  - Evidence: branch diff against `skill-invocation-kind/read-only-foundation`; PR #1564 corroborates the same file set; focused `@asdl/areg` and `@asdl/clinkr` checks/tests passed; full TypeScript workspace check/test passed; `just dprint-check` passed.
- [ ] Decide and implement the TypeScript distribution/install model.
  - Choose consumer-backed invocation for local checkout development and installed use, update `justfile`/workspace metadata/docs accordingly, and avoid assuming either Python `uvx` or prior run-from-source shims without evidence.
  - Evidence: installation recipe and docs invoke TypeScript-backed `areg` consistently.
- [ ] Cut over public callers and retire the Python package.
  - Remove active references to Python `packages/areg`, delete or archive the package after rollback/reference evidence is recorded, and ensure tests/docs/skills no longer direct users to Python-backed invocation.
  - Evidence: repo searches and relevant workspace checks show `areg` is TS-default and Python is no longer an active path.
- [ ] Feed reusable lessons back into the parent migration Objective.
  - Record any reusable findings about skill-lock parsing, managed project-file mutation, external skill tooling, or distribution that should affect later capability ports.
  - Evidence: parent Semantic Update and, if warranted, `porting-playbook.md` changes capture lessons without moving unproven package-local seams into shared foundations.

## Parked

- Mounting `areg` under the top-level `asdl` CLI or renaming the product surface.
- Redesigning the upstream `npx skills` install/update model instead of preserving the current workaround.
- Broad skill-content audits unrelated to behavior needed by the `areg` port.
- Browser-compatible execution for `areg` workflows that depend on local filesystem, Git, `gh`, or `npx` state.
- Shared TypeScript extraction for skill-lock/project-config/managed-block helpers before a second consumer proves the seam.
