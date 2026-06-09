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
- A parent agent fills only semantic fields in that scaffold, such as
  disposition, summary, complexity, and informational reason, potentially from a
  delegated subagent's prose classification report.
- The delegated report is not the deterministic CLI contract;
  `validate-feedback-classification` receives the parent-generated JSON packet.
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

`record-batch-checkpoint` validates compact post-batch evidence from
`plan-feedback`, mutation helper results, validation commands, changed files, and
non-thread outcomes. `changed_files` entries must be repository-relative
forward-slash paths. When the plan came from a payload-backed run, it writes a
managed `.summary.json` checkpoint artifact without copying raw feedback bodies
into the checkpoint.

`finalize-run` consumes a fresh compact `get-feedback` payload manifest plus the
batch checkpoint results and produces final unresolved, skipped, mutation, and
validation evidence. It is local/read-only and does not read or print raw
feedback bodies.
