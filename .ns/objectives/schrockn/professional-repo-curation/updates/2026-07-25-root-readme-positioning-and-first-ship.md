# Root README positioning settled; first team-facing ship chosen

Date: 2026-07-25

## Summary

An interactive positioning session settled the content basis for the "Root README
reframing" row and made one sequencing decision:

- **Identity:** `ns` = **nonslop** as the primary identity; category is
  "infrastructure for the agentic development lifecycle," explicitly not another coding
  agent. The context-management thesis appears as headline assertion in the README and
  is argued in a linked `why-ns.md` manifesto (two-document split: landing page vs.
  argument).
- **Presentation taxonomy:** core capabilities (objectives, handoffs, flow,
  pr-feedback — universal problems with no incumbent) vs. extensions shipped in this
  repo (slots, reviews, plans/branch-context — opt-in, "bring your own X") vs. harness
  integrations (pi as the first example of a harness-neutral pattern) vs. tools (herdr
  reclassified as a standalone tool with a pi extension) vs. skills (curated universal
  set only; `code-*` and repo-internal skills stay internal).
- **Flow framing:** named for the engineer's flow state — naming-fatigue reduction and
  method-agnostic parallelism (clones, worktrees, or the slots extension all valid).
- **Quickstart:** pure CLI, no pi dependency; **pr-feedback** is the leading candidate;
  a cold-checkout install path is unverified and gates the row.
- **First team-facing ship: single-player objective system.** Colleagues install and
  use Objectives from outside this checkout. This revises the creation-time
  adoption-wedge assumption (herdr/pi-partners first) and pulls the objectives
  graduation ahead of the hosts wave.

Full positioning, outline, and content rules persisted in
`references/root-readme-positioning.md`.

## Objective Impact

- `objective.md`: Root README scope bullet now cites the settled positioning reference
  and the `why-ns.md` companion; new scope bullet for the single-player objective
  system first ship; creation-time adoption-wedge assumption marked revised.
- `roadmap.md`: Root README row carries the settled-outline evidence and the
  install-path gate; new row for the first team-facing ship (single-player objective
  system), advancing ahead of the hosts wave, likely Subobjective when scoped.
- `orientation.md`: graduation-ladder clause re-derived to lead with the single-player
  objective system ship.
- New risk surfaced: `@nseng-ai/objectives` depends on `branch-context` and `flow`
  (both incubator-destined); the first-ship row owns the verdict — cut the edges or
  graduate a minimal slice together.

## Follow-Ups

- Verify a cold-checkout install path to unblock the quickstart decision (pr-feedback
  candidate).
- Decide which workflow gets the README terminal capture; final hero wording pass.
- Scope the single-player objective system Subobjective, including the
  branch-context/flow dependency verdict.
- Draft `why-ns.md` from the session material (not blocked on the quickstart decision).
- Portability pass over the curated skill set before skills become the public on-ramp.
