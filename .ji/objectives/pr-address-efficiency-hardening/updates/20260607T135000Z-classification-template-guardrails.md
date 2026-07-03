# Classification Template Guardrails

## Summary

The current stack contains deterministic classification-template support for pr-address. `pr-address exec classification-template` builds a fill-in scaffold from a compact `prepare-run` or `get-feedback` manifest, pre-populating stable review/thread/comment identities, item pointers, and minimal body locator refs while leaving semantic fields for LLM judgment.

The validator and tests now cover the guardrail cases called out in the roadmap: filled templates validate, unfilled templates do not, resolved threads are omitted, and validation detects missing items, duplicate items, invalid/extra locator fields, wrong covered-comment field names, and omitted unresolved thread comments. The CLI reference documents the template contract.

Evidence: local stack diff against `master` includes `feedback_classification.py`, `classification_template.py`, scenario and unit tests, and `skills/pr-address/references/cli-reference.md`.

## Objective Impact

This completes the deterministic classification-template roadmap slice. It directly addresses the original PR #999 failure mode where an LLM understood review semantics but produced packet-shape mistakes such as extra locator fields, non-contract fields, and wrong covered-comment field names.

It also partially advances mutation payload ergonomics and docs: `validate-feedback-classification`, `classification-template`, and `resolve-thread-batch` can read JSON from stdin or explicit JSON options through the shared loader, and the CLI reference now describes the improved path. That is not yet enough to close the broader run-state, planning, checkpoint, selected-detail, or finalization work.

## Follow-Ups

- Add selected-detail artifact ergonomics so classification/execution can inspect needed bodies without dumping selected body text into the main transcript.
- Add deterministic planning from validated classifications before continuing to larger mutation/checkpoint/finalization helpers.
- Keep future helper docs focused on deterministic helpers before manual JSON grouping or mutation payload assembly.
