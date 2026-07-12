**Direction: ns cloud nativity is two thin seams on Vercel primitives — remote execution (harness against a repo checkout in a sandbox; results return via git) and durable jobs (schedules invoking the executor) — with pluggable backends; Eve is a potential consumer of the seams, never the chassis.**

Getting to: `ns dispatch plan|prompt` (+ session continuation; backend repo-configured,
no `--target` flag) on Vercel Sandbox via the AI SDK
harness adapters (pi first, Claude Code second), and nightly objective advancement on
Vercel Workflows calling the same executor core. Git is the state plane: every dispatch
opens its anchor branch + PR up front, results and failure states land on that PR, and
nothing else comes back (automatic result-handoff generation is parked). This is a README-driven
Objective: the canonical user-facing contract is `references/README-draft.md` (promoting
to the dispatch capability package README); seam contracts and rationale live in this
objective's records and never override the README.

What you see now: dispatch exists only as Pi-only `/ccc:workspace:dispatch-*` commands
over the `@nseng-ai/ccc` cmux cores; `docs/wayfinding/ns-cloud-capabilities/` is deleted
(superseded here — its "Eve presumed in as chassis" stance is reversed).

Avoid: vendor types (Vercel, Eve, AI SDK) in ns package APIs — they stay inside backend
modules; agent logic in the workflow/job layer (jobs only invoke the execution seam);
coupling the harness-session-generation local session contract to sandbox/cloud concerns.

Active slice: see this objective's roadmap.md.
