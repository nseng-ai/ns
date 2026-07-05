# areg is not the customer provisioning path; first consumer seam landed in `@nseng-ai/ns-init`

## Context

While scaffolding `@nseng-ai/ns-init` (the `ns init` capability package for
`ship-objectives-to-customers`), the question came up directly: don't we already have
code that installs and manages skills in areg? Recording the answer here because this
Objective owns the provisioning path that question is really about.

## The areg answer

Yes — `ts/packages/tools/areg` has a full apparatus: `npx-skills-gateway`,
`skillx-workspace-gateway`, skill-kind inference, doctor reports, and an `init`
operation. It was examined and deliberately rejected as the customer provisioning path
in the 2026-07-01 `ship-objectives-to-customers` grilling session
(`.ns/objectives/ship-objectives-to-customers/updates/20260701T185244Z-grilling-decisions-and-distribution-split.md`),
and the code confirms why:

- **Symlink-based.** areg's model materializes `.agents/skills/<name>` as a symlink to
  `../../skills/<name>`, and `.claude/skills/<name>` as a symlink into
  `.agents/skills/` (`src/operations/init.ts` instruction text,
  `skill-mirror-conventions.ts`). A customer who installed `ns` from npm has no source
  skill directory in their repo to symlink to.
- **Dev-facing.** areg `init` hard-codes cloning `dagster-io/asdl-tools` as
  `BOOTSTRAP_REPO` and shells out to the third-party `npx skills` CLI
  (`npx-skills-gateway.ts`). Customers should not be cloning our tooling repos, and
  this Objective's scope already commits to zero `npx skills` dependency for
  first-party content.

Customers need bundled skill directories **copied** into harness roots — the
copy-not-symlink provisioning op this Objective owns.

What the customer path *did* keep from areg is its patterns, not its machinery: the
managed-markdown-block approach (via the shared `@nseng-ai/foundation/managed-region`
primitive areg also consumes) and its append/update/already-current/malformed handling
shape.

## The consumer seam now exists

`@nseng-ai/ns-init` (`ts/packages/capabilities/ns-init`) landed with a typed
`SkillMaterializer` gateway —
`materializeObjectiveSkills({ repoRoot, harnesses: ("claude-code" | "codex" | "pi")[] })`
returning `materialized | unavailable | error` — plus an in-memory fake and a labeled
`pendingBundleSkillMaterializer` stub that reports `unavailable` until a real
implementation exists. That is the first concrete binding point for this Objective's
copy-into-harness-roots slice: when the `ns skills` provisioning surface exists, the
`@nseng-ai/ns` host wires it in as the real `SkillMaterializer` (locating skill dirs
bundled inside the published package is host knowledge, injected at wiring time).

None of this forecloses areg reuse *inside* this Objective — re-platforming AREG onto
the shared core remains the roadmap's proving-second-consumer row; the seam only fixes
the customer-facing contract (copy, not symlink; no bootstrap clone; no `npx skills`).
