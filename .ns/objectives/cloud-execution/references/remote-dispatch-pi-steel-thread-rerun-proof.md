# Remote Dispatch Pi Steel Thread — Rerun Proof

**PR-only controlled proof artifact.** This document is a tightly scoped,
PR-only live-verification record produced by a single headless dispatched
agent run against a fresh, isolated sandbox checkout. It records only facts
this agent could directly witness. It makes **no** claim about supervising
Workflow completion, landing success, Sandbox cleanup, or any other outcome
that only the supervising parent runner can witness.

## Source revision

- Expected source SHA: `b10475c1a26df96f935d52da996fc1e43a3cb78c`
- Observed checkout `HEAD` (via `git rev-parse HEAD`):
  `46f80bedacbf5897a7729a4a8f6d55dad9d24c31`
- The expected SHA is **not** present as an object in this checkout
  (`git cat-file -t b10475c1a26df96f935d52da996fc1e43a3cb78c` returned
  "could not get object info"). This proof therefore verifies the repaired
  runner startup contract at the checkout actually provided
  (`46f80be`); the SHA mismatch is recorded here rather than silently
  reconciled.

## Bounded first-Bash result

- Checkout path (`pwd`): `/vercel/sandbox`
- Working tree at start (`git status --short`): clean (no output).

## Startup-order fact (from task subagent, read-only)

Source: `.ns/objectives/cloud-execution/references/dispatch-pi-runner.md`

After `createAgentSession()` and **before** the prompt is submitted, the
runner must call and await `session.bindExtensions({ mode: "print" })`.

Exact quoted startup-sequence steps 3–5:

> 3. call `createAgentSession()` with checkout cwd and an in-memory session manager;
> 4. call and await `session.bindExtensions({ mode: "print" })`;
> 5. only then submit the prompt;

Rationale (quoted):

> `createAgentSession()` discovers and loads extensions, but it does not emit
> `session_start`. Headless SDK hosts must bind extensions before prompting.

The repair makes extension initialization an explicit
`PiAgentSdkSession.initialize()` lifecycle operation and awaits it before the
prompt; an initialization failure is a session startup failure, and disposal
is attempted without hiding that failure.

## Validation

- Command selected: `dprint check` scoped to this file only
  (`npx --yes dprint check .ns/objectives/cloud-execution/references/remote-dispatch-pi-steel-thread-rerun-proof.md`;
  root `dprint.json` is the repo formatter config).
- Result: **pass** (exit code 0; no formatting diagnostics reported).
