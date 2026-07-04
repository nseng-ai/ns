# CI PR Context Wiring

## Summary

The CI wiring slice landed on local branch `roaster-review-convergence/ci-pr-context`.

The roaster workflow now gathers PR base/head data from the existing `PR_NUMBER`/`GH_TOKEN` context, fetches the PR head SHA, computes the reviewed base merge-base, passes opt-in Prior-findings context flags to `ns roaster review run`, and stamps reviewed head/base merge-base values during `publish-findings`. The workflow diff adds no permissions, triggers, `contents: write`, or draft-gating changes.

A small CLI/operation seam was added so `ns roaster review run` can opt in to prior-findings PR context by PR number and cap. The default run remains PR-free unless `--prior-findings-pr-number` is supplied.

## Objective Impact

The CI context-wiring roadmap row is complete in the landed-state model. All non-empirical implementation rows are now complete: ADR, publish stamping, read-side gathering, prompt context/instructions, and CI wiring.

The Objective remains open because the empirical validation row and empirical completion criteria still require representative real PRs, LLM compute, and GitHub writes under human control.

## Follow-Ups

- Human-steered empirical validation: resolve→resubmit should not re-raise prior findings on unchanged code, unchanged rerun/restack should stay quiet, and new work should still surface fresh issues.
- Decide the remaining local default-fetch question only with human input; current default stays opt-in.
