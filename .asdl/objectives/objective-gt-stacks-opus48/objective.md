# objective gt stacks — production implementation (Opus 4.8 build)

## Thesis

Rebuild `objective gt stacks` as a clean, spec-first, fake-driven TDD implementation that satisfies the authoritative observable contract in `docs/specs/objective-gt-stacks.md`. The prior prototype (CLI wiring, projection modules, tests) was deleted in commit `e5ca049f` after its behavior was distilled into that spec, so this is the **implement** leg of the `prototype → spec → production` lifecycle described in `docs/spec-distillation.md`. The spec — not the deleted code — is the source of truth.

The design is a **deep semantic projection module with a small interface**, backed by the existing explicit Graphite (`asdl_core.gt`) and Git (`asdl_core.git`) seams, with **thin CLI and rendering adapters** around it. The JSON projection (the `data` object inside the `{exit_code, data}` envelope) is the **primary semantic test surface**; the human and markdown formats are renderers over that projection, never independent sources of truth.

Graphite stays strictly behind the explicit `objective gt` command path — its name advertises the dependency. Generic Objective workflows, notably `objective list`, remain **checkout-local and Graphite-free**: this Objective must not leak a `GtGateway` into the base `objective` context.

The slug encodes provenance: this is the Opus 4.8 build of the spec. It is a from-scratch implementation graded against the spec's §13 acceptance checklist, not a port of the deleted prototype's structure.

## Scope

The production **Python** implementation of `objective gt stacks` and its semantic projection:

- A **deep projection module** in `asdl-objectives` (under an `objective gt`-owned location, e.g. `asdl_objectives/gt/`) that composes three reads into the spec's result object:
  - the trunk-scoped Graphite branch graph (`GtGateway.branch_graph` → `GtBranchGraph`, carrying per-branch `parent`/`children`/`validation_result`/`needs_restack` and pass-through `warnings`);
  - per-branch `parent..branch` **slice** touches under the **active root only** (`GitGateway.path_touches_under`), counting **deletions/renames**, ignoring the archive root entirely;
  - **trunk** projected-status reads (`GitGateway.list_directories_at_ref` / `path_exists_at_ref` against the trunk ref) for `open` / `closed` / `in-flight`;
  - producing `trunk_branch`, `warnings`, and alphabetically-ordered `objectives[]` with `segments[]`/`rows[]`, sorted `also_touches`, connector marking, branch/segment counts, latest work, and deterministic ordering (spec §5).
- A `gt` `ClinkrGroup` mounted on the existing `objective` group (group help "Work with Graphite Objective stack projections"), exposing a `stacks` operation (help "Show Objective work across Graphite-tracked branches", **no positional args**) with `--format human|json|markdown|md`, `--json-schema`, and `--help` (spec §4).
- A **dedicated `gt` CLI context** (separate from the Graphite-free `ObjectiveCliContext`) carrying both a `GitGateway` and a `GtGateway`, so the Graphite-boundary rule holds.
- Three renderers: **JSON** envelope (semantic facts only, no glyphs; matches §7.3.2), **human** (default, §7.1 + §6), **markdown**/`md` (§7.2 + §6).
- The stable **failure taxonomy** (exit code 2, machine `error_type`): `not_in_repo` (§8.1), `gt_branch_graph_failed` (§8.2), and stable identifiers for underlying data-read failures (§8.3) — never emitting a partial projection.
- Non-fatal, de-duplicated **warnings**: skipped-branch / broken local parent chain, ancestor-walk anomalies, and branch-graph pass-through diagnostics (§9).
- **Fake-driven tests** as the primary surface: projection **unit** tests over `FakeGtGateway`/`FakeGitGateway` asserting the result object across the §10 worked example and edge cases; **scenario** tests over `build_cli()` asserting the full JSON envelope, human/markdown output, `--json-schema`, `--help`, and failure envelopes.
- The §13 acceptance checklist (every bullet except the `/objective-gt-stacks` wrapper) is the conformance target.

## Non-Goals

- The **`/objective-gt-stacks` Pi display wrapper** (spec §11) — explicitly carved into a separate follow-on Objective. No TypeScript work in `ts/packages/pi-extensions/` here.
- Any change to generic / checkout-local Objective workflows. `objective list` stays Graphite-free; no `GtGateway` enters the base `objective` context.
- Editing the spec. `docs/specs/objective-gt-stacks.md` is authoritative and frozen for this work; resolve ambiguities against it rather than rewriting it.
- Porting the deleted prototype's module structure — no resurrection of `gt_stack_models.py` / `gt_stack_projection.py` / `gt_stack_touches.py`; design fresh toward locality and leverage.
- Reproducing Graphite's connector art, slice size/count metrics, pending-lifecycle interpretation ("closing"/"creating"), archived-Objective inclusion, scanning non-current trunks, including untracked branches, or an interactive TUI (spec §12).
- **Speculative** extension of `asdl_core` seams. Build on existing `GtGateway`/`GitGateway` methods; only extend a seam if the spec provably needs a fact none expose (see Assumptions/Risks), keeping ordinary repo facts in `git` and Graphite facts in `gt`.
- Live Graphite end-to-end runs as a closure prerequisite (parked; fake-driven tests are the closure surface).

## Completion Criteria

Ready for user inspection / closure when:

- `objective gt stacks` lives under an explicit `objective gt` group that advertises Graphite in help, takes no positional args, and supports `--format human|json|markdown|md` (`md` aliases `markdown`), `--json-schema`, and `--help` with the spec's usage line, description, and option text (§4).
- The projection satisfies §5 in full: current-trunk-only scope; only locally-present, trunk-connected tracked branches; never untracked; the current branch need not be tracked; touches from `parent..branch` under the active root only, counting deletions, ignoring the archive root; many-to-many grouping with sorted `also_touches`; segments + connectors (`◆` vs `◇`) with connectors excluded from branch count and latest-work; projected `open`/`closed`/`in-flight` from the trunk with no pending-transition interpretation; latest work from the newest Objective-touching commit with the deterministic tie-break (timestamp, then branch name, then oid; uninterpretable timestamps sort oldest); deterministic ordering (alphabetical slugs, stable segment order, stack-order rows with correct `depth` starting at 0, sorted also-touches, de-duplicated warnings).
- The JSON `data` object matches §7.3.2 exactly (field names, types, semantic-facts-only, no glyphs); the human (§7.1 + §6) and markdown (§7.2 + §6) formats render from that projection; the §10 worked example reproduces the spec's JSON, human, and markdown outputs (modulo environment-dependent relative-time wording).
- Failures exit `2` with a stable `error_type` (`not_in_repo`, `gt_branch_graph_failed`, and the data-read identifiers) and the §7.3.1 failure envelope in JSON / `error:`-prefixed stderr in human; no partial projection is ever emitted.
- Non-fatal warnings surface per §9 without aborting and are de-duplicated.
- Every §13 acceptance-checklist item pertaining to the CLI is satisfied (all but the `/objective-gt-stacks` wrapper bullet).
- Tests are fake-driven and TDD-built: projection unit tests over `FakeGtGateway`/`FakeGitGateway` are the primary semantic surface; scenario tests over `build_cli()` cover the envelope, formats, schema, help, and failures. `just check` is green, or any unrelated blocker is recorded.
- `objective list` and the base `objective` context remain Graphite-free (verified, not just asserted).
- The implementer leaves the Objective **open** for explicit user inspection and manual closure.

## Assumptions and Risks

Assumptions:

- The spec is the complete, authoritative, frozen contract; the §10 worked example and §13 checklist are the grading instruments.
- The existing `asdl_core` seams are **sufficient — no `asdl_core` changes needed**. Specifically: `GtGateway.branch_graph` supplies trunk + per-branch `parent`/`children`/`validation_result`/`needs_restack` + pass-through `warnings`; `GitGateway.path_touches_under(parent..branch, active_root)` supplies slice touches (`oid`, `committed_iso`, `paths`) including deletions; `GitGateway.list_directories_at_ref` / `path_exists_at_ref` against the trunk ref supply projected status; `branch_exists` / `list_local_branches` supply local-presence. `FakeGtGateway` / `FakeGitGateway` already exist for the fake-driven tests.
- The projection logic (which composes gt + git + Objective-record knowledge) belongs in `asdl-objectives`, **not** `asdl_core.gt` — that subpackage is stdlib-only and extraction-locked and must not depend on objectives.
- A dedicated `gt` context (git + gt) is the right way to honor the Graphite-boundary rule without contaminating the base `objective` context.
- "Pure projection-first" sequencing: the projection module is built and fully TDD'd in isolation against fakes before any CLI/renderer wiring.
- Closure is gated on fake-driven tests + the acceptance checklist + `just check`, not on a live Graphite stack run.

Risks:

- **Seam-sufficiency is an assumption, not yet proven by a passing test.** If a spec fact has no existing seam method (e.g. a subtlety in "tracked-but-not-locally-present" branch detection, or reading the active-record set at the trunk ref rather than the working tree), a small `asdl_core` seam extension may be needed — and that is graduation-style work (`gt` is stdlib-only/extractable; a `git` change must update its fake too). _Mitigation:_ validate each seam read with a unit test early in the projection slices; if a gap appears, extend `git` for ordinary repo facts and `gt` for Graphite facts.
- The **segment/connector** algorithm (§5.4) and the **deterministic ordering/tie-break** (§5.7–§5.8) are the subtlest semantics. The §10 worked example (two segments for `alpha`; `feat/connector` a connector inside segment 1; latest = `feat/b`, not the deepest branch) is the anchor; risk of off-by-one `depth` or mis-attributed connectors.
- `in-flight` depends on reading **trunk** record existence, distinct from the working checkout — exactly where this command differs from the checkout-local `objective list`. Risk of accidentally reading the checkout instead of the trunk ref.
- "No partial projection on failure" (§8.3) requires threading data-read failures up as typed failures rather than swallowing them; risk of a renderer-time crash instead of a clean exit-2 envelope.
- Human-format `latest` relative time (e.g. "3h ago" / "7d ago") is now-dependent; tests must assert **structure** (branch + parenthesized relative time, or branch-only, or `—`), not exact durations.
- Pure-projection-first defers CLI/envelope wiring to the end; risk of late discovery of a Clinkr envelope / `--json-schema` / `--format` mismatch. _Mitigation:_ keep the projection's public return type aligned to the spec's `data` object so the Clinkr Result model is a thin mirror.

## Open Questions

- Exact stable `error_type` identifiers for the §8.3 data-read failure family (candidates: `gt_slice_read_failed`, `trunk_status_read_failed`). The spec leaves these to the implementation as "equally stable identifiers"; settle the names in the failure-mode slice.
- Precise file layout within `asdl-objectives` (`asdl_objectives/gt/{group,context,stacks,projection,models,render}.py` mirrors the deleted layout and the `exec/` precedent) — confirm during the wiring slices; let the deepening pattern (small interface, deep module) drive it rather than copying the prototype.
- Whether any §9 ancestor-walk warning wording is stabilized vs. informative. The spec marks warnings informative, so default to asserting presence/shape (not byte-exact strings) in the integration contract unless the worked example pins a string.
- Resolved for v1: the `/objective-gt-stacks` Pi wrapper is out of scope (separate follow-on Objective).
- Resolved for v1: roadmap sequencing is pure projection-first.
