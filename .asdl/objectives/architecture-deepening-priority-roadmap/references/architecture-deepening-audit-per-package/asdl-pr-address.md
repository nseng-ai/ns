# asdl-pr-address Architecture Deepening Audit

Subagent session: `/var/folders/9r/wfby6pcs4mgbfb_lg0ndgb180000gn/T/pi-runner-subagents/session-ojU4SY/a81fe4e1-3e02-4c09-aade-03b9fc01ab21.jsonl`

## What I did

Performed a read-only deep architecture audit focused on `packages/asdl-pr-address`, using the requested module/interface/depth/seam/adapter model.

## Files inspected

- Root context: `CONTEXT.md`, `CONTEXT-MAP.md`
- Package docs/config: `packages/asdl-pr-address/README.md`, `docs/development.md`, `pyproject.toml`
- Package source: `packages/asdl-pr-address/src/asdl_pr_address/...`
- Package tests: `packages/asdl-pr-address/tests/...`
- Cross-package seams: `packages/asdl-core/src/asdl_core/gh/pr_gateway.py`, `pr_testing.py`

## Validation run

No tests run. Read-only audit only.

---

# Architecture report

## 1. Package map

`asdl-pr-address` is mostly a deterministic CLI adapter package backing the `pr-address` skill: docs say it “fetch[es] PR feedback from GitHub and execute[s] resolution mutations” (`README.md:4`) and provides deterministic, testable operations invoked by the skill (`docs/development.md:74`).

Major modules:

- **CLI/plugin adapter**
  - `cli/main.py`, `cli/plugin.py`, `cli/pr_address/group.py`
  - Builds standalone CLI and hidden `exec` group; hidden seam at `group.py:28-52`.
- **Runtime context seam**
  - `PrAddressCliContext` holds `PRGateway` and `GitGateway` (`context.py:13`, real adapters at `context.py:23-24`).
- **Remote-owned PR seam**
  - `asdl_core.gh.PRGateway` is the main interface (`asdl-core/.../pr_gateway.py:45`), with `RealPRGateway` (`:140`) and `FakePRGateway` (`pr_testing.py:28`): this is a real seam by the “two adapters” rule.
- **Feedback fetch/summary modules**
  - `get_feedback.py`, `summarize_feedback.py`, `prepare_run.py`
  - Share review filtering (`get_feedback.py:76-77`, `summarize_feedback.py:164-165`, `prepare_run.py:214-215`).
- **Payload/manifest module**
  - `feedback_payload.py`; deep-ish module around body locators and compact manifests (`BodyLocator` at `:38`, builder at `:123`).
- **Classification validation module**
  - `feedback_classification.py`; deep module with small public interface `validate_feedback_classification` (`:158`) and substantial validation implementation.
- **Mutation/reply modules**
  - Simple mutation wrappers (`resolve_thread.py`, `unresolve_thread.py`, `add_issue_comment.py`, etc.).
  - Composite reply/resolve batching in `resolve_thread_with_reply.py` and `resolve_thread_batch.py`.
  - Canonical reply strings in `reply_formatting.py`.

Dependency categories:

- **In-process:** Clinkr operation registration, Pydantic request/result models, formatting/classification/payload logic.
- **Local-substitutable:** `GitGateway` / `FakeGitGateway`; payload filesystem store.
- **Remote-owned:** GitHub via `PRGateway` / `RealPRGateway`.
- **True external:** `gh`, `git`, filesystem, shell/stdin/Click runtime.

---

## 2. Initial clues: validated/refuted

### Clue: `review_filtering.filter_empty_reviews` may be a 2-line pass-through

**Partly validated.**

Evidence:

- Actual implementation is tiny: `filter_empty_reviews` is one tuple comprehension (`review_filtering.py:21-22`).
- But the named policy is non-trivial: empty `COMMENTED` / `APPROVED` reviews are noise, while empty `CHANGES_REQUESTED` / `DISMISSED` still carry signal (`review_filtering.py:7-18`).
- Used by three callers: `get_feedback.py:76-77`, `prepare_run.py:214-215`, `summarize_feedback.py:164-165`.

**Deletion test:** deleting the module would reintroduce the same policy in 3 callers. So the function earns some keep, but the surrounding fetch+filter policy remains shallow at the callers.

### Clue: `feedback_classification.py` is large/deep but may lack isolated local test seam

**Mostly refuted.**

Evidence:

- Public test surface is a single in-process interface: `validate_feedback_classification(manifest, classification)` (`feedback_classification.py:158`).
- It builds a manifest view and validates exact-once coverage, locator correctness, resolved-thread exclusion, and action/informational field semantics (`feedback_classification.py:148`, `:361`, `:392`, `:652`).
- Unit tests directly exercise this interface, not the CLI, for complete/missing/duplicate/unknown/invalid-locator/resolved-thread/semantic cases (`tests/unit/test_feedback_classification.py:173`, `:220`, `:235`, `:256`, `:295`, `:327`, `:353`).

**Verdict:** this is one of the healthiest modules. The interface is the test surface.

### Clue: `reply_formatting.py` is shallow string builders

**Mostly validated, but low-risk.**

Evidence:

- Three public formatting functions: resolution, review reply, discussion reply (`reply_formatting.py:17`, `:44`, `:59`).
- Callers do validation outside the module; docstring explicitly says callers must validate inputs (`reply_formatting.py:17-35`).
- Unit coverage is minimal and targets private `_resolution_summary` only (`tests/unit/test_reply_formatting.py:5`).

**Deletion test:** deleting it would duplicate canonical markers/timestamps/quote style across reply modules, so it earns keep as locality for reply text. It is shallow but useful.

### Clue: Biggest friction may be no local `PRGateway` test double

**Partly validated, but not the biggest issue.**

Evidence:

- Package tests use `asdl_core.gh.pr_testing.FakePRGateway`, not a package-local fake (`tests/scenario/test_operations.py:15`, `tests/scenario/test_composite_operations.py:14`).
- Helpers inject the core fake through `PrAddressCliContext` (`test_operations.py:35-52`, `test_composite_operations.py:41-55`).
- There is no package-local fake under `packages/asdl-pr-address/src`.

But:

- The `PRGateway` seam is already real: interface + real adapter + fake adapter (`pr_gateway.py:45`, `:140`, `pr_testing.py:28`).
- The bigger friction is that package-specific feedback policy is often tested through full CLI scenario tests rather than a deeper in-process module.

---

## 3. Top deepening/collapse candidates

### 1. Deepen feedback fetch/filter policy

- **Files:** `get_feedback.py`, `summarize_feedback.py`, `prepare_run.py`, `review_filtering.py`, `feedback_payload.py`
- **Deletion test:** deleting `review_filtering` duplicates policy in 3 callers; deleting the repeated fetch/filter/count/manifest logic would currently push complexity into CLI operations.
- **Dependency category:** remote-owned GitHub via `PRGateway`; local-substitutable in tests via `FakePRGateway`; in-process payload builders.
- **Proposed shape:** introduce an in-process module such as `feedback_snapshot.py` that fetches reviews/threads/discussions, applies empty-review and resolved-thread policy, and returns a normalized feedback snapshot.
- **Tests affected:** move many `get-feedback`, `summarize-feedback`, and parts of `prepare-run` scenario assertions into unit tests over the snapshot interface.
- **Strength:** Strong.
- **Risk:** `prepare-run` has extra branch/reopen/git responsibilities; avoid over-unifying unlike workflows.

### 2. Deepen `prepare_run` into a domain module behind the CLI adapter

- **Files:** `prepare_run.py`, `tests/scenario/test_composite_operations.py`
- **Evidence:** `run_prepare_run` currently does branch lookup (`prepare_run.py:179`), PR lookup (`:191`), feedback fetching/filtering (`:214-215`), contested thread reopening (`:224`, helper at `:315`), thread normalization (`:232`, helper at `:332`), git restructure detection (`:239`), and payload-mode dispatch.
- **Deletion test:** deleting/extracting the CLI module would force this workflow complexity into tests/callers; the workflow deserves a deeper interface.
- **Dependency category:** local-substitutable git, remote-owned GitHub, local payload store.
- **Proposed shape:** keep `run_prepare_run` as a thin Clinkr adapter; move workflow to `prepare_pr_address_run(context, cwd, options)`.
- **Tests affected:** many `test_prepare_run_*` scenario tests (`test_composite_operations.py:81`, `:230`, `:282`, `:343`, `:400`, `:441`, `:461`) can become unit tests over the in-process interface; retain CLI smoke.
- **Strength:** Strong.
- **Risk:** preserve current payload-session behavior and failure envelopes.

### 3. Fix mutation failure semantics at the `PRGateway` seam

- **Files:** `reply_to_discussion.py`, `asdl_core/gh/pr_gateway.py`, `asdl_core/gh/pr_testing.py`
- **Evidence:** `reply_to_discussion` catches `subprocess.CalledProcessError` directly (`reply_to_discussion.py:83`), leaking RealPRGateway implementation detail through the interface.
- **Deletion test:** if this catch disappears, mutation failure behavior becomes ad hoc across callers.
- **Dependency category:** remote-owned GitHub seam.
- **Proposed shape:** define mutation failure behavior in `PRGateway` interface, e.g. return `PRGatewayFailure` or raise a domain exception, then adapt Real/Fake gateways.
- **Tests affected:** failing reaction tests using subclassed fake (`test_composite_operations.py:1140-1142`) should target the gateway-domain failure, not subprocess.
- **Strength:** Worth exploring / Strong if more mutation callers need graceful failure.
- **Risk:** cross-package disruption in `asdl-core`.

### 4. Collapse or group shallow one-operation CLI modules

- **Files:** `get_reviews.py`, `get_review_comments.py`, `get_discussion_comments.py`, `resolve_thread.py`, `unresolve_thread.py`, `add_issue_comment.py`, `add_reaction.py`
- **Evidence:** many modules are thin Clinkr wrappers around one gateway call, e.g. `run_get_reviews` (`get_reviews.py:36`) and `run_resolve_thread` (`resolve_thread.py:25`).
- **Deletion test:** complexity mostly vanishes or moves into `group.py`; these are shallow adapter modules.
- **Proposed shape:** either leave as file-local operation convention, or group fetch/mutation wrappers by domain if navigation cost grows.
- **Strength:** Speculative.
- **Risk:** churn with little leverage; current layout matches CLI operation inventory.

### 5. Tighten reply formatting interface

- **Files:** `reply_formatting.py`, `resolve_thread_with_reply.py`, `reply_to_review.py`, `reply_to_discussion.py`
- **Deletion test:** formatting strings/marker would reappear in callers, so do not delete outright.
- **Proposed shape:** either accept shallowness, or deepen by moving normalization/validation into reply constructors so callers do not need to know preconditions.
- **Strength:** Worth exploring only if reply bugs recur.
- **Risk:** timestamp behavior complicates deterministic unit tests unless a clock seam is added.

---

## 4. Test analysis

Healthy:

- Classification validation has a good in-process interface and unit coverage.
- Payload manifest construction has focused unit coverage (`tests/unit/test_feedback_payload.py`).
- Scenario tests correctly exercise the standalone CLI via `build_cli()` (`test_operations.py:3`, `:32`).

Friction:

- Scenario tests are large: `test_operations.py` is ~2051 lines; `test_composite_operations.py` is ~1260 lines.
- Package-specific policies like empty-review filtering, contested-thread reopening, and payload manifest behavior are often tested through full CLI invocation and core fakes.
- `reply_formatting.py` has only a private-helper test; public formatting is effectively scenario-tested.

What should move to deeper interfaces:

- Feedback snapshot/filtering/counting.
- Prepare-run contested thread normalization and git restructure warning behavior.
- Reply body construction with deterministic clock seam if needed.

---

## 5. Cross-package leverage/disruption

- `asdl-pr-address` is intentionally coupled to `asdl-core.gh + asdl-core.git + asdl-core.clinkr/plugin` per context map (`CONTEXT-MAP.md:56`).
- The existing `PRGateway` seam has real leverage because both real and fake adapters exist.
- A package-local narrower PR feedback interface would only be justified if it gains two adapters: a real adapter over `PRGateway` and a local fake/snapshot adapter.
- The most important cross-package improvement is mutation failure semantics in `asdl-core.gh`; direct `subprocess.CalledProcessError` handling in package code is a seam leak.

---

## 6. Final verdict

`packages/asdl-pr-address` is **generally healthy**, not a serious collapse target.

The best architecture target is **deepening feedback snapshot / prepare-run policy** so package-specific behavior is tested through an in-process interface rather than mostly through Clinkr scenario tests. `feedback_classification.py` is already deep and well-tested. The shallow modules are mostly acceptable CLI adapters.

**Confidence:** High.  
**Blockers/follow-up:** None; read-only audit complete.
