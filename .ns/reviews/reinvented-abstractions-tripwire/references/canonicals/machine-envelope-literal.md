# machine-envelope-literal

- Kind key: `machine-envelope-literal`
- Canonical: toMachineEnvelope / usageErrorMachineEnvelope / envelopeJsonText; parseMachineEnvelopeData
- Import/path hints: @nseng-ai/clinkr for builders; @nseng-ai/core/machine-envelope for parser
- Raw-form tell: object literals with status, exitCode, data/message for --format json
- Why reuse matters: one status/exitCode/field contract across CLIs
- Structural exemptions: test fixtures and local expected-value literals
- Semantic judgment notes: Cite the builder or parser side accurately; do not point builder findings at the parser only.

Example finding wording: "This added code hand-rolls toMachineEnvelope / usageErrorMachineEnvelope / envelopeJsonText; parseMachineEnvelopeData instead of routing through the existing canonical. Reuse the canonical so the existing policy/test seam applies."
