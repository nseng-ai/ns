# Findings — brmem, handoff, branch-context, objective, plans

Branch-scoped durable storage CLIs. Theme: do these share a deep storage seam, or each reimplement git-ref/markdown storage shallowly? Five candidates. Paths relative to `ts/packages/`.

---

## D1 — Deepen Branch Memory behind an entry locator (brmem) · Strong → roadmap #6

**Files:** `brmem/src/gateway.ts` (96; `BrmemGateway` ~39–95), `brmem/src/ref-layout.ts` (200+; `buildSnapshotRef`, `buildEntryLocator`, `encodeBranchName`), `brmem/src/validation.ts` (~150; `validateEntryKey`, `validateNamespaceName`), `brmem/src/real-git-gateway.ts` (400+), `brmem/src/operations/*.ts` (shared, put, get, list, …).

**Problem:** `BrmemGateway` is the public seam but it doesn't encapsulate ref naming or validation. Callers of the gateway *and* direct CLI operations (`put.ts`, `get.ts`, `list.ts`) import `ref-layout.ts` and `validation.ts` directly — and so do downstream packages (handoff, branch-context). A namespace-encoding change (e.g. flattening `/` → `---`) must propagate across operation files and external callers. No module wraps the `(namespace, key, branch) → git-ref → content` pipeline; each operation is a thin CLI handler orchestrating gateway calls + ref construction + validation.

**Deletion test:** Delete `ref-layout.ts` and operations + handoff + branch-context fail to compile; the logic is duplicated inline across callers. The gateway interface survives unchanged (it only returns results), confirming the ref/validation logic is the thing leaking.

**Proposed deepening:**
- `BrmemEntryLocator` with `parse(namespace, key, branch)` returning a validated locator or error; carries computed `refName` and `entryLocator`. Absorbs `ref-layout` + validation.
- `BrmemEntriesGateway` working in locators: `getEntry(locator)`, `putEntry(locator, content)`, `deleteEntry(locator)`, `listEntries({ namespace, branch? })`.
Operations and downstream packages call `BrmemEntryLocator.parse()` instead of importing ref-layout/validation.

**Tests improve:** Ref encoding tested in isolation; operations tested against a fake entries gateway returning deterministic locators; handoff/branch-context reuse one parse seam. **Highest reuse surface in the survey** — leverage across brmem + handoff + branch-context.

**Risk (carried to objective):** widest blast radius; a botched encoding change could corrupt existing refs. Treat encoding as compatible/append-only and cover with locator tests before migrating callers.

**Open question (carried to objective):** does the locator live in `brmem` and get imported by downstream packages, or get re-exported through each consumer's seam?

---

## D2 — Plan-attachment module for branch-context · Worth exploring → roadmap #7

**Files:** `branch-context/src/brmem-gateway.ts` (200; `RealBranchContextBrmemGateway` ~66–198), `branch-context/src/attach.ts` (341), `branch-context/src/attached-plan.ts` (271), `branch-context/src/constants.ts` (`BRANCH_CONTEXT_NAMESPACE = "branch-context"` line 3).

**Problem:** `RealBranchContextBrmemGateway` is a shallow adapter directly wrapping brmem CLI output parsing. Callers in `attach.ts` / `attached-plan.ts` still reference the namespace constant and build keys via `buildBranchContextPlanKey()` (which delegates to `buildPlanFileName()` from the plans package). Entry-key construction scatters across three modules; brmem's storage layout is visible to callers.

**Deletion test:** Delete `brmem-gateway.ts` and storage details reappear in callers — `attach.ts` would call `brmem.checkEntry()` with hardcoded namespace strings; `attached-plan.ts` would parse list/get responses inline. Concentrates → keep, but deepen.

**Proposed deepening:** A `PlanAttachmentStorage` interface (`attachPlan`, `listAttachedPlans`, `getAttachedPlan`, `deleteAttachedPlan` — all by slug); namespace/key derivation moves inside the implementation. Composes onto D1's locator.

**Tests improve:** Key generation tested standalone; branch-context operations use a fake `PlanAttachmentStorage` that never references brmem; a future "objective-context" reuses the same interface.

---

## D3 — Objective markdown validator (objective) · Worth exploring → roadmap #8

**Files:** `objective/src/storage.ts` (287; `ObjectiveStorage` ~82–204), `objective/src/real-storage.ts` (109), `objective/src/operations/read-objective.ts` (~150), `objective/src/operations/check-objective.ts` (~200; required headings ~21–30).

**Problem:** `ObjectiveStorage` is a thin facade over `ObjectiveStorageGateway` — it calls `readTextFile()` but doesn't parse/interpret markdown frontmatter, structure, or metadata. Operations read raw markdown and apply their own validation (e.g. `check-objective.ts` defines required headings inline). A schema change (new section) must update every operation, not one module. Interface depth is minimal (file I/O), but structure-interpretation logic is scattered.

**Deletion test:** Delete `storage.ts` and operations instantiate `RealObjectiveStorageGateway` and read files directly; validation rules remain copy-pasted per operation — no consolidation. (This is a *missing-locality* finding rather than a pure-shallowness one.)

**Proposed deepening:** An `ObjectiveMarkdownValidator` (`validateObjectiveMd`, `validateRoadmapMd`, `validateUpdateMd`, `requiredHeadings(kind)`); move heading checks out of `check-objective.ts` into it; all operations consume it.

**Tests improve:** Validation rules tested in isolation; operations use a fake validator; new operations (e.g. "objective export") reuse it.

---

## D4 — Handoff identity parsing scattered (handoff) · Worth exploring

**Files:** `handoff/src/identity.ts` (88; `FLAT_HANDOFF_SLUG_PATTERN`, `parseFlatHandoffSlug`, `handoffSlugToKey`, `HANDOFF_KEY_SUFFIX = ".md"`), `handoff/src/artifact-storage.ts` (154; `handoffKeyFromSlug` calls ~82–91, 112).

**Problem:** `identity.ts` owns slug validation + key-suffix encoding; `artifact-storage.ts` calls `handoffKeyFromSlug()` to convert input → key, but the formatting (`key.slice(0, -HANDOFF_KEY_SUFFIX.length)`) lives back in identity.ts. A round-trip test must touch both modules.

**Deletion test:** Slug↔key conversions vanish but parsing is split (pattern in identity, transformation calls in storage). Callers of `artifact-storage` break without identity.ts. You *could* inline the conversion without changing orchestration — so this is a weaker, more cosmetic finding.

**Proposed deepening:** A `HandoffIdentity` module owning the full identity contract (`namespace`, `isValidSlug`, `slugToKey`, `keyToSlug`, `keyToEntryLocator`); `artifact-storage.ts` receives it as a dependency.

**Tests improve:** Slug validation standalone; handoff-namespace I/O with a stubbed identity. *Not promoted: lower deletion-test signal; reconsider folding it into D1's locator work since handoff sits on brmem.*

---

## D5 — Branch-context plan-content-slug duplicates plans logic · Worth exploring

**Files:** `branch-context/src/plan-content-slug.ts` (51; `PLAN_CONTENT_SLUG_VARIANT` ~20–29, `deriveContentSlug` call line 37), `plans/src/content-slug-derivation.ts` (180+), `plans/src/saved-plan-content-slug.ts` (~70), `plans/src/model-slug.ts`.

**Problem:** Branch-context calls `deriveContentSlug()` from plans with a custom variant supplying prompt lines + error messages, but core slug derivation/normalization/validation lives in plans. If normalization rules change, branch-context's expected behavior silently breaks (no compile error). Branch-context must know the plans package's internal "variant" concept to participate.

**Deletion test:** Delete branch-context's `plan-content-slug.ts` and callers lose branch-context slug derivation; plans normalization is unaffected — but a plans-side normalization change silently breaks branch-context's expected slugs (a leaky-seam smell, not a vanishing-complexity one).

**Proposed deepening:** A domain-specific entry point in plans — `deriveBranchContextPlanSlug(pi, { filePath, cwd, signal? })` — hiding the variant configuration inside plans; branch-context calls it instead of the generic `deriveContentSlug()`.

**Tests improve:** Normalization tested in plans without branch-context; branch-context tests use a deterministic mock. *Not promoted: narrower payoff; revisit alongside any plans-package consolidation.*
