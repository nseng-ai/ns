# osc8-hyperlink

- Kind key: `osc8-hyperlink`
- Canonical: safeTerminalHyperlink / terminalHyperlink / sanitizeTerminalHyperlinkUrl
- Import/path hints: @ns/core/terminal-presentation
- Raw-form tell: raw OSC-8 marker ]8;; or equivalent ESC construction
- Why reuse matters: URL sanitization and protocol/control-character policy
- Structural exemptions: the terminal-presentation canonical implementation itself
- Semantic judgment notes: Scope to hyperlink emission/parsing, not unrelated terminal presentation helpers.

Example finding wording: "This added code hand-rolls safeTerminalHyperlink / terminalHyperlink / sanitizeTerminalHyperlinkUrl instead of routing through the existing canonical. Reuse the canonical so the existing policy/test seam applies."
