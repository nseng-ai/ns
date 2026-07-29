# @nseng-ai/skill-exposure

Tested tooling for reconciling this repository's skill exposure overlays, packaged as an ns
extension at `ts/packages/incubating/extensions/skill-exposure/`.

Its disposition is **incubating**: there is real external release intent, but the exposure
policy and registry are still repository-specific, so the package remains `private: true` and
unpublished. Promotion to `public/` waits on a general policy model and a second consumer
proving the contract, not on a rename.

## Policies

`ns skill-exposure apply` accepts one of three policies:

- `normal`: model invocation is allowed and the native Pi skill remains visible.
- `invoke-only`: implicit model invocation is disabled and the native Pi skill remains visible.
- `skill-backed-command`: implicit model invocation is disabled and the native Pi skill is replaced
  by a command surface verified in the skill-backed command registry.

The former `command-backed` spelling is rejected. Use `skill-backed-command` when applying the
replacement policy. `show` and `check` report the same authoritative policy literal.
