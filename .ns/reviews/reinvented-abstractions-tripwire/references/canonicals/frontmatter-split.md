# frontmatter-split

- Kind key: `frontmatter-split`
- Canonical: splitMarkdownFrontmatter
- Import/path hints: @nseng-ai/foundation/markdown-frontmatter
- Raw-form tell: text.split("---"), indexOf("---"), or leading-fence regexes
- Why reuse matters: CRLF-preserving fence detection and not_found/missing_closing_fence errors
- Structural exemptions: tests with tiny markdown fixtures
- Semantic judgment notes: Fire when production code parses frontmatter, not when prose happens to contain ---.

Example finding wording: "This added code hand-rolls splitMarkdownFrontmatter instead of routing through the existing canonical. Reuse the canonical so the existing policy/test seam applies."
