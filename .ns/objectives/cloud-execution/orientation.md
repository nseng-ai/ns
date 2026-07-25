**Direction: ns cloud nativity is Vercel-native by decision — one capability package, `@nseng-ai/vercel`, and one execution spine: every dispatch, interactive or scheduled, is a Vercel Workflow run durably supervising a Vercel Sandbox that holds the repo checkout and runs the configured harness as an in-sandbox process; results return via git. No backend pluggability: do not overpromise generality. Eve is a potential consumer, never the chassis.**

Getting to: `ns dispatch plan|prompt|handoff` (backend and in-sandbox harness configured
in the repo-root `ns.toml` `[dispatch]` table, no `--target` flag) triggering the
dispatch workflow through an authenticated route on the package's deployable; the
workflow mints credentials in-process, creates the sandbox, launches the harness
headless inside it (pi first via an ns-owned runner over the pi library, Claude Code
second via its headless CLI), supervises with poll steps and zero-compute sleeps, and
lands results; plus a reusable setup skill distilled from the proven path and nightly
objective advancement as a cron trigger of the same workflow. Git is the state plane:
every dispatch selects a semantic `dispatch/<slug>-<configured-zone-timestamp>` anchor
branch before mutation, opens its PR up front with
the workflow run id stamped on it, and results, decision log, and failure states land
there — nothing else comes back. This is a README-driven Objective: the canonical
user-facing contract is `references/README-draft.md` (promoting to
`ts/packages/capabilities/vercel/README.md`); seam contracts and rationale live in
`references/seam-design.md` and never override the README.

What you see now: `@nseng-ai/vercel` is itself the linked Vercel deployable and carries the
`NS_DISPATCH_*` production contract, a verified Development OIDC identity, a working
OIDC-only, clone-only mint endpoint over an in-process mint core, and a fixed
private-repository Sandbox hello probe that one billable run verified live. The Workflow
spine is now live-proven: hello, private checkout, short supervision, and an 840-second
run completed; production deployment `dpl_He9jnMkZmH7fTYg9K3DcHp1mKbds` carries hermetic
CommonJS API handlers plus the complete Workflow inventory. Local follow-on hardening has
migrated the deployable to Workflow v5 unified artifacts with structured phase observability
and added an exact-SHA detached-worktree production deployment gate with authoritative
inventory and deployment/alias identity checks; that new deployment command is not yet
live-proven. The first real
`ns dispatch prompt` completed as `wrun_01KXFZ14SBRCGTSPP5PEH19C3T` and landed one proof
file plus decision log on PR #3612 through fallback commit recovery. It exposed two Pi host
defects—extensions were not bound before prompt, and checkout-local `pi` was absent from
child PATH. Local repairs are green. The local prompt command now derives content-backed
semantic anchor slugs (or accepts `--slug/-s`), uses a validated/defaulted repository IANA
timezone, and exhausts exact remote-name collisions through `-50` before anchor mutation; source
publication now precedes that availability check and uses exact-SHA Git for definitively
untracked branches or authorized Vercel-owned Graphite source publication for tracked current/downstack scope.
Both paths revalidate the final remote SHA before anchor creation and are locally covered,
not live-proven. One controlled rerun must prove first-call
Bash, agent-created commit, subagent spawn, and normal landing before the Pi steel thread closes.
The implemented dispatch-harness registry remains Pi-only: local preflight and remote
invocation reject `claude-code` until its roadmap row supplies a complete recipe. No setup
skill has landed; do not author it before the repaired Pi path is live-proven. The deployed
`NS_DISPATCH_SANDBOX_MINT_SECRET` variable is retired and remains pending human cleanup,
but no source or runtime parser consumes it. The Pi-only `/ccc:workspace:dispatch-*`
surface remains the established local dispatch path; cloud prompt dispatch is live but still
under steel-thread verification. Current topic contracts and evidence are mapped in
`references/README.md`; the retired cloud wayfinding map's "Eve presumed in as chassis"
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
landing token into the single landing command); source/random or deterministic fallbacks when
semantic anchor generation fails; coupling the harness-session-generation
local session contract to sandbox/cloud concerns.

Active slice: see this objective's roadmap.md.
