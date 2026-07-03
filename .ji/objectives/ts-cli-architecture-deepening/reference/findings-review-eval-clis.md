# Findings — roaster, aretro, vibechk, packagechk, pr-address, areg

Review/evaluation/setup CLIs. Five candidates. Paths relative to `ts/packages/`.

---

## E1 — Lift diff parsing into asdl-core, only if a second consumer appears (roaster / pr-address) · Speculative → roadmap #9 (watch-point)

**Files:** `roaster/src/diff-parsing.ts` (71), `roaster/src/inline-commentability.ts` (73), `roaster/src/gateways/local-diff.ts` (caller).

**Problem:** Roaster has two pure parsers wrapping `@pierre/diffs`: `parseUnifiedDiff` (maps Pierre metadata → `DiffFile`) and `commentableRightSideLines` (Pierre hunk ranges → right-side line numbers). They have no domain coupling and *look* reusable by pr-address or future packages — but nothing else parses diffs today.

**Deletion test:** Delete them and complexity reappears only in *hypothetical* future callers. Today there is exactly one consumer (roaster). **One adapter = hypothetical seam.** By the survey's own rule this is not yet a real deepening.

**Disposition:** HOLD as a watch-point. Relocate `parseUnifiedDiff` + `commentableRightSideLines` to `@asdl/core` only when a real second consumer (e.g. pr-address needing hunk geometry) materializes — then two adapters make the seam real.

**⚠ ADR-0007 interaction:** ADR-0007 deliberately kept roaster a *thin* Pierre adapter and rejected broadening its parser surface. Relocating the adapter speculatively re-opens a settled decision. Recorded here so a future automated review doesn't mistake this deliberate one-adapter case for a missing seam. If the candidate is ever rejected outright, amend ADR-0007 rather than leaving it indeterminate.

---

## E2 — Extract a pure session parser behind the source seam (aretro) · Worth exploring

**Files:** `aretro/src/sessions/source.ts` (`SessionSource` interface ~1–17), `aretro/src/sessions/pi-jsonl-source.ts` (200+), `aretro/src/sessions/source-fake.ts` (42).

**Problem:** `SessionSource` is a real seam (real `pi-jsonl-source` + `source-fake`), but the interface is minimal (single `query()`) and the real implementation entangles JSONL parsing (warning detection, sessionId extraction, model-event reconstruction) with file I/O. The pure parsing can't be tested without file fixtures.

**Deletion test:** Delete `source.ts` and `cli.ts` must know `pi-jsonl-source` explicitly; tests lose the seam; the fake becomes embedded in scenarios. Complexity reappears in test setup → seam earns its keep, but the pure logic is entangled with I/O.

**Proposed deepening:** Extract `parsePiJsonlSession()` (pure, no file I/O) and keep `pi-jsonl-source` a thin adapter (file I/O → pure parser). Optionally promote `SessionSource` + `limitSessions` to a shared location for future harness adapters (e.g. claude-code JSONL).

**Tests improve:** Parser unit-tested without temp files; `FakeSessionSource` injects parsed sessions; new harness formats reuse the parser + add their own file-reading adapter.

---

## E3 — Deepen the harness gateway: pure output parser + (future) registry (roaster) · Worth exploring

**Files:** `roaster/src/gateways/harness.ts` (224; `RealHarnessGateway` + `FakeHarnessGateway`), `roaster/src/gateways/harness-output.ts` (212), `roaster/test/gateways/harness.test.ts`.

**Problem:** The harness gateway is already exemplary (real adapter spawns `claude`; fake returns configured results; parsing in `harness-output.ts`). But `harness-output.ts` parsing depends on `harness.ts`'s `ReviewExecutionResponse` type, so it can't be unit-tested independently against captured stderr fixtures.

**Deletion test:** Delete `harness.ts` and `cli-operations.ts` instantiates `RealHarnessGateway` directly (tight coupling); review runs become integration tests; the parser can't be tested alone. Complexity reappears in callers → keep.

**Proposed deepening:** Extract a pure `parseHarnessOutput(stdout, reviewName): ReviewExecutionResponse | ParseError` testable against string fixtures. A `HarnessRegistry` (review-definition.harness-type → factory) is a *future* addition — only real once a second harness type exists.

**Tests improve:** New `harness-output.test.ts` validates parsing against real Claude Code error outputs (model-not-found, validation-failure); `harness.test.ts` focuses on the gateway contract via the fake. *Note: this is an incremental deepening of already-good code; lower priority than the shallow-module candidates.*

---

## E4 — Consolidate skill-kind mutation planning/execution (areg) · Worth exploring

**Files:** `areg/src/operations/skill-kind.ts` (507), `skill-kind-apply-plan.ts` (396), `skill-kind-inference.ts` (302), `project-mutations.ts` (301).

**Problem:** Skill-kind orchestration spans ~1.5k lines across four modules. `skill-kind.ts` calls inference, inspection, and apply-plan in sequence; `skill-kind-apply-plan.ts` plans mutations (write/delete/remove-empty-dir); `project-mutations.ts` executes via gateways. No single module owns "what makes a skill-kind operation coherent" — inference, planning, and execution are scattered; tests span all three. (areg's operations aren't too big by LOC; the issue is missing module boundaries.)

**Deletion test:** Delete `skill-kind.ts` and inference (pure transform) and `project-mutations.ts` (generic gateway wrapper) survive, but the apply-plan logic is skill-kind-specific and reappears in any new variant (e.g. skill-kind-delete). The orchestration layer is thin — a sequential composition of three concerns.

**Proposed deepening:** A `SkillKindMutation` value (`skill`, `operations[]`, `evidence`, `applyPhase`) plus a `SkillKindMutationApplier` coordinating preflight + execution via gateways. `skill-kind.ts` shrinks to load → infer → plan → apply.

**Tests improve:** Inference and plan-building tested as pure units; applier tested with `FakeAregProjectGateway`; `skill-kind.ts` becomes a thin integration test; new skill-kind-* operations reuse inference + applier. *Not promoted to the nine: payoff is mostly future-proofing against a growing skill-kind ecosystem.*

---

## E5 — Unify GitHub PR feedback/review models in core (roaster / pr-address) · Speculative

**Files:** `roaster/src/models.ts` (311; review domain ~140), `pr-address/src/core/feedback-snapshot.ts` (91), `pr-address/src/core/feedback-summary.ts` (22). pr-address imports PR types from `asdl-core/github-pr-feedback`.

**Problem:** Roaster (findings publication: `ReviewFinding` → comment) and pr-address (feedback download: `GithubPrReview` → local storage) have disjoint models for PR feedback, yet share concepts (review state, thread resolution, author dedup, automation-comment detection). Duplicate marker-parsing logic (roaster's summary marker vs pr-address's `isAutomationLikeDiscussionComment`); no shared findings↔comment mapping.

**Deletion test:** Delete roaster's `ReviewRunResult` and the Zod/clinkr envelope is roaster-specific (no loss elsewhere), but the underlying finding shape (path/line/severity/summary/details) is generic. If pr-address added reverse-flow (comments → findings), it would reinvent line/path matching.

**Proposed deepening:** Shared `asdl-core` models — `ReviewComment`, `CodeFinding`, `PullRequestFeedback` — plus author normalization, marker extraction, dedup. Roaster keeps its envelope + rendering; pr-address keeps feedback-summary as a filter.

**Disposition:** Speculative — requires roaster + pr-address to agree on `CodeFinding` semantics. Justified only if both become "GitHub comment orchestrators"; otherwise the separation is correct. *Not promoted.*
