# Dispatch Workflow and Sandbox runtime

## Ownership

This living reference owns the execution-runtime contract: Vercel Workflow supervision,
private-repository Sandbox checkout, detached harness execution, poll/sleep behavior,
retries, cleanup, and run-length constraints.

Deployment packaging lives in `dispatch-deployment-contract.md`; credentials live in
`dispatch-credentials-and-trust.md`; anchor and landing behavior lives in
`dispatch-anchor-and-landing.md`; evidence lives in `dispatch-live-evidence.md`.

## Execution spine

Every cloud dispatch is one Vercel Workflow run durably supervising one Vercel Sandbox. The
Workflow is orchestration only. The agent loop runs as a long-lived process inside the
Sandbox.

The supervisor:

1. validates bounded dispatch input;
2. mints a clone-purpose credential in-process;
3. creates a Sandbox at the exact dispatched SHA;
4. resolves the checkout's harness recipe;
5. provisions the harness;
6. launches it detached with launch retries disabled;
7. polls short-lived status steps;
8. sleeps between polls at zero compute;
9. reads and validates the result journal;
10. mints a fresh landing credential;
11. lands commits and the decision log;
12. reports failure on the anchor PR when any terminal phase fails;
13. stops the Sandbox on every terminal path.

The Workflow outlives the Sandbox process. A process or Sandbox failure must still leave a
durable anchor-PR result.

## Sandbox checkout contract

Sandboxes are ephemeral fresh checkouts, not cloud slots.

Creation requirements:

- repository equals the configured exact `owner/repo`;
- revision is a full 40-character SHA reachable from the GitHub remote;
- source uses a short-lived clone-purpose installation token;
- checkout is shallow and private;
- runtime is Node 24;
- persistence is disabled;
- timeout remains below the five-hour Sandbox lifetime cap.

A local-only commit is not a dispatchable revision. Local preflight pushes the source first
when the remote branch is missing or behind.

The clone credential is not retained in the git remote or agent environment. Agent work is
tokenless.

## Harness resolution and launch

The configured harness comes from the dispatched checkout's repo-root `ns.toml` `[dispatch]`
table. The checkout's exact `ts/package.json#packageManager` supplies the supported pnpm
version for both local preflight and remote provisioning.

The implemented registry currently accepts only `pi`. Unsupported harnesses are rejected
before local mutation and independently after checkout before provisioning.

Launch is detached because the harness, not a Workflow step, carries long-running work.
Launch steps use `maxRetries: 0` so a platform retry cannot bill or execute the agent twice.

Pi-specific hosting details live in `dispatch-pi-runner.md`.

## Supervision protocol

The Sandbox process writes a name-only journal and final result file. Workflow steps poll
bounded state and return quickly. Between polls, Workflow `sleep()` suspends at zero compute.

The supervision core must distinguish:

- still running;
- completed with a valid result;
- process exit without a valid result;
- timeout;
- Sandbox unavailable;
- malformed journal/result;
- cleanup failure.

Landing and reporting steps are idempotent because Workflow steps may retry. Launch is not
retried.

## Run length and lifecycle

A live 840-second command completed after 873 seconds under Workflow supervision, proving
that the Sandbox process and poll/sleep protocol—not one long Function invocation—carry the
run.

The current Sandbox lifetime caps v1 runs below five hours. Snapshot-based rotation is the
recorded extension for longer runs; it is not implemented.

Workflow-generated `nodejs22.x` consumers worked in the linked Node 24 project. That is a
verified deployment fact, not a backend abstraction.

## Controlled verification ladder

Verify increasing-cost boundaries in this order:

1. hello Workflow and Queue delivery;
2. private-repository Sandbox checkout at an exact SHA;
3. short detached supervision smoke;
4. run exceeding a single Function invocation ceiling;
5. complete prompt dispatch with anchor and landing.

A controlled private-repository probe must verify:

- fixed marker output;
- requested versus observed HEAD equality;
- command success;
- mandatory cleanup.

Sandbox creation is billable. Setup and diagnostic tooling stops for explicit human consent
immediately before its first billable probe unless a higher-level Objective policy explicitly
pre-authorizes that interlude.

## Failure and cleanup contract

After Sandbox creation, every failure path attempts cleanup. Cleanup failure makes the
operation failed and must include safe manual remediation guidance.

Failure reports identify phase and semantic reason without vendor request dumps or
credentials:

- clone mint;
- Sandbox create;
- checkout/revision;
- harness configuration;
- provisioning;
- launch;
- poll/journal;
- result validation;
- landing mint;
- git landing;
- PR reporting;
- cleanup.

The anchor PR remains open and marked failed when the run cannot land successfully.

## Verified evidence

Recorded in `dispatch-live-evidence.md`:

- hello Workflow and Queue execution;
- private-repository exact-SHA checkout;
- 15-second supervision smoke;
- 840-second supervision proof;
- first completed prompt dispatch and fallback landing.

## Open work

- Reverify the Pi runner after extension lifecycle and child-PATH repair.
- Keep Sandbox cleanup and reporting evidence explicit in subsequent dispatches.
- Decide and implement snapshot rotation only if runs need to exceed the current cap.
