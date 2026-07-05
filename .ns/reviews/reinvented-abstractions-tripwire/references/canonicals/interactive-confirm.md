# interactive-confirm

- Kind key: `interactive-confirm`
- Canonical: confirmInteractiveOrUsageError
- Import/path hints: @ns/clinkr
- Raw-form tell: readline/readline/promises prompt loops or process.stdin.isTTY checks in command handlers
- Why reuse matters: shared non-interactive/CI usage-error policy instead of prompts that hang
- Structural exemptions: low-level prompt implementation modules themselves
- Semantic judgment notes: Check the command has a yes/force flag or equivalent that can be represented by the canonical helper.

Example finding wording: "This added code hand-rolls confirmInteractiveOrUsageError instead of routing through the existing canonical. Reuse the canonical so the existing policy/test seam applies."
