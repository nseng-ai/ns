# PR Feedback Classification

This directory contains the `pr-address exec` operations that fetch PR feedback,
turn it into a compact manifest, classify it, and validate the result before any
agent acts on review comments.

The classification system exists because raw GitHub feedback is messy: PR-level
reviews, inline review threads, thread comments, discussion comments, bots, stack
status updates, and human requests all arrive through different shapes. Agents
need a single explicit packet that says which items are actionable, which are
informational, and why.

The important design choice is to separate deterministic structure from LLM
judgment:

- `prepare_run.py` / `get_feedback.py` fetch feedback and emit compact manifests
  with body locators instead of dumping raw bodies into the transcript.
- `feedback_manifest_view.py` normalizes supported manifest shapes into one view
  for both template generation and validation.
- `feedback_classification_template.py` builds a deterministic scaffold with
  IDs, locators, thread item pointers, and exact comment coverage prefilled.
- An LLM fills only semantic fields such as disposition, summary, complexity,
  and informational reason.
- `feedback_classification.py` validates the filled packet strictly before any
  execution plan is shown or any GitHub mutation is attempted.

Validation intentionally requires exact-once coverage for every review, every
unresolved review thread, every covered thread comment, and every discussion
comment. This prevents agents from silently dropping feedback while still
allowing bot/status noise to be recorded as informational.

`json_sources.py` and the `classification-template` /
`validate-feedback-classification` operations support both legacy wrapper input
and split manifest/classification input. Split input is preferred because it
keeps the workflow explicit and avoids ad-hoc wrapper JSON assembly.

`resolve-thread-batch` accepts its payload from stdin, `--payload-json`, or
`--payload-file`. Pass only one explicit payload source; use `--payload-file`
for large generated batch payloads to keep agent transcripts compact.
