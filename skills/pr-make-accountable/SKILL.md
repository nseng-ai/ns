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

High-level orientation bullets (what and where), then the design decisions,
tradeoffs, or limitations necessary to understand the implementation — each
explained from zero.

## Reviewer focus (optional)

Anything you'd especially like reviewers to pay attention to.

---

*PR description co-authored with `/pr-make-accountable` using `<model>` in `<harness>`.*
```

Finding that the author misunderstands the change or that the PR needs work is
a useful outcome; surface it rather than forcing agreement.

## Boundaries

- Target one existing PR: an explicit number/URL or the current branch's PR. If
  none exists, stop and ask the user to submit first (for example, with
  `ns flow submit`).
- Use `gh` for PR metadata and the body update; use local `git` read-only for
  the diff.
- The only write is complete PR-body replacement with
  `gh pr edit <n> --body-file <tmpfile>`. Leave commits, branches, labels,
  reviewers, and repo files unchanged.
- Keep proposed PR changes advise-only. The author decides and performs them
  outside this skill.

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
  the PR first. If yes, pause for external changes and restart at inventory. If
  no, represent the current PR honestly and route the item to a limitation,
  reviewer focus, or the consumability report.

Track every material decision, tradeoff, limitation, and inventory gap as:

- **shared** — author and agent tell the same evidence-consistent story; or
- **open** — unresolved or planned as a PR change.

Completion criterion: every material topic has a status. Open topics may proceed
only when the draft or final report states them honestly.

## 3. Co-author the body

Draft only from the shared interview record. Include intent, accepted risks, and
judgment calls that the diff cannot communicate. Keep length proportional to the
decision surface, not line count.

In `## Changes`:

- Start with one orientation bullet per major addition or behavior change,
  naming what and where. Give a reviewer a map, not a file inventory.
- Explain each risk or judgment call from zero, including any mechanism needed
  to understand it. Assume codebase familiarity, not session or workflow
  familiarity.

Read [`caveman.md`](caveman.md) and apply its **lite** rules once to the draft.
Retain professional full sentences, articles, exact technical terms, paths, and
code.

Omit `## Reviewer focus (optional)` when empty. End every draft with this
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
anything false or unlike their voice. Require explicit approval or edits before
writing.

The author's wording wins. If an edit restores a claim disproved during the
interview, push back once with evidence before accepting their decision. Remind
them that this LM-authored version is a draft and that they are accountable
for the final description.

Write the approved draft as the complete body:

```sh
gh pr edit <n> --body-file <tmpfile>
```

## 4. Report consumability

After the update, give an advise-only verdict with concrete recommendations for
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
