**Direction: ns cloud nativity is Vercel-native by decision — one capability package, `@nseng-ai/vercel`, owns remote execution (harness against a repo checkout in a Vercel Sandbox; results return via git) and durable jobs (Vercel Workflows + cron invoking the same dispatch core). No backend pluggability: do not overpromise generality. Eve is a potential consumer, never the chassis.**

Getting to: `ns dispatch plan|prompt|handoff` (backend and in-sandbox harness configured
in the repo-root `ns.toml` `[dispatch]` table, no `--target` flag) on Vercel Sandbox via
the AI SDK harness adapters (pi first, Claude Code second), a reusable setup skill
distilled from the proven Vercel Sandbox + GitHub path, plus nightly objective
advancement on Vercel Workflows. Git is the state plane: every dispatch pushes a
`dispatch/`-prefixed anchor branch, opens its PR up front with the run handle stamped on
it, and results, decision log, and failure states land there — nothing else comes back.
This is a README-driven Objective: the canonical user-facing contract is
`references/README-draft.md` (promoting to `ts/packages/capabilities/vercel/README.md`);
seam contracts and rationale live in `references/seam-design.md` and never override the
README.

What you see now: `@nseng-ai/vercel` is itself the linked Vercel deployable and carries the
`NS_DISPATCH_*` production contract, a verified Development OIDC identity, a working mint
endpoint, and a fixed private-repository Sandbox hello probe. One billable probe has cloned
`nseng-ai/ns` at an exact remote SHA and verified marker, HEAD, and cleanup. Old-prefix
credential and superseded-key cleanup are complete; dispatch preflight remains. No `ns dispatch`
command, harness executor,
or setup skill has landed.
Collect proven setup facts while implementing; do not author the skill ahead of the steel
thread.
The only working dispatch remains the Pi-only `/ccc:workspace:dispatch-*` surface over
`@nseng-ai/ccc`; the retired cloud wayfinding map's "Eve presumed in as chassis" stance
remains reversed.

Avoid: inventing a backend-agnostic executor abstraction — Vercel coupling is deliberate
and Vercel-vocabulary gateways are sanctioned (though vendor types stay inside the
package's gateway adapters as ordinary hygiene); agent logic in the workflow/job layer
(jobs only invoke the dispatch core); coupling the harness-session-generation local
session contract to sandbox/cloud concerns.

Active slice: see this objective's roadmap.md.
