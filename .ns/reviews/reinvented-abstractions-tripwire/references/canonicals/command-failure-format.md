# command-failure-format

- Kind key: `command-failure-format`
- Canonical: formatCommandFailure / formatCommandResultFailure
- Import/path hints: @ns/core/exec; @ns/core/command
- Raw-form tell: local formatCommandFailure or hand-built exit-code/stderr strings
- Why reuse matters: central truncation, terminal-escape stripping, stdout/stderr section policy
- Structural exemptions: tests asserting historical text; command domains with a stricter user-facing contract
- Semantic judgment notes: Open the formatter and verify the canonical text contract is acceptable at the call site.

Example finding wording: "This added code hand-rolls formatCommandFailure / formatCommandResultFailure instead of routing through the existing canonical. Reuse the canonical so the existing policy/test seam applies."
