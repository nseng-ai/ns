# areg contract inventory complete

## Summary

Completed the initial TypeScript-port contract inventory for the current Python `areg` implementation and recorded the durable/incidental classification in `areg-contract-inventory.md`.

The inventory covers:

- Standalone `areg` CLI identity and visible/hidden command surfaces.
- Hidden `areg exec skillx parse|list|fetch|cleanup` JSON contracts, exit behavior, and transient workspace cleanup safety.
- `areg init` Git-root, target-agent resolution, managed block, `asdl.toml`, legacy `areg.json`, bootstrap install, and symlink/path safety behavior.
- `areg check` skill-layout, lockfile, frontmatter, invoke-only, Pi-exclusion, orphan, and `AGENTS.md`/`CLAUDE.md` pairing checks.
- `areg update-skills` curated lockfile-preserving workaround semantics.
- `areg command convert|revert|list` local-skill selection, command-backed artifacts, Pi replacement verification, dry-run/idempotence, and reporting behavior.
- File/config contracts for `skills/`, `.agents/skills`, `.claude/skills`, `skills-lock.json`, `asdl.toml`, `.pi/settings.json`, and managed instruction blocks.
- External gateway boundaries for Git root discovery, host tool checks, `gh api`, `npx skills add`, transient skillx workspaces, and filesystem planning/mutation.

Accepted TypeScript divergences are recorded for Python module layout, Click help/error byte formatting, JSON key order/indentation, internal dataclass/enum/exception names, TS-native gateway implementation shape, safer `gh` error classification, and possible `areg init` ordering improvements that preserve the existing safety guarantees.

## Objective Impact

The contract-inventory roadmap row is complete. The next semantic work can establish the TypeScript package shell and package-local gateway seams without guessing which Python details are public compatibility requirements.

The inventory also clarifies one scope boundary for later rows: `docs/skill-invocation-profiles.md` documents future `areg skill profile` commands, but the current Python CLI does not register that surface. The current TypeScript port should preserve the implemented legacy `areg command convert|revert|list` surface unless a separate explicit decision expands scope.

## Follow-Ups

- Start the TypeScript package shell using package-local seams for filesystem, Git-root/tool checks, `gh api`, `npx skills`, transient skillx workspaces, and project config.
- Port hidden `exec skillx` as the first deterministic implementation slice against the recorded JSON and cleanup contracts.
- Revisit distribution only at the dedicated distribution roadmap row; do not inherit Python `uvx areg` or previous TS run-from-source shims by accident.
