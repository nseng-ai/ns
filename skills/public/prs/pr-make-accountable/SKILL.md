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
cannot supply, requires approval of the complete draft, and produces a co-authored
body. Do not substitute a best-effort inventory from diff and commit headlines for
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
  repository may optionally use `ns flow submit`; this skill does not require
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
4. Read the existing body as context only; the approved body will replace it.

Inventory:

- apparent problem and conceptual change;
- visible design decisions and tradeoffs;
- apparent limitations and reviewer-risky or subtle areas;
- material intent, constraints, and rejected alternatives unknowable from the
  evidence.

Completion criterion: every material area is either understood from evidence or
listed as an interview gap.

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
- If the interview exposes an undefended decision, unintended behavior, or
  scope that should change, record it and ask whether the author wants to amend
  the PR first. If yes, offer to make the change in the checked-out branch;
  after approval, edit, validate, commit, resubmit, and restart at inventory.
  The author may instead make the change externally. If no, represent the
  current PR honestly and route the item to a limitation, reviewer focus, or
  the consumability report.

Track every material decision, tradeoff, limitation, and inventory gap as:

- **shared** — author and agent tell the same evidence-consistent story; or
- **open** — unresolved or planned as a PR change.

Completion criterion: every material topic has a status. Open topics may proceed
only when the draft or final report states them honestly.

## 3. Co-author the body

Draft only from the shared interview record. Include intent, accepted risks, and
judgment calls that the diff cannot communicate. Keep length proportional to the
decision surface, not line count. End the description with
`**PR:** [#<number>](<url>)`, replacing the placeholders with the PR number and
canonical URL from the inventory. Put this link immediately before the horizontal
rule and provenance footer.

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

Read [`caveman.md`](caveman.md) and apply its **lite** rules once to the draft.
Retain professional full sentences, articles, exact technical terms, paths, and
code.

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

Show the complete draft, including the footer, and say explicitly that it is
not final: the author's name goes on it, so they must read every claim and edit
anything false or unlike their voice. Explain that the text shown in the harness
is not directly editable: the author can request changes in chat before approval,
and final hands-on editing happens in the GitHub UI after the body is written.
Require explicit approval or requested edits before writing.

The author's wording wins. If an edit restores a claim disproved during the
interview, push back once with evidence before accepting their decision. Remind
them that this LM-authored version is a draft and that they are accountable
for the final description.

Write the approved draft as the complete body, and prefix the PR title with
`[accountable] ` (skip the title change if it already starts with
`[accountable]`):

```sh
gh pr edit <n> --body-file <tmpfile> --title "[accountable] <existing title>"
```

## 4. Report consumability

After the update, give a verdict with concrete recommendations for
each axis:

- **Size and cohesion** — reviewable and focused, or better split?
- **Title honesty** — faithful to the diff?
- **Narrative** — do commits and body establish the right model before code?
- **Focus** — are interview-discovered hotspots in `## Reviewer focus`?

Include deferred PR-change items from the interview.

## Wrap up

Report:

- PR URL;
- shared understanding: reached or not reached;
- description alignment with reality: aligned or not aligned;
- every open topic;
- PR changes the author chose because of the interview;
- documentation gaps discovered (flag only; do not write docs).
