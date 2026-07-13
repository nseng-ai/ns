**Direction: ns cloud nativity is Vercel-native by decision — one capability package, `@nseng-ai/vercel`, and one execution spine: every dispatch, interactive or scheduled, is a Vercel Workflow run durably supervising a Vercel Sandbox that holds the repo checkout and runs the configured harness as an in-sandbox process; results return via git. No backend pluggability: do not overpromise generality. Eve is a potential consumer, never the chassis.**

Getting to: `ns dispatch plan|prompt|handoff` (backend and in-sandbox harness configured
in the repo-root `ns.toml` `[dispatch]` table, no `--target` flag) triggering the
dispatch workflow through an authenticated route on the package's deployable; the
workflow mints credentials in-process, creates the sandbox, launches the harness
headless inside it (pi first via an ns-owned runner over the pi library, Claude Code
second via its headless CLI), supervises with poll steps and zero-compute sleeps, and
lands results; plus a reusable setup skill distilled from the proven path and nightly
objective advancement as a cron trigger of the same workflow. Git is the state plane:
every dispatch pushes a `dispatch/`-prefixed anchor branch, opens its PR up front with
the workflow run id stamped on it, and results, decision log, and failure states land
there — nothing else comes back. This is a README-driven Objective: the canonical
user-facing contract is `references/README-draft.md` (promoting to
`ts/packages/capabilities/vercel/README.md`); seam contracts and rationale live in
`references/seam-design.md` and never override the README.

What you see now: `@nseng-ai/vercel` is itself the linked Vercel deployable and carries the
`NS_DISPATCH_*` production contract, a verified Development OIDC identity, a working mint
endpoint, and a fixed private-repository Sandbox hello probe. One billable probe has cloned
`nseng-ai/ns` at an exact remote SHA and verified marker, HEAD, and cleanup. No workflow
entrypoints, trigger route, `ns dispatch` command, harness runner, or setup skill has
landed; the deployed `NS_DISPATCH_SANDBOX_MINT_SECRET` variable is retired by the
2026-07-13 architecture revision and awaits removal once the workflow spine lands.
Collect proven setup facts while implementing; do not author the skill ahead of the steel
thread. The only working dispatch remains the Pi-only `/ccc:workspace:dispatch-*` surface
over `@nseng-ai/ccc`; the retired cloud wayfinding map's "Eve presumed in as chassis"
stance remains reversed.

Avoid: inventing a backend-agnostic executor abstraction — Vercel coupling is deliberate
and Vercel-vocabulary gateways are sanctioned (though vendor types stay inside the
package's gateway adapters as ordinary hygiene); agent logic in workflow steps — workflow
code is supervision and orchestration only, the agent loop runs inside the sandbox, and
long-running work never lives in a step (steps cap at the function ceiling; the sandbox
carries the run); reintroducing `HarnessAgent`/driver-in-workflow harness hosting without
its recorded revisit trigger (mid-run interactivity — see the
workflow-supervisor-architecture-adopted Semantic Update); standing push-capable
credentials in the sandbox environment (the supervisor mints in-process and injects the
landing token into the single landing command); coupling the harness-session-generation
local session contract to sandbox/cloud concerns.

Active slice: see this objective's roadmap.md.
