# Autorun execution policy adopted; the objective is execution-friendly with authorized parent interludes

## Summary

The objective is now buildable through the `objective-autorun` /
`objective-runner-step` loop (grill session, user decisions 2026-07-13).
The structural fit problem: the runner's hard boundary forbids external
writes inside steps, while this objective's remaining acceptance evidence
is almost entirely live — deploys, workflow triggers, billable Sandbox
runs, anchor-PR pushes. The adopted split: **runner steps write and
locally verify code; everything live happens between steps**, either as
pre-authorized parent interludes or under a per-action consent gate.
`objective.md` gains `## Definition of Progress` and `## Runner Policy`;
implementation roadmap rows gain `Policy:` notes marking each row's
local/live seam.

Decisions recorded:

1. **Autonomy model: authorized parent interludes** (chosen over
   human-only interludes and fully pre-authorized runs). Subagent steps
   stay code-only; the parent performs named live actions between steps.
2. **Consent partition.** Pre-authorized without prompting: read-only
   observability (`getRun`, deployment status, GitHub reads),
   `vercel deploy` to the linked `ns-dispatch` project, workflow
   triggering through the authenticated route, and direct billable
   Sandbox creation — the field guide's explicit billable-consent
   requirement is deliberately waived for this prototype context (user
   decision). One per-action consent gate remains: pushing `dispatch/`
   branches or creating/mutating PRs on `nseng-ai/ns` — the only actions
   visible beyond the user and the only writes to the repo's shared
   surface.
3. **Deferred from the e2e prototype entirely:** Vercel env-var mutations
   (including the retired `NS_DISPATCH_SANDBOX_MINT_SECRET` removal) and
   GitHub App permission tightening. The loop neither performs nor stops
   for them; they remain human-only post-prototype cleanup (credentials
   row and risk residuals reworded accordingly).
4. **Roadmap shape: annotate, don't rewrite.** Rows stay at thesis level
   with row-level `Policy:` prose marking the step/interlude seam; the
   parent slices dynamically per step. One exception: the steel-thread
   row gains an ordered sub-list recording its deploy-before-verify
   dependency structure (workflow-side → pi runner → CLI-side →
   end-to-end interlude).
5. **Definition of Progress.** Keepable: targeted `just ts-check` /
   `just ts-test` green with fake-driven gateways; `build:deployable`
   green when the slice touches the deployable — the gate lives *inside*
   step validation so local verification predicts deployability (the
   proven escape-local-validation risk class); README edits that
   implement but never assert live behavior. Not keepable: verification
   claims from steps, credential material in any form, speculative work
   on deferred/parked rows.
6. **Fact-folding attestation rule.** The parent hand-commits all
   proven-fact README/reference folds and Semantic Updates between steps;
   verification claims are written only by the actor that witnessed them
   (chosen over routing interlude evidence through a subagent, which
   would launder parent-witnessed facts through an agent that did not
   observe them). Interlude facts travel into later steps as
   `--guidance`.
7. **Landing cadence: working habit, not policy.** Deploys run from the
   local stack, so PR submission never gates verification; the habit is
   landing stack segments via the normal Graphite/flow path at
   proven-phase boundaries. Policy text only restates the existing
   boundary that submission is post-run parent work.
8. **Secrets: parent operational use only.** The parent may `vercel env
   pull` and use the Development token for trigger calls under
   never-echo / never-persist-outside-gitignored-`.env.local` /
   never-argv / never-record rules; subagent steps never touch credential
   material.
9. **Autorun phase 1** (in order): (1) extend the `build:deployable` gate
   for `"use workflow"`/`"use step"` packaging — before any workflow code
   lands; (2) expose the mint core for in-process use (credentials-row
   residual); (3) probe-1 workflow entrypoints + authenticated trigger
   route. Then interlude 1: deploy, trigger, observe via `getRun`, fold
   facts, land. Explicitly out of phase 1: dispatch preflight,
   steel-thread CLI work, probe-2/3 code (their shape should absorb
   probe-1's proven facts first).

## Objective Impact

- `objective.md` gains `## Definition of Progress` and `## Runner Policy`
  between Completion Criteria and Assumptions and Risks; the objective is
  now execution-friendly per the execution-policy conventions.
- `roadmap.md`: preamble notes the `Policy:` convention; the credentials,
  spine-probes, steel-thread, dispatch-plan, dispatch-session, jobs-TUI,
  Claude-Code-harness, and durable-jobs rows gain `Policy:` seam notes;
  the steel-thread row gains the ordered sub-slice list; the mint-secret
  removal residual is reworded as deferred out of the prototype.
- This Runner Policy doubles as the prototype for the durable-jobs row's
  open advancement-policy question — what an objective must declare to be
  advanced autonomously — though that decision remains open and
  user-owned.
- No architecture, seam, credential, or command-shape decision changes;
  the field-guide consent waiver is scoped to this prototype's autorun
  context, not a revision of the field guide itself.

## Follow-Ups

- Launch autorun phase 1 per the spine-probes row's `Policy:` note (gate
  extension → mint-core exposure → probe-1 code → interlude 1). No launch
  happens without the user's go.
- After the prototype: perform the deferred human-only cleanup (mint
  secret variable removal, App permission tightening) and revisit the
  field-guide consent waiver before any wider or scheduled deployment of
  dispatch.
