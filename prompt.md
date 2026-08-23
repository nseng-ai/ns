## Completion instructions
After you finish the implementation:
1. Create or update the branch commit using the repo's normal workflow.
2. Then run `!ns flow submit`.

## Launch context
This branch was created from the existing local Graphite trunk and is intentionally unrelated to the caller's current stack.

Implement a documentation/doctrine change to the first-party `code-split-pr` skill so every invocation’s final plan ends with a concise ordered summary of the proposed PRs.

## Goal

Amend the canonical `code-split-pr` skill instructions so its emitted plan always includes, at the bottom, a summary in this shape:

1. **Centralize managed Slot path parsing**  
   **Content:** Make `@nseng-ai/slots` own managed-worktree recognition; Flow uses its typed API for landing classification and cleanup.  
   **Decision PR:** This asks one architectural question—whether Slots owns canonical Slot-path semantics—and is independent of model-backed naming.

2. **Centralize semantic slug derivation**  
   **Content:** Add one policy-driven Extension Kit operation and migrate Plans, Branch Context, Handoffs, and tracked-branch creation to structured results and injected configuration.  
   **Decision PR:** This asks whether consumers should share model-policy and failure semantics without requiring approval of Herdr’s user-facing label behavior.

3. **Delete superseded slug implementations**  
   **Content:** Remove the obsolete Plans and Handoff slug implementations after their consumers migrate to the shared operation.  
   **Mechanical deletion PR:** Isolating pure dead-code deletion keeps the old and new implementations available for comparison in the preceding decision PR and makes cleanup independently revertible.

4. **Adopt semantic Herdr resource labels**  
   **Content:** Apply the shared slug operation to Herdr space/tab descriptions and goals, with Herdr-owned policy, canonical Slot prefixes, explicit targeting, and no fallback.  
   **Decision PR:** This asks a distinct product question—whether Herdr should use fail-closed semantic labels—and can be accepted or rejected independently of the shared infrastructure.

The examples above describe the source session’s specific donor. Do not hardcode those PRs into the skill. Generalize the output contract so every split proposal summarizes its own batches.

## Required summary contract

At the bottom of every emitted split plan:

- Include every proposed batch exactly once and in stack order.
- Give each entry a concise human-readable PR title.
- Add a `Content:` line summarizing what the PR changes.
- Consolidate class and rationale into one labeled line:
  - `Decision PR:` for a decision batch.
  - `Mechanical PR:` for an ordinary mechanical batch.
  - `Mechanical deletion PR:` for a pure deletion batch.
- The class/rationale line must explain why the batch warrants its own PR according to the skill’s rubric:
  - For a decision PR, state the single reviewer question or decision boundary and why it is independent of adjacent work.
  - For a mechanical PR, name the review/conflict/reversion benefit and the adjacent decision it supports.
  - For a deletion PR, explain why isolated dead-code removal improves comparison or review and remains independently revertible.
- Keep the summary concise. It supplements rather than replaces the detailed ordered batches, coverage map, rebuild strategy, and executor handoff.
- Preserve the skill’s plan-only scope: this change must not authorize branch mutation or execution.

## Repository instructions

Before editing:

1. Read root `AGENTS.md`.
2. Run `ns objective exec load-orientations --format md`.
3. Because this changes a skill, read:
   - `docs/conventions/skill-conventions.md`
   - `skills/README.md`
4. Resolve `code-split-pr` through the flat Harness Overlay at `.agents/skills/code-split-pr/SKILL.md`, then identify and edit its canonical first-party source as directed by the skill topology documentation. Do not edit a generated overlay or vendored third-party skill as though it were canonical.
5. Check for any nearer `AGENTS.md` governing the canonical skill directory.

## Verified source-session facts

- The Harness Overlay currently resolves at `.agents/skills/code-split-pr/SKILL.md`.
- The existing skill is explicitly plan-only.
- Its current “Plan shape” requires:
  1. ordered batches;
  2. coverage map;
  3. rebuild-strategy recommendation;
  4. executor handoff.
- It currently does not require the concise bottom summary described above.
- The skill already distinguishes Decision PRs, Mechanical PRs, and pure deletion PRs and already requires a rationale for batch boundaries.
- No implementation edits for this request were made in the source session.
- The source session happened on branch `semantic-slug-consolidation-herdr-labels`, PR #4277, but that branch contains an unrelated oversized donor implementation. Treat the destination checkout and branch as authoritative, inspect status before editing, and do not mix this skill-doctrine change into unrelated work without confirming the intended branch.

## Concrete anchors

Primary semantic anchor:

- `.agents/skills/code-split-pr/SKILL.md` — Harness Overlay used to locate the skill.

Within the canonical `SKILL.md`, inspect and update at least:

- `### 6. Emit and iterate`
- `## Plan shape`
- The Decision/Mechanical/Deletion classification doctrine if needed to make summary labels unambiguous.

Prefer adding an explicit final plan-shape item such as **Summary**, with the exact generalized formatting contract. If useful, include a short generic template demonstrating title, `Content:`, and consolidated class/rationale lines. Avoid duplicating large portions of the existing doctrine.

Search narrowly for tests, snapshots, generated metadata, indexes, or documentation that encode the skill text or plan shape. Update only artifacts required by the repository’s documented skill workflow.

## Remaining steps

1. Resolve the canonical first-party skill source from the overlay.
2. Amend the canonical skill instructions to require the bottom summary.
3. Ensure deletion batches use `Mechanical deletion PR:` while other mechanical batches use `Mechanical PR:`.
4. Ensure the rationale is on the same line as the PR class label, not in separate `Class:` and `Rationale:` fields.
5. Ensure the summary remains ordered and includes all batches exactly once.
6. Reconcile any generated overlay/metadata only through the repository-approved process.
7. Review the resulting prose against the existing split rubric to ensure no requirements were weakened.

## Validation

Run the validation prescribed by `docs/conventions/skill-conventions.md` and the canonical skill’s nearest instructions. At minimum:

- Run the relevant Markdown/dprint check.
- Run any skill topology, overlay, metadata, or parity validation identified by the repository docs.
- Run `just` if it is the expected validation entry point for this documentation-only change, unless repository instructions specify a narrower authoritative check.
- If formatting fails, use `just dprint-fix` rather than manually fighting formatter output, then rerun validation.

Report changed paths and validation results.

## Risks and unknowns

- The canonical source path is intentionally not assumed; resolve it from `skills/README.md` and the overlay rather than guessing.
- The overlay may be generated or linked. Editing only `.agents/skills/code-split-pr/SKILL.md` could violate skill topology rules.
- “Whenever invoked” must be expressed as a mandatory output contract, not merely an optional example.
- Do not make the source-session’s four proposed PRs permanent skill content; they are examples of formatting only.
- Do not let the concise summary replace the total coverage map, detailed learnings, boundary arguments, intermediate-state descriptions, or executor handoff required by the existing skill.