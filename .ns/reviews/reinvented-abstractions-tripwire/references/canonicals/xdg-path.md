# xdg-path

- Kind key: `xdg-path`
- Canonical: requireNsStatePath / resolveNsXdgPath / resolveXdgHome
- Import/path hints: @nseng-ai/foundation/xdg-path; @nseng-ai/extension-kit/xdg
- Raw-form tell: os.homedir(), process.env.XDG_*/HOME, or .local/state/.config path literals
- Why reuse matters: central XDG policy, namespace defaults, env seam, and directory privacy handling
- Structural exemptions: canonical XDG modules; os.tmpdir(); Pi-owned ~/.pi paths
- Semantic judgment notes: Confirm the path is NS/XDG state/config, not a tool-specific user path.

Example finding wording: "This added code hand-rolls requireNsStatePath / resolveNsXdgPath / resolveXdgHome instead of routing through the existing canonical. Reuse the canonical so the existing policy/test seam applies."
