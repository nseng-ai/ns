# Combined Thermo-Nuclear Code Quality Review — areg TypeScript CLI

This document merges two independent thermo-nuclear reviews of the same TypeScript
`areg` CLI at the same commit. Overlapping structural findings are consolidated;
model-specific findings are preserved and attributed.

## Review metadata

- **Commit:** `f6c8e061dcd829149356a69bee943283092b6ab4` (`f6c8e061d`), 2026-06-15 08:36:37 -0400
- **Scope reviewed:** `ts/packages/areg` in its entirety (~3,500 lines of `src/`, gateways, shim install surface, and tests)
- **Review type:** thermo-nuclear-code-quality-review
- **Sources merged:**
  - `reviews-findings/2026-06-15-openai-codex-gpt-5-5-areg-cli-review.md` — Harness: Pi; Model: `openai-codex/gpt-5.5`
  - `review-findings/areg-ts-cli-thermo-nuclear-review.claude-opus-4-8.md` — Harness: Claude Code (CLI); Model: Claude Opus 4.8 (1M context), `claude-opus-4-8[1m]`

---

## Scope note (both reviewers agree)

The **branch diff itself is tiny and clean**: it deletes the Python `packages/areg`
and adds a 33-line bash `areg-shim` plus a thorough 132-line wrapper test. The shim
is genuinely good — clear precedence logic (enclosing checkout → baked canonical →
hard error), every branch covered by a test, honest error messages. **The branch's
actual change is approvable.**

The findings below are about the **whole** TS CLI, which predates this branch and
carries structural debt that the migration is now locking in as the canonical
implementation. This migration is the moment to fix it: once this is the canonical
impl, every issue below becomes "the way areg is."

---

## Consolidated findings

### A. Gateway layer is a monolith of near-identical adapters with identity-only type aliases

*Both reviewers independently flagged this as the dominant structural issue.*

- **Four near-identical project-inspection gateways** — `RealAregCheckProjectInspectionGateway`,
  `RealAregInitProjectGateway`, `RealAregUpdateProjectGateway`, `RealAregSkillKindProjectGateway`
  — are the *same* gateway wearing four hats. They differ only in *which* files they read,
  yet each re-implements `projectDir` resolution, `inspectPath`/`inspectTextFile`, and
  `genericReplacement`. `real-gateways.ts` additionally owns host, GitHub, npx, skillx,
  prompt, init, update, skill-kind, check, path safety, recursive scanning, and write
  execution in one ~835-line file; `fake-gateways.ts` mirrors it with duplicated state/copying.
- **Six identity type aliases that buy nothing** (`gateways.ts:141-203`):

  ```ts
  export type AregInitPathState = AregCheckPathState;
  export type AregInitTextFileState = AregCheckTextFileState;
  export type AregUpdatePathState = AregCheckPathState;
  // ...SkillKind too — six aliases, all === AregCheckPathState/TextFileState
  ```

  They imply a domain distinction that does not exist. The `Check` prefix on the
  canonical pair is itself misleading — path-state is a filesystem-inspection
  primitive shared by every gateway, not a check concept.

**Recommendation:**

1. Delete all six aliases; use one canonical `AregPathState` / `AregTextFileState` pair everywhere.
2. Collapse the four inspection gateways toward one `AregProjectInspectionGateway`
   (or a shared `inspectProject(projectDir, {fields})` core) so `projectDir` resolution,
   `genericReplacement`, and `.pi/settings.json` reading exist once.
3. Split the monolith by capability/feature and extract shared managed-file / path-safety
   primitives plus one small in-memory fake project model — deleting the repeated
   gateway/fake plumbing.

### B. Verbatim duplication — extract or delete

*Confirmed by grep (Opus); aligns with Codex's monolith finding.*

- **`genericReplacement` block copy-pasted** byte-for-byte between `real-gateways.ts:273-276`
  and `:372-375`. Extract `inspectGenericReplacement(projectDir)`.
- **`.pi/settings.json` parsing duplicated** — `check.ts:parsePiExclusions` (274-287) and
  `skill-kind.ts:parsePiSettings` (441-456) re-implement the same JSON-parse + `isRecord` +
  "skills must be array of strings" validation with identical error strings. Use one
  canonical parser; `check` can ignore the extra `data`/`text` fields.
- **`rejectTextState` duplicated verbatim** between `init.ts:332-337` and `project-agents.ts:78-83`.
- **`errorInfo` defined twice** — `real-gateways.ts:824` (local) and `init.ts:399` (`export`ed).
  The `init.ts` one is **dead**: zero callers, zero importers. Delete it; promote one shared
  `errorInfo` if both layers need it.

These are independent maintenance hazards where a message or rule will drift between copies.

### C. `areg check` and `areg skill` have contradictory skill-kind models

*Codex-specific.*

`skill-kind.ts` defines `invoke-only` as `disable-model-invocation + openai.yaml + no Pi
exclusion` (`ts/packages/areg/src/operations/skill-kind.ts`, tested in
`skill-kind-list-show-cli.test.ts`). But `check.ts` treats any disabled/sidecar local skill
without `-skills/<name>` as a command-converted error.

This is a model split, not a local bug. **Delete the bespoke `checkInvokeOnly` logic and
make `check` consume the same classifier used by `areg skill list/show/apply`.** (Reinforces
finding A — both commands should consume one typed skill-kind model.)

### D. Pi replacement verification is too magical and not actually per-command

*Codex-specific.*

`SPECIALIZED_SKILL_REPLACEMENTS` returns `verified: true` unconditionally. Generic
replacements are "verified" by two project-global file-existence booleans in
`real-gateways.ts`. That does not prove `/foo:bar` exists.

**Replace with a real inventory/contract:** gateway returns verified replacement surfaces,
or `hasReplacement(surface)`. Do not call global file existence "verified."

### E. Mutating flows can leave half-applied state

*Codex-specific.*

`runInit` installs bootstrap skills before applying planned text writes, so a later write
failure leaves installed skills behind. `runSkillKindApply` mutates one skill at a time and
returns partial results on later failure, while `applySkillKindPlan` validates/writes/deletes
sequentially.

**Do a full preflight over every target before any mutation, then apply one composed plan.**
If rollback is intentionally out of scope, expose explicit partial-state evidence.

### F. Git exclude handling bypasses Git and breaks worktrees

*Codex-specific.*

`readLocallyExcludedSkillNames` reads `projectDir/.git/info/exclude` directly. In linked
worktrees, `.git` is a file, so exclusions are silently missed.

**Use `GitGateway` / `git rev-parse --git-path info/exclude` instead.**

### G. Shim installation templating is brittle and tests do not exercise the real installer

*Codex-specific.*

`_install-ts-shim` uses raw `sed` path replacement, while tests render via JS `replaceAll`.
Paths containing `&`, `|`, backslashes, etc. can corrupt the generated shell assignment.

**Move shim rendering into a tiny tested generator that shell-quotes the path, and have
tests call that generator with adversarial checkout paths.**

### H. Dead field on `RealAregHostGateway`

*Opus-specific.*

`real-gateways.ts:94-109`: the class takes `{ runner }`, stores `this.runner`, and **never
reads it** — `checkTool` walks `PATH` via `isExecutable` directly. The other two gateways
genuinely use `this.runner`; this one copied the boilerplate without the usage. Delete the
constructor option and field (it also makes the gateway look injectable/testable when it isn't).

### I. `cleanupWorkspace` accepts `cwd`/`env` it ignores

*Opus-specific.*

`AregSkillxWorkspaceCleanupRequest` carries `cwd` and `env`; `RealAregSkillxWorkspaceGateway.cleanupWorkspace`
(`real-gateways.ts:184-187`) uses neither. Cleanup is genuinely cwd/env-independent (a
`realpath`-guarded `rm` under tmpdir), so drop those fields from the request type — the
contract should state the real invariant.

### J. File-size / decomposition — `skill-kind.ts` (709) and `real-gateways.ts` (835)

*Opus-specific.*

Neither crosses 1k, so not a hard blocker, but both do too much for one scan:

- **`skill-kind.ts`** bundles zod schemas, CLI-group wiring, three handlers, three renderers,
  the kind-inference state machine (`inferKind`/`*Status`/`buildNotes`), the apply planner
  (`plan*Operation`), and a frontmatter editor (`transformSkillFrontmatter`/`splitLinesKeepEndings`/`isTopLevelKey`).
  Split into `skill-kind/{inference,apply-plan,frontmatter-edit}.ts`.
- Frontmatter logic exists twice conceptually: `frontmatter.ts:parseSkillFrontmatterBlock`
  (reader) and `skill-kind.ts:transformSkillFrontmatter` (rewrite-preserving editor).
  Acceptable if intentional, but pin why they can't share a parse.

### K. Minor: version is a triple source of truth

*Opus-specific.*

`cli.ts:VERSION = "0.1.0"`, `package.json:"version"`, and `areg-shim.test.ts:96` literal
`"0.1.0"` must move together by hand. If `buildCli` can read the package version, the literal
in `cli.ts` is the one to retire.

---

## Verdict

**The branch's actual change (shim + test) is approvable** — tidy, well-tested, sound
migration direction.

**The TS CLI as a whole does not clear the thermo-nuclear bar.** The canonical TypeScript
`areg` implementation carries a clear, visible code-judo move being passed over (finding A),
confirmed verbatim duplication (finding B), contradictory domain models (finding C), magical
verification (finding D), partial-mutation paths (finding E), a worktree-breaking bug
(finding F), brittle shim templating (finding G), and dead/contract-lying code (findings H, I).
None block current behavior, but the migration is the moment to fix them.

## Highest-leverage next actions, in order

1. **Centralize the skill-kind / Pi-replacement model** so both `check` and `skill` consume
   one typed model (findings C, D, A) — the biggest code-judo move.
2. Delete the six `*PathState`/`*TextFileState` identity aliases → one canonical pair (A).
3. Extract `inspectGenericReplacement` + one `parsePiSettings` + one `errorInfo` + one
   `rejectTextState` (B).
4. Delete the dead `runner` field on `RealAregHostGateway` and the dead `errorInfo` export
   in `init.ts` (H, B).
5. Fix the worktree-breaking git-exclude read via `GitGateway` (F).
6. Add full preflight to mutating flows or expose partial-state evidence (E).
7. Move shim rendering into a tested, shell-quoting generator (G).
8. Then reassess whether the four inspection gateways want to become one; split
   `skill-kind.ts`; drop ignored `cleanupWorkspace` fields; collapse the version source of
   truth (A, J, I, K).

Items 2–4 and H are mechanical, behavior-preserving, and covered by the existing
scenario/gateway tests.
