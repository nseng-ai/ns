---
name: objective-critique
disable-model-invocation: true
description: "Red-team an Objective before implementation starts: a verdict-first critique grounded in repo evidence, with every stated assumption classified and Non-Goals re-litigated."
---

# objective-critique

Red-team one Objective as the skeptical product designer — an expert in user experience, product design, and engineering — who must approve it before implementation starts. The deliverable is a critique report; this skill is read-only on Objective records and changes no code.

Part of the Objective skill family. Use the `objective` umbrella skill for shared vocabulary and selection rules when needed.

## 1. Select exactly one Objective

Use the explicit slug or path if the user gave one. Otherwise, if the current branch adds or modifies exactly one Objective record, use that one. Otherwise run `ns objective list --format md` and ask the user to choose.

Read the full record: `objective.md`, plus `roadmap.md` and recent `updates/*.md` if present.

## 2. Ground in the repo

Read the code, workflows, and subsystems the Objective touches before judging any claim — not just the Objective's own prose. A criticism that could have been written without reading the code doesn't count.

## 3. Critique

Cover, with cited evidence for each:

1. **Problem reality** — is the problem the Thesis describes what the code actually does today? How bad is it, concretely, and for whom?
2. **Assumptions** — classify EVERY entry in the Assumptions and Risks section, plus any risk the Objective itself flags as load-bearing or not yet de-risked, as: verified in code, plausible but unchecked, or contradicted. None skipped.
3. **Unstated assumptions and risks** — what is the Objective silently relying on that it never wrote down? Name any you find that you are confident about, and say whether each holds.
4. **Mechanism→goal fit** — trace the primary workflow the Objective claims to improve end to end through the proposed design, and show where it delivers the stated goal or fails to.
5. **Cheapest alternative** — what's the simplest design that captures most of the value? Re-litigate each rejection in Non-Goals: are the stated reasons for rejecting it actually sound?
6. **Complexity budget** — enumerate every new moving part the Scope introduces and say which the stated goal genuinely requires vs. which are speculative.
7. **End-to-end user experience** — the experience before vs. after for whoever this Objective serves, including the failure modes the new design introduces.

If the record lacks a section named above, flag the gap as a finding and critique what is present.

## 4. Report

Output the verdict first — go / go-with-changes / no-go — then concerns ranked by severity.

Done means: verdict stated, every stated assumption classified, and every concern tied to something you read in the repo. Do not edit the Objective or the code; applying changes is a follow-up the user must ask for.
