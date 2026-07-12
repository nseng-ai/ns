**Direction: ns cloud nativity is two thin seams on Vercel primitives — remote execution (harness against a repo checkout in a sandbox; results return via git) and durable jobs (schedules invoking the executor) — with pluggable backends; Eve is a potential consumer of the seams, never the chassis.**

Getting to: `ns dispatch plan|prompt --target cloud` on Vercel Sandbox via the AI SDK
harness adapters (pi first, Claude Code second), and nightly objective advancement on
Vercel Workflows calling the same executor core. Git is the state plane: pushed branch
plus handoff/branch-memory record is the only return path. Seam contracts live in this
objective's records.

What you see now: dispatch exists only as Pi-only `/ccc:workspace:dispatch-*` commands
over the `@nseng-ai/ccc` cmux cores; `docs/wayfinding/ns-cloud-capabilities/` is deleted
(superseded here — its "Eve presumed in as chassis" stance is reversed).

Avoid: vendor types (Vercel, Eve, AI SDK) in ns package APIs — they stay inside backend
modules; agent logic in the workflow/job layer (jobs only invoke the execution seam);
coupling the harness-session-generation local session contract to sandbox/cloud concerns.

Active slice: see this objective's roadmap.md.
