# @nseng-ai/pi-ns-objectives

Pi host adapter for the [`@nseng-ai/objectives`](../../../../extensions/objectives/README.md)
ns extension.

This incubating package preserves the `/ns:objective:*` Pi command family while keeping
Pi registration and presentation out of the harness-independent Objectives package. It
consumes Objective behavior only through the curated `@nseng-ai/objectives/api` extension
package API and uses neutral `@nseng-ai/pi-runtime/...` host helpers for Pi integration.

The adapter owns Pi command registration, completion, selection presentation, skill
expansion, and Pi parity metadata. After an explicit `/ns:objective:next` or
`/skill:objective-next` invocation, when the run's final assistant message contains exactly
one `## ▶ Proposed prompt — ready to run` heading, the adapter extracts the railed
blockquote prompt and presents a Pi-only chooser: execute the exact prompt as a
same-session follow-up, replace the full input area with it, or dismiss the chooser. Other
runs, co-equal prompt sets, and `Declined` packets remain ordinary decision text. If
interactive UI or the selected editor capability is unavailable, the adapter takes no
action and leaves the packet usable as recommendation output.

The executed `/ns:objective:list` bridge uses Pi Runtime's shared CLI result presentation: Pi sends bounded captured output to the repository's configured command-summary model operation, displays the validated summary, and keeps exact stdout/stderr in private OS-temporary log files whose paths are shown in the result. Summarization failures fall back to complete inline raw output. This can send command output to the repository-configured model provider, and temporary-file retention follows operating-system cleanup policy.

This chooser is presentation over the portable proposed-prompt contract, not a new
Objective lifecycle or execution permission. The adapter does not redefine Objective
records, lifecycle, storage, selection policy, or runner semantics; those remain owned by
the Objectives extension and the repository's canonical Objective-system context.

## Current status

The package is implemented on the current feature branch but has not landed or been
published. Its `pi.extensions` manifest makes the package itself the Pi entry point; this
repository loads the local workspace package directly from `.pi/settings.json`, without a
`.pi/extensions/objective.ts` discovery adapter.

`/ns:objective:autorun` is a thin Objective picker and skill injector. The injected
`objective-autorun` skill owns both portable and ns-bookended orchestration; the former
project-local `.pi/extensions/objective-autorun.ts` artifact and its
`objective_runner_step` tool have been removed.
