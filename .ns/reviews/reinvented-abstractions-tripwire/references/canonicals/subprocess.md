# subprocess

- Kind key: `subprocess`
- Canonical: runCommand / NodeCommandExecApi / CommandExecApi
- Import/path hints: @ns/core/exec; @ns/core/command
- Raw-form tell: direct node:child_process import or dynamic child_process require/import
- Why reuse matters: injectable subprocess seam, normalized ExecResult, timeout/kill handling
- Structural exemptions: the @ns/core/exec adapter itself; genuinely interactive TTY spawns after inspection
- Semantic judgment notes: Open the exec API and verify the changed site does not require an interactive child process or behavior outside the gateway contract.

Example finding wording: "This added code hand-rolls runCommand / NodeCommandExecApi / CommandExecApi instead of routing through the existing canonical. Reuse the canonical so the existing policy/test seam applies."
