# Dispatch Pi runner

## Ownership

This living reference owns the headless Pi harness contract inside the Sandbox: SDK session
creation, extension lifecycle, tool environment, checkout-local subagent resolution, prompt
execution, result extraction, decision logs, and exit behavior.

Workflow supervision lives in `dispatch-workflow-and-sandbox-runtime.md`; landing lives in
`dispatch-anchor-and-landing.md`; evidence lives in `dispatch-live-evidence.md`.

## Runner role

The ns-owned runner launches Pi through `@earendil-works/pi-coding-agent`'s library API. It
runs from the repository checkout so Pi's default resource discovery sees:

- repo and directory `AGENTS.md` files;
- project `.pi/extensions`;
- project and vendored skills;
- prompt templates and settings;
- the checkout's exact source and Objective context.

One in-memory Pi session handles one dispatch. The session file is not the durable result;
git commits, the anchor PR, and its decision log are.

The implemented dispatch harness registry currently contains only `pi`.

## Startup sequence

The runner must perform this order:

1. prepend the Vercel package's checkout-local `.bin` directory to child `PATH`;
2. lazily import the Pi library;
3. call `createAgentSession()` with checkout cwd and an in-memory session manager;
4. call and await `session.bindExtensions({ mode: "print" })`;
5. only then submit the prompt;
6. wait for completion;
7. inspect the final assistant message;
8. write the decision log and atomic result protocol;
9. dispose the session without masking the run outcome.

## The SDK lifecycle distinction

`createAgentSession()` discovers and loads extensions, but it does not emit
`session_start`. Headless SDK hosts must bind extensions before prompting.

The first completed live dispatch omitted `bindExtensions`. The project harness-session
extension's Bash guard loaded, while its `session_start` initializer never ran. Every Bash
tool call was therefore blocked with:

```text
HARNESS_SESSION_ID has not been initialized for this Pi session.
```

`read` and `write` still worked because they do not pass through that Bash guard. The agent
created the requested file but could not format or commit it.

The repair makes extension initialization an explicit `PiAgentSdkSession.initialize()`
lifecycle operation and awaits it before the prompt. An initialization failure is a session
startup failure, and disposal is attempted without hiding that failure.

Do not “fix” this with Bash retry or lazy extension state. The host omitted a required SDK
lifecycle phase.

## Harness session ID

The project harness-session extension creates or restores one stable ID per Pi session and
prepends it to Bash commands as `HARNESS_SESSION_ID`.

For in-memory sessions it creates an ephemeral ID and records it through an extension custom
entry. The tool guard must not execute before `session_start` resolves.

The ID is coordination metadata, not a credential. It should remain consistent across Bash
calls in one session and must not be confused with the Workflow run ID.

## Child Pi and subagent PATH

The library-hosted parent process runs under generic `node`. The subagent dispatcher cannot
reuse a Pi CLI script from `process.argv[1]`, so it falls back to command `pi`.

A filtered pnpm workspace install places the relevant executable at:

```text
ts/packages/capabilities/vercel/node_modules/.bin/pi
```

The workspace-root `ts/node_modules/.bin/pi` is not guaranteed to exist. Before creating the
Pi session, the runner prepends the package-local `.bin` directory to `PATH`. Forked child
processes then inherit a resolvable `pi` command without requiring a global installation.

The first live task-subagent attempt failed with `spawn pi ENOENT`; this exact behavior is the
reason for the PATH contract.

## Provisioning and model environment

The checkout's exact `ts/package.json#packageManager` selects the supported pnpm version.
Provisioning:

- configures the App bot git author identity;
- installs that pnpm version;
- installs the filtered `@nseng-ai/vercel...` workspace dependency closure.

The launch environment carries required model credentials by configured name. Secrets are
not passed on argv or recorded in runner output.

## Tool and agent contract

The runner expects normal Pi coding tools and project extensions to operate from checkout
cwd. A healthy steel thread must prove:

- first-call Bash succeeds;
- repository instructions and skills are discoverable;
- file edits occur in the checkout;
- validation commands can run;
- git commits can be created;
- checkout-local task subagents can spawn when requested;
- the final result protocol is written.

Subagents are an additive capability, not a requirement for every dispatched task, but the
checkout must not advertise a tool that deterministically fails because the host PATH is
wrong.

## Result extraction

The adapter inspects the last assistant message:

- `error` or `aborted` stop reasons produce a failed run with a safe message;
- otherwise text blocks become the completion summary;
- no assistant message is a failure;
- malformed optional message fields do not crash extraction.

The runner writes an atomic result file and a decision log. The supervisor validates these
before normal landing. If the result file is absent but the checkout contains valid dirty
work, fallback landing may preserve it; that remains recovery behavior.

## First live result and bounded claim

Run `wrun_01KXFZ14SBRCGTSPP5PEH19C3T` proved that the Pi library session started, the model
ran, `read` and `write` worked, the requested file was created, and the decision log was
captured. It did not prove healthy Bash, agent-side commit, or subagent spawning.

The supervisor created fallback commit `4e6f8629924c3a7f8227e8ad92dfaf220dd29816`
and landed it on PR #3612.

## Required reverification

One controlled dispatch after the runner repair must witness:

1. Bash succeeds on its first call.
2. The agent runs formatting or another harmless validation.
3. The agent creates its own commit.
4. A task subagent resolves the checkout-local Pi executable.
5. Normal landing uses agent-produced history rather than fallback commit creation.

Until then, describe the first dispatch as completed with degraded Pi tooling, not as a fully
healthy Pi steel thread.
