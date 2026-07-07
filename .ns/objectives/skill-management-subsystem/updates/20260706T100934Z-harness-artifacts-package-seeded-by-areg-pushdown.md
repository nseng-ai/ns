# `@nseng-ai/harness-artifacts` seeded by pushing down areg convention code

## Summary

The canonical package boundary now exists: `ts/packages/capabilities/harness-artifacts`
(`@nseng-ai/harness-artifacts`, tier `capability`, exports `.` and `./api`). This slice
was deliberately a **code reorg only** — no new provisioning machinery. The package is
seeded with the areg code the subsystem will reuse, moved verbatim (names unprefixed),
with areg re-importing from `@nseng-ai/harness-artifacts/api`:

- `skills-lockfile.ts` — the `skills-lock.json` v1 parsing (`SourceType`,
  `LockfileSkill(Data)`, `SkillsLockfile(Data)`, `parseLockfileData/Text/Inspected`),
  formerly `areg/src/operations/lockfile.ts`. This is the convergence surface the
  roadmap's install-manifest design must reconcile with; it is now owned by this
  Objective's package.
- `skill-mirror-conventions.ts` — the `.agents/skills` / `.claude/skills` mirror path
  and symlink-target conventions plus the delete-contract classifier, formerly
  `areg/src/operations/skill-mirror-conventions.ts`. Seed material for the harness path
  table (the conventions encode today's project-scope harness roots).
- `skill-frontmatter.ts` — SKILL.md frontmatter block parsing and managed-key transform,
  formerly `areg/src/operations/frontmatter.ts`.
- `fs-state.ts` — `PathState` / `TextFileState` (formerly `AregPathState` /
  `AregTextFileState` in `areg/src/gateways.ts`); areg re-exports them under the new
  names, all ~116 usages renamed.

Tests moved with the code (lockfile parser suite, frontmatter transform suite) and the
mirror conventions gained a direct unit suite (previously covered only indirectly through
areg check/doctor scenarios). areg's remaining suites pass unchanged — the reorg is
behavior-preserving. Full validation (`just`) green, including the tier-layering guard
(`standalone-tool` → `capability` is a sanctioned edge).

## Decisions confirmed in this session

- **Package name confirmed:** `@nseng-ai/harness-artifacts` (was the leading candidate;
  the open question is closed, and the workspace name is now live).
- **First harness set confirmed:** `pi` + `claude-code` + `codex` — matching
  `@nseng-ai/ns-init`'s `HarnessId` union so the `SkillMaterializer` seam binds without a
  follow-up harness addition. Recorded for the path-table design; the table itself is not
  built yet.

## What this deliberately does not do

The roadmap's design row (artifact model, harness path table, install manifest,
reconcile) remains open: no catalog types, no path table, no manifest, no reconcile were
written. A larger design-by-implementation plan for that row was drafted and set aside in
favor of this reorg-first slice; the moved lockfile/mirror/frontmatter code is the
existing-behavior substrate that design will grow around, keeping the AREG re-platforming
row a matter of moving remaining callers rather than forking formats.

## Objective Impact

- `objective.md`: the package-name open question is resolved and removed.
- `roadmap.md`: the vocabulary row completes (`[x]` — terms decided earlier, package name
  now confirmed and landed); the design row gains a pointer to the seeded package.
