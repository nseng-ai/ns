**Direction: ns cloud nativity is Vercel-native by decision — one capability package, `@nseng-ai/vercel`, owns remote execution (harness against a repo checkout in a Vercel Sandbox; results return via git) and durable jobs (Vercel Workflows + cron invoking the same dispatch core). No backend pluggability: do not overpromise generality. Eve is a potential consumer, never the chassis.**

Getting to: `ns dispatch plan|prompt|handoff` (backend and in-sandbox harness configured
in the repo-root `ns.toml` `[dispatch]` table, no `--target` flag) on Vercel Sandbox via
the AI SDK harness adapters (pi first, Claude Code second), plus nightly objective
advancement on Vercel Workflows. Git is the state plane: every dispatch pushes a
`dispatch/`-prefixed anchor branch, opens its PR up front with the run handle stamped on
it, and results, decision log, and failure states land there — nothing else comes back.
This is a README-driven Objective: the canonical user-facing contract is
`references/README-draft.md` (promoting to `ts/packages/capabilities/vercel/README.md`);
seam contracts and rationale live in `references/seam-design.md` and never override the
README.

What you see now: `@nseng-ai/vercel` has a package/deployable shell, typed `[dispatch]`
project linkage, and a linked health-only Vercel build, but no mint endpoint, preflight,
`ns dispatch` commands, or Sandbox executor yet. The only working dispatch remains the
Pi-only `/ccc:workspace:dispatch-*` surface over `@nseng-ai/ccc`; the retired cloud
wayfinding map's "Eve presumed in as chassis" stance remains reversed.

Avoid: inventing a backend-agnostic executor abstraction — Vercel coupling is deliberate
and Vercel-vocabulary gateways are sanctioned (though vendor types stay inside the
package's gateway adapters as ordinary hygiene); agent logic in the workflow/job layer
(jobs only invoke the dispatch core); coupling the harness-session-generation local
session contract to sandbox/cloud concerns.

Active slice: see this objective's roadmap.md.
