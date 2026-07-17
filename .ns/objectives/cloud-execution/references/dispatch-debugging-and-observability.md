# Dispatch debugging and observability

## Ownership

This living reference owns the diagnostic method for cloud dispatch: deterministic local
loops, deployed-route probes, Workflow inspection, Sandbox/harness/landing classification,
anchor-PR verification, and safe output rules.

Topic contracts describe expected behavior. `dispatch-live-evidence.md` records what was
actually witnessed.

## First principle: classify the failing phase

Do not collapse every symptom into “dispatch failed.” Locate the boundary:

1. local source/ref/dirty-tree refusal;
2. configuration or Development identity preflight;
3. source push;
4. anchor initialization or push;
5. PR creation or run-ID stamp;
6. trigger route;
7. Workflow registration or Queue delivery;
8. clone credential mint;
9. Sandbox create or checkout;
10. harness configuration/provisioning/launch;
11. process supervision or result journal;
12. landing credential mint;
13. git landing;
14. decision-log/failure reporting;
15. cleanup.

Each phase has a different evidence source and remediation path.

## Artifact-first deployment loop

Before deploying, build the narrowest deterministic loop:

1. run the native TypeScript check;
2. run `pnpm build:deployable`;
3. inspect `.vercel/output/functions`;
4. inspect API `.vc-config.json` handlers and confirm no `filePathMap`;
5. verify handler presence and emitted relative-import closure;
6. verify Workflow flow, step, webhook, manifest, Queue, and workflow-ID inventory;
7. inspect merged routes;
8. only then promote and invoke a safe route.

A Ready deployment is not a substitute for this loop. Production logs corroborate artifact
analysis; they should not be its only signal.

## Deployed route ladder

Use increasing-cost checks:

1. `vercel inspect <stable-alias>` — bind the alias to an exact deployment and inventory.
2. Health route — prove basic function invocation.
3. Safe unauthenticated request — prove classified rejection.
4. Authenticated read-only identity preflight — prove caller trust without starting work.
5. Hello Workflow — prove trigger, Queue delivery, and consumers.
6. Exact-SHA Sandbox probe — prove private checkout and cleanup.
7. Supervision smoke and long-run proof.
8. Full dispatch with anchor and landing.

Never jump to a billable Sandbox to diagnose a cheaper local artifact or identity failure.

## HTTP evidence

Record both status and safe classified response body. Caught application failures may appear
in Vercel logs only as an invocation line.

Example: identity preflight returned 502 while logs showed only `GET /api/runs`. The safe
body contained:

```json
{"error":{"code":"run-status-read-failed","message":"Run status read failed."}}
```

That narrowed the issue to the Workflow run adapter rather than deployment reachability or
OIDC authentication.

Never print request headers carrying credentials.

## Remote-step operation logs

External and configuration-dependent operations inside remote Workflow steps emit JSON-line records to
Vercel Function logs. Each operation writes `operation_started` followed by `operation_succeeded` or
`operation_failed`; terminal records include elapsed milliseconds and curated safe context such as
repository, revision, sandbox name, path, harness, anchor branch, anchor PR number, purpose, ordinal,
or exit code.

By product decision, failures retain the raw downstream `Error.message` (or string form of a non-Error
throw). Safety is enforced by construction instead of redaction: operation records never serialize
credentials, headers, prompt or decision-log content, command argv/environment maps, authenticated
URLs, response bodies, or whole operation results.

These records currently exist only in Function logs. Adapting operation events at the Workflow edge to
the existing named `status` stream could later provide a durable detailed timeline in the Workflow CLI
and Web UI; that status-stream/UI work is deferred and is not live-proven here.

## Valid-shape probe identifiers

A deliberately nonexistent identifier must still satisfy the vendor grammar.

The original preflight used:

```text
ns-dispatch-identity-preflight
```

The Workflow SDK treated that malformed run ID as an adapter error, producing 502. An A/B
probe established:

- malformed nonexistent ID → 502;
- valid-shaped nonexistent `wrun_00000000000000000000000000` → 404 `run-not-found`.

The 404 is the intended authenticated read-only success signal. Use this differential method
when an API distinguishes invalid identity shape from missing resource.

## Vercel inspection and logs

Useful commands:

```sh
vercel inspect https://ns-dispatch.vercel.app --scope <team-slug>
vercel logs ns-dispatch.vercel.app --scope <team-slug> --since 30m --no-follow --expand
```

Use status-code, request-ID, environment, deployment, and time filters before broad queries.
Recognize these limits:

- a caught application error may have no detailed log payload;
- a CLI polling transport error may occur after successful promotion;
- stable aliases move, so always record the deployment ID;
- source and prebuilt deployments can have different inventories while both are Ready.

Inspect before retrying an ambiguous deployment.

## Workflow run inspection

Bind every run to its deployment:

```sh
pnpm exec workflow inspect run <run-id> \
  --backend vercel \
  --project <project-id> \
  --team <team-id> \
  --env production \
  --json
```

Record:

- run ID;
- status transitions;
- deployment ID;
- workflow name;
- created, started, updated, and completed timestamps;
- encrypted-input/output status without decrypting or printing secrets.

Interpret common patterns:

- `run_created` only and indefinitely pending: inspect missing consumers/Queue registration;
- running with periodic updates: inspect poll/sleep progress;
- completed: still inspect the anchor PR and landed history;
- failed: inspect safe Workflow phase result, Sandbox state, and PR failure reporting.

## Anchor PR inspection

Workflow completion alone is insufficient. Inspect:

- expected base and head refs;
- PR state and URL;
- initialization commit or produced commits;
- run-ID marker in the body;
- changed-file inventory;
- decision-log marked section;
- failure comments;
- CI/check state, separately from dispatch completion.

The first anchor failure was obvious only at the GitHub boundary: both branches pointed to
the same commit, and GitHub rejected PR creation with “No commits between.” The corrected
metadata-only initialization protocol is in `dispatch-anchor-and-landing.md`.

## Sandbox and harness diagnosis

For Sandbox failures, identify:

- create versus get/resume;
- checkout and observed HEAD;
- provisioning command and exit code;
- detached launch;
- process journal updates;
- result-file validity;
- cleanup status.

For Pi failures, separate:

- session creation/model resolution;
- extension loading;
- extension lifecycle binding;
- first tool call;
- child executable resolution;
- prompt completion;
- result extraction.

The first live Pi run showed why this matters: `read` and `write` worked, Bash was blocked by
uninitialized extension state, and task subagents failed separately because bare `pi` was
not on PATH.

## Safe diagnostic output

Allowed:

- deployment/run/PR/commit identifiers;
- variable names and sensitivity;
- non-secret identity claim matches;
- HTTP status and semantic error code;
- function and Workflow inventory;
- phase names, exit codes, and bounded safe messages;
- requested and observed non-secret commit SHAs.

Forbidden:

- `.env.local` contents;
- OIDC JWTs;
- GitHub App private keys;
- installation or landing tokens;
- model credentials;
- credential-bearing request dumps;
- secrets on argv.

## Evidence-writing discipline

After a live check:

1. append witnessed facts to `dispatch-live-evidence.md`;
2. state exactly what they prove and do not prove;
3. update the owning topic reference if current truth changed;
4. update the canonical README only for user-visible changes;
5. update roadmap status without turning intended behavior into a verification claim.

Do not write “works” when the evidence proves only deployment, only Workflow completion, or
only fallback recovery.
