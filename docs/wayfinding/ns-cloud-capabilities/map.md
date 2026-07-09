# ns Cloud Capabilities — Wayfinder Map

## Destination

A committed vision doc for ns cloud capabilities: the ns↔Eve seam decision
(what Eve owns vs what ns owns), each cloud use case — Slack sessions,
scheduled agentic work, event-driven triage, remote job dispatch, speculative
execution — mapped onto that seam, alternatives recorded, risks named. Sharp
enough that a future implementation effort starts from it without reopening
decisions. The doc is the destination; no implementation or dogfooding
happens on this map.

## Notes

- Skills every session should consult: `grilling`, `domain-modeling`
  (vendored under `.agents/skills/`).
- Eve lives at `/Users/schrockn/code/githubs/vercel/eve`; a capability map
  from initial research is at [eve-capability-map.md](eve-capability-map.md).
- Standing preferences settled at charting:
  - **Eve is presumed in** as the cloud chassis (dogfooding it is part of the
    job); tickets *validate* load-bearing assumptions rather than run a
    bake-off. One research ticket records the alternatives landscape for
    defensibility without blocking anything. Only a validation failure
    reopens the chassis question.
  - The destination is a **doc, not a dogfood slice** — no first-slice spec,
    no build.
- Loose ideas go in [ideas.md](ideas.md), not here.

## Decisions so far

<!-- one line per closed ticket: gist + link to the ticket's anchor -->

## Not yet specified

- New ns primitives the cloud story may imply — objective fork semantics,
  branch memory written from sandboxes, whether slots extend to cloud
  sandboxes or stay a local concept. Coarser than a ticket until use-case
  mapping resolves.
- Eve as a third harness under the cross-harness-parity contract — what the
  parity table owes an Eve surface, if anything. Depends on the harness
  stance.
- Review/observability workflow for cloud-produced work — how a human
  audits and lands what autonomous sessions produce.
- Cost, quota, and guardrails for autonomous cloud runs.

## Out of scope

- All implementation and dogfooding: building the Eve agent, Slack app
  registration, deployment, credentials provisioning. Returns as a fresh
  effort once the vision doc exists.

## Tickets

### Alternatives landscape

- type: research
- status: open

**Question:** What is the alternatives landscape for ns's cloud chassis —
Eve vs Claude Agent SDK / managed agents vs claude.ai/code remote sessions vs
bare Workflow SDK or similar durable-execution plumbing? Recording for
defensibility, not evaluating: Eve stays presumed in, and this ticket blocks
nothing.

### Can ns skills and CLIs drive Eve's harness?

- type: research
- status: open

**Question:** Can Eve's default harness actually drive ns — do ns skills
load via Eve's Agent Skills support as-is, can the `ns`/`slot`/`brmem` CLIs
run as tools against a sandbox repo checkout, and what concretely breaks
(skill features, CLI assumptions about local worktrees, auth)? Start from
[eve-capability-map.md](eve-capability-map.md).

### Cloud identity and secrets model

- type: research
- status: open

**Question:** How does a cloud ns agent get the credentials its work needs —
git push rights, Anthropic API access, GitHub App identity — given Eve's
security model where the sandbox is deliberately secret-free and tools run in
the trusted app runtime?

### State boundary rule

- type: grilling
- status: open

**Question:** What durable state, if any, may live in Eve's workflow world
versus must land git-native via ns? How do Eve sessions relate to ns
objectives — is Eve state strictly transport/session plumbing, and what rule
keeps the boundary from eroding?

### Multi-repo scope

- type: grilling
- status: open

**Question:** Is the cloud capability scoped to the ns repo (self-hosting
dogfood) or a capability pointable at other repos (e.g. dagster)? What does
the answer imply for where repo-specific configuration lives?

### Vercel coupling stance

- type: grilling
- status: open

**Question:** How much Vercel gravity is acceptable — Vercel-hosted
(Workflow, Sandbox, Cron, AI Gateway) versus self-hosted Node with Docker
sandboxes? What is the stance on lock-in versus zero-config?

### What do the AI SDK harness adapters offer?

- type: research
- status: open

**Question:** What do the AI SDK harness APIs (`HarnessAgent` +
`@ai-sdk/harness-claude-code`, `@ai-sdk/harness-pi`, sandbox-bridge model,
per-session Agent Skills injection, approvals/tool filtering) give ns for
cloud execution? Verified at charting: Eve does **not** consume
`HarnessAgent` — they are separate Vercel surfaces today. Map what each
surface owns, how they might compose (e.g. an Eve tool spawning a
HarnessAgent run), and the maturity risk (explicitly experimental). Source:
`/Users/schrockn/code/githubs/vercel/ai`
(`content/docs/03-ai-sdk-harnesses/`).

### Harness stance

- type: grilling
- status: open
- blocked by: [Can ns skills and CLIs drive Eve's harness?](#can-ns-skills-and-clis-drive-eves-harness), [What do the AI SDK harness adapters offer?](#what-do-the-ai-sdk-harness-adapters-offer)

**Question:** Which harness runs cloud ns work, and on which chassis? The
option space: (a) Eve's default harness driving ns CLIs/skills; (b)
`HarnessAgent` with the Claude Code or Pi adapter — ns's existing harnesses
and skills unchanged — on a thinner chassis without Eve's durable
session/channel machinery; (c) a composition (Eve for durability/channels,
HarnessAgent runs spawned from its trusted runtime). Resolve where step-level
durability, approvals, and HITL must live for the cloud use cases.

### Use-case mapping

- type: grilling
- status: open
- blocked by: [State boundary rule](#state-boundary-rule), [Harness stance](#harness-stance)

**Question:** How does each motivating use case map onto the settled seam:
remote plan dispatch from a local session (steel-thread candidate — see
ideas.md), scheduled agentic work, event-driven issue→triage→fix, and
speculative execution? For each: what Eve provides, what ns provides, what's
missing. Slack is a general input channel across all of these, not a use
case of its own — likely an existing Vercel agent to extend, not a bot to
build.

### Speculative execution shape

- type: grilling
- status: open
- blocked by: [Use-case mapping](#use-case-mapping)

**Question:** What shape does speculative execution take — at an overnight
HITL ambiguity point, fork and execute both options, present both outcomes
for a human to pick? What ns primitive does this imply (objective fork,
sibling branches, recorded fork rationale) and what does Eve contribute
(parked question, subagent fan-out)?

### Draft the vision doc

- type: prototype
- status: open
- blocked by: [Use-case mapping](#use-case-mapping), [Speculative execution shape](#speculative-execution-shape)

**Question:** Draft the destination vision doc from the accumulated
decisions, as an artifact to react to and iterate on. Where does it live and
what form does it take (plain doc vs ADR-backed)?
