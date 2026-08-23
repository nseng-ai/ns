# Encode durable TypeScript API and accountability-interview policy

## Goal and outcome

Create one focused ns pull request that records two reusable agent policies discovered during the Clinkr PR #25 accountability interview:

1. TypeScript APIs should keep a small, clearly ordered set of required core data and dependencies as direct positional inputs. A named `*Options` object is for optional/defaulted behavioral configuration, flags, multiple optional values, or a genuinely long input list—not merely for “several” required inputs. Preserve the existing rule that five or more positional inputs usually justify redesign or an options object.
2. `/pr-make-accountable` should distinguish reusable policy from rationale specific to the current PR, track recurring policy during the interview, and report unencoded durable policy at wrap-up with a recommended authoritative existing home. It must not silently turn the interview into unrelated documentation work.

The result should keep the TypeScript summary, core rule, checklist, and TypeScript Tripwire wording coherent; update the canonical accountability procedure; and add only a concise public README summary of the new wrap-up behavior. The PR should not add a standalone standards document, change runtime code, or broaden into unrelated skill-system work.

## Context and discovered facts

- Source brief: `/tmp/ns-durable-policy-followup.md`. It originates from the accountability interview for Clinkr PR #25, where the final API was `runCli(application, argv, stdout, stderr)` rather than an options object.
- The checkout is currently clean on `master`, tracking `origin/master`. Repository policy forbids committing on `master`; implementation must create a feature branch first.
- This is the ns repository, separate from Clinkr. The requested PR must be an independent ns PR and cannot be stacked on Clinkr PR #25.
- Active orientation `professional-repo-curation` treats `pr-make-accountable` as the repository’s sole public skill warrant and requires preserving the distinction among skill support disposition, family, identity, invocation mode, and metadata. This work changes behavior within the existing public skill; it does not change those classifications or topology.
- Canonical first-party skill sources are the nested paths under `skills/`. `.agents/skills/typescript-style` and `.agents/skills/pr-make-accountable` are symlinks to those sources, and `.claude/skills/*` links through `.agents`; edit canonical sources only.
- `skills/internal/typescript/typescript-style/SKILL.md` currently summarizes the rule as “options objects for several/optional inputs,” which can over-trigger options-object design.
- `skills/internal/typescript/typescript-style/core-rules.md` currently permits up to four required positional parameters when order is clear and recommends a named `*Options` object for five or more positional parameters, defaults, flags, or multiple optional values.
- `skills/internal/typescript/typescript-style/checklist.md` mirrors that threshold but does not explicitly distinguish required core inputs/dependencies from behavioral options.
- `.ns/reviews/ns-typescript-style-tripwire/review.md` rule 12 repeats the positional-parameter threshold. It should be sharpened with the canonical wording so the review does not treat a small set of clear required core inputs as a violation. This remains an LM review rule; no deterministic TypeScript guard implementation currently enforces parameter-list semantics.
- `skills/public/prs/pr-make-accountable/SKILL.md` currently tracks material decisions, tradeoffs, limitations, and gaps only as `shared` or `open`. Its wrap-up reports generic “documentation gaps discovered (flag only; do not write docs).” The new policy should refine both interview tracking and wrap-up without weakening the existing explicit-approval boundary for PR edits.
- The skill already defines the full approved-change workflow: propose the change, obtain explicit approval, edit and validate the checked-out PR branch, use the repository’s normal commit/resubmit workflow, then rebuild inventory from the new PR head. Durable-policy edits approved for the current PR should use this existing path rather than a parallel procedure.
- The public skill must remain standalone and must not gain an ns-specific operational dependency. Recommendations should identify an authoritative existing documentation or skill location in the target repository; they should not require ns commands or ns-internal paths.
- User decision from the structured grill: update `skills/public/prs/pr-make-accountable/README.md` with one concise summary sentence, while retaining all classification, tracking, approval, and restart mechanics in `SKILL.md`.
- No generated artifact was found for these prose sources. `skills-lock.json` contains local computed hashes for both skills, but ordinary direct edits to first-party skills do not require an install operation. Inspect validation and the final diff before changing lock state; do not invent hashes or accept unrelated `npx skills` churn.
- Relevant validation entry points are `dprint check`/`just dprint-check`, `just ts-test-typescript-style-guard`, and the repository-wide `just`. Plain `just` does not include the specialized TypeScript style-guard lane, so run that lane explicitly.

## Files, symbols, tests, and documentation

### Canonical TypeScript guidance

- `skills/internal/typescript/typescript-style/SKILL.md`
  - “One-paragraph version” sentence about options objects.
- `skills/internal/typescript/typescript-style/core-rules.md`
  - Section 6 bullet “Use options objects for long or optional input lists.”
- `skills/internal/typescript/typescript-style/checklist.md`
  - “Functions, state, naming” parameter-list checklist item.
- `.ns/reviews/ns-typescript-style-tripwire/review.md`
  - Rule 12, “Long positional parameter lists or optional positional parameters.”

### Accountability interview behavior

- `skills/public/prs/pr-make-accountable/SKILL.md`
  - Section 2 tracking model and completion criterion.
  - Approved PR-change branch in Section 2, relying on the existing boundary and resubmit/rebuild-inventory procedure.
  - “Wrap up” report fields.
- `skills/public/prs/pr-make-accountable/README.md`
  - “How it works” public summary only; add a concise statement about reporting recurring unencoded policy and suggesting its authoritative home.

### Metadata and generated-state checks

- `skills-lock.json`
  - Inspect the entries for `typescript-style` and `pr-make-accountable` after edits. Change only if supported repository tooling explicitly requires and regenerates the hashes; never hand-author a hash or include unrelated lock churn.
- `.agents/skills/{typescript-style,pr-make-accountable}` and `.claude/skills/{typescript-style,pr-make-accountable}`
  - Verify links still resolve; do not edit or recreate them because identity/topology is unchanged.

### Validation

- Targeted Markdown formatting: `dprint check` on the changed Markdown files (use `just dprint-fix` if formatting fails, then recheck).
- Specialized policy/review lane: `just ts-test-typescript-style-guard`.
- Full repository gate: `just`.
- Final focused-diff inspection with `git diff --check`, `git diff --stat`, and a content review of every changed file.

## Implementation steps

1. **Create an independent ns feature branch from current trunk.**
   - Revalidate `git status --short --branch` and ensure the checkout is clean and on current `master`/trunk.
   - Use the repository’s Graphite workflow (`gt create <focused-branch-name> -m <message>` at the appropriate point) rather than committing on `master`.
   - Keep this as a single focused PR; do not attach it to or model it as a stack with the Clinkr repository.

2. **Sharpen the TypeScript one-paragraph summary.**
   - Replace “options objects for several/optional inputs” with compact language that leads with direct inputs for a small, clearly ordered set of required core data/dependencies.
   - In the same sentence or adjacent compact clause, reserve named options objects for behavioral configuration and long input lists.
   - Avoid introducing the detailed numeric threshold into the summary if it makes the paragraph heavy; the core rule and checklist remain the precise operational sources.

3. **Refine the canonical TypeScript core rule without losing the existing threshold.**
   - Keep the rule in Section 6 rather than creating a new document or section.
   - State positively that required core data and dependencies stay positional when there are up to four and their order is clear at call sites.
   - State that a named `*Options` object is appropriate for optional/defaulted behavioral configuration, flags, multiple optional values, or five-or-more/otherwise long positional lists.
   - Explicitly prevent the anti-pattern: do not wrap a small set of clear required core inputs merely because there are several inputs.
   - Preserve room for redesign rather than implying that five or more inputs must always be mechanically packed into an object.
   - Keep wording compact and consistent with existing naming guidance (`*Options` for caller inputs, `*Config` for stable configuration).

4. **Make the checklist test the semantic distinction.**
   - Rewrite the existing parameter-list item rather than adding overlapping checks.
   - Ensure the item confirms all three facts: clear small required core inputs may remain positional; optional/defaulted behavior and multiple optional values belong in a named `*Options` object; five or more positional inputs normally trigger redesign or an options object.
   - Ensure it does not classify every dependency as “configuration” or imply that four positional values are automatically preferable when their order is unclear.

5. **Align the TypeScript Tripwire review rule.**
   - Update rule 12 to use the same distinction between required core inputs/dependencies and optional/defaulted behavioral configuration.
   - Retain warning severity, the five-or-more threshold, the clear-order exception for up to four required inputs, and the existing library/framework callback exception.
   - Phrase the recommendation as redesign or a named `*Options` object for long lists, and avoid flagging a small, clearly ordered required-core signature solely because it has several inputs.
   - Do not add a deterministic AST rule; this distinction is judgment-based and already belongs to the LM tripwire.

6. **Extend `pr-make-accountable` interview tracking with a durable-policy classification.**
   - Add a compact definition near the existing tracked-topic model:
     - PR-specific rationale explains the current net diff and remains in the shared interview record/PR body as appropriate.
     - Durable policy is a reusable rule or decision likely to recur across PRs or future accountability interviews.
   - Track only candidate durable policy that is both likely to recur and not already encoded in an authoritative source. Do not promote every design answer, preference, or one-off rationale into a documentation task.
   - Keep `shared`/`open` as the status model for material PR topics; add durable-policy classification as an orthogonal note/category rather than conflating “reusable” with “resolved.”
   - Require evidence-based classification: repository inspection should determine whether a policy is already encoded and identify a plausible existing authoritative home. Do not ask the author for lookupable repository facts.

7. **Integrate policy encoding into the existing approved-change workflow.**
   - When an unencoded durable policy is found, record it for wrap-up by default; do not silently edit documentation or skills outside the PR’s intended scope.
   - If the author explicitly chooses to encode the policy in the current PR, treat that as an approved PR change under the skill’s existing rules: state the proposed edit, obtain explicit approval, edit, validate, commit/resubmit using the repository’s normal workflow, and rebuild the inventory from the new PR head before continuing.
   - Make clear that the same scope discipline applies: unrelated policy documentation should normally remain a recommendation rather than being pulled into the current PR.
   - Preserve the public skill’s Git + authenticated `gh` standalone boundary; describe the workflow generically rather than introducing ns-specific commands.

8. **Strengthen the accountability wrap-up report.**
   - Replace or refine the generic documentation-gap bullet so wrap-up separately lists:
     - reusable/durable policy discovered during the interview that is not yet encoded; and
     - for each item, a recommended authoritative existing documentation or skill location.
   - Report “none” when no such policy was found so the requirement is reliable rather than optional or silently omitted.
   - Keep PR-specific rationale in the shared understanding and live PR body, not in the durable-policy report.
   - Retain the existing boundary that gaps are flagged rather than written automatically, and retain reporting of open topics and interview-driven PR changes.

9. **Update the public README concisely.**
   - Add one sentence or short clause in “How it works” explaining that the final report identifies recurring policy not yet encoded and suggests an authoritative home.
   - Do not duplicate the detailed durable-vs-PR-specific test, tracking model, approval mechanics, or inventory restart workflow from `SKILL.md`.
   - Keep the README’s claim accurate for a standalone public skill and consistent with its existing purpose and dependency statement.

10. **Review coherence and scope before validation.**
    - Read the TypeScript summary, core rule, checklist item, and Tripwire rule in sequence. Confirm they use the same semantic categories and threshold and do not imply “several required inputs means options object.”
    - Read the complete accountability interview and wrap-up sections in sequence. Confirm that durable policy is distinguished from PR rationale, only recurring policy is flagged, existing approval boundaries remain intact, and the README does not overpromise automatic edits.
    - Inspect `git diff -- skills-lock.json` and all overlay links. Revert/avoid unrelated metadata or lock churn unless supported tooling proves a required generated update.

11. **Format, validate, commit, and submit the PR.**
    - Run targeted `dprint check` for changed Markdown; if it fails, run `just dprint-fix` and inspect formatter changes before rerunning.
    - Run `just ts-test-typescript-style-guard` because plain `just` omits this specialized lane.
    - Run `just` as the default repository validation gate.
    - Run `git diff --check` and inspect the final stat/diff for focus.
    - Stage only the intended files and use `gt modify`/`gt create` as appropriate under the Graphite workflow.
    - The loaded brief explicitly requests a new PR, so submit the independent ns branch with `gt submit --no-interactive`. Verify the resulting PR targets the ns repository and is not stacked on a Clinkr branch. Report the PR URL and validation evidence.

## Validation guidance

- Treat this as policy behavior, not merely copyediting. Manual semantic coherence review is essential because the acceptance criteria depend on distinctions that formatting and tests cannot prove.
- Confirm the TypeScript guidance handles these representative cases consistently:
  - `runCli(application, argv, stdout, stderr)`: acceptable direct required inputs when order is clear.
  - A function with required input plus retry flags/default timeout/optional logger: behavioral values belong in a named options object (with required core inputs allowed to remain direct where clear).
  - A function with five or more positional values: redesign the interface or use a named options object unless a project/framework contract governs it.
  - Four values whose order is confusing: the numeric threshold is permission, not a requirement to keep them positional; redesign remains appropriate.
- Confirm the accountability behavior handles these representative cases:
  - “This API uses four positional parameters because all are required core inputs”: candidate durable policy if likely to recur and not already encoded; recommend the existing TypeScript style skill as its home.
  - “This PR keeps the old output text for compatibility with one caller”: PR-specific rationale unless evidence establishes a reusable cross-PR rule.
  - A durable policy already documented in a repository standard: cite/use that authority during reasoning, but do not report it as unencoded.
  - The author declines to expand the PR: retain the policy recommendation in wrap-up without editing unrelated docs.
  - The author approves encoding it now: follow approval, edit, validate, resubmit, and inventory rebuild before resuming.
- Expected commands:
  - `dprint check <changed-markdown-files...>`
  - `just ts-test-typescript-style-guard`
  - `just`
  - `git diff --check`
- If `just` reports a dprint failure, use `just dprint-fix` rather than hand-formatting generated formatter output, then rerun validation.

## Risks, assumptions, and open questions

### Risks

- **Overcorrecting toward positional APIs:** The new rule must not imply that every required input belongs positionally. Clear call-site order and the up-to-four threshold still matter; long or ambiguous signatures should be redesigned.
- **Using `*Options` as a generic bag:** Required core inputs should not be hidden in an options object merely to satisfy a naming pattern. Conversely, optional/defaulted behavioral controls should remain named.
- **Turning interviews into documentation audits:** Durable-policy tracking must remain narrow: recurring, reusable, and not already encoded. One-off design rationale belongs to the current PR narrative.
- **Silent scope expansion:** The accountability skill must recommend a home by default, not edit unrelated standards without explicit author approval.
- **Public/internal dependency leakage:** `pr-make-accountable` is public. Do not make ns-specific skills, paths, or commands required for its promised workflow.
- **Policy drift across enforcement surfaces:** Leaving Tripwire rule 12 with older semantics could cause reviews to over-trigger despite corrected canonical prose.
- **Lockfile churn:** Editing local first-party skill content may expose stale computed hashes or tool-version behavior. Do not hand-edit hashes or accept unrelated changes; investigate and include only a supported, required regeneration.

### Assumptions

- The two policy corrections are coherent enough for one focused PR because both encode lessons from the same accountability interview and both improve future agent decision-making.
- No new ADR, CONTEXT vocabulary, standalone standards file, runtime package, generated artifact, or deterministic guard is required.
- The README update is intentionally concise, per the grill decision; `SKILL.md` remains the canonical operational procedure.
- Existing `shared`/`open` topic statuses remain useful and should not be replaced. Durable-vs-PR-specific is a separate classification axis.

### Open questions

- No material product or workflow questions remain. During implementation, exact sentence-level wording may be adjusted to keep the three TypeScript guidance surfaces and the accountability skill internally consistent.
- If repository tooling reports that a skill lock hash must be regenerated, investigate the supported current command and include only the two affected entries; otherwise leave `skills-lock.json` unchanged.

## Review and remediation

1. **Self-review against the source brief:** map every requested TypeScript and accountability behavior to a changed sentence or checklist/report field. Confirm the PR remains limited to these two related policy corrections.
2. **Cross-surface consistency review:** compare summary → core rule → checklist → Tripwire, then interview tracking → approved-change path → wrap-up → README. Remove duplicate or contradictory language.
3. **Public-skill boundary review:** ensure `pr-make-accountable` still requires only Git and authenticated `gh`, recommends target-repository authoritative locations generically, and does not expose ns-internal implementation details.
4. **Diff hygiene review:** reject unrelated formatting, overlay, lockfile, generated-file, objective, or package changes. If formatting touches more than intended, narrow or explain it before commit.
5. **Validation remediation:**
   - dprint failure: run `just dprint-fix`, inspect, and rerun.
   - TypeScript style-guard failure: determine whether the review definition wording/format is invalid or whether a pre-existing unrelated failure exists; fix only changes caused by this PR.
   - full `just` failure: diagnose and remediate only in-scope regressions; report clearly if an unrelated baseline failure blocks green evidence.
6. **PR review focus:** ask reviewers to verify that the semantic boundary is crisp in both domains: required core inputs are not mislabeled as options, and PR-specific rationale is not mislabeled as durable policy. Also verify that the approval/edit/revalidate/resubmit/reinventory boundary remains unchanged.
