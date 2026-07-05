# manual-truncation

- Kind key: `manual-truncation`
- Canonical: truncateTextHeadTail / truncateTextHead / tailText
- Import/path hints: @nseng-ai/core/text-truncation; @nseng-ai/core/command
- Raw-form tell: slice plus ellipsis or manual head/tail split
- Why reuse matters: budget-aware omission marker calculation and shared output limits
- Structural exemptions: small UI labels where exact budget is irrelevant
- Semantic judgment notes: Low precision: require user-visible bounded text or command output truncation.

Example finding wording: "This added code hand-rolls truncateTextHeadTail / truncateTextHead / tailText instead of routing through the existing canonical. Reuse the canonical so the existing policy/test seam applies."
