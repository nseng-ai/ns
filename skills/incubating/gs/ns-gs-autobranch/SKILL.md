---
name: ns-gs-autobranch
disable-model-invocation: true
description: "Run or recover the GS-native dirty-work autobranch workflow through `ns gs autobranch`."
---

# ns-gs-autobranch

Use the deterministic `ns gs autobranch` command to move pending work onto a new github/gh-stack child and checkpoint it.

## Entry points

- Preferred Pi surface: `/ns:gs:autobranch [--slug <slug>] [recovery context]`.
- Other harnesses: run `ns gs autobranch --yes --format json`, adding `--slug <slug>` only when explicitly requested or needed after preparation refusal.

## Contract

The CLI supports exactly two paths in the invoking provider worktree:

- dirty cached trunk: create and switch to a child, checkpoint all pending work, then run public `gh stack init`;
- dirty non-trunk that is the invoking provider view's unique current top: run public `gh stack add`, prove the dirty child attachment, then checkpoint.

It requires exactly gh-stack v0.1.0. It uses cached `origin/HEAD` without fetching. It does not scan peer worktrees, access provider-private state, manage Slots, push, submit, mutate GitHub, or import Flow.

## Workflow

1. Run the structured CLI once.
2. If `data.outcome=completed`, report the verified child, checkpoint, invoking provider-worktree provenance, and that no push or GitHub mutation occurred.
3. If `data.outcome=refused`, follow only the returned recovery instruction. A refusal made no intended mutation.
4. If `data.outcome=known-partial-failure`, inspect the preserved child and invoking provider view named by the envelope. Do not replay completed effects.
5. If `data.outcome=ambiguous-failure`, stop mutation and reconcile Git plus public `gh stack view --json` facts in the same worktree. Ask the user before any repair whose effect is not proven.
6. If the envelope is malformed, missing, or contradicts process status, stop and report protocol ambiguity.

## Recovery prohibitions

Never rerun branch creation, `gh stack init`, `gh stack add`, or checkpointing merely because the overall command did not complete. Never roll back, delete the child, run `gh stack unstack`, edit/copy provider-private files, inspect or mutate peer provider state, use Slots, fetch, push, submit, or mutate GitHub as recovery. Preserve forward state and separate observed facts from hypotheses.
