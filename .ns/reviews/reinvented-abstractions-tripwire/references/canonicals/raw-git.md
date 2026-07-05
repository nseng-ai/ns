# raw-git

- Kind key: `raw-git`
- Canonical: GitGateway
- Import/path hints: @nseng-ai/git or capability-owned GitGateway
- Raw-form tell: git subprocess invocation and hand-parsed git failures/output
- Why reuse matters: typed git surface with in-memory fakes and consistent failure behavior
- Structural exemptions: operations without an equivalent gateway method; sanctioned Graphite boundary calls
- Semantic judgment notes: Low precision: open GitGateway and verify an equivalent method exists.

Example finding wording: "This added code hand-rolls GitGateway instead of routing through the existing canonical. Reuse the canonical so the existing policy/test seam applies."
