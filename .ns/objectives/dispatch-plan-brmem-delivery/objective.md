---
edges:
  - objective: cloud-execution
    annotation: Focused delivery slice — this Objective owns the user contract and implementation evidence for `ns dispatch plan` carrying a Saved Plan into the cloud through Branch Memory; cloud-execution owns the surrounding Vercel dispatch spine and broader cloud program.
---

# Dispatch Plan through Branch Memory

## Thesis

`ns dispatch plan <plan-ref>` sends a Saved Plan to the existing Vercel-native cloud dispatch spine without embedding the plan in an HTTP request or workflow payload. The command resolves an explicit Saved Plan locally, stores a dispatch-owned copy in Branch Memory, verifies that its exact Snapshot Ref is remotely reachable, and starts a dispatch carrying only a typed Branch Memory locator. In the sandbox, deterministic supervision fetches and checks that entry before launch; the harness then runs `brmem get` as its first action and executes the delivered plan. Results continue to land through the existing anchor branch and pull request.

This is a readme-driven-development Objective. Its canonical user-facing contract now lives at `ts/packages/capabilities/vercel/README.md` (section "Dispatch a Saved Plan"); the contract was developed at `references/README-draft.md`, which remains only as a pointer. Supporting records may explain implementation and rationale but never override that README.

## Scope

- The user-facing `ns dispatch plan <plan-ref>` kernel command with one explicit Saved Plan file reference; latest-session-plan selection remains Pi sugar outside the kernel command.
- Safe Saved Plan resolution through the curated `@nseng-ai/plans/api` boundary.
- An ns-generated Dispatch ID created before external mutation and reused across the anchor branch, retained plan input, workflow provenance, command output, and anchor PR.
- A workflow-owned Branch Memory Namespace, `dispatch-context`, where the Dispatch ID is a context-envelope key prefix and the Saved Plan is retained at `<dispatch-id>/plan/<plan-slug>.md`; future typed context may add sibling paths under the same prefix without a manifest in this version.
- The Dispatch ID seeded on the Vercel Workflow run as a `dispatch.id` attribute, so the vendor-generated `wrun_...` can be recovered through exact attribute lookup; zero or multiple matches are explicit failures, never guessed.
- Preflight that confirms Branch Memory Git synchronization is configured, refusing with actionable `brmem setup-git` guidance rather than mutating clone-local Git configuration.
- Exact Snapshot Ref publication and remote-reachability verification before any cloud workflow starts.
- A typed workflow locator carrying Namespace, Dispatch ID context-envelope prefix, source branch, and exact ref identity rather than plan content or an enumerated member manifest.
- Sandbox-side exact-ref fetch and deterministic `brmem check` before harness launch, followed by a harness instruction whose first action is `brmem get` and whose task is to execute the retrieved plan.
- Progressive-disclosure provenance: normal human output shows the Dispatch ID plus PR/workflow links; machine output and a marked anchor-PR section carry the full Branch Memory locator, Dispatch ID, and Vercel run ID.
- Plan-specific anchor PR identity, failure reporting, wrapper-skill coverage, fake-driven tests, and one real end-to-end dispatch.
- Coordination with `cloud-execution` so this focused Objective supplies the evidence for its broader `ns dispatch plan` roadmap dependency without creating a second cloud execution architecture.

## Non-Goals

- Accepting generic Branch Memory locators or Branch Context Attached Plans as command input.
- Reusing the reserved `branch-context` Namespace or representing delivery entries as Attached Plans.
- Sending the plan body through the trigger route, workflow input, or another hidden payload channel.
- Automatically running `brmem setup-git`, silently changing Git configuration, or bypassing configured synchronization with an ad hoc transport contract.
- Deleting delivery entries automatically at workflow completion; retention and future cleanup policy are separate work.
- Replacing the existing Vercel Workflow supervisor, sandbox runner, anchor branch, or pull-request result path.
- Proving long-run supervision again; this Objective reuses the existing workflow-spine evidence and tests the new plan-delivery risk.
- Adding `ns dispatch handoff`, the jobs TUI, another harness, scheduled jobs, or the broader reusable cloud setup skill.

## Completion Criteria

- The canonical README coherently documents the explicit Saved Plan input, Branch Memory delivery behavior, setup prerequisite, remote harness experience, retained evidence, failure states, and anchor-PR result contract.
- `ns dispatch plan <plan-ref>` resolves a Saved Plan, creates one Dispatch ID, writes the plan under that context-envelope prefix in `dispatch-context`, confirms configured Branch Memory synchronization, publishes and verifies the exact Snapshot Ref, and starts the existing dispatch workflow with the Dispatch ID attribute and no plan body in its HTTP/workflow payload.
- The sandbox fetches the exact snapshot and deterministically checks the convention-required plan member under the Dispatch ID prefix before launch; the harness is then instructed to call `brmem get` first and execute the delivered plan.
- Failure before workflow start leaves no silently orphaned cloud run and reports any local or remote Branch Memory state already created; sandbox retrieval failure is reported durably on the anchor PR.
- Fake-driven tests cover success, unsafe or missing plan input, Branch Memory setup refusal, write/push/remote-verification failures, locator validation, Dispatch ID propagation and Workflow attribute lookup, sandbox precheck failure, help, progressive-disclosure human output, full machine output, and wrapper parity.
- One witnessed real Saved Plan dispatch proves exact Branch Memory delivery, harness `brmem get`, plan execution, an agent-created commit, and normal anchor-PR landing. Existing long-supervision evidence from `cloud-execution` is linked rather than repeated.
- The settled README is merged into `ts/packages/capabilities/vercel/README.md`, and this Objective's canonical reference is repointed to that durable user-facing home.

## Definition of Progress

Progress is keepable when:

- Local code and documentation implement one coherent roadmap slice and targeted fake-driven tests plus relevant TypeScript checks pass.
- Each Objective Runner step is independently reviewable, leaves one verified local commit, and preserves the ordered local implementation path: contract → preparation/delivery → workflow/sandbox → command/wrapper → durable README.
- Changes preserve the Vercel-native supervisor and use explicit gateways for Saved Plan, Branch Memory, Git remote, workflow, and sandbox boundaries.
- User-facing prose distinguishes locally implemented behavior from live-proven behavior and contains no secret or credential material.

Do not keep changes that:

- Put the Saved Plan body into trigger or workflow payloads, reuse `branch-context` for transport, or introduce a second dispatch spine.
- Mutate Git configuration automatically, perform an unconfirmed external write, or claim live verification not witnessed by the actor recording it.
- Broaden input to Attached Plans or raw Branch Memory locators without a new user decision.

Useful evidence includes targeted Vercel, Plans, Branch Memory, and capability-kit tests; `just ts-check`; CLI scenario coverage; `build:deployable` when the deployable changes; and safe, value-free live run identifiers recorded after a confirmed interlude.

## Runner Policy

This Objective is designed for repeated, local-only `objective-autorun` / `objective-runner-step` execution under these boundaries. After the normal launch preview and confirmation, the parent may drive consecutive local roadmap slices without another design stop while the settled contract remains intact.

- Runner steps may edit local package code, fake-driven tests, wrapper skills, README/reference prose, and Objective tracking needed by the selected slice. `runner-finish` owns one verified local commit per step; later steps stack locally on it.
- The settled contract is executable without steering: explicit Saved Plan input with Pi latest-session sugar; convention-based `dispatch-context` context under `<dispatch-id>/` with the plan at `<dispatch-id>/plan/<plan-slug>.md`; Dispatch ID propagation as the `dispatch.id` Workflow attribute; supervisor precheck followed by harness `brmem get`; retained evidence; and progressive-disclosure output.
- Stop and ask before changing the public input model, Namespace or retention lifecycle, remote refspec contract, harness retrieval responsibility, Dispatch ID semantics, cloud architecture, or durable README destination. Stop rather than inventing behavior if implementation evidence disproves a settled contract assumption.
- Before keeping TypeScript work, run targeted tests and relevant TypeScript checks; when deployable artifacts change, also pass `build:deployable`. Keep user-facing claims at locally implemented or live-proven status as supported by evidence.
- Autorun is strictly local-only. Neither runner children nor the parent may run `brmem put`, configure Branch Memory synchronization, push Branch Memory/source/anchor refs, deploy, trigger a workflow, create or mutate an anchor PR, publish/submit a stack, or perform any other write-capable external action. Read-only repository and vendor inspection is allowed when it exposes no secret material.
- The autorun loop stops after the locally implementable rows are complete and reports the live end-to-end proof as the remaining human-run interlude. Live facts and corresponding Semantic Updates may be recorded only by the human or later parent that witnessed that separately authorized run.

## Assumptions and Risks

Assumptions:

- Branch Memory Snapshot Refs can act as the git-native input plane because `brmem setup-git` configures ordinary remote operations to synchronize `refs/brmem/*`.
- Retained dispatch-owned context Entries give enough immutable provenance for retries and review when paired with an exact Snapshot Ref identity.
- For this version, the Dispatch ID prefix layout is intentionally a flexible Branch Memory convention understood by the supervisor and agent; it does not need a manifest until context enumeration, required/optional member semantics, or compatibility versioning proves necessary.
- Vercel Workflow attributes support efficient exact filtering through `world.analytics.runs.list`; querying `dispatch.id` can recover the vendor-generated run ID within the configured analytics retention window.
- The sandbox checkout can fetch the exact Branch Memory ref and run the repository's available `brmem` command before the harness begins its task.
- The existing prompt dispatch spine can be deepened into a shared dispatch core without changing its Vercel-native architecture or result contract.

Risks:

- Ordinary source pushes and Branch Memory ref pushes can partially succeed. The command must order mutations deliberately, verify exact remote state, and report every durable artifact already created so retry or cleanup is safe.
- Branch Memory Entries are branch-scoped while a dispatch also has an anchor branch. The contract must keep the source branch, delivery Snapshot Ref, and result anchor distinct and explicit.
- Workflow attribute lookup is eventually observable, time-windowed, and does not enforce uniqueness. The command retains the run ID returned by the normal start path; recovery lookup requests at most two matches and treats zero or multiple results explicitly rather than guessing.
- A convention-only context envelope may become too implicit as member types grow. Add a versioned manifest only when implementation evidence requires deterministic enumeration or compatibility semantics; do not introduce one speculatively in this slice.
- Telling the harness to retrieve its own plan could turn deterministic transport failure into agent behavior. Mitigation: the supervisor fetches and checks the exact Entry before launch; the harness-owned `brmem get` remains the visible first action, not the only validation.
- Retained delivery Entries can accumulate. Retention is deliberate evidence for this slice; any cleanup policy must later preserve reproducibility and avoid implicit deletion.
- Generalizing prompt-only code may create a shallow abstraction. The implementation should extract only the shared dispatch phases while keeping prompt and plan input preparation explicit and testable.
- The existing Pi steel thread has live-unproven repairs. Local plan delivery can proceed, but final end-to-end evidence depends on normal harness commit and landing behavior working in production.

## Open Questions

None block implementation. Automatic or explicit cleanup of retained `dispatch-context` Entries remains parked; a later Objective must settle evidence and age rules before deletion.
