# Findings — asdl-core

Shared foundation library: Gateways (`exec.ts`, `clock.ts`, `timers.ts`, `git/`, `github-cli.ts`, `github-graphql-json.ts`, `github-status.ts`, `graphite-metadata.ts`), the `submit/` subsystem, `github-pr-feedback/`, and text utilities. Five candidates. Paths relative to `ts/packages/asdl-core/src/`.

---

## A1 — Collapse the PR-description pipeline into one module · Strong → roadmap #1

**Files:** `submit/pr-description.ts` (571), `submit/pr-description-apply.ts` (182), `submit/submit-pr-descriptions.ts` (216).

**Problem:** Three modules encode one semantic ("given a PR, generate its description"). `submit-pr-descriptions.ts` (orchestration, ~lines 29–149) alternates between them in a shallow loop: load PR → decide overwrite → apply. Decision-making (fingerprinting, reconciliation) leaks across boundaries; callers stitch the pieces. `submit-pr-descriptions.ts` imports 15+ symbols from `pr-description.ts` (lines 4–10). The overwrite decision lives in `pr-description-apply.ts` `decidePrBodyOverwrite` (lines 41–81); the fingerprint it reads lives in `pr-description.ts` `parseManagedGeneratedRegion` (lines 203–217).

**Deletion test:** Delete `pr-description-apply.ts` and the fingerprint/overwrite logic scatters — `submit-pr-descriptions.ts` imports even more from `pr-description.ts` directly, and the split fingerprint logic duplicates or goes implicit. High cost → complexity concentrates when merged → earns its keep.

**Proposed deepening:** One `pr-description-orchestration.ts` with:
- Input: `{ pr: GithubPrDetails; generation: resolved; isPrewritten: boolean; onProgress? }`
- Output: discriminated union `{ kind: "matched" } | { kind: "updated" } | { kind: "generated"; title; body; promptSource } | { kind: "failed"; reason }`
Absorbs: PR viewing + commit fetching (`submit-pr-descriptions.ts` 55–64), fingerprint/skip detection (split across apply + pr-description), generation+editing orchestration, prewritten reconciliation (`submit-pr-descriptions.ts` 171–204).

**Tests improve:** `pr-description.test.ts` currently tests parsing/generation in isolation; the real bug is *when* generation runs (the decision logic in apply.ts, undertested). One module lets tests assert given-PR-state-X → output-Y, killing coordination bugs.

---

## A2 — Make `TextGenerationGateway` a real seam · Strong → roadmap #2

**Files:** `submit/text-generation.ts` (25). Consumed by `pr-description.ts` (line 17), `pr-description-apply.ts` (line 15), `submit-pr-descriptions.ts` (line 5).

**Problem:** `TextGenerationGateway` is declared as an interface (lines 12–14) but has only one adapter (real model calls). No in-memory fake. Tests of PR-description generation must mock at the type level or skip integration. One adapter = hypothetical seam.

**Deletion test:** Inline the real model and PR-description tests (which should verify orchestration, not model output) fail or go flaky. The interface should be a seam but, without a fake, is only aspirational.

**Proposed deepening:** Add `InMemoryTextGenerationGateway` returning a canned description; export both adapters from `testing/index.ts` alongside `ScriptedCommandRunner` (the existing gold-standard adapter — see `test/submit-gateway.test.ts` line 10). Update `test/pr-description.test.ts` to use the fake instead of mocking.

**Tests improve:** Deterministic, fast. Can assert "given prewritten metadata, skip generation" / "given none, generate and edit." Pairs with A1.

---

## A3 — github-pr-feedback pagination leaks across modules · Worth exploring

**Files:** `github-pr-feedback/gateway.ts` (450; esp. `collectGraphqlPages` 325–358, `collectGraphqlContinuationPages` 360–395), `github-pr-feedback/parsing.ts` (144; `requireCursor` 113–135), `github-pr-feedback/queries.ts`.

**Problem:** Pagination is split: the gateway owns cursor iteration but delegates cursor validation to `requireCursor` in parsing.ts, and calls a caller-provided `connectionFromResponse` callback (line 95) to extract page data. Callers (`getPrReviewThreads`, `getPrDiscussionComments`) pass near-identical lambdas re-implementing extraction (gateway.ts 175–176, 196–197). The pagination loop is generic but the callbacks leak response-shape knowledge across the seam; the real bugs live in the closures.

**Deletion test:** Remove `collectGraphqlPages` and pagination has to be hand-coded per method — duplication appears immediately. Module earns its keep, but the seam is leaky because callbacks expose internal structure.

**Proposed deepening:** Typed pagination helpers `collectPrReviewThreadsPages(gateway, params)` and `collectPrDiscussionCommentsPages(gateway, params)` that absorb the callback + schema validation. Interface shrinks to `{ prNumber, operation, schema }` → `Promise<...pages>`.

**Tests improve:** Cursor-handling bugs concentrate in one tested place rather than being verified separately per consumer.

---

## A4 — submit.ts hidden state machine (missing locality) · Worth exploring

**Files:** `submit/submit.ts` (826; `runSubmitCommand` 341–489; detection helpers 734–826: `detectRestackNeeded`, `detectTrunkOutOfDate`, `parseConflictedFiles`, `parsePorcelainConflictedFiles`, `detectSubmitSemanticFailureCause`).

**Problem:** `runSubmitCommand` is ~148 lines of state-machine logic (preflight → restack? → recheck readiness → prewrite metadata → submit → verify) interleaved with output formatting. The detection helpers are pure functions extracted for testability, but the real integration bugs live in how their results flow through orchestration. Example: lines 373–405 do a restack decision then a readiness recheck whose result is one of `ready | restack_required | failed`, but the code only checks for `failed` (line 393) — a subtle gap.

**Deletion test:** Delete the detection helpers and every transition needs inline pattern matching — they're necessary. But they're extracted for testability, not locality: the real code path (dry-run → detect → decide → run next) is a hidden state machine spread over ~150 lines.

**Proposed deepening:** Model the phases explicitly (`SubmitPhase` discriminated union + an `advance(phase)` step), and move detection into methods that analyze phase outputs so transition + detection co-locate.

**Tests improve:** Each test becomes a single transition ("from preflight restack_required, advance() runs restack then rechecks") instead of a 150-line scenario.

---

## A5 — Shallow `submit/format.ts` re-export · Speculative

**Files:** `submit/format.ts` (3), `submit/submit-format.ts` (404).

**Problem:** `format.ts` exports a single pure `formatItemCount`, used once (`submit-pr-descriptions.ts` line 7). Interface == implementation; the real formatting lives in `submit-format.ts`.

**Deletion test:** Delete it and the caller inlines a two-line helper. No complexity vanishes into silence — pure hygiene, not a leverage problem.

**Proposed deepening:** Inline at the call site, or fold into `submit-format.ts` if siblings emerge. Not promoted to the roadmap (hygiene-only).
