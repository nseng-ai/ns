# Code-first run: spine and steel-thread code complete

## Summary

The code-first autorun run (8 verified runner steps, one Graphite stack
on `adopt-autorun-execution-policy`) landed the entire dispatch spine
and steel-thread code, locally green per the Definition of Progress:

1. `extend-deployable-gate-workflow-packaging` (`edca0ad68`) — the
   `build:deployable` gate now validates `"use workflow"`/`"use step"`
   packaging offline: `workflow validate --strict`, the
   vercel-build-output-api build, artifact/Queues/manifest checks, and a
   strict merge of the workflow-overwritten Build Output `config.json`
   back over the vercel-build routes.
2. `expose-mint-core-in-process` (`2a4149676`) — the mint core
   (`DispatchTokenMinter`, `createGitHubAppDispatchTokenMinter`) as an
   in-process seam; `POST /api/mint` is a thin adapter, contract
   unchanged.
3. `workflow-hello-probe` (`bd7588223`) — probe-1 code: hello workflow,
   authenticated `POST /api/trigger` calling `start()` behind the
   `WorkflowRunGateway` seam, read-only `GET /api/runs` over `getRun`,
   shared Development-OIDC trust module.
4. `workflow-sandbox-probe` (`b15171dc9`) — probe-2 code: single
   explicit step minting the clone token in-process and running the
   proven private-repo sandbox hello probe; credential-source union;
   trigger contract as a discriminated union.
5. `supervision-probe-code` (`3a605d228`) — probe-3 code: maxRetries-0
   launch of a detached sandbox command, name-only journal crossing,
   zero-compute `sleep()` + idempotent poll steps, cleanup on every
   path, bounded run-length trigger parameters.
6. `dispatch-workflow-code` (`3c04c1f03`) — the dispatch workflow (nine
   steps) reusing the probe shapes: in-process clone mint, sandbox over
   the exact dispatched SHA, harness-invocation configuration seam,
   poll/sleep supervision, late-minted landing token injected into the
   single idempotent landing command, marked anchor-PR
   description/failure reporting.
7. `pi-runner-code` (`10f6f78c7`) — the ns-owned pi runner subpackage
   (headless over the `@earendil-works/pi-coding-agent` library API;
   prompt in, agent loop, decision log + atomic result JSON, honest
   exit codes) and the first real harness recipe resolved from the
   checkout's `ns.toml` `[dispatch]` table at the dispatched SHA.
8. `dispatch-prompt-cli` (`36253089a`) — `ns dispatch prompt` as a
   repo-local kernel command: credentials preflight (closing the
   credentials row's last item), dirty-tree refusal, push-first, anchor
   `dispatch/<sanitized-source>-<8-hex>` branch + PR up front on the
   user's own credentials, trigger call, idempotent run-id stamp with a
   parser the jobs TUI will reuse; `deployment_url` added to the
   `[dispatch]` table and README.

Durable integration facts the run established (all local; the gate
caught the first two as real would-be deployment escapes):

- The Vercel builder typechecks deployable code without
  `strictNullChecks`; deployable-path narrowing must use `ok === false`
  equality, not truthiness.
- The Vercel Node builder cannot type-resolve the `workflow` package's
  root export; route-bundle-reachable modules must not import the
  `workflow` root — runtime-free workflow-id metadata modules are the
  pattern.
- The workflow builder overwrites `.vercel/output/config.json`; the
  gate produces a merged config, and the live deploy path must preserve
  that merge.
- The builder emits `runtime nodejs22.x` in workflow `.vc-config.json`
  while the linked project is nodeVersion 24.x — confirm live.
- Harness/config resolution moved after sandbox creation (the
  configuration lives in the checkout at the dispatched SHA), so a
  misconfigured repo costs a brief billable create-then-stop instead of
  failing pre-creation.
- `ANTHROPIC_API_KEY` must be present on the deployable's environment
  for pi runs, or launch fails clean as dispatch-misconfigured.
- The mint runtime config still requires the retired
  `NS_DISPATCH_SANDBOX_MINT_SECRET` variable, so dispatch inherits that
  requirement until the deferred human cleanup (or a code change drops
  the requirement first).

## Objective Impact

- Credentials row: complete as roadmap work — mint-core in-process
  exposure and dispatch preflight (its two remaining items) are coded
  and locally green; in-process minting from deployed workflow-step
  compute is pending the live pass.
- Workflow-spine-probes row: all three probe code slices complete; the
  row's remaining substance is the batched live deploy/trigger/observe
  pass.
- Steel thread row: sub-slices 1–3 (workflow, pi runner, CLI) complete
  as code; remaining are the live e2e (`ns dispatch prompt` observed to
  a landed anchor PR) under the Runner Policy's per-action consent for
  anchor push/PR.
- Seam-design details settled in code: anchor branch naming
  (`dispatch/<sanitized-source>-<8-hex>`), the run-id stamp as a marked
  PR-description line, the fourth `dispatch` trigger discriminant, and
  the `deployment_url` `[dispatch]` key.

## Follow-Ups

- The batched live pass (parent interlude work): deploy; probe-1
  trigger/observe via `getRun`; probe-2 billable sandbox probe; probe-3
  smoke run plus the >13-minute supervision proof; then the real
  `ns dispatch prompt` e2e with per-action-consented anchor push/PR.
  Fold proven facts (including the nodejs22.x runtime question and the
  merged-config deploy path) into the README/field guide from that pass
  only.
- Decide whether to drop the code-side `NS_DISPATCH_SANDBOX_MINT_SECRET`
  requirement ahead of the deferred env-var removal.
- Wrapper skills and `/ns:dispatch:prompt` Pi sugar land with the
  `ns dispatch plan` row per its Policy note.
