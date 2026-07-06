**Direction: extensibility/config surfaces converge on the point system — extensions define points; consumers install hooks (scripts) and prompts (pure LM) at them; a kernel shared loader and point catalog own `ns.toml`.**

Getting to: one kernel `ns.toml` loader (`[points]` + manifest-declared settings), static
`ns.points` manifest definitions, a point catalog with diagnostics, and `ns extension
points` introspection; decided design in this objective's `brief.md`.

What you see now — legacy, do not copy: four ad-hoc smol-toml parsers (flow.hooks,
roaster.*, areg.agents, ns-init harnesses), three prompt-resolution ladders, and the
provisional `[flow.hooks].pre_submit` key.

Avoid: adding new direct `ns.toml` parsers, prompt-resolution ladders, or ad-hoc
hook/config surfaces; calling points "extension points" or "hook points"; treating
prompts as hooks; reifying a lifecycle object.

Active slice: see this objective's roadmap.md.
