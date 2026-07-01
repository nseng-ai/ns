# hand-rolled-table

- Kind key: `hand-rolled-table`
- Canonical: renderTextTable / displayWidth
- Import/path hints: @sdl/core/text-table or package renderer helpers
- Raw-form tell: padStart/padEnd, Math.max length widths, repeat rule strings clustered together
- Why reuse matters: display-width correctness for wide/combining glyphs
- Structural exemptions: tiny one-column labels or non-table prose formatting
- Semantic judgment notes: Low precision: require at least a real table/column layout before firing.

Example finding wording: "This added code hand-rolls renderTextTable / displayWidth instead of routing through the existing canonical. Reuse the canonical so the existing policy/test seam applies."
