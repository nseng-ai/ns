# Architecture Deepening

## Thesis

The asdl-tools codebase has accumulated shallow modules and over-extracted pure functions whose interfaces are nearly as complex as their implementations. The deepening pattern — collapse a shallow module into a deeper one with a smaller interface and more leverage — applies cleanly to several places, and the deletion test points the right way for each. This Objective tracks turning those candidates into actual depth.

The shared architectural vocabulary lives in `.claude/skills/improve-codebase-architecture/LANGUAGE.md` (module, interface, seam, adapter, depth, leverage, locality). Any grilling conversation that picks up a candidate should use those terms.

## Scope

Five candidates surfaced by an `/improve-codebase-architecture` review pass:

1. **`gateway_access.py` shallow modules** — both `brmem/gateway_access.py` (three one-line accessors plus an out-of-place error translator) and `asdl-pr-address/cli/pr_address/gateway_access.py` (two one-line accessors over a `PrAddressCliContext`). Deletion folds the accessors into direct `load_typed_context(ctx, <Context>)` reads at op call sites — matching the existing `asdl-reviewer` convention — and collapses brmem's error translator into the documented `Ensure.ideal_state` idiom on the canonical `DetachedHead`/`GitCommandFailure` types. Both pass-through modules disappear.
2. **asdl-slots slot lifecycle** — `repo_context.py`, `inventory.py`, `checkout_planning.py`, `lifecycle.py` are four thin pure-data modules. A `slot checkout` requires composing all four in the correct order from the CLI; the cross-module invariants live nowhere.
3. **asdl-reviewer workflow + four thin gateways** — `harness_detection`, `local_diff`, `review_definition`, `review_execution` each expose 2–3 methods. The workflow knows all four gateway shapes; the actual variation point is "what environment am I running a review in," not "which capability am I asking for."
4. **clinkr operation registration ceremony** — `_register_operation` and the Pydantic-to-Click params bridge live as free helpers; they belong as internal seams of `ClinkrGroup`. Public decorator surface unchanged.
5. **asdl-reviewer harness invocation** — adapter + registry + workflow + prompts currently scatter the harness concept across files. A harness should be one module with one interface (review definition + diff → findings).

Roadmap is an **open list**: deepening one candidate may surface adjacent shallowness; new rows may be added to `## Work` with a deletion-test argument recorded in this `## Scope` section.

## Non-Goals

- Speculative new gateways or seams. The two-adapter rule applies: don't introduce a seam unless something actually varies across it.
- Unrelated refactors discovered along the way (renames, dependency bumps, doc tidying). Those go to their own PRs.
- Touching asdl-objectives or asdl-dispatcher. Both are small/new and weren't in this review pass.
- Touching vendored code under `.agents/skills/`.
- Establishing a `docs/adr/` directory pre-emptively. Create it only when the first rejection actually needs an ADR.

## Completion Criteria

Every candidate currently on the roadmap reaches a definite state:

- **shipped** — the deepening landed and the tests target the new interface
- **parked-with-reason** — explicitly moved to `## Parked` with a one-line reason
- **rejected-with-ADR** — a `docs/adr/` entry records why the candidate was the wrong shape, so future review passes don't re-suggest it

Closure requires that no candidate is in an indeterminate state. Candidates added mid-flight (open-list rule) extend the bar; they do not get a free pass.

## Assumptions and Risks

**Assumptions**

- The deletion-test signal recorded for each candidate holds up under closer inspection. If it doesn't for a given candidate, that's a signal to reject with ADR rather than ship.
- Each candidate can be shipped as one or two PRs without coordinated multi-package rewrites.
- The depth-as-leverage framing in `LANGUAGE.md` is the right shared vocabulary for grilling conversations that pick up a candidate.

**Risks**

- Deepening asdl-slots and asdl-reviewer touches the busiest packages; a botched consolidation could regress observable CLI behavior. _Mitigation_: insist on a working test surface against the new interface before deleting the old shape.
- Collapsing the four asdl-reviewer gateways may erase a seam that a future harness or environment variant actually wants. _Status_: the `review_environment` consolidation replaces the four thin gateways with one composite seam backed by real and fake adapters. The later harness-invocation candidate has also shipped: harness-specific prompt assembly, model support, subprocess invocation, and Claude stream parsing now live behind `asdl_reviewer.harness.invocation`, while the review-environment seam stays semantic (`list_harnesses`, `run_review`). This de-risks the useful-variation-point concern for the current reviewer candidates. _Residual_: if a second harness or environment variant appears, re-litigate the two-adapter rule against the unified runtime rather than pre-emptively adding seams.
- The clinkr deepening (candidate 4) touched every package that registers commands. _Status_: shipped with the public decorator/group APIs unchanged; `_register_operation` is now a `ClinkrGroup` private method, the standalone params bridge was deleted, type-hint extraction is cached without sharing Click parameter instances, and clinkr plus representative CLI/plugin suites passed under the full repo gate.
- "Open list" creates closure-creep risk: candidates added mid-flight could keep this Objective open indefinitely. _Mitigation_: each added candidate must include a deletion-test argument written into `## Scope` before its roadmap row is added.

## Open Questions

- Should the resolution mode (shipped / parked-with-reason / rejected-with-ADR) be recorded explicitly in each candidate's roadmap row, or is the `## Parked` section plus the ADR file plus the completed checkbox sufficient signal?
- Are there second-pass review opportunities worth surfacing for asdl-objectives or asdl-dispatcher before they grow further? Not in scope here, but worth flagging on close.
- Resolved: the asdl-reviewer gateway consolidation and harness-invocation candidates shipped as separate rows. The gateway seam remains the review-environment boundary; harness invocation is a deep implementation module behind that seam.
