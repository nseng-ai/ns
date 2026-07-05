# escape-regex

- Kind key: `escape-regex`
- Canonical: stripTerminalEscapes
- Import/path hints: @ns/core/terminal-escapes or @ns/core/command re-export
- Raw-form tell: regex/string ESC handling such as \\x1b, \\u001b, or \\033
- Why reuse matters: correct CSI + OSC stripping including hyperlink terminators
- Structural exemptions: the terminal escape canonical implementation itself
- Semantic judgment notes: Prevention detector; fire only if the code is stripping/sanitizing terminal escapes.

Example finding wording: "This added code hand-rolls stripTerminalEscapes instead of routing through the existing canonical. Reuse the canonical so the existing policy/test seam applies."
