---
name: pr-make-accountable
disable-model-invocation: true
description: Interview a PR author to establish shared understanding of intent and design decisions, then co-author the What / Why / Changes / Reviewer focus PR body.
---

# pr-make-accountable

Interview one PR's author about context the evidence cannot supply and decisions
visible in the diff. Probe politely and insistently. Finish with shared
understanding and a PR body aligned with the actual change:

```markdown
## What

A one or two sentence summary of what this change is.

## Why

Why is this change needed? What problem does it solve?

<!-- When the final net diff changes externally visible behavior, insert at least one concise, representative example here. Show the user's action and resulting behavior as an invocation/output block, before/after pair, request/response pair, or short workflow. Add more examples only when they clarify materially different user experiences and remain proportional to the change. Omit this instruction and all example content when the change is internal-only. -->

## Changes

Opening orientation bullets — scaled to the scope of the change — naming the
mechanism, where it lives, and which consumers change; then one bullet per
judgment call, tradeoff, or limitation the diff cannot defend on its own,
each stated in one sentence. A rationale thread that spans several changes
may instead be carried once by a short prose paragraph. Defer code-visible
detail to the diff.

## Reviewer focus

Anything you'd especially like reviewers to pay attention to.

**PR:** [#<number>](url)

---

*PR description co-authored with `/pr-make-accountable` using `<model>` in `<harness>`.*
```

Finding that the author misunderstands the change or that the PR needs work is
a useful outcome; surface it rather than forcing agreement.

This skill is intentionally independent of Flow and ns. It is not an automatic,
mechanically assembled inventory: it interviews the author for rationale the diff
cannot supply, requires the author to review the complete written body, and
produces a co-authored body. Do not substitute a best-effort inventory from diff and commit headlines for
that accountability process.

## Boundaries

- Target one existing PR: an explicit number/URL or the current branch's PR. If
  none exists, stop and ask the user to create or push one using the
  repository's normal Git/PR workflow.
- Require Git and an authenticated `gh` session. Use `gh` for PR metadata and
  the body update. Use local `git` to inspect the diff and, when the author
  approves a change during the interview, to edit and validate the checked-out
  PR branch. No Flow or ns installation is required.
- Do not change code speculatively. Before editing, state the proposed change
  and get the author's explicit approval. Keep unrelated files, labels, and
  reviewers unchanged.
- After an approved code change, use the repository's normal commit workflow,
  push or resubmit the PR (or stack) with its established tooling, then rebuild
  the inventory from the new PR head before continuing the interview. An ns
  repository may optionally use `ns flow gt submit`; this skill does not require
  ns or that integration.

## 1. Build the inventory

Before questioning the author:

1. Run:
   `gh pr view <n> --json title,body,url,number,baseRefName,headRefName,headRefOid,additions,deletions,changedFiles,commits`.
2. Confirm the checked-out branch equals `headRefName` and local `HEAD` equals
   `headRefOid`; fetch first if needed. On divergence, stop and ask the user to
   sync.
3. Inspect the shape with
   `git diff --stat $(git merge-base HEAD origin/<baseRefName>)...HEAD`, then
   inspect each file with `git diff` or `git show`. For a large diff, sample by
   file rather than truncating blindly.
4. Read the existing body as context only; the co-authored body will replace it.
5. Describe the PR only in terms of its net diff against the base. Intermediate
   commit state — files added then removed within the PR, reverted experiments,
   commit-by-commit churn — is not PR content; exclude it from the inventory,
   interview, body, and reports. Use commit messages only as evidence of intent
   about the net change.

Inventory:

- apparent problem and conceptual change;
- visible design decisions and tradeoffs;
- apparent limitations and reviewer-risky or subtle areas;
- material intent, constraints, and rejected alternatives unknowable from the
  evidence;
- whether the final net diff changes anything from a user's viewpoint, including
  CLI syntax or output, UI behavior, API request or response behavior,
  configuration behavior, diagnostics, workflows, or another user-facing
  contract; and
- for an externally visible change, evidence for at least one candidate
  representative example: the user's action, the resulting behavior, and any
  exact text or values that the implementation supports. For an internal-only
  change, record that classification without manufacturing a candidate.

Completion criterion: every material area is either understood from evidence or
listed as an interview gap. The inventory is not complete until it includes the
externally visible or internal-only classification and, for an externally visible
change, candidate evidence for at least one representative example.

Present a condensed inventory summary: what the PR appears to do, where it
lives, and notable decisions. Invite correction. Then ask: **“Why is this
change needed? What problem does it solve?”**

## 2. Interview the author

Ask one open-ended, plain-prose question per turn and wait for free-text answers.
Scale depth to the decision surface: one or two probes may cover a trivial fix;
a large feature warrants a full decision, tradeoff, and limitation walk. Always give
users the option to end the interview.

Pursue only material inventory gaps. Depending on the PR, elicit the motivating
problem and affected users, external constraints, prior context, deliberate
non-goals, and what “done” means beyond this PR.

For each material design decision, probe why it has its final shape: the
alternative rejected, what breaks if it differs, and whether the tradeoff was
intentional. If the answer restates the code or delegates judgment to the agent,
acknowledge it and re-ask specifically.

Apply these rules:

- Discuss only final-state rationale, behavior, tradeoffs, limitations, and
  risks. Discuss history only when it explains a decision or limitation that
  remains.
- Derive lookupable facts from the PR. Ask the author for the rationale behind
  those facts, not for an inventory they could reread.
- If an answer conflicts with evidence, cite the file/line and investigate until
  either your reading or the author's model is corrected. Accept
  incomplete-but-correct answers without adding inventory detail.
- For an externally visible change, resolve material uncertainty about each
  candidate example's values, behavior, or context. Do not ask for facts that
  repository or PR evidence already establishes; ask only for missing rationale
  or confirmation needed for accuracy. Each representative user action and
  result must enter the shared, evidence-consistent interview record before
  drafting. If no accurate representative example is yet supportable, keep this
  drafting prerequisite open and continue the interview or follow the approved
  PR-change path instead of inventing content.
- If the interview exposes an undefended decision, unintended behavior, or
  scope that should change, record it and ask whether the author wants to amend
  the PR first. If yes, offer to make the change in the checked-out branch;
  after approval, edit, validate, commit, resubmit, and restart at inventory.
  The author may instead make the change externally. If no, represent the
  current PR honestly and route the item to a limitation, reviewer focus, or
  the consumability report.

Classify interview material separately from its resolution status:

- **PR-specific rationale** explains the current net diff and remains in the
  shared interview record or PR body as appropriate.
- **Candidate durable policy** is a reusable rule or decision likely to recur
  across PRs or future accountability interviews. Track it for wrap-up only
  when repository inspection shows that no authoritative source already
  encodes it. Identify a plausible existing documentation or skill location
  that should own it. Do not ask the author for lookupable repository facts or
  turn every design answer, preference, or one-off rationale into policy work.

Record unencoded durable policy for wrap-up by default; do not silently edit
unrelated documentation or skills. If the author wants to encode it in the
current PR and the change fits the PR's intended scope, state the proposed edit
and obtain explicit approval. Then follow the existing PR-change workflow:
edit, validate, commit, resubmit with the repository's normal tooling, and
restart at inventory from the new PR head. Policy documentation outside the
PR's intended scope normally remains a recommendation.

Track every material decision, tradeoff, limitation, and inventory gap as:

- **shared** — author and agent tell the same evidence-consistent story; or
- **open** — unresolved or planned as a PR change.

This status is orthogonal to the PR-specific or durable-policy classification.
Completion criterion: every material topic has a status. Open topics may proceed
only when the draft or final report states them honestly.

## 3. Co-author the body

Draft only from final-net-diff evidence and the shared interview record. Include
intent, accepted risks, and judgment calls that the diff cannot communicate. Keep
length proportional to the decision surface, not line count. End the description
with `**PR:** [#<number>](<url>)`, replacing the placeholders with the PR number
and canonical URL from the inventory. Put this link immediately before the
horizontal rule and provenance footer.

When the final net diff changes externally visible behavior, insert at least one
concise, representative example after the motivation in `## Why` and before
`## Changes`. Choose the clearest suitable form: an invocation and its output, a
before/after behavior pair, a request and response, or a short user workflow.
Show both the user's action and the resulting behavior; an abstract statement
that behavior changed is not an example. Use only implementation-supported
commands, output, errors, paths, API fields, behavior, and values confirmed by
the shared interview record. Never invent sample values, output, or behavior.
Preserve exact technical text, Markdown, and code-block formatting. The live
draft for an externally visible PR is not complete until at least one example is
present. Add more examples only when they clarify materially different user
experiences and remain proportional to the change; they must not become an
exhaustive tutorial or replace `## Changes`. Omit examples and every placeholder
or empty example section only when the final net diff has no externally visible
effect.

In `## Changes`:

- Open with orientation bullets scaled to the scope of the change, naming the
  mechanism, where it lives, and which consumers change. Give a reviewer a
  map, not a file inventory.
- Spend the remaining bullets only on judgment calls, risks, tradeoffs, and
  limitations the diff cannot communicate on its own. State each in one
  sentence; add a second only when the judgment call genuinely needs it. Name
  the mechanism and where it lives; do not teach it from zero. Assume codebase
  familiarity, not session or workflow familiarity.
- Budget the section: typically three to six bullets total, including
  orientation. Before exceeding that, merge related decisions into one bullet
  or route the content elsewhere per the rules below.
- When one rationale thread genuinely spans several changes, write it once as
  a short prose paragraph (two to four sentences) between the orientation and
  decision bullets, and keep the affected bullets to one-line pointers into
  it. Use this instead of repeating or splitting the rationale across bullets.
- Route content at the wrong altitude out of the section: motivation belongs
  in `## Why`; hotspots the reviewer must scrutinize belong in
  `## Reviewer focus`; rationale already recorded in the diff (for example in
  an ADR) gets a one-clause pointer, not a restatement.
- Defer lookupable, code-visible facts to the diff — error-code lists,
  type/state plumbing, dependency removals, test updates. Mention such a fact
  only when it embodies a deliberate design decision, and then in one short
  clause.

<!-- Drafting-pass inspiration: mattpocock/skills, skills/productivity/wait-what/SKILL.md. -->

Apply one ASD-STE100-inspired Simplified Technical English editing pass to the
complete draft:

- Use short, direct sentences with one main point or action per sentence.
- Prefer active voice when naming the actor improves accountability.
- Use one consistent term for each concept and avoid unnecessary synonyms.
- Remove filler, pleasantries, and unsupported hedging only when doing so does
  not remove meaningful information or context.
- Preserve full grammatical sentences and articles. Do not compress the prose
  into fragments.
- Preserve all meaningful information and context, including substantive
  rationale, constraints, qualifications, causal relationships, tradeoffs,
  limitations, and distinctions between ideas. Concision must not change or
  weaken the intended meaning.
- Preserve exact technical terms, code, paths, CLI commands, output, quoted
  errors, API fields, links, technical spellings, and code-block formatting,
  including those in the representative example.
- Keep the existing sections, Markdown structure, bullets, footer, and
  proportionality rules intact.
- After the pass, compare the edited draft with the source draft. Restore any
  meaningful information or context that the editing pass removed or obscured.

Omit `## Reviewer focus` when empty; the written heading never carries an
`(optional)` marker. End every draft with this
provenance footer, separated from the description by a horizontal rule:

```markdown
---

*PR description co-authored with `/pr-make-accountable` using `<model>` in `<harness>`.*
```

Replace `<model>` with the exact qualified model identity reported by the
current runtime and `<harness>` with its human-readable harness name. Do not
infer, abbreviate, or hard-code either value. For example, an OpenAI session in
Pi might report `openai/gpt-5.6-sol` and `Pi`; an Anthropic session in Claude
Code might report `anthropic/claude-opus-4-6` and `Claude Code`.

Draft a concise title that describes the net diff. Preserve the substantive
existing title when it is faithful; rewrite it when it is inaccurate,
misleading, or describes intermediate work absent from the net diff. Prefix
the resulting title with `[accountable]` exactly once.

Write the draft body and honest title immediately:

```sh
gh pr edit <n> --body-file <tmpfile> --title "[accountable] <honest title>"
```

Then show the complete body and title as written, and say explicitly that they
are now live on the PR but not final: the author's name goes on them, so they
must read every claim, including each representative example's action and
resulting output or behavior, and change anything false or unlike their voice.
Prompt for further edits: the author can request changes in chat (apply them
with another `gh pr edit`) or edit directly in the GitHub UI; if they are
satisfied as-is, no further step is needed.

The author's wording wins. If a requested edit restores a claim disproved
during the interview, push back once with evidence before accepting their
decision. Remind them that this LM-authored version is a draft and that they
are accountable for the final description.

Before ending the interview, publish the PR for review if it is still a draft.
Check its current `isDraft` value with `gh pr view`; when true, run
`gh pr ready <n>`. Do not leave an accountability interview's PR unpublished,
and do not ask the author to perform this routine step. Verify the PR is ready
before reporting completion.

## 4. Report consumability

After the update, give a verdict with concrete recommendations for
each axis:

- **Size and cohesion** — reviewable and focused, or better split?
- **Title honesty** — does the live substantive title accurately summarize the net diff?
- **Narrative** — does the body establish the right model before code?
- **Focus** — are interview-discovered hotspots in `## Reviewer focus`?

Include deferred PR-change items from the interview.

## Wrap up

Report:

- PR URL;
- shared understanding: reached or not reached;
- description alignment with reality: aligned or not aligned;
- every open topic;
- PR changes the author chose because of the interview;
- reusable or durable policy discovered during the interview that is not yet
  encoded, or `none` when no such policy was found; and
- for each unencoded policy, a recommended authoritative existing documentation
  or skill location (flag only; do not write docs automatically).
