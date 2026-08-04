## Completion instructions
After you finish the implementation:
1. Create or update the branch commit using the repo's normal workflow.
2. Then run `!ns flow submit`.

## Launch context
This branch was created from the existing local Graphite trunk and is intentionally unrelated to the caller's current stack.

# Build a named refactoring-technique catalog for the `standing-test-performance-boundaries` Objective

## Mission

Run a long-horizon, human-steered working session that produces a Fowler-style **catalog of named refactoring techniques** for test-boundary work in this repository, derived from the techniques already documented (unnamed) inside the Objective `.ns/objectives/standing-test-performance-boundaries/`. The catalog gives each technique a short, imperative, Fowler-style name plus a one-line intent, mechanics, constraints, and precedent citations. A second, entangled deliverable is a durable vocabulary separation between **Gateway Injection**, **Function Seams**, and generic **Dependency Injection** in this repo.

This is explicitly an interactive, many-commit collaboration with the human: go through techniques **one at a time**, propose candidate names and definitions, and wait for the human's pick or counter-proposal before moving on. Do not batch-name everything in one pass — the human has already established that cadence. Expect the session to span many turns and commits.

## Working environment

- You are executing in a fresh Slot worktree. Your destination cwd is authoritative; all paths below are repository-root-relative and must be rebased under your checkout.
- **Hard gate: never commit on `main`/`master`.** Create a feature branch first using Graphite (`gt create`), per the repo's gt-over-git doctrine. Load `skills/internal/code/code-graphite/SKILL.md` if the `code-graphite` skill is not in your available-skill inventory.
- Validation entrypoint is `just`. Formatting failures route through `just dprint-fix`, never hand-edits.
- Read the root `AGENTS.md` and run `ns objective exec load-orientations --format md` before non-trivial work (repo rule).

## Source-session context (what happened before this handoff)

An `objective-next` session for the standing Objective `standing-test-performance-boundaries` (a standing test-performance maintenance Objective; read its `objective.md`, `roadmap.md`, and `orientation.md` first) surveyed the Objective's `updates/` directory and synthesized **twelve recurring refactoring techniques** documented across its Semantic Updates and `## Implementation Guidance`. The human then decided to give these techniques catalog names in the spirit of Martin Fowler's *Refactoring*, and to work through them individually.

### Decisions already made (treat as settled unless the human reopens them)

1. **Terminology for the artifact itself:** it is a **catalog** (Fowler's own term) with a light taxonomy grouping. The word "ontology" is explicitly avoided — it is already loaded in this repo (package disposition ontology, skill disposition ontology per ADRs 0045/0046).
2. **Naming convention:** each entry is an **imperative verb phrase naming the transformation** ("Extract Function"-style), not the end-state pattern.
3. **Technique #1 was discussed at length and split into two entries** (proposed and directionally endorsed by the human; confirm the split and final names with the human before recording durably):
   - **Introduce Function Seam** — the lightweight rung: a single injected function parameter with a default-to-real binding (canonical precedent: `registerSdlExtension(pi, { runCli })` described in `updates/2026-06-24T122002Z-repeated-integration-setup-for-localized-logic.md`). No interface type, no fake/adapter pairing, no production wiring change. Lineage note: Michael Feathers' "seam" concept; mechanism: parameter injection.
   - **Introduce Gateway** — the heavyweight rung: a semantic, capability-shaped gateway interface with a paired real adapter and true in-memory fake, consumer narrowing, and composition-root wiring. Its mechanics are already governed by `docs/conventions/consumer-gateways-and-command-shape.md` (domain-first shape, Consumer Gateway `Pick` narrowing, inversion rule, `*Context` clumps, no `Deps`/`Services` bags) and `.agents/skills/typescript-fake-driven-testing/SKILL.md`.
4. **Vocabulary separation (the human's explicit goal):** in this repo, **Gateway Injection** is the endorsed heavyweight species; **generic Dependency Injection** is the umbrella *mechanism*, not an endorsed design term — the repo already bans its usual trappings (DI containers, `Dependencies`/`Deps`/`Services` bags, `…Loader` noun-types, speculative single-collaborator contexts). The decision ladder: (rung 1) Function Seam while the boundary is one operation with local scope; (rung 2) promote to Gateway when the boundary has multiple domain operations, needs a durable fake across many tests, or gains a second consumer — gated by the consumer-gateways convention doc. Saying "just use DI" is treated as a smell because it invites the banned bag shapes.
5. **CONTEXT.md discipline:** proposed vocabulary stays in the plan/discussion/catalog draft until ground truth lands; do not update any `CONTEXT.md` ahead of implementation (root `AGENTS.md` rule). When the catalog lands somewhere durable, the relevant `CONTEXT.md`/glossary sync happens in the same change.

### The twelve synthesized techniques (session artifact — revalidate against sources)

This enumeration was synthesized by the source session from the Objective's files; it is grounded but not itself checked in anywhere. Revalidate each against its cited source before naming it. Candidate names below techniques 2–12 were **never discussed with the human** — propose your own.

1. *(split as described above into Introduce Function Seam / Introduce Gateway)* Inject a narrow seam and fake the boundary. Sources: `objective.md` § Implementation Guidance; `updates/2026-06-24T122002Z-repeated-integration-setup-for-localized-logic.md`.
2. Move case fan-out onto the fake seam — parameterized cases vary inputs against fakes; the real backend gets one representative smoke; heuristic: a `for (const case of cases)` loop recreating real setup per iteration. Source: same update as #1 (it names this an explicit anti-pattern with a three-way split remedy).
3. Split pure logic from the runtime adapter — extract a pure core, leave a thin CLI/process adapter covered by integration smoke. Source: `updates/2026-06-21T131815Z-source-cli-shim-subprocess-split.md`.
4. Separate static catalog contracts from dynamic loading — inspect registration/descriptor metadata without invoking lazy loader thunks; keep a small set of real dynamic-loading smokes. Source: `updates/2026-07-25T163444Z-ns-host-contract-boundaries.md` (187 ms → 11 ms median evidence).
5. Split application claims from adapter compatibility — the cross-product coverage model in `ts/TESTING.md`: default tests own application claims through fakes; integration tests own each meaningful real adapter surface.
6. Move real boundaries into the integration lane — real Git/subprocess/sqlite/network/dynamic import/cold runtime belongs in `test/integration/` directly under the package test root; temp directories alone are *not* integration. Sources: `updates/2026-06-23T225203Z-real-git-temp-repo-standard.md`, `updates/2026-07-04T234201Z-integration-lane-placement-restored.md`.
7. Contain irreducibly ambient contracts in the isolated lane — only after preferring injection, explicit env/cwd, auto-restored stubs, manual time, owned lifecycle seams; isolation is containment, not a slow-test lane. Source: `updates/2026-07-10T220455Z-isolated-lane-and-shared-cache-guard.md`.
8. Use the sanity lane for concrete adapters requiring low-level module substitution — real adapter subject, mock only runtime/vendor modules, never domain logic or the adapter itself. Source: `updates/2026-08-03T123350Z-gitplane-real-adapter-sanity-lane.md`.
9. Replace ambient process state with explicit inputs — env/cwd as parameters, injected event sources, owned lifecycle seams (the five `NS_TS_BAN_SHARED_TEST_*` guard rules in `ts/AGENTS.md` enforce the test side).
10. Replace wall-clock time with manual seams — `Clock`/`TimerScheduler` injection, `createManualClock()`/`createManualTimerScheduler()` from `@nseng-ai/foundation`. Sources: `objective.md` § Implementation Guidance; `ts/AGENTS.md` § Time seams.
11. Prefer package-local seams; defer shared abstractions — extract repo-wide rules only after multiple slices prove the same shape (roadmap row; Objective Non-Goals).
12. Slice migrations by boundary family — one family per slice: loader/runtime, real Git, subprocess, sqlite/metadata, network, time. Source: `updates/2026-06-19T180901Z-implementation-guidance-from-ts-stack.md`.

## Required reading before starting (in this order)

1. Root `AGENTS.md` and `ts/AGENTS.md`.
2. `.ns/objectives/standing-test-performance-boundaries/objective.md`, `roadmap.md`, `orientation.md` — note the Runner Policy: **ask first before repository-wide conventions changes**, which this catalog is; the human's participation in this session satisfies that, but keep each durable-artifact commit within human-confirmed scope.
3. The update files cited above (skim the rest of `updates/` for anything the synthesis missed).
4. `docs/conventions/consumer-gateways-and-command-shape.md` — the gateway mechanics the catalog must cite rather than restate.
5. `.agents/skills/typescript-fake-driven-testing/SKILL.md` and `.agents/skills/typescript-style/SKILL.md` (flat Harness Overlay paths).
6. `ts/TESTING.md` — the lane model and cross-product coverage doctrine.
7. `docs/conventions/platform-and-consumer.md` and `docs/conventions/doc-economics.md` — needed for the placement decision below.

## Open questions to resolve with the human (do not decide unilaterally)

1. **Where the catalog lives.** Candidates: a new `docs/conventions/` doc; a section of `ts/TESTING.md`; the Objective's `objective.md` Implementation Guidance; the `typescript-fake-driven-testing` skill. This is a platform-vs-consumer and doc-economics decision — read those conventions docs, present a recommendation with trade-offs, and let the human choose. (Assumption, not verified: no such catalog exists yet anywhere in the repo — verify with a search before proposing a new doc.)
2. **Final names for all entries**, including confirming the #1 split and whether "Gateway Injection" survives as a standalone term or collapses into the "Introduce Gateway" entry (the source session noted the injection is implied since gateways are only consumed via injection here).
3. **Whether the vocabulary separation (Gateway Injection vs DI vs Function Seam) lands in the catalog itself, the gateways conventions doc, root `CONTEXT.md`, or several** — same-change glossary sync applies wherever ground truth lands.
4. **Taxonomy grouping** — the source session suggested seam-introduction / lane-routing / state-replacement as natural groups but never confirmed them.

## Suggested working procedure

1. Set up: feature branch via `gt create`, load orientations, do the required reading.
2. Present the human a brief restatement of the catalog plan plus the placement recommendation (open question 1). Get placement settled early — it shapes entry granularity.
3. Iterate technique-by-technique, resuming at **technique #2** (fan-out onto fake seam): for each, propose 2–3 candidate names with a recommended pick, a one-line Fowler-style intent, mechanics/constraints, and precedent citations to the update files. Wait for the human's decision. Commit incrementally as entries are accepted (small commits via `gt`, `gt modify` for revisions).
4. Once entries stabilize, draft the vocabulary-separation prose and reconcile with `docs/conventions/consumer-gateways-and-command-shape.md` (extend it or cross-reference it; do not duplicate its rules — cite them).
5. Sync any affected `CONTEXT.md` glossary language in the same change that lands the catalog, honoring existing *Avoid* lists (note: root `CONTEXT.md` bans "port" as a noun for these interfaces).
6. Write a Semantic Update under `.ns/objectives/standing-test-performance-boundaries/updates/` recording the catalog decision, placement rationale, and vocabulary separation — this work plausibly advances the Objective's roadmap row about extracting repeated seams/repo-wide rules "only after multiple slices prove the same shape"; cite that row. Never edit existing update files (immutable).
7. Validation before each keep: `just` (expect dprint checks; run `just dprint-fix` on formatting failures). If any TypeScript files change (unlikely — this is documentation work), run the full TS validation expectations in `ts/AGENTS.md`.

## Constraints and risks

- **Documentation-only work still obeys doc economics** — read `docs/conventions/doc-economics.md` before minting a new doc; prefer extending an authoritative existing home.
- **Do not restate governed mechanics.** The gateways conventions doc, `ts/TESTING.md`, and the style-guard rules are authoritative; catalog entries cite them. Duplicated normative prose will drift.
- **Objective mutation boundaries:** only append new files under `updates/`; edit `objective.md`/`roadmap.md` only for meaningful tracking (e.g., noting the catalog as evidence against the seam-extraction roadmap row); never touch other Objectives' records.
- **Risk — naming collisions:** verify candidate names against existing repo vocabulary (`CONTEXT-MAP.md`, root `CONTEXT.md`, conventions docs) before proposing; several terms ("extension", "adapter", "lane", "seam") already carry precise meanings here.
- **Risk — scope creep:** the catalog names existing documented techniques; it does not invent new techniques, change guard rules, alter lane commands, or refactor any tests. If the human steers toward applying a technique to live code (three candidate slow tests were mentioned in the source session: `packages/incubating/extensions/skill-exposure/test/unit/descriptor.test.ts`, `packages/internal/dev/ns-dev/test/source-cli-shim.test.ts`, `packages/public/infra/brmem/test/scenario/copy-operation.test.ts` — repo-relative under `ts/`), treat that as a separate slice with its own preview and confirmation.
- **Verified vs assumed:** everything under "Decisions already made" and the file citations were verified in the source session against the source checkout at that time; the twelve-technique enumeration is a session synthesis; the absence of an existing catalog and the current state of `master` are assumptions you must re-verify in your worktree.
- PR submission is out of scope unless the human explicitly asks; leave work as committed branch state via `gt`.