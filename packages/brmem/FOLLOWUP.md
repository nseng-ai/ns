# brmem follow-ups

These are product/code/doc alignment items discovered while writing `packages/brmem/CONTEXT.md`. The context file records the intended ontology; this file tracks known reality gaps to resolve later.

## Alignment items

- **Base Namespace copyability**
  - Should-be: The Base Namespace is a real Namespace in the domain model; copy semantics should not be conceptually limited to named Namespaces.
  - Current reality: `brmem copy` requires `--namespace <ns>` and only copies named Namespaces.
  - Likely change: Support Base Namespace copy, either by omitting `--namespace` or via an explicit `--base` option, while preserving safe conflict behavior.

- **Entry Locator naming**
  - Should-be: `<snapshot-ref>:<entry-key>` is an Entry Locator, not a real Git ref.
  - Current reality: code and JSON result types use `ref_name`; some human output labels the locator as `Ref:`.
  - Likely change: Improve human-facing labels and docs to say `Entry Locator`; handle JSON field changes compatibly if any are attempted.

- **Prompt Plugin visibility**
  - Should-be: Prompt Plugin resolution is skill-facing/internal automation, not a user-facing Branch Memory operation.
  - Current reality: the README command table presents `brmem exec resolve-prompt` alongside user commands.
  - Likely change: Move or reword prompt-plugin docs so `exec` remains hidden/skill-facing and user help stays focused on Branch Memory operations.

- **Namespace ownership wording**
  - Should-be: named Namespaces are workflow-owned; the Base Namespace is reserved by `brmem`.
  - Current reality: docs use both “domain-owned” and “tool-owned” wording.
  - Likely change: Sweep docs/skills/README wording to use workflow-owned consistently where public-facing.

- **Empty Snapshot copy behavior**
  - Should-be: Deleting the last Entry leaves an empty current Snapshot for that Namespace; an empty destination Snapshot should not create a Copy Conflict because there are no destination Entries to replace.
  - Current reality: needs audit. Snapshot-level copy without `--key-glob` may treat any existing destination Snapshot Ref as a conflict even when its tree is empty.
  - Likely change: Audit and adjust copy conflict detection so conflicts are Entry-based, not merely ref-existence-based.
